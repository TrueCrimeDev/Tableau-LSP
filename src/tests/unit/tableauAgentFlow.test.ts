import * as vscode from 'vscode';
import { readFileSync } from 'fs';
import { join } from 'path';
import { registerTableauChatParticipant, TABLEAU_PARTICIPANT_ID } from '../../chat/tableauChatParticipant.js';
import { registerTableauLanguageModelTools, TABLEAU_TOOL_NAMES } from '../../chat/tableauTools.js';
import { TABLEAU_EDIT_XML_TOOL, TABLEAU_READ_XML_TOOL, TABLEAU_SAVE_COPY_TOOL } from '../../chat/workbookXmlTools.js';
import { workbookRevision } from '../../chat/workbookXmlPlan.js';
import { resolveWorkbookUri, resolveWritableWorkbookUri } from '../../chat/activeWorkbook.js';
import { loadProjectInstructions } from '../../chat/projectInstructions.js';
import { readWorkbookXml } from '../../services/workbookFieldContextManager.js';
import { applyWorkbookXmlMutation, launchEditedWorkbook, readCurrentWorkbookXml } from '../../services/workbookMutationService.js';
import { WorkbookEditService } from '../../services/workbookEditService.js';

jest.mock('vscode', () => {
    const { URI, Utils } = require('vscode-uri');
    URI.joinPath = Utils.joinPath;
    class TextPart { constructor(public value: string) {} }
    const message = (role: string, content: string | unknown[]) => ({ role, content: typeof content === 'string' ? [new TextPart(content)] : content });
    return {
        Uri: URI,
        LanguageModelTextPart: TextPart,
        LanguageModelToolCallPart: class { constructor(public callId: string, public name: string, public input: object) {} },
        LanguageModelToolResultPart: class { constructor(public callId: string, public content: unknown[]) {} },
        LanguageModelToolResult: class { constructor(public content: unknown[]) {} },
        LanguageModelChatMessage: {
            User: (content: string | unknown[]) => message('user', content),
            Assistant: (content: string | unknown[]) => message('assistant', content),
        },
        MarkdownString: class {
            value = '';
            appendText(value: string) { this.value += value; return this; }
            appendCodeblock(value: string) { this.value += `\n${value}\n`; return this; }
        },
        chat: { createChatParticipant: jest.fn() },
        lm: { registerTool: jest.fn(), invokeTool: jest.fn(), tools: [] },
        workspace: { textDocuments: [] },
    };
});
jest.mock('../../chat/activeWorkbook.js', () => ({
    ...jest.requireActual('../../chat/activeWorkbook.js'),
    resolveWorkbookUri: jest.fn(), resolveWritableWorkbookUri: jest.fn(),
}));
jest.mock('../../chat/projectInstructions.js', () => ({ loadProjectInstructions: jest.fn() }));
jest.mock('../../services/workbookFieldContextManager.js', () => ({ readWorkbookXml: jest.fn() }));
jest.mock('../../services/workbookMutationService.js', () => ({
    readCurrentWorkbookXml: jest.fn(), applyWorkbookXmlMutation: jest.fn(), launchEditedWorkbook: jest.fn(),
}));
jest.mock('../../services/workbookEditService.js', () => ({ WorkbookEditService: jest.fn() }));

const source = vscode.Uri.file('/workspace/Book.twbx');
const original = '<workbook><datasources/><worksheets><worksheet name="Sales"/></worksheets></workbook>';
const updated = original.replace('name="Sales"', 'name="Revenue"');
const invocationToken = { request: 'scripted-chat-request' } as unknown as vscode.ChatParticipantToolToken;
type Part = vscode.LanguageModelTextPart | vscode.LanguageModelToolCallPart;
type Script = (messages: vscode.LanguageModelChatMessage[]) => Part[];
const call = (id: string, name: string, input: object = {}) => new vscode.LanguageModelToolCallPart(id, name, input);
const text = (value: string) => new vscode.LanguageModelTextPart(value);

function resultText(messages: vscode.LanguageModelChatMessage[], callId: string): string {
    const result = messages[messages.length - 1].content.find(
        part => part instanceof vscode.LanguageModelToolResultPart && part.callId === callId
    ) as vscode.LanguageModelToolResultPart | undefined;
    expect(result).toBeDefined();
    return result!.content.map(part => (part as vscode.LanguageModelTextPart).value).join('');
}

function editInput(receipt: { workbookId: string; revision: string }) {
    return {
        workbookId: receipt.workbookId, expectedRevision: receipt.revision,
        summary: 'Rename Sales to Revenue',
        replacements: [{ oldText: 'name="Sales"', newText: 'name="Revenue"' }],
    };
}

describe('Tableau chat participant tool conversation', () => {
    let handler: vscode.ChatRequestHandler;
    let xml: string;
    let copy: jest.Mock;
    let token: { isCancellationRequested: boolean };
    let declineTool: string | undefined;
    let afterInvocation: ((name: string) => void) | undefined;
    let confirmations: vscode.PreparedToolInvocation[];
    const registry = new Map<string, vscode.LanguageModelTool<object>>();

    beforeEach(() => {
        jest.clearAllMocks();
        xml = original;
        token = { isCancellationRequested: false };
        declineTool = undefined;
        afterInvocation = undefined;
        confirmations = [];
        registry.clear();
        const manifest = JSON.parse(readFileSync(join(__dirname, '../../../package.json'), 'utf8'));
        (vscode.lm as unknown as { tools: unknown[] }).tools = manifest.contributes.languageModelTools.map(
            (tool: { name: string; modelDescription: string; inputSchema: object }) => ({ name: tool.name, description: tool.modelDescription, inputSchema: tool.inputSchema })
        );
        jest.mocked(resolveWorkbookUri).mockResolvedValue(source);
        jest.mocked(resolveWritableWorkbookUri).mockResolvedValue(source);
        jest.mocked(loadProjectInstructions).mockResolvedValue([]);
        jest.mocked(readWorkbookXml).mockImplementation(async () => ({ xml, workbookName: 'Book.twb' }));
        jest.mocked(readCurrentWorkbookXml).mockImplementation(async () => xml);
        jest.mocked(applyWorkbookXmlMutation).mockImplementation(async (uri, before, after) => {
            expect(uri).toEqual(source);
            expect(before).toBe(xml);
            xml = after;
            return { verified: true, backup: vscode.Uri.file('/workspace/.tableau-lsp-backups/Book.twbx') };
        });
        copy = jest.fn(async (uri: vscode.Uri, destination: vscode.Uri, options: { expectedXml: string }) => {
            expect(uri).toEqual(source);
            expect(options.expectedXml).toBe(xml);
            return destination;
        });
        jest.mocked(WorkbookEditService).mockImplementation(() => ({ saveCopy: copy }) as unknown as WorkbookEditService);
        jest.mocked(launchEditedWorkbook).mockResolvedValue('Tableau Desktop');
        jest.mocked(vscode.lm.registerTool).mockImplementation((name, tool) => {
            registry.set(name, tool as vscode.LanguageModelTool<object>);
            return { dispose() {} };
        });
        jest.mocked(vscode.lm.invokeTool).mockImplementation(async (name, options, cancellation) => {
            const tool = registry.get(name);
            expect(tool).toBeDefined();
            const prepared = await tool!.prepareInvocation?.({ input: options.input as object }, cancellation!);
            if (prepared?.confirmationMessages) { confirmations.push(prepared); }
            // The mock host grants approval unless this test explicitly declines.
            if (declineTool === name) { throw new Error('The user declined the confirmation'); }
            const result = await tool!.invoke({ ...options, input: options.input as object }, cancellation!);
            afterInvocation?.(name);
            return result;
        });
        jest.mocked(vscode.chat.createChatParticipant).mockImplementation((_id, callback) => {
            handler = callback;
            return { dispose() {} } as vscode.ChatParticipant;
        });
        const context = { subscriptions: [], extensionUri: vscode.Uri.file('/extension') } as unknown as vscode.ExtensionContext;
        registerTableauLanguageModelTools(context);
        registerTableauChatParticipant(context);
    });

    async function run(scripts: Script[], request: { prompt?: string; command?: string; history?: unknown[] } = {}) {
        let step = 0;
        let modelFailure: unknown;
        const snapshots: vscode.LanguageModelChatMessage[][] = [];
        const markdown = jest.fn();
        const reference = jest.fn();
        const sendRequest = jest.fn(async (messages: vscode.LanguageModelChatMessage[], options: vscode.LanguageModelChatRequestOptions, cancellation: vscode.CancellationToken) => {
            try {
                expect(options.tools?.map(tool => tool.name).sort()).toEqual([...TABLEAU_TOOL_NAMES].sort());
                expect(options.tools).toHaveLength(5);
                expect(cancellation).toBe(token);
                snapshots.push([...messages]);
                expect(step).toBeLessThan(scripts.length);
                const parts = scripts[step++]([...messages]);
                return { stream: (async function* () { for (const part of parts) { yield part; } })() };
            } catch (error) {
                // The participant intentionally catches model errors. Re-throw
                // test assertions outside that catch so they cannot be hidden.
                modelFailure = error;
                throw error;
            }
        });
        await handler({
            prompt: request.prompt ?? 'Rename the Sales worksheet to Revenue, save a copy, and open it in Tableau.',
            command: request.command ?? 'edit', model: { sendRequest }, toolInvocationToken: invocationToken, toolReferences: [],
        } as unknown as vscode.ChatRequest,
        { history: request.history ?? [] } as unknown as vscode.ChatContext,
        { markdown, reference } as unknown as vscode.ChatResponseStream,
        token as vscode.CancellationToken);
        if (modelFailure) { throw modelFailure; }
        expect(step).toBe(scripts.length);
        return { markdown, reference, sendRequest, snapshots };
    }

    it.each([
        ['new', 'create a calculated field'],
        ['edit', 'edit this workbook xml'],
        ['export', 'save a separate copy'],
        ['borders', 'border and divider'],
        ['calcs', 'list every calculation'],
        ['fields', 'list the datasource fields'],
    ])('routes /%s through the participant with its default question and selected workbook', async (command, expectedQuestion) => {
        const output = await run([messages => {
            const question = messages[messages.length - 1].content[0] as vscode.LanguageModelTextPart;
            expect(question.value.toLowerCase()).toContain(expectedQuestion);
            expect((messages[0].content[0] as vscode.LanguageModelTextPart).value).toContain('# Workbook digest');
            return [text('The selected workbook is available for this request.')];
        }], { command, prompt: '' });
        expect(output.reference).toHaveBeenCalledWith(source);
        expect(readWorkbookXml).toHaveBeenCalledWith(source);
        expect(output.markdown).toHaveBeenCalledWith('Working with `Book.twbx`\n\n');
        expect(output.sendRequest).toHaveBeenCalledTimes(1);
        expect(vscode.lm.invokeTool).not.toHaveBeenCalled();
    });

    it('replays prior request and response turns before the current follow-up', async () => {
        await run([messages => {
            expect(messages).toHaveLength(4);
            expect(messages[1]).toMatchObject({ role: 'user', content: [{ value: '/new Create a profit ratio calculation.' }] });
            expect(messages[2]).toMatchObject({ role: 'assistant', content: [{ value: 'Should the ratio use total sales?' }] });
            expect(messages[3]).toMatchObject({ role: 'user', content: [{ value: 'Yes, divide total profit by total sales.' }] });
            return [text('I will use total profit divided by total sales.')];
        }], {
            prompt: 'Yes, divide total profit by total sales.',
            command: 'new',
            history: [
                { command: 'new', prompt: 'Create a profit ratio calculation.' },
                { response: [{ value: new vscode.MarkdownString().appendText('Should the ratio use total sales?') }] },
            ],
        });
    });

    it('includes supplied project guidance in the actual model request and identifies its source', async () => {
        jest.mocked(loadProjectInstructions).mockResolvedValue([{ label: 'tableau/agent.md', text: 'Use the Retail datasource.' }]);
        const output = await run([messages => {
            const context = (messages[0].content[0] as vscode.LanguageModelTextPart).value;
            expect(context).toContain('Use the Retail datasource.');
            expect(context).toContain('tableau/agent.md');
            return [text('The project guidance is included.')];
        }]);
        expect(output.markdown).toHaveBeenCalledWith('Working with `Book.twbx` · using `tableau/agent.md`\n\n');
    });

    it('does not ask a model or invoke tools when no unambiguous workbook is selected', async () => {
        jest.mocked(resolveWorkbookUri).mockResolvedValue(undefined);
        const output = await run([]);
        expect(output.markdown).toHaveBeenCalledWith(expect.stringContaining('No unambiguous Tableau workbook'));
        expect(output.reference).not.toHaveBeenCalled();
        expect(output.sendRequest).not.toHaveBeenCalled();
        expect(readWorkbookXml).not.toHaveBeenCalled();
        expect(vscode.lm.invokeTool).not.toHaveBeenCalled();
    });

    it('reads, approves an XML edit, exports its new revision, and returns a truthful launch receipt through the real handler', async () => {
        const output = await run([
            () => [call('read', TABLEAU_READ_XML_TOOL)],
            messages => {
                const read = JSON.parse(resultText(messages, 'read'));
                expect(read.xml).toBe(original);
                expect(read.contentType).toBe('untrusted_workbook_xml');
                return [call('edit', TABLEAU_EDIT_XML_TOOL, editInput(read))];
            },
            messages => {
                const edit = JSON.parse(resultText(messages, 'edit'));
                expect(edit).toMatchObject({ saved: true, revision: workbookRevision(updated), tableauValidation: 'not_run' });
                expect(edit.backup).toContain('.tableau-lsp-backups');
                return [call('export', TABLEAU_SAVE_COPY_TOOL, {
                    workbookId: edit.workbookId, expectedRevision: edit.revision,
                    fileName: 'Presentation.twbx', openInTableau: true,
                })];
            },
            messages => {
                const saved = JSON.parse(resultText(messages, 'export'));
                expect(saved).toMatchObject({ saved: true, launchRequested: true, tableauValidation: 'not_run' });
                expect(saved).not.toHaveProperty('openedInTableau');
                expect(saved.nextStep).toContain('launching does not prove the workbook loaded');
                return [text('Saved Presentation.twbx and requested its launch in Tableau. Rendering and data connections still need validation.')];
            },
        ]);
        expect(vscode.chat.createChatParticipant).toHaveBeenCalledWith(TABLEAU_PARTICIPANT_ID, expect.any(Function));
        expect([...registry.keys()].sort()).toEqual([...TABLEAU_TOOL_NAMES].sort());
        expect(vscode.lm.invokeTool).toHaveBeenCalledTimes(3);
        for (const invocation of jest.mocked(vscode.lm.invokeTool).mock.calls) {
            expect(invocation[1].toolInvocationToken).toBe(invocationToken);
            expect(invocation[2]).toBe(token);
        }
        expect(confirmations).toHaveLength(2);
        expect(confirmations[0].confirmationMessages?.message).toMatchObject({ value: expect.stringContaining('name="Revenue"') });
        expect(confirmations[1].confirmationMessages?.message).toMatchObject({ value: expect.stringContaining('Presentation.twbx') });
        expect(xml).toBe(updated);
        expect(copy).toHaveBeenCalledTimes(1);
        expect(jest.mocked(launchEditedWorkbook).mock.calls[0][0].toString()).toBe(vscode.Uri.file('/workspace/Presentation.twbx').toString());
        expect(output.reference).toHaveBeenCalledWith(source);
        expect(output.markdown).toHaveBeenLastCalledWith(expect.stringContaining('still need validation'));
        expect(output.sendRequest).toHaveBeenCalledTimes(4);
        // The assistant's tool call is immediately followed by the matching result.
        for (const [index, id] of ['read', 'edit', 'export'].entries()) {
            const messages = output.snapshots[index + 1];
            expect(messages[messages.length - 2].content[0]).toMatchObject({ callId: id });
            expect(messages[messages.length - 1].content[0]).toMatchObject({ callId: id });
        }
    });

    it('feeds a saved-copy receipt with launch failure back to the model without claiming Tableau opened it', async () => {
        jest.mocked(launchEditedWorkbook).mockRejectedValue(new Error('Tableau Desktop is unavailable'));
        const output = await run([
            () => [call('read', TABLEAU_READ_XML_TOOL)],
            messages => {
                const read = JSON.parse(resultText(messages, 'read'));
                return [call('export', TABLEAU_SAVE_COPY_TOOL, { workbookId: read.workbookId, expectedRevision: read.revision, openInTableau: true })];
            },
            messages => {
                const saved = JSON.parse(resultText(messages, 'export'));
                expect(saved).toMatchObject({ saved: true, launchRequested: false, launchError: 'Tableau Desktop is unavailable', tableauValidation: 'not_run' });
                return [text('The copy was saved, but Tableau could not be launched. Validate the saved file in Tableau.')];
            },
        ]);
        expect(copy).toHaveBeenCalledTimes(1);
        expect(output.markdown).toHaveBeenLastCalledWith(expect.stringContaining('could not be launched'));
        expect(applyWorkbookXmlMutation).not.toHaveBeenCalled();
    });

    it.each([false, undefined])('exports without launching Tableau when openInTableau is %s', async openInTableau => {
        const prompt = 'Save a separate copy named Presentation.twbx without opening Tableau. Set openInTableau to false.';
        const output = await run([
            messages => {
                expect(messages[messages.length - 1].content[0]).toMatchObject({ value: prompt });
                return [call('read', TABLEAU_READ_XML_TOOL)];
            },
            messages => {
                const read = JSON.parse(resultText(messages, 'read'));
                return [call('export', TABLEAU_SAVE_COPY_TOOL, {
                    workbookId: read.workbookId, expectedRevision: read.revision,
                    fileName: 'Presentation.twbx', ...(openInTableau === undefined ? {} : { openInTableau }),
                })];
            },
            messages => {
                const saved = JSON.parse(resultText(messages, 'export'));
                expect(saved).toMatchObject({ saved: true, launchRequested: false, tableauValidation: 'not_run' });
                expect(saved).not.toHaveProperty('launchError');
                return [text('Saved Presentation.twbx. Tableau was not launched, and rendering was not checked.')];
            },
        ], { command: 'export', prompt });
        expect(confirmations).toHaveLength(1);
        expect(confirmations[0].confirmationMessages?.title).toBe('Save a workbook copy?');
        expect(copy).toHaveBeenCalledTimes(1);
        expect(launchEditedWorkbook).not.toHaveBeenCalled();
        expect(applyWorkbookXmlMutation).not.toHaveBeenCalled();
        expect(xml).toBe(original);
        expect(output.markdown).toHaveBeenLastCalledWith(expect.stringContaining('Tableau was not launched'));
    });

    it('does not invoke a queued edit when cancellation arrives with the model response', async () => {
        await run([
            () => [call('read', TABLEAU_READ_XML_TOOL)],
            messages => {
                const read = JSON.parse(resultText(messages, 'read'));
                token.isCancellationRequested = true;
                return [call('edit', TABLEAU_EDIT_XML_TOOL, editInput(read))];
            },
        ]);
        expect(vscode.lm.invokeTool).toHaveBeenCalledTimes(1);
        expect(applyWorkbookXmlMutation).not.toHaveBeenCalled();
        expect(copy).not.toHaveBeenCalled();
        expect(launchEditedWorkbook).not.toHaveBeenCalled();
        expect(xml).toBe(original);
    });

    it('stops a batch after cancellation instead of exporting after the completed edit', async () => {
        afterInvocation = name => { if (name === TABLEAU_EDIT_XML_TOOL) { token.isCancellationRequested = true; } };
        await run([
            () => [call('read', TABLEAU_READ_XML_TOOL)],
            messages => {
                const read = JSON.parse(resultText(messages, 'read'));
                return [
                    call('edit', TABLEAU_EDIT_XML_TOOL, editInput(read)),
                    call('export', TABLEAU_SAVE_COPY_TOOL, { workbookId: read.workbookId, expectedRevision: workbookRevision(updated), openInTableau: true }),
                ];
            },
        ]);
        expect(vscode.lm.invokeTool).toHaveBeenCalledTimes(2);
        expect(applyWorkbookXmlMutation).toHaveBeenCalledTimes(1);
        expect(xml).toBe(updated);
        expect(copy).not.toHaveBeenCalled();
        expect(launchEditedWorkbook).not.toHaveBeenCalled();
    });

    it('returns a declined confirmation to the model without writing or retrying', async () => {
        declineTool = TABLEAU_EDIT_XML_TOOL;
        const output = await run([
            () => [call('read', TABLEAU_READ_XML_TOOL)],
            messages => [call('edit', TABLEAU_EDIT_XML_TOOL, editInput(JSON.parse(resultText(messages, 'read'))))],
            messages => {
                const declined = resultText(messages, 'edit');
                expect(declined).toContain('user declined');
                expect(declined).toContain('The workbook was not changed');
                expect(declined).toContain('do not retry');
                return [text('The edit was declined. The workbook was not changed and no copy was created.')];
            },
        ]);
        expect(confirmations).toHaveLength(1);
        expect(applyWorkbookXmlMutation).not.toHaveBeenCalled();
        expect(copy).not.toHaveBeenCalled();
        expect(xml).toBe(original);
        expect(vscode.lm.invokeTool).toHaveBeenCalledTimes(2);
        expect(output.markdown).toHaveBeenLastCalledWith(expect.stringContaining('was not changed'));
    });
});
