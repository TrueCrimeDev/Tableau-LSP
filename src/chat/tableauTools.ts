import * as vscode from 'vscode';
import {
    CalculationPlan,
    CalculationPlanError,
    describeCalculationPlan,
    describeCalculationReceipt,
    normalizeCalculationInput,
} from './calculationPlan.js';
import { FieldInventoryKind, buildFieldInventory } from './fieldInventory.js';
import { NoWritableWorkbookError, resolveWorkbookUri, resolveWritableWorkbookUri } from './activeWorkbook.js';
import { addCalculationToWorkbook, readCurrentWorkbookXml } from '../services/workbookMutationService.js';
import { basename } from 'path';
import { readWorkbookXml } from '../services/workbookFieldContextManager.js';

/**
 * Language model tools that let any agent — the @tableau participant, Copilot
 * agent mode, or another extension — read the live workbook's full schema and
 * write calculated fields into it.
 *
 * Both are contributed in package.json under `languageModelTools`; the names
 * here must match those entries.
 */

export const TABLEAU_LIST_FIELDS_TOOL = 'tableau_listFields';
export const TABLEAU_ADD_CALCULATION_TOOL = 'tableau_addCalculation';

/** Prefix that marks a failed tool call so the model cannot read it as success. */
const TOOL_ERROR = 'TOOL ERROR — the workbook was NOT changed.';

function textResult(value: string): vscode.LanguageModelToolResult {
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(value)]);
}

function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

interface ListFieldsInput {
    datasource?: string;
    kind?: FieldInventoryKind;
    nameContains?: string;
}

class ListFieldsTool implements vscode.LanguageModelTool<ListFieldsInput> {
    public prepareInvocation(
        options: vscode.LanguageModelToolInvocationPrepareOptions<ListFieldsInput>
    ): vscode.PreparedToolInvocation {
        const scope = options.input.datasource ? ` in ${options.input.datasource}` : '';
        return { invocationMessage: `Reading Tableau workbook fields${scope}` };
    }

    public async invoke(
        options: vscode.LanguageModelToolInvocationOptions<ListFieldsInput>
    ): Promise<vscode.LanguageModelToolResult> {
        const uri = await resolveWorkbookUri();
        if (!uri) {
            return textResult(
                'No unambiguous Tableau workbook is open. Ask the user to open the .twb or .twbx workbook they mean.'
            );
        }
        try {
            const source = await readWorkbookXml(uri);
            const inventory = buildFieldInventory(source.xml, source.workbookName, {
                datasource: options.input.datasource,
                kind: options.input.kind,
                nameContains: options.input.nameContains,
            });
            return textResult(inventory);
        } catch (error) {
            return textResult(`Could not read the workbook fields: ${messageOf(error)}`);
        }
    }
}

interface AddCalculationInput {
    caption?: string;
    formula?: string;
    datatype?: string;
    datasource?: string;
    role?: string;
    replaceExisting?: boolean;
}

/** What the user was actually shown on the confirmation card. */
interface ApprovedTarget {
    uri: string;
    datasource: string;
    caption: string;
    formula: string;
    replacesExisting: boolean;
}

function targetOf(uri: vscode.Uri, plan: CalculationPlan): ApprovedTarget {
    return {
        uri: uri.toString(),
        datasource: plan.datasource,
        caption: plan.caption,
        formula: plan.formula,
        replacesExisting: plan.replacesExisting,
    };
}

function inputKey(input: AddCalculationInput): string {
    return JSON.stringify([input.caption, input.formula, input.datatype, input.datasource, input.role]);
}

class AddCalculationTool implements vscode.LanguageModelTool<AddCalculationInput> {
    /**
     * What prepareInvocation resolved, so invoke() can prove it is about to
     * write the same thing the user approved. VS Code renders the Continue /
     * Cancel card between the two calls, and the active editor can change
     * while it waits.
     */
    private readonly approved = new Map<string, ApprovedTarget>();

    /**
     * Reads the workbook to validate the calculation and describe exactly what
     * will change. Returning `confirmationMessages` is what puts the Continue /
     * Cancel card in front of the user before anything is written.
     */
    public async prepareInvocation(
        options: vscode.LanguageModelToolInvocationPrepareOptions<AddCalculationInput>
    ): Promise<vscode.PreparedToolInvocation> {
        const caption = options.input.caption?.trim() ?? 'calculated field';
        const invocationMessage = `Writing "${caption}" to the Tableau workbook`;
        this.approved.delete(inputKey(options.input));
        try {
            const uri = await resolveWritableWorkbookUri();
            const xml = await readCurrentWorkbookXml(uri);
            const plan = normalizeCalculationInput(options.input, xml);
            this.approved.set(inputKey(options.input), targetOf(uri, plan));
            return {
                invocationMessage,
                confirmationMessages: {
                    title: `${plan.replacesExisting ? 'Overwrite' : 'Add'} "${plan.caption}" ` +
                        `in ${basename(uri.fsPath)}?`,
                    message: new vscode.MarkdownString(describeCalculationPlan(plan, uri.fsPath)),
                },
            };
        } catch {
            // Invalid input or no writable workbook. Skip the confirmation card
            // and let invoke() hand the model an error it can correct.
            return { invocationMessage };
        }
    }

    public async invoke(
        options: vscode.LanguageModelToolInvocationOptions<AddCalculationInput>
    ): Promise<vscode.LanguageModelToolResult> {
        const key = inputKey(options.input);
        const approved = this.approved.get(key);
        this.approved.delete(key);

        let uri: vscode.Uri;
        try {
            uri = await resolveWritableWorkbookUri();
        } catch (error) {
            if (error instanceof NoWritableWorkbookError) {
                return textResult(`${TOOL_ERROR} ${error.message}`);
            }
            throw error;
        }

        try {
            const xml = await readCurrentWorkbookXml(uri);
            const plan = normalizeCalculationInput(options.input, xml);

            // The card the user approved named a specific workbook, datasource
            // and add-vs-overwrite verdict. Anything else is a write they did
            // not consent to — refuse and make the model ask again.
            if (!approved) {
                return textResult(
                    `${TOOL_ERROR} This edit was not confirmed. Call tableau_addCalculation again so the user ` +
                    'can review the change before it is written.'
                );
            }
            const current = targetOf(uri, plan);
            if (JSON.stringify(current) !== JSON.stringify(approved)) {
                return textResult(
                    `${TOOL_ERROR} The workbook changed between the confirmation prompt and the write ` +
                    `(approved \`${approved.uri}\`, now \`${current.uri}\`). Nothing was written. ` +
                    'Call tableau_addCalculation again to re-confirm against the current workbook.'
                );
            }

            const receipt = await addCalculationToWorkbook(uri, {
                datasource: plan.datasource,
                caption: plan.caption,
                formula: plan.formula,
                datatype: plan.datatype,
                role: plan.role,
                replaceExisting: plan.replaceExisting,
            });
            return textResult(describeCalculationReceipt({
                action: receipt.calculation.action,
                caption: receipt.calculation.caption,
                datasourceCaption: receipt.calculation.datasource,
                workbookName: basename(uri.fsPath),
                backupPath: receipt.backup.fsPath,
            }));
        } catch (error) {
            if (error instanceof CalculationPlanError) {
                return textResult(`${TOOL_ERROR} ${error.message}`);
            }
            return textResult(`${TOOL_ERROR} ${messageOf(error)}`);
        }
    }
}

/** The workbook tools this extension contributes, for a participant's request. */
export function tableauToolSpecs(): vscode.LanguageModelChatTool[] {
    return vscode.lm.tools
        .filter(tool => tool.name === TABLEAU_LIST_FIELDS_TOOL || tool.name === TABLEAU_ADD_CALCULATION_TOOL)
        .map(tool => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
        }));
}

export function registerTableauLanguageModelTools(context: vscode.ExtensionContext): void {
    // The tools API ships in VS Code 1.95+; older hosts simply skip the feature.
    if (typeof vscode.lm.registerTool !== 'function') {
        return;
    }
    context.subscriptions.push(
        vscode.lm.registerTool(TABLEAU_LIST_FIELDS_TOOL, new ListFieldsTool()),
        vscode.lm.registerTool(TABLEAU_ADD_CALCULATION_TOOL, new AddCalculationTool())
    );
}
