import * as path from 'path';
import * as vscode from 'vscode';
import { resolveWorkbookUri } from '../chat/activeWorkbook.js';
import { WorkbookEditService } from '../services/workbookEditService.js';
import { readCurrentWorkbookXml } from '../services/workbookMutationService.js';
import { registerWorkbookXmlEditor } from '../services/workbookXmlEditor.js';
import { resolveWorkbookSourceUri, workbookEditorKeys } from '../services/workbookUri.js';
import { LocalTableauConnectorHub } from '../services/localTableauConnectors.js';

const prefix = 'tableau-language-support.workbook.';

export function registerWorkbookCommands(context: vscode.ExtensionContext): void {
    const editor = registerWorkbookXmlEditor(context);
    const previews = new Map<string, string>();
    let previewId = 0;
    context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider('tableau-preview', {
        provideTextDocumentContent: uri => previews.get(uri.toString()) ?? '',
    }));
    context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(doc => {
        if (doc.uri.scheme === 'tableau-preview') { previews.delete(doc.uri.toString()); }
    }));

    async function target(candidate?: vscode.Uri): Promise<vscode.Uri> {
        const selected = candidate ?? await resolveWorkbookUri();
        if (!selected) { throw new Error('Open or select the .twb or .twbx workbook first.'); }
        const source = resolveWorkbookSourceUri(selected);
        if (source.scheme !== 'file' || !/\.twbx?$/i.test(source.path)) {
            throw new Error('Choose a .twb or .twbx workbook on the local filesystem.');
        }
        return source;
    }

    async function selectBackup(source: vscode.Uri): Promise<vscode.Uri | undefined> {
        const directory = vscode.Uri.file(path.join(path.dirname(source.fsPath), '.tableau-lsp-backups'));
        let entries: [string, vscode.FileType][];
        try { entries = await vscode.workspace.fs.readDirectory(directory); }
        catch { throw new Error('No backups were found beside this workbook.'); }
        const extension = path.extname(source.fsPath);
        const stem = path.basename(source.fsPath, extension);
        const choices = entries.filter(([name, type]) => type === vscode.FileType.File &&
            name.startsWith(`${stem}.`) && name.toLowerCase().endsWith(extension.toLowerCase()) &&
            /^\d{8}-\d{6}-\d{3}(?:-[a-f0-9]{8})?$/i.test(name.slice(stem.length + 1, -extension.length)))
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([name]) => ({ label: name, uri: vscode.Uri.joinPath(directory, name) }));
        if (!choices.length) { throw new Error('No matching backups were found for this workbook.'); }
        return (await vscode.window.showQuickPick(choices, { placeHolder: 'Choose a workbook backup (newest first)' }))?.uri;
    }

    async function preview(source: vscode.Uri, backup: vscode.Uri): Promise<void> {
        const before = await readCurrentWorkbookXml(backup);
        const bound = workbookEditorKeys(source);
        const draft = vscode.workspace.textDocuments.find(doc => bound.includes(doc.uri.toString()));
        const after = draft?.getText() ?? await readCurrentWorkbookXml(source);
        const id = ++previewId;
        const left = vscode.Uri.from({ scheme: 'tableau-preview', path: `/${id}/backup.twb` });
        const right = vscode.Uri.from({ scheme: 'tableau-preview', path: `/${id}/current.twb` });
        previews.set(left.toString(), before);
        previews.set(right.toString(), after);
        await vscode.commands.executeCommand('vscode.diff', left, right, `${path.basename(source.fsPath)}: backup ↔ current`);
    }

    const register = (name: string, action: (...args: any[]) => Promise<unknown>) => {
        context.subscriptions.push(vscode.commands.registerCommand(prefix + name, async (...args: any[]) => {
            try { return await action(...args); }
            catch (error) {
                void vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
                return undefined;
            }
        }));
    };

    register('editXml', async (candidate?: vscode.Uri) => editor.open(await target(candidate)));

    async function saveCopy(open: boolean, candidate?: vscode.Uri, destination?: vscode.Uri): Promise<vscode.Uri | undefined> {
        const source = await target(candidate);
        const extension = path.extname(source.fsPath);
        destination ??= await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(path.join(path.dirname(source.fsPath), `${path.basename(source.fsPath, extension)}-edited${extension}`)),
            filters: { 'Tableau Workbook': [extension.slice(1)] },
            title: extension.toLowerCase() === '.twb' ? 'Save a copy beside the original to retain relative data paths' : 'Save a packaged workbook copy',
            saveLabel: open ? 'Save Copy and Open' : 'Save Copy',
        });
        if (!destination) { return undefined; }
        const result = await new WorkbookEditService().saveCopy(source, destination);
        if (open) {
            const executablePath = vscode.workspace.getConfiguration('tableau-language-support').get<string>('local.executablePath', '').trim();
            try {
                await new LocalTableauConnectorHub({ executablePath: executablePath || undefined }).launchWorkbook(result.fsPath);
                void vscode.window.showInformationMessage('Copy saved and sent to Tableau. Check that its data and sheets load there.');
            } catch (error) {
                void vscode.window.showWarningMessage(`Copy saved to ${result.fsPath}. Tableau launch failed: ${error instanceof Error ? error.message : String(error)}`);
            }
        } else {
            void vscode.window.showInformationMessage(`Workbook copy saved and checked: ${result.fsPath}`);
        }
        return result;
    }
    register('saveCopy', (candidate?: vscode.Uri, destination?: vscode.Uri) => saveCopy(false, candidate, destination));
    register('saveCopyAndOpen', (candidate?: vscode.Uri) => saveCopy(true, candidate));
    register('previewChanges', async (candidate?: vscode.Uri) => {
        const source = await target(candidate);
        const backup = await selectBackup(source);
        if (backup) { await preview(source, backup); }
    });
    register('restoreBackup', async (candidate?: vscode.Uri) => {
        const source = await target(candidate);
        const backup = await selectBackup(source);
        if (!backup) { return; }
        // A broken current workbook still needs to be recoverable.
        try { await preview(source, backup); } catch { /* Restore validates the selected backup itself. */ }
        const choice = await vscode.window.showWarningMessage(
            `Restore ${path.basename(backup.fsPath)} over ${path.basename(source.fsPath)}? The current file will be backed up first.`,
            { modal: true }, 'Restore Backup',
        );
        if (choice !== 'Restore Backup') { return; }
        const receipt = await new WorkbookEditService().restore(source, backup);
        void vscode.window.showInformationMessage(`Backup restored and checked. Previous file: ${receipt.backup.fsPath}`);
    });
}
