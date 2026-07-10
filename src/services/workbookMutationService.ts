import * as vscode from 'vscode';
import {
    WorkbookCalculationInput,
    WorkbookCalculationResult,
    addOrUpdateWorkbookCalculation,
} from '../parsers/workbookCalculations.js';
import { WorkbookEditReceipt, WorkbookEditService } from './workbookEditService.js';
import { LocalTableauConnectorHub } from './localTableauConnectors.js';

const decoder = new TextDecoder('utf-8');

export interface WorkbookMutationOptions {
    relaunch?: boolean;
}

export interface WorkbookMutationReceipt extends WorkbookEditReceipt {
    launchedWith?: string;
    launchError?: string;
}

export interface CalculationMutationReceipt extends WorkbookMutationReceipt {
    calculation: WorkbookCalculationResult;
}

export async function readCurrentWorkbookXml(uri: vscode.Uri): Promise<string> {
    const openDocument = vscode.workspace.textDocuments.find(
        document => document.uri.toString() === uri.toString()
    );
    if (openDocument) {
        return openDocument.getText();
    }
    return decoder.decode(await vscode.workspace.fs.readFile(uri));
}

async function launchEditedWorkbook(uri: vscode.Uri): Promise<string> {
    const config = vscode.workspace.getConfiguration('tableau-language-support');
    const configuredExecutable = config.get<string>('local.executablePath', '').trim();
    return new LocalTableauConnectorHub({
        executablePath: configuredExecutable.length > 0 ? configuredExecutable : undefined,
    }).launchWorkbook(uri.fsPath);
}

export async function applyWorkbookXmlMutation(
    uri: vscode.Uri,
    originalXml: string,
    updatedXml: string,
    options: WorkbookMutationOptions = {}
): Promise<WorkbookMutationReceipt> {
    const receipt = await new WorkbookEditService().apply(uri, originalXml, updatedXml);
    if (!options.relaunch) {
        return receipt;
    }
    try {
        return { ...receipt, launchedWith: await launchEditedWorkbook(uri) };
    } catch (error) {
        return {
            ...receipt,
            launchError: error instanceof Error ? error.message : String(error),
        };
    }
}

export async function addCalculationToWorkbook(
    uri: vscode.Uri,
    input: WorkbookCalculationInput,
    options: WorkbookMutationOptions = {}
): Promise<CalculationMutationReceipt> {
    const originalXml = await readCurrentWorkbookXml(uri);
    const calculation = addOrUpdateWorkbookCalculation(originalXml, input);
    const receipt = await applyWorkbookXmlMutation(uri, originalXml, calculation.updatedXml, options);
    return { ...receipt, calculation };
}
