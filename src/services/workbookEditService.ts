import * as vscode from 'vscode';
import { basename, dirname, extname } from 'path';
import { validateWorkbookXml } from '../parsers/workbookCalculations.js';

const decoder = new TextDecoder('utf-8');
const encoder = new TextEncoder();

export interface WorkbookEditReceipt<TBackup = vscode.Uri> {
    backup: TBackup;
    verified: true;
}

export interface WorkbookEditIO<TBackup> {
    createBackup(content: string): Promise<TBackup>;
    write(content: string): Promise<void>;
    read(): Promise<string>;
}

export class WorkbookEditTransactionError extends Error {
    public constructor(
        message: string,
        public readonly backup: unknown,
        public readonly rolledBack: boolean
    ) {
        super(message);
        this.name = 'WorkbookEditTransactionError';
    }
}

/**
 * Apply a prevalidated workbook mutation, verify the persisted bytes, and roll
 * back to the exact original XML if any write/verification step fails.
 */
export async function runWorkbookEditTransaction<TBackup>(
    originalXml: string,
    updatedXml: string,
    io: WorkbookEditIO<TBackup>
): Promise<WorkbookEditReceipt<TBackup>> {
    validateWorkbookXml(originalXml);
    validateWorkbookXml(updatedXml);
    if (updatedXml === originalXml) {
        throw new WorkbookEditTransactionError('The workbook edit made no changes.', undefined, false);
    }

    let backup: TBackup;
    try {
        backup = await io.createBackup(originalXml);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new WorkbookEditTransactionError(`Could not create a workbook backup: ${message}`, undefined, false);
    }

    let writeAttempted = false;
    try {
        writeAttempted = true;
        await io.write(updatedXml);
        const persisted = await io.read();
        validateWorkbookXml(persisted);
        if (persisted !== updatedXml) {
            throw new Error('The persisted workbook does not match the validated edit.');
        }
        return { backup, verified: true };
    } catch (error) {
        let rolledBack = false;
        let rollbackMessage = '';
        if (writeAttempted) {
            try {
                await io.write(originalXml);
                rolledBack = (await io.read()) === originalXml;
            } catch (rollbackError) {
                rollbackMessage = ` Rollback also failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`;
            }
        }
        const message = error instanceof Error ? error.message : String(error);
        throw new WorkbookEditTransactionError(
            `Workbook edit failed${rolledBack ? ' and was rolled back' : ''}: ${message}.${rollbackMessage}`,
            backup,
            rolledBack
        );
    }
}

function timestamp(date: Date): string {
    return date.toISOString().replace(/[-:]/g, '').replace('T', '-').replace('Z', '').replace('.', '-');
}

export class WorkbookEditService {
    public constructor(private readonly now: () => Date = () => new Date()) {}

    public async apply(uri: vscode.Uri, originalXml: string, updatedXml: string): Promise<WorkbookEditReceipt> {
        if (!uri.path.toLowerCase().endsWith('.twb')) {
            throw new WorkbookEditTransactionError(
                'Transactional workbook editing currently supports plain .twb files only.',
                undefined,
                false
            );
        }
        return runWorkbookEditTransaction(originalXml, updatedXml, {
            createBackup: content => this.createBackup(uri, content),
            write: content => this.write(uri, content),
            read: async () => decoder.decode(await vscode.workspace.fs.readFile(uri)),
        });
    }

    private async createBackup(uri: vscode.Uri, content: string): Promise<vscode.Uri> {
        const folder = vscode.Uri.file(dirname(uri.fsPath));
        const backupFolder = vscode.Uri.joinPath(folder, '.tableau-lsp-backups');
        await vscode.workspace.fs.createDirectory(backupFolder);
        const extension = extname(uri.fsPath) || '.twb';
        const stem = basename(uri.fsPath, extension);
        const backup = vscode.Uri.joinPath(
            backupFolder,
            `${stem}.${timestamp(this.now())}${extension}`
        );
        await vscode.workspace.fs.writeFile(backup, encoder.encode(content));
        return backup;
    }

    private async write(uri: vscode.Uri, content: string): Promise<void> {
        const openDocument = vscode.workspace.textDocuments.find(
            document => document.uri.toString() === uri.toString()
        );
        if (!openDocument) {
            await vscode.workspace.fs.writeFile(uri, encoder.encode(content));
            return;
        }
        const edit = new vscode.WorkspaceEdit();
        edit.replace(
            uri,
            new vscode.Range(openDocument.positionAt(0), openDocument.positionAt(openDocument.getText().length)),
            content
        );
        if (!await vscode.workspace.applyEdit(edit)) {
            throw new Error('VS Code rejected the workbook edit.');
        }
        if (!await openDocument.save()) {
            throw new Error('VS Code could not save the edited workbook.');
        }
    }
}
