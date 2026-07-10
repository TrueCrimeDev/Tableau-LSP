import * as vscode from 'vscode';
import {
    TableauCalculationDatatype,
    listWorkbookDatasources,
} from '../parsers/workbookCalculations.js';
import {
    addCalculationToWorkbook,
    readCurrentWorkbookXml,
} from '../services/workbookMutationService.js';
import { basename } from 'path';

interface DatatypePick extends vscode.QuickPickItem {
    datatype: TableauCalculationDatatype;
}

function activeWorkbookUri(): vscode.Uri | undefined {
    const editorUri = vscode.window.activeTextEditor?.document.uri;
    if (editorUri?.path.toLowerCase().endsWith('.twb')) {
        return editorUri;
    }
    for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) {
            const input = tab.input as { uri?: vscode.Uri } | undefined;
            if (input?.uri?.path.toLowerCase().endsWith('.twb')) {
                return input.uri;
            }
        }
    }
    return undefined;
}

async function pickWorkbook(): Promise<vscode.Uri | undefined> {
    const active = activeWorkbookUri();
    if (active) {
        return active;
    }
    const workbooks = await vscode.workspace.findFiles('**/*.twb', '**/{node_modules,.git,.worktrees}/**', 100);
    if (!workbooks.length) {
        void vscode.window.showErrorMessage('No .twb workbook was found. Open or add one to the workspace first.');
        return undefined;
    }
    if (workbooks.length === 1) {
        return workbooks[0];
    }
    const selected = await vscode.window.showQuickPick(
        workbooks.map(uri => ({ label: basename(uri.fsPath), description: uri.fsPath, uri })),
        { placeHolder: 'Choose the workbook that will receive the calculated field', matchOnDescription: true }
    );
    return selected?.uri;
}

function calculationSourceFromEditor(): { caption?: string; formula?: string } {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'twbl') {
        return {};
    }
    let value = editor.selection.isEmpty
        ? editor.document.getText()
        : editor.document.getText(editor.selection);
    const header = /^\s*\/\/\s*([^\r\n–-]+)(?:\s*[–-].*)?\r?\n/.exec(value);
    const caption = header?.[1]?.trim();
    if (header) {
        value = value.slice(header[0].length);
    }
    return { caption, formula: value.trim() };
}

export async function addWorkbookCalculationCommand(): Promise<void> {
    const workbookUri = await pickWorkbook();
    if (!workbookUri) {
        return;
    }
    try {
        const xml = await readCurrentWorkbookXml(workbookUri);
        const datasources = listWorkbookDatasources(xml).filter(item => {
            const normalizedName = item.name.replace(/^\[|\]$/g, '').toLowerCase();
            return item.caption.toLowerCase() !== 'parameters' && normalizedName !== 'parameters';
        });
        if (!datasources.length) {
            throw new Error('No writable datasource was found in this workbook.');
        }
        const datasource = datasources.length === 1
            ? datasources[0]
            : (await vscode.window.showQuickPick(
                datasources.map(item => ({
                    label: item.caption,
                    description: item.name,
                    datasource: item,
                })),
                { placeHolder: 'Choose a datasource for the calculated field' }
            ))?.datasource;
        if (!datasource) {
            return;
        }

        const editorSource = calculationSourceFromEditor();
        const caption = await vscode.window.showInputBox({
            title: 'Calculated field name',
            prompt: `Add a calculation to ${datasource.caption}`,
            value: editorSource.caption ?? '',
            validateInput: value => value.trim() ? undefined : 'A field name is required.',
        });
        if (!caption) {
            return;
        }
        const sourceFormula = editorSource.formula ?? '';
        const formula = sourceFormula.length > 0
            ? sourceFormula
            : await vscode.window.showInputBox({
                title: `Formula for ${caption}`,
                prompt: 'For multiline formulas, select the formula in a .twbl editor before running this command.',
                validateInput: value => value.trim() ? undefined : 'A formula is required.',
            });
        if (!formula) {
            return;
        }
        const datatypes: DatatypePick[] = [
            { label: 'Number (real)', description: 'Measure / quantitative', datatype: 'real' },
            { label: 'Integer', description: 'Measure / quantitative', datatype: 'integer' },
            { label: 'String', description: 'Dimension / nominal', datatype: 'string' },
            { label: 'Boolean', description: 'Dimension / nominal', datatype: 'boolean' },
            { label: 'Date', description: 'Dimension / ordinal', datatype: 'date' },
            { label: 'Date & time', description: 'Dimension / ordinal', datatype: 'datetime' },
        ];
        const datatype = await vscode.window.showQuickPick(datatypes, {
            placeHolder: 'Choose the calculation result datatype',
        });
        if (!datatype) {
            return;
        }
        const exists = datasource.calculations.some(item => item.toLowerCase() === caption.trim().toLowerCase());
        let replaceExisting = false;
        if (exists) {
            replaceExisting = await vscode.window.showWarningMessage(
                `Replace the existing calculation "${caption.trim()}"?`,
                { modal: true },
                'Replace'
            ) === 'Replace';
            if (!replaceExisting) {
                return;
            }
        }
        const launch = await vscode.window.showQuickPick([
            { label: 'Save and open in Tableau', relaunch: true },
            { label: 'Save only', relaunch: false },
        ], { placeHolder: 'After the verified workbook edit…' });
        if (!launch) {
            return;
        }

        const receipt = await addCalculationToWorkbook(workbookUri, {
            datasource: datasource.name,
            caption,
            formula,
            datatype: datatype.datatype,
            replaceExisting,
        }, { relaunch: launch.relaunch });
        const launchMessage = receipt.launchedWith
            ? ' Opened in Tableau.'
            : receipt.launchError
                ? ` Saved, but Tableau did not open: ${receipt.launchError}.`
                : '';
        void vscode.window.showInformationMessage(
            `${receipt.calculation.action === 'added' ? 'Added' : 'Updated'} ` +
            `"${receipt.calculation.caption}" in ${basename(workbookUri.fsPath)}. ` +
            `${launchMessage} Backup: ${receipt.backup.fsPath}`
        );
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(`Could not add the Tableau calculation: ${message}`);
    }
}
