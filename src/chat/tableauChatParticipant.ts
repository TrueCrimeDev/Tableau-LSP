import * as vscode from 'vscode';
import { TWB_AGENT_PRIMER } from './twbPrimer.js';
import { buildWorkbookDigest, DigestFocus } from './workbookDigest.js';

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
    command?: string
): { context: string; question: string } {
    const focus = command && KNOWN_FOCUS.has(command) ? (command as DigestFocus) : undefined;
    const digest = buildWorkbookDigest(xml, focus);
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

/** Active editor first, then any open .twb tab — mirrors the sidebar's pattern. */
function resolveWorkbookUri(): vscode.Uri | undefined {
    const active = vscode.window.activeTextEditor;
    if (active && active.document.uri.path.toLowerCase().endsWith('.twb')) {
        return active.document.uri;
    }
    for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) {
            const input = tab.input as { uri?: vscode.Uri } | null | undefined;
            if (input?.uri?.path.toLowerCase().endsWith('.twb')) {
                return input.uri;
            }
        }
    }
    return undefined;
}

async function readWorkbookXml(uri: vscode.Uri): Promise<string> {
    const openDoc = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString());
    if (openDoc) {
        return openDoc.getText();
    }
    const data = await vscode.workspace.fs.readFile(uri);
    return Buffer.from(data).toString('utf8');
}

async function handleRequest(
    request: vscode.ChatRequest,
    _context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
): Promise<void> {
    const uri = resolveWorkbookUri();
    if (!uri) {
        stream.markdown(
            'No `.twb` workbook is open. Open a Tableau workbook file, then ask again. ' +
            '(Packaged `.twbx` workbooks are not yet supported.)'
        );
        return;
    }

    let xml: string;
    try {
        xml = await readWorkbookXml(uri);
    } catch (error: unknown) {
        stream.markdown(`Could not read the workbook: ${error instanceof Error ? error.message : String(error)}`);
        return;
    }

    const { context: contextMessage, question } = composeTableauMessages(xml, request.prompt, request.command);

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
