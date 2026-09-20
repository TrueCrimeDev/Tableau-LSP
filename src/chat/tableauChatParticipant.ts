import * as vscode from 'vscode';
import { InstructionSource, composeCustomInstructions } from './customInstructions.js';
import { NO_WORKBOOK_MESSAGE, resolveWorkbookUri } from './activeWorkbook.js';
import { TABLEAU_CALCULATION_PRIMER } from './calculationPrimer.js';
import { TWB_AGENT_PRIMER } from './twbPrimer.js';
import { buildWorkbookDigest, DigestFocus } from './workbookDigest.js';
import { conversationHistory } from './chatHistory.js';
import { loadProjectInstructions } from './projectInstructions.js';
import { readWorkbookXml } from '../services/workbookFieldContextManager.js';
import { tableauToolSpecs } from './tableauTools.js';
import { validateWorkbookXml } from '../parsers/workbookCalculations.js';

export const TABLEAU_PARTICIPANT_ID = 'tableau-language-support.tableau';

const DEFAULT_QUESTIONS: Record<string, string> = {
    borders: 'Summarise every border and divider setting in this workbook, per worksheet, and note where defaults are inherited.',
    calcs: 'List every calculation with its formula and explain what each one does.',
    fields: 'List the datasource fields with their datatypes and roles.',
    new: 'Create a calculated field in this workbook. Ask me what it should compute if the request is not already clear.',
    edit: 'Edit this workbook XML using the Tableau tools. Ask which change I want if I have not described it yet.',
    export: 'Save a separate copy of the current workbook and open that copy in Tableau Desktop.',
};

const KNOWN_FOCUS = new Set<string>(['borders', 'calcs', 'fields']);

/** Bounds the tool loop so a model that keeps calling tools cannot spin. */
const MAX_TOOL_ROUNDS = 10;

/**
 * Recognises a request to author or change a calculated field. Such a request
 * needs every exact field name, so the digest's field cap is lifted for it —
 * a field the model cannot see is a field it will invent.
 */
const CALCULATION_INTENT =
    /\b(add|create|make|build|writ\w*|author|insert|update|change|fix|rewrite|modify|rename)\b[^.?!]{0,48}\b(calc\w*|measure|dimension|formula|field)\b/i;

export function looksLikeCalculationRequest(prompt: string, command?: string): boolean {
    return command === 'new' || CALCULATION_INTENT.test(prompt);
}

/** Commands whose answers benefit from the calculation-authoring guide. */
const CALCULATION_COMMANDS = new Set(['new', 'calcs']);

/**
 * Pure message composition — the two user-role messages sent to the model.
 * Exported for unit tests.
 */
export function composeTableauMessages(
    xml: string,
    prompt: string,
    command?: string,
    workbookName: string = 'Workbook.twb',
    sourceUri?: string,
    instructions: readonly InstructionSource[] = []
): { context: string; question: string } {
    // Validate before digesting. `buildWorkbookDigest` is pure regex and never
    // throws, so a damaged or non-workbook file used to yield a digest reading
    // "Calculations (0)" — and the model would then tell the user their
    // workbook has no calculations, which is a wrong answer delivered with full
    // confidence. Truncated XML happened to throw a TypeError deeper in; this
    // makes the check deliberate and gives every failure a usable message.
    validateWorkbookXml(xml);

    const focus = command && KNOWN_FOCUS.has(command) ? (command as DigestFocus) : undefined;
    const authoring = looksLikeCalculationRequest(prompt, command);
    // Workbook content is untrusted: neutralise anything that could forge the
    // primer's instruction-boundary tag inside the digest.
    const digest = buildWorkbookDigest(
        xml,
        focus,
        workbookName,
        sourceUri,
        prompt,
        authoring
    ).replace(/<(\/?)TABLEAU_AGENT_INSTRUCTION>/gi, '&lt;$1TABLEAU_AGENT_INSTRUCTION&gt;');
    const question = prompt.trim() || (command ? DEFAULT_QUESTIONS[command] : '') ||
        'Give me an overview of this workbook.';

    // Ordered weakest to strongest: general workbook knowledge, then how
    // Tableau evaluates a calculation, then the project's own conventions,
    // then the data. Later sections are the ones that should win.
    const sections = [TWB_AGENT_PRIMER];
    if (authoring || (command && CALCULATION_COMMANDS.has(command))) {
        sections.push(TABLEAU_CALCULATION_PRIMER);
    }
    const projectInstructions = composeCustomInstructions(instructions);
    if (projectInstructions) {
        sections.push(projectInstructions);
    }
    sections.push(`The user's active workbook digest follows.\n\n${digest}`);
    return { context: sections.join('\n\n'), question };
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

/** This extension's workbook tools plus anything the user attached with `#`. */
function availableTools(request: vscode.ChatRequest): vscode.LanguageModelChatTool[] {
    const tools = tableauToolSpecs();
    const names = new Set(tools.map(tool => tool.name));
    for (const reference of request.toolReferences ?? []) {
        if (names.has(reference.name)) {
            continue;
        }
        const tool = vscode.lm.tools.find(candidate => candidate.name === reference.name);
        if (tool) {
            names.add(tool.name);
            tools.push({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema });
        }
    }
    return tools;
}

/**
 * Streams the model's answer, invoking any tools it asks for and feeding the
 * results back until it produces a tool-free reply.
 */
async function runToolLoop(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
    messages: vscode.LanguageModelChatMessage[]
): Promise<void> {
    const tools = availableTools(request);
    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
        const response = await request.model.sendRequest(messages, { tools }, token);
        const parts: (vscode.LanguageModelTextPart | vscode.LanguageModelToolCallPart)[] = [];
        const calls: vscode.LanguageModelToolCallPart[] = [];
        for await (const part of response.stream) {
            if (part instanceof vscode.LanguageModelToolCallPart) {
                parts.push(part);
                calls.push(part);
            } else if (part instanceof vscode.LanguageModelTextPart) {
                parts.push(part);
                stream.markdown(part.value);
            }
        }
        if (!calls.length) {
            return;
        }
        if (token.isCancellationRequested) {
            return;
        }

        messages.push(vscode.LanguageModelChatMessage.Assistant(parts));
        const results: vscode.LanguageModelToolResultPart[] = [];
        for (const call of calls) {
            if (token.isCancellationRequested) { return; }
            results.push(await invokeChatTool(request, call, token));
        }
        messages.push(vscode.LanguageModelChatMessage.User(results));
    }
    stream.markdown(
        `\n\n_Stopped after ${String(MAX_TOOL_ROUNDS)} rounds of workbook tool calls. Ask again with a narrower request._`
    );
}

/**
 * A tool failure — including the user cancelling the write confirmation — is
 * reported back to the model as a result, not thrown, so it can explain what
 * did not happen instead of the whole turn erroring out.
 */
async function invokeChatTool(
    request: vscode.ChatRequest,
    call: vscode.LanguageModelToolCallPart,
    token: vscode.CancellationToken
): Promise<vscode.LanguageModelToolResultPart> {
    try {
        const result = await vscode.lm.invokeTool(
            call.name,
            { input: call.input, toolInvocationToken: request.toolInvocationToken },
            token
        );
        return new vscode.LanguageModelToolResultPart(call.callId, result.content);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return new vscode.LanguageModelToolResultPart(call.callId, [
            new vscode.LanguageModelTextPart(
                `The ${call.name} tool did not run: ${message}. The workbook was not changed. ` +
                'Tell the user what was not done — do not retry the same call.'
            ),
        ]);
    }
}

async function handleRequest(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
): Promise<void> {
    const uri = await resolveWorkbookUri();
    if (!uri) {
        stream.markdown(NO_WORKBOOK_MESSAGE);
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

    const instructions = await loadProjectInstructions();

    let contextMessage: string;
    let question: string;
    try {
        ({ context: contextMessage, question } = composeTableauMessages(
            xml,
            request.prompt,
            request.command,
            workbookName,
            uri.toString(),
            instructions
        ));
    } catch (error: unknown) {
        stream.markdown(`Could not parse the workbook: ${error instanceof Error ? error.message : String(error)}`);
        return;
    }
    const fileName = uri.path.split('/').pop() ?? uri.path;
    const usingInstructions = instructions.length
        ? ` · using ${instructions.map(source => `\`${source.label}\``).join(', ')}`
        : '';
    stream.markdown(`Working with \`${fileName}\`${usingInstructions}\n\n`);
    stream.reference(uri);

    // Instructions and workbook data first, then the conversation so far, then
    // what was just asked. A follow-up like "now make it a percentage" is
    // meaningless without the turns that came before it.
    const messages = [vscode.LanguageModelChatMessage.User(contextMessage)];
    for (const turn of conversationHistory(context.history)) {
        messages.push(turn.role === 'user'
            ? vscode.LanguageModelChatMessage.User(turn.text)
            : vscode.LanguageModelChatMessage.Assistant(turn.text));
    }
    messages.push(vscode.LanguageModelChatMessage.User(question));

    try {
        await runToolLoop(request, stream, token, messages);
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
            { prompt: '', label: 'Create a calculated field', command: 'new' },
            { prompt: '', label: 'Edit workbook XML', command: 'edit' },
            { prompt: '', label: 'Save copy and open in Tableau', command: 'export' },
            { prompt: '', label: 'Scan borders & dividers', command: 'borders' },
            { prompt: '', label: 'Explain the calculations', command: 'calcs' },
            { prompt: '', label: 'List datasource fields', command: 'fields' },
        ],
    };
    context.subscriptions.push(participant);
}
