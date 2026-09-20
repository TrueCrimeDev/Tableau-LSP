import * as vscode from 'vscode';
import { basename, dirname, extname } from 'path';
import { randomUUID } from 'crypto';
import { validateWorkbookXml } from '../parsers/workbookCalculations.js';
import { readWorkbookPackage, replaceWorkbookXml } from './workbookPackage.js';
import { resolveWorkbookSourceUri, workbookEditorKeys } from './workbookUri.js';

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

export class WorkbookCopyVerificationError extends Error {
    public constructor(message: string, public readonly destination: vscode.Uri) {
        super(message);
        this.name = 'WorkbookCopyVerificationError';
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

interface WorkbookSnapshot {
    diskBytes: Uint8Array;
    currentBytes: Uint8Array;
    editorText?: string;
    virtualEditorText?: string;
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
    return Buffer.from(left).equals(Buffer.from(right));
}

function workbookExtension(uri: vscode.Uri): string {
    const extension = extname(uri.fsPath).toLowerCase();
    if (extension !== '.twb' && extension !== '.twbx') {
        throw new Error('Select a .twb workbook or .twbx packaged workbook.');
    }
    return extension;
}

function workbookKey(uri: vscode.Uri): string {
    const key = uri.toString();
    return process.platform === 'win32' ? key.toLowerCase() : key;
}

const pendingEdits = new Map<string, Promise<unknown>>();

async function exclusively<T>(uri: vscode.Uri, action: () => Promise<T>): Promise<T> {
    const key = workbookKey(uri);
    const preceding = pendingEdits.get(key) ?? Promise.resolve();
    const result = preceding.catch(() => undefined).then(action);
    pendingEdits.set(key, result);
    try {
        return await result;
    } finally {
        if (pendingEdits.get(key) === result) {
            pendingEdits.delete(key);
        }
    }
}

export class WorkbookEditService {
    public constructor(private readonly now: () => Date = () => new Date()) {}

    public async apply(uri: vscode.Uri, originalXml: string, updatedXml: string, options: { fromXmlEditor?: boolean } = {}): Promise<WorkbookEditReceipt> {
        uri = resolveWorkbookSourceUri(uri);
        workbookExtension(uri);
        return exclusively(uri, async () => {
            if (!options.fromXmlEditor) {
                this.requireCleanPackageEditor(uri);
            }
            validateWorkbookXml(originalXml);
            validateWorkbookXml(updatedXml);
            if (originalXml === updatedXml) {
                throw new WorkbookEditTransactionError('The workbook edit made no changes.', undefined, false);
            }
            const snapshot = await this.snapshot(uri);
            const current = await readWorkbookPackage(snapshot.currentBytes, uri.fsPath);
            if (current.xml !== originalXml.replace(/^\uFEFF/, '')) {
                throw new WorkbookEditTransactionError('The workbook changed since this edit was prepared. Refresh it and try again.', undefined, false);
            }
            const replacement = await replaceWorkbookXml(snapshot.currentBytes, uri.fsPath, updatedXml);
            return this.commit(uri, snapshot, replacement);
        });
    }

    /** Save an independently verified copy. The original and existing files are never overwritten. */
    public async saveCopy(sourceUri: vscode.Uri, destinationUri: vscode.Uri, options: { expectedXml?: string } = {}): Promise<vscode.Uri> {
        sourceUri = resolveWorkbookSourceUri(sourceUri);
        destinationUri = resolveWorkbookSourceUri(destinationUri);
        this.requireSameFormat(sourceUri, destinationUri);
        if (workbookKey(sourceUri) === workbookKey(destinationUri)) {
            throw new Error('Save Copy requires a different path from the source workbook.');
        }
        return exclusively(sourceUri, async () => {
            const snapshot = await this.snapshot(sourceUri);
            await readWorkbookPackage(snapshot.currentBytes, sourceUri.fsPath);
            const bytes = snapshot.virtualEditorText === undefined ? snapshot.currentBytes
                : await replaceWorkbookXml(snapshot.currentBytes, sourceUri.fsPath, snapshot.virtualEditorText);
            if (options.expectedXml !== undefined && (await readWorkbookPackage(bytes, sourceUri.fsPath)).xml !== options.expectedXml.replace(/^\uFEFF/, '')) {
                throw new Error('The workbook changed since the export was reviewed. Read it again before saving a copy.');
            }
            await this.ensureUnchanged(sourceUri, snapshot);
            const temporary = vscode.Uri.joinPath(vscode.Uri.file(dirname(destinationUri.fsPath)), `.tableau-copy-${randomUUID()}.tmp`);
            let copied = false;
            try {
                await vscode.workspace.fs.writeFile(temporary, bytes);
                // The provider performs the exclusive create, avoiding a stat/write race.
                await vscode.workspace.fs.copy(temporary, destinationUri, { overwrite: false });
                copied = true;
                await this.verify(destinationUri, bytes);
                return destinationUri;
            } catch (error) {
                if (copied) {
                    // A different process may have replaced this path. There is
                    // no compare-and-delete operation in FileSystemProvider, so
                    // retain the destination for inspection instead of deleting it.
                    throw new WorkbookCopyVerificationError(`The copy could not be verified. The destination was kept for inspection: ${error instanceof Error ? error.message : String(error)}`, destinationUri);
                }
                throw error;
            } finally {
                await Promise.resolve(vscode.workspace.fs.delete(temporary)).catch(() => undefined);
            }
        });
    }

    /** Restore even a damaged workbook, keeping its current bytes as a new backup. */
    public async restore(uri: vscode.Uri, backupUri: vscode.Uri): Promise<WorkbookEditReceipt> {
        uri = resolveWorkbookSourceUri(uri);
        backupUri = resolveWorkbookSourceUri(backupUri);
        this.requireSameFormat(uri, backupUri);
        if (workbookKey(uri) === workbookKey(backupUri)) {
            throw new Error('Choose a backup file different from the current workbook.');
        }
        return exclusively(uri, async () => {
            this.requireCleanPackageEditor(uri);
            const replacement = await vscode.workspace.fs.readFile(backupUri);
            await readWorkbookPackage(replacement, backupUri.fsPath);
            const snapshot = await this.snapshot(uri);
            if (equalBytes(snapshot.currentBytes, replacement)) {
                throw new WorkbookEditTransactionError('The workbook already matches this backup.', undefined, false);
            }
            return this.commit(uri, snapshot, replacement);
        });
    }

    private requireSameFormat(source: vscode.Uri, destination: vscode.Uri): void {
        if (workbookExtension(source) !== workbookExtension(destination)) {
            throw new Error('The destination must use the same workbook extension; format conversion is not supported.');
        }
    }

    private openDocument(uri: vscode.Uri): vscode.TextDocument | undefined {
        return (vscode.workspace.textDocuments ?? []).find(document => workbookKey(document.uri) === workbookKey(uri));
    }

    private packageEditor(uri: vscode.Uri): vscode.TextDocument | undefined {
        const keys = workbookEditorKeys(uri);
        return (vscode.workspace.textDocuments ?? []).find(document => keys.includes(document.uri.toString()) && document.isDirty);
    }

    private requireCleanPackageEditor(uri: vscode.Uri): void {
        if (workbookExtension(uri) === '.twbx' && this.packageEditor(uri)) {
            throw new Error('The packaged workbook XML editor has unsaved changes. Save or revert those changes before editing or restoring the package.');
        }
    }

    private async snapshot(uri: vscode.Uri): Promise<WorkbookSnapshot> {
        const diskBytes = await vscode.workspace.fs.readFile(uri);
        const editorText = workbookExtension(uri) === '.twb' ? this.openDocument(uri)?.getText() : undefined;
        let currentBytes = diskBytes;
        if (editorText !== undefined) {
            const hasBom = diskBytes[0] === 0xef && diskBytes[1] === 0xbb && diskBytes[2] === 0xbf;
            currentBytes = encoder.encode(hasBom && !editorText.startsWith('\uFEFF') ? `\uFEFF${editorText}` : editorText);
        }
        const virtualEditorText = workbookExtension(uri) === '.twbx' ? this.packageEditor(uri)?.getText() : undefined;
        return { diskBytes, currentBytes, editorText, virtualEditorText };
    }

    private async ensureUnchanged(uri: vscode.Uri, expected: WorkbookSnapshot): Promise<void> {
        const current = await this.snapshot(uri);
        if (!equalBytes(current.diskBytes, expected.diskBytes) || !equalBytes(current.currentBytes, expected.currentBytes) || current.virtualEditorText !== expected.virtualEditorText) {
            throw new WorkbookEditTransactionError('The workbook changed while the edit was being prepared. Refresh it and try again.', undefined, false);
        }
    }

    private async commit(uri: vscode.Uri, snapshot: WorkbookSnapshot, replacement: Uint8Array): Promise<WorkbookEditReceipt> {
        await this.ensureUnchanged(uri, snapshot);
        let backup: vscode.Uri;
        try {
            backup = await this.createBackup(uri, snapshot.currentBytes);
        } catch (error) {
            throw new WorkbookEditTransactionError(`Could not create a workbook backup: ${error instanceof Error ? error.message : String(error)}`, undefined, false);
        }
        // A failed optimistic concurrency check must not trigger rollback over the newer edit.
        await this.ensureUnchanged(uri, snapshot);
        try {
            await this.write(uri, replacement);
            await this.verify(uri, replacement);
            return { backup, verified: true };
        } catch (error) {
            let rolledBack = false;
            let rollbackError = '';
            try {
                const currentBytes = await vscode.workspace.fs.readFile(uri);
                let validConcurrentWrite = false;
                if (!equalBytes(currentBytes, replacement) && !equalBytes(currentBytes, snapshot.currentBytes)) {
                    try {
                        await readWorkbookPackage(currentBytes, uri.fsPath);
                        validConcurrentWrite = true;
                    } catch {
                        // Invalid output is consistent with an interrupted write.
                    }
                }
                if (validConcurrentWrite) {
                    rollbackError = ' A different valid workbook appeared during verification. It was preserved; the original backup is available for manual restore.';
                } else if (equalBytes(currentBytes, snapshot.currentBytes)) {
                    rolledBack = true;
                } else {
                    await this.write(uri, snapshot.currentBytes);
                    rolledBack = equalBytes(await vscode.workspace.fs.readFile(uri), snapshot.currentBytes);
                }
            } catch (failure) {
                rollbackError = ` Could not safely restore the original workbook: ${failure instanceof Error ? failure.message : String(failure)}`;
            }
            throw new WorkbookEditTransactionError(
                `Workbook edit failed${rolledBack ? ' and was rolled back' : ''}: ${error instanceof Error ? error.message : String(error)}.${rollbackError}`,
                backup,
                rolledBack
            );
        }
    }

    private async verify(uri: vscode.Uri, expected: Uint8Array): Promise<void> {
        const actual = await vscode.workspace.fs.readFile(uri);
        if (!equalBytes(actual, expected)) {
            throw new Error('The persisted workbook does not match the validated edit.');
        }
        await readWorkbookPackage(actual, uri.fsPath);
    }

    private async createBackup(uri: vscode.Uri, content: Uint8Array): Promise<vscode.Uri> {
        const folder = vscode.Uri.file(dirname(uri.fsPath));
        const backupFolder = vscode.Uri.joinPath(folder, '.tableau-lsp-backups');
        await vscode.workspace.fs.createDirectory(backupFolder);
        const extension = extname(uri.fsPath) || '.twb';
        const stem = basename(uri.fsPath, extension);
        const backup = vscode.Uri.joinPath(
            backupFolder,
            `${stem}.${timestamp(this.now())}-${randomUUID().slice(0, 8)}${extension}`
        );
        await vscode.workspace.fs.writeFile(backup, content);
        if (!equalBytes(await vscode.workspace.fs.readFile(backup), content)) {
            throw new Error('The persisted backup does not match the original workbook.');
        }
        return backup;
    }

    private async write(uri: vscode.Uri, bytes: Uint8Array): Promise<void> {
        const openDocument = workbookExtension(uri) === '.twb' ? this.openDocument(uri) : undefined;
        if (!openDocument) {
            await vscode.workspace.fs.writeFile(uri, bytes);
            return;
        }
        const edit = new vscode.WorkspaceEdit();
        edit.replace(
            uri,
            new vscode.Range(openDocument.positionAt(0), openDocument.positionAt(openDocument.getText().length)),
            decoder.decode(bytes)
        );
        if (!await vscode.workspace.applyEdit(edit)) {
            throw new Error('VS Code rejected the workbook edit.');
        }
        if (!await openDocument.save()) {
            throw new Error('VS Code could not save the edited workbook.');
        }
    }
}
