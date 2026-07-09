import * as vscode from 'vscode';
import { TWB_AGENT_PRIMER } from './twbPrimer.js';
import { buildWorkbookDigest, DigestFocus } from './workbookDigest.js';
import { readWorkbookXml } from '../services/workbookFieldContextManager.js';

export const TABLEAU_PARTICIPANT_ID = 'tableau-language-support.tableau';

const DEFAULT_QUESTIONS: Record<string, string> = {
    borders: 'Summarise every border and divider setting in this workbook, per worksheet, and note where defaults are inherited.',
    calcs: 'List every calculation with its formula and explain what each one does.',
    fields: 'List the datasource fields with their datatypes and roles.',
};

const KNOWN_FOCUS = new Set<string>(['borders', 'calcs', 'fields']);

/**
 * Pure message composition — the two user-role messages sent to the model.
 * Exported for unit tests.
 */
export function composeTableauMessages(
    xml: string,
    prompt: string,
    command?: string,
    workbookName: string = 'Workbook.twb',
    sourceUri?: string
): { context: string; question: string } {
    const focus = command && KNOWN_FOCUS.has(command) ? (command as DigestFocus) : undefined;
    // Workbook content is untrusted: neutralise anything that could forge the
    // primer's instruction-boundary tag inside the digest.
    const digest = buildWorkbookDigest(xml, focus, workbookName, sourceUri, prompt)
        .replace(/<(\/?)TABLEAU_AGENT_INSTRUCTION>/gi, '&lt;$1TABLEAU_AGENT_INSTRUCTION&gt;');
    const question = prompt.trim() || (command ? DEFAULT_QUESTIONS[command] : '') ||
        'Give me an overview of this workbook.';
    return {
        context: `${TWB_AGENT_PRIMER}\n\nThe user's active workbook digest follows.\n\n${digest}`,
        question,
    };
}

/** Maps model-request failures to a short user-facing message. Exported for tests. */
export function describeChatError(error: unknown): string {
    if (error && typeof error === 'object' && 'code' in error) {
        const code = String((error as { code: unknown }).code);
        if (code === 'NoPermissions' || code === 'Blocked') {
            return 'Copilot declined the request (permissions or content policy). Try rephrasing.';
        }
        if (code === 'NotFound') {
            return 'No language model is available. An active GitHub Copilot subscription is required for @tableau.';
        }
    }
    const message = error instanceof Error ? error.message : String(error);
    return `The language model request failed: ${message}`;
}

/**
 * Active editor, then the active tab of each group (active group first), then
 * any open .twb tab. VS Code exposes no true MRU order, so the handler also
 * names the workbook it picked in its reply.
 */
async function resolveWorkbookUri(): Promise<vscode.Uri | undefined> {
    const isWorkbook = (uri: vscode.Uri | undefined): uri is vscode.Uri => {
        const path = uri?.path.toLowerCase() ?? '';
        return path.endsWith('.twb') || path.endsWith('.twbx');
    };
    const active = vscode.window.activeTextEditor;
    if (active && isWorkbook(active.document.uri)) {
        return active.document.uri;
    }
    const twbOf = (tab: vscode.Tab | undefined): vscode.Uri | undefined => {
        const input = tab?.input as { uri?: vscode.Uri } | null | undefined;
        return isWorkbook(input?.uri) ? input.uri : undefined;
    };
    const activeTabWorkbook = twbOf(vscode.window.tabGroups.activeTabGroup.activeTab ?? undefined);
    if (activeTabWorkbook) {
        return activeTabWorkbook;
    }

    const candidates = new Map<string, vscode.Uri>();
    for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) {
            const uri = twbOf(tab);
            if (uri) { candidates.set(uri.toString(), uri); }
        }
    }
    if (candidates.size === 1) {
        return candidates.values().next().value;
    }
    if (candidates.size > 1) {
        return undefined;
    }
    const workspaceWorkbooks = await vscode.workspace.findFiles(
        '**/*.{twb,twbx}',
        '**/{node_modules,.git,.worktrees}/**',
        2
    );
    return workspaceWorkbooks.length === 1 ? workspaceWorkbooks[0] : undefined;
}

async function handleRequest(
    request: vscode.ChatRequest,
    _context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
): Promise<void> {
    const uri = await resolveWorkbookUri();
    if (!uri) {
        stream.markdown(
            'No unambiguous Tableau workbook is available. Open the `.twb` or `.twbx` workbook you want to discuss, then ask again.'
        );
        return;
    }

    let xml: string;
    let workbookName: string;
    try {
        const source = await readWorkbookXml(uri);
        xml = source.xml;
        workbookName = source.workbookName;
    } catch (error: unknown) {
        stream.markdown(`Could not read the workbook: ${error instanceof Error ? error.message : String(error)}`);
        return;
    }

    let contextMessage: string;
    let question: string;
    try {
        ({ context: contextMessage, question } = composeTableauMessages(
            xml,
            request.prompt,
            request.command,
            workbookName,
            uri.path.toLowerCase().endsWith('.twb') ? uri.toString() : undefined
        ));
    } catch (error: unknown) {
        stream.markdown(`Could not parse the workbook: ${error instanceof Error ? error.message : String(error)}`);
        return;
    }
    const fileName = uri.path.split('/').pop() ?? uri.path;
    stream.markdown(`Analyzing \`${fileName}\`\n\n`);

    try {
        const messages = [
            vscode.LanguageModelChatMessage.User(contextMessage),
            vscode.LanguageModelChatMessage.User(question),
        ];
        const response = await request.model.sendRequest(messages, {}, token);
        for await (const fragment of response.text) {
            stream.markdown(fragment);
        }
    } catch (error: unknown) {
        stream.markdown(describeChatError(error));
    }
}

export function registerTableauChatParticipant(context: vscode.ExtensionContext): void {
    // Chat API ships in VS Code 1.90+; older hosts simply skip the feature.
    if (typeof vscode.chat?.createChatParticipant !== 'function') {
        return;
    }
    const participant = vscode.chat.createChatParticipant(TABLEAU_PARTICIPANT_ID, handleRequest);
    participant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'images', 'tableau2.svg');
    participant.followupProvider = {
        provideFollowups: () => [
            { prompt: '', label: 'Scan borders & dividers', command: 'borders' },
            { prompt: '', label: 'Explain the calculations', command: 'calcs' },
            { prompt: '', label: 'List datasource fields', command: 'fields' },
        ],
    };
    context.subscriptions.push(participant);
}
