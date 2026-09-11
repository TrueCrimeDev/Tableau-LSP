import {
    TableauCalculationDatatype,
    TableauCalculationRole,
    WorkbookDatasourceInfo,
    listWorkbookDatasources,
    validateCalculationFormula,
    workbookCalculationSemanticContext,
} from '../parsers/workbookCalculations.js';
import {
    describeUnknownReferences,
    findUnknownReferences,
    knownReferenceNames,
} from './formulaReferences.js';
import { safeMarkdownText, sanitizeWorkbookText } from './untrustedText.js';
import { buildWorkbookFieldContext } from '../services/workbookFieldContext.js';

/**
 * Turns a language model's loosely-typed tool input into a calculation the
 * workbook writer will accept, or into an error the model can act on.
 *
 * Validation happens here rather than inside the write so the user is never
 * shown a confirmation prompt for an edit that was doomed to fail.
 */

export const CALCULATION_DATATYPES: readonly TableauCalculationDatatype[] = [
    'string', 'real', 'integer', 'boolean', 'date', 'datetime',
];

export interface CalculationPlan {
    datasource: string;
    datasourceCaption: string;
    caption: string;
    formula: string;
    datatype: TableauCalculationDatatype;
    role: TableauCalculationRole;
    replaceExisting: boolean;
    /** True when the caption already exists and will be overwritten. */
    replacesExisting: boolean;
}

export class CalculationPlanError extends Error {}

function text(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

/** Tableau's parameter pseudo-datasource cannot hold calculated fields. */
function writableDatasources(xml: string): WorkbookDatasourceInfo[] {
    return listWorkbookDatasources(xml).filter(item => {
        const normalized = item.name.replace(/^\[|\]$/g, '').toLowerCase();
        return item.caption.toLowerCase() !== 'parameters' && normalized !== 'parameters';
    });
}

/** Datasource captions are workbook-controlled and flow back to the model. */
function captionList(datasources: WorkbookDatasourceInfo[]): string {
    return datasources.map(item => `"${sanitizeWorkbookText(item.caption, 120)}"`).join(', ');
}

function resolveDatasource(xml: string, requested: string): WorkbookDatasourceInfo {
    const datasources = writableDatasources(xml);
    if (!datasources.length) {
        throw new CalculationPlanError('This workbook has no datasource that can hold a calculated field.');
    }
    if (!requested) {
        if (datasources.length === 1) {
            return datasources[0];
        }
        throw new CalculationPlanError(
            'This workbook has more than one datasource, so "datasource" is required. Choose one of: ' +
            captionList(datasources) + '.'
        );
    }
    const wanted = requested.toLowerCase().replace(/^\[|\]$/g, '');
    const match = datasources.find(item =>
        item.caption.toLowerCase() === wanted ||
        item.name.toLowerCase() === wanted ||
        item.name.toLowerCase().replace(/^\[|\]$/g, '') === wanted
    );
    if (!match) {
        throw new CalculationPlanError(
            `Datasource "${sanitizeWorkbookText(requested, 120)}" is not in this workbook. Available: ` +
            captionList(datasources) + '.'
        );
    }
    return match;
}

function resolveDatatype(raw: unknown, formula: string): TableauCalculationDatatype {
    const requested = text(raw).toLowerCase();
    if ((CALCULATION_DATATYPES as readonly string[]).includes(requested)) {
        return requested as TableauCalculationDatatype;
    }
    if (requested) {
        throw new CalculationPlanError(
            `Datatype "${requested}" is not a Tableau calculation datatype. Use one of: ` +
            CALCULATION_DATATYPES.join(', ') + '.'
        );
    }
    // The schema marks datatype required, so this is a defensive fallback only.
    if (/^\s*(SUM|AVG|MIN|MAX|COUNTD?|MEDIAN|STDEV|VAR|ZN|TOTAL|RUNNING_|WINDOW_)/i.test(formula)) {
        return 'real';
    }
    return 'string';
}

export function normalizeCalculationInput(raw: unknown, xml: string): CalculationPlan {
    const input = (raw ?? {}) as Record<string, unknown>;
    const caption = text(input.caption) || text(input.name);
    if (!caption) {
        throw new CalculationPlanError('A calculation name ("caption") is required.');
    }
    if (/[[\]\r\n]/.test(caption)) {
        throw new CalculationPlanError(
            `"${caption}" is not a usable calculation name — names cannot contain brackets or line breaks. ` +
            'Pass the name without brackets.'
        );
    }

    const formula = text(input.formula);
    if (!formula) {
        throw new CalculationPlanError('A Tableau "formula" is required.');
    }
    const formulaErrors = validateCalculationFormula(formula);
    if (formulaErrors.length) {
        throw new CalculationPlanError(`The formula is not valid Tableau: ${formulaErrors.join(' ')}`);
    }

    const datasource = resolveDatasource(xml, text(input.datasource));
    const semanticErrors = validateCalculationFormula(formula, workbookCalculationSemanticContext(xml, datasource.name));
    if (semanticErrors.length) {
        throw new CalculationPlanError(`The formula is not valid Tableau: ${semanticErrors.join(' ')}`);
    }

    // Syntax validation says nothing about whether the fields exist, so a
    // single transposed letter would otherwise reach the workbook and show up
    // in Tableau as a broken calculation.
    const known = knownReferenceNames(
        buildWorkbookFieldContext(xml, 'workbook').fields,
        datasource.caption
    );
    const unknown = findUnknownReferences({
        formula,
        knownNames: known,
        datasourceAliases: [datasource.caption, datasource.name],
        selfName: caption,
    });
    if (unknown.length) {
        throw new CalculationPlanError(
            describeUnknownReferences(unknown, sanitizeWorkbookText(datasource.caption, 120))
        );
    }
    const datatype = resolveDatatype(input.datatype, formula);
    const requestedRole = text(input.role).toLowerCase();
    const role: TableauCalculationRole = requestedRole === 'dimension' || requestedRole === 'measure'
        ? requestedRole
        : datatype === 'real' || datatype === 'integer' ? 'measure' : 'dimension';

    // The writer collides against EVERY column, calculated or not, so this
    // pre-check has to use the same domain — otherwise the confirmation card
    // can read "Add" for a write that overwrites or that always fails.
    const wantedCaption = caption.toLowerCase();
    const replacesExisting = datasource.calculations.some(item => item.toLowerCase() === wantedCaption);
    const collidesWithPlainField = !replacesExisting &&
        datasource.columns.some(item => item.toLowerCase() === wantedCaption);
    const safeDatasource = sanitizeWorkbookText(datasource.caption, 120);
    if (collidesWithPlainField) {
        throw new CalculationPlanError(
            `"${caption}" is already a non-calculated field in "${safeDatasource}", which Tableau will not let a ` +
            'calculation replace. Choose a different name.'
        );
    }
    const replaceExisting = input.replaceExisting === true;
    if (replacesExisting && !replaceExisting) {
        throw new CalculationPlanError(
            `"${caption}" already exists in "${safeDatasource}". ` +
            'Call again with replaceExisting: true to overwrite it, or choose a different name.'
        );
    }

    return {
        datasource: datasource.name,
        datasourceCaption: datasource.caption,
        caption,
        formula,
        datatype,
        role,
        replaceExisting,
        replacesExisting,
    };
}

/**
 * A fence longer than any backtick run inside the formula. The formula is
 * model-supplied, so it must not be able to close the block early and forge
 * text on the card the user is being asked to approve.
 */
function fenceFor(formula: string): string {
    const longestRun = Math.max(0, ...[...formula.matchAll(/`+/g)].map(match => match[0].length));
    return '`'.repeat(Math.max(3, longestRun + 1));
}

/**
 * The body of the confirmation card shown before the workbook is written.
 * `workbookPath` is the full path, not a basename: the user cannot consent to
 * a write whose target they cannot see.
 */
export function describeCalculationPlan(plan: CalculationPlan, workbookPath: string): string {
    const fence = fenceFor(plan.formula);
    return [
        `${plan.replacesExisting ? 'Overwrite' : 'Add'} **${safeMarkdownText(plan.caption, 200)}** ` +
        `(${plan.datatype}, ${plan.role}) in datasource ` +
        `**${safeMarkdownText(plan.datasourceCaption, 200)}**.`,
        '',
        fence,
        plan.formula,
        fence,
        '',
        `Writes to \`${sanitizeWorkbookText(workbookPath, 300)}\`.`,
        'A timestamped backup is written to `.tableau-lsp-backups/` first, and the edit rolls back if the workbook fails validation.',
    ].join('\n');
}

export interface CalculationReceiptSummary {
    action: 'added' | 'updated';
    caption: string;
    datasourceCaption: string;
    workbookName: string;
    backupPath: string;
    launchedWith?: string;
    launchError?: string;
}

/** The tool result the model reads back after a successful write. */
export function describeCalculationReceipt(summary: CalculationReceiptSummary): string {
    const lines = [
        `${summary.action === 'added' ? 'Added' : 'Updated'} calculated field ` +
        `"${sanitizeWorkbookText(summary.caption, 200)}" in datasource ` +
        `"${sanitizeWorkbookText(summary.datasourceCaption, 200)}" of ` +
        `${sanitizeWorkbookText(summary.workbookName, 200)}. ` +
        'The workbook on disk now contains this calculation.',
        `Backup of the previous workbook: ${sanitizeWorkbookText(summary.backupPath, 300)}`,
    ];
    if (summary.launchedWith) {
        lines.push(`Reopened in Tableau via ${summary.launchedWith}.`);
    } else if (summary.launchError) {
        lines.push(`Saved, but Tableau could not be launched: ${summary.launchError}`);
    }
    lines.push(
        'Tell the user it is saved, name the backup path, and remind them Tableau must reopen the workbook to see the field.'
    );
    return lines.join('\n');
}
