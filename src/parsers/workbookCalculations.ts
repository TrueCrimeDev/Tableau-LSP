import { TokenType, tokenize } from '../lexer.js';
import { XMLValidator } from 'fast-xml-parser';
import { createHash } from 'crypto';

export type TableauCalculationDatatype = 'string' | 'real' | 'integer' | 'boolean' | 'date' | 'datetime';
export type TableauCalculationRole = 'dimension' | 'measure';
export type TableauCalculationType = 'nominal' | 'ordinal' | 'quantitative';

export interface WorkbookDatasourceInfo {
    caption: string;
    name: string;
    calculations: string[];
}

export interface WorkbookCalculationInput {
    datasource: string;
    caption: string;
    formula: string;
    datatype: TableauCalculationDatatype;
    role?: TableauCalculationRole;
    type?: TableauCalculationType;
    replaceExisting?: boolean;
}

export interface WorkbookCalculationResult {
    updatedXml: string;
    action: 'added' | 'updated';
    datasource: string;
    caption: string;
    internalName: string;
}

export class WorkbookCalculationError extends Error {
    public constructor(message: string, public readonly code: string) {
        super(message);
        this.name = 'WorkbookCalculationError';
    }
}

interface XmlChild {
    name: string;
    start: number;
    openEnd: number;
    end: number;
    openingTag: string;
}

interface DatasourceBlock extends WorkbookDatasourceInfo {
    start: number;
    openEnd: number;
    closeStart: number;
    end: number;
    openingTag: string;
    children: XmlChild[];
}

function validateXml(xml: string): void {
    const result = XMLValidator.validate(xml);
    if (result !== true) {
        const detail = typeof result === 'object'
            ? `${result.err.msg} (line ${String(result.err.line)}, column ${String(result.err.col)})`
            : 'Unknown XML validation error';
        throw new WorkbookCalculationError(`Workbook XML is not well formed: ${detail}`, 'INVALID_WORKBOOK_XML');
    }
    if (!/<workbook\b/i.test(xml) || !/<datasources\b/i.test(xml)) {
        throw new WorkbookCalculationError('The document is not a Tableau workbook with datasources.', 'INVALID_WORKBOOK');
    }
}

function maskIgnoredXml(xml: string): string {
    return xml.replace(/<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->/g, value =>
        value.replace(/[^\r\n]/g, ' ')
    );
}

function attributeOf(tag: string, name: string): string | undefined {
    const match = new RegExp(`\\b${name}=(['"])([\\s\\S]*?)\\1`, 'i').exec(tag);
    return match?.[2]
        ?.replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&gt;/g, '>')
        .replace(/&lt;/g, '<')
        .replace(/&amp;/g, '&');
}

function scanDirectChildren(xml: string, contentStart: number, contentEnd: number): XmlChild[] {
    const source = maskIgnoredXml(xml.slice(contentStart, contentEnd));
    const tagPattern = /<\/?([A-Za-z_][\w:.-]*)(?:\s[^<>]*?)?\/?>/g;
    const children: XmlChild[] = [];
    let depth = 0;
    let active: XmlChild | undefined;
    let match: RegExpExecArray | null;
    while ((match = tagPattern.exec(source)) !== null) {
        const tag = match[0];
        const closing = tag.startsWith('</');
        const selfClosing = /\/\s*>$/.test(tag);
        const absoluteStart = contentStart + match.index;
        const absoluteEnd = absoluteStart + tag.length;
        if (closing) {
            depth = Math.max(0, depth - 1);
            if (depth === 0 && active) {
                active.end = absoluteEnd;
                active = undefined;
            }
            continue;
        }
        if (depth === 0) {
            const child: XmlChild = {
                name: match[1].toLowerCase(),
                start: absoluteStart,
                openEnd: absoluteEnd,
                end: absoluteEnd,
                openingTag: xml.slice(absoluteStart, absoluteEnd),
            };
            children.push(child);
            if (!selfClosing) {
                active = child;
            }
        }
        if (!selfClosing) {
            depth += 1;
        }
    }
    return children;
}

function datasourceBlocks(xml: string): DatasourceBlock[] {
    validateXml(xml);
    const masked = maskIgnoredXml(xml);
    const containerOpen = /<datasources\b[^>]*>/i.exec(masked);
    if (containerOpen?.index === undefined) {
        return [];
    }
    const contentStart = containerOpen.index + containerOpen[0].length;
    const closeStart = masked.indexOf('</datasources>', contentStart);
    if (closeStart < 0) {
        throw new WorkbookCalculationError('The workbook datasources container is not closed.', 'INVALID_WORKBOOK_XML');
    }
    return scanDirectChildren(xml, contentStart, closeStart)
        .filter(child => child.name === 'datasource')
        .map(child => {
            const datasourceCloseStart = child.end - '</datasource>'.length;
            const children = scanDirectChildren(xml, child.openEnd, datasourceCloseStart);
            const caption = attributeOf(child.openingTag, 'caption') ??
                attributeOf(child.openingTag, 'name') ?? 'Unknown Datasource';
            const name = attributeOf(child.openingTag, 'name') ?? caption;
            const calculations = children
                .filter(item => item.name === 'column')
                .filter(item => /<calculation\b/i.test(xml.slice(item.start, item.end)))
                .map(item => attributeOf(item.openingTag, 'caption') ?? attributeOf(item.openingTag, 'name') ?? '')
                .filter(Boolean);
            return {
                caption,
                name,
                calculations,
                start: child.start,
                openEnd: child.openEnd,
                closeStart: datasourceCloseStart,
                end: child.end,
                openingTag: child.openingTag,
                children,
            };
        });
}

export function listWorkbookDatasources(xml: string): WorkbookDatasourceInfo[] {
    return datasourceBlocks(xml).map(({ caption, name, calculations }) => ({ caption, name, calculations }));
}

export function validateCalculationFormula(formula: string): string[] {
    const value = formula.trim();
    if (!value) {
        return ['Formula is required.'];
    }
    const errors: string[] = [];
    const delimiters: TokenType[] = [];
    let blockDepth = 0;
    for (const token of tokenize(value)) {
        if (token.type === TokenType.Unexpected) {
            errors.push(`Unexpected or unterminated token near "${token.value.slice(0, 24)}".`);
        } else if (token.type === TokenType.LParen || token.type === TokenType.LBrace) {
            delimiters.push(token.type);
        } else if (token.type === TokenType.RParen) {
            if (delimiters.pop() !== TokenType.LParen) {
                errors.push('Unbalanced parentheses.');
            }
        } else if (token.type === TokenType.RBrace) {
            if (delimiters.pop() !== TokenType.LBrace) {
                errors.push('Unbalanced LOD braces.');
            }
        } else if (token.type === TokenType.If || token.type === TokenType.Case) {
            blockDepth += 1;
        } else if (token.type === TokenType.End) {
            blockDepth -= 1;
            if (blockDepth < 0) {
                errors.push('END does not have a matching IF or CASE.');
                blockDepth = 0;
            }
        }
    }
    if (delimiters.includes(TokenType.LParen)) {
        errors.push('Unbalanced parentheses.');
    }
    if (delimiters.includes(TokenType.LBrace)) {
        errors.push('Unbalanced LOD braces.');
    }
    if (blockDepth > 0) {
        errors.push('IF or CASE is missing END.');
    }
    return [...new Set(errors)];
}

function escapeXmlAttribute(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/'/g, '&apos;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\r\n|\r|\n/g, '&#13;&#10;');
}

function setAttribute(tag: string, name: string, value: string): string {
    const pattern = new RegExp(`\\b${name}=(['"])[\\s\\S]*?\\1`, 'i');
    const encoded = escapeXmlAttribute(value);
    if (pattern.test(tag)) {
        return tag.replace(pattern, `${name}='${encoded}'`);
    }
    return tag.replace(/\s*\/?\s*>$/, ending => ` ${name}='${encoded}'${ending}`);
}

function calculationMetadata(input: WorkbookCalculationInput): {
    datatype: TableauCalculationDatatype;
    role: TableauCalculationRole;
    type: TableauCalculationType;
} {
    const role = input.role ?? (
        input.datatype === 'real' || input.datatype === 'integer' ? 'measure' : 'dimension'
    );
    const type = input.type ?? (
        role === 'measure' && (input.datatype === 'real' || input.datatype === 'integer')
            ? 'quantitative'
            : input.datatype === 'date' || input.datatype === 'datetime'
                ? 'ordinal'
                : 'nominal'
    );
    return { datatype: input.datatype, role, type };
}

function generateInternalName(xml: string, datasource: string, caption: string, formula: string): string {
    const existing = new Set(
        [...xml.matchAll(/name=(['"])\[?(Calculation_\d+)\]?\1/gi)].map(match => match[2].toLowerCase())
    );
    for (let attempt = 0; attempt < 100; attempt += 1) {
        const hash = createHash('sha256')
            .update(`${datasource}\0${caption}\0${formula}\0${String(attempt)}`)
            .digest('hex');
        const digits = (BigInt(`0x${hash.slice(0, 16)}`) % 10_000_000_000_000_000n)
            .toString()
            .padStart(16, '0');
        const name = `Calculation_${digits}`;
        if (!existing.has(name.toLowerCase())) {
            return `[${name}]`;
        }
    }
    throw new WorkbookCalculationError('Could not generate a unique Tableau calculation identifier.', 'ID_COLLISION');
}

function lineStartAt(xml: string, index: number): number {
    const lineFeed = xml.lastIndexOf('\n', index - 1);
    return lineFeed < 0 ? 0 : lineFeed + 1;
}

function indentationAt(xml: string, index: number): string {
    const start = lineStartAt(xml, index);
    return /^[\t ]*/.exec(xml.slice(start, index))?.[0] ?? '';
}

function replaceExistingCalculation(
    xml: string,
    child: XmlChild,
    input: WorkbookCalculationInput,
    metadata: ReturnType<typeof calculationMetadata>
): { updatedXml: string; internalName: string } {
    const original = xml.slice(child.start, child.end);
    if (!/<calculation\b/i.test(original)) {
        throw new WorkbookCalculationError(
            `A non-calculated field named "${input.caption}" already exists in this datasource.`,
            'FIELD_NAME_CONFLICT'
        );
    }
    const internalName = attributeOf(child.openingTag, 'name') ?? '';
    let openingTag = child.openingTag;
    openingTag = setAttribute(openingTag, 'caption', input.caption);
    openingTag = setAttribute(openingTag, 'datatype', metadata.datatype);
    openingTag = setAttribute(openingTag, 'role', metadata.role);
    openingTag = setAttribute(openingTag, 'type', metadata.type);
    let replacement = openingTag + original.slice(child.openingTag.length);
    replacement = replacement.replace(/<calculation\b[^>]*>/i, tag =>
        setAttribute(setAttribute(tag, 'class', 'tableau'), 'formula', input.formula.trim())
    );
    return {
        updatedXml: xml.slice(0, child.start) + replacement + xml.slice(child.end),
        internalName,
    };
}

function insertCalculation(
    xml: string,
    datasource: DatasourceBlock,
    input: WorkbookCalculationInput,
    metadata: ReturnType<typeof calculationMetadata>
): { updatedXml: string; internalName: string } {
    const internalName = generateInternalName(xml, datasource.name, input.caption, input.formula.trim());
    const nextChild = datasource.children.find(child => child.name === 'column') ??
        datasource.children.find(child => ['extract', 'layout', 'semantic-values'].includes(child.name));
    const rawInsertion = nextChild?.start ?? datasource.closeStart;
    const possibleLineStart = lineStartAt(xml, rawInsertion);
    const insertion = /^[\t ]*$/.test(xml.slice(possibleLineStart, rawInsertion))
        ? possibleLineStart
        : rawInsertion;
    const parentIndent = indentationAt(xml, datasource.start);
    const indent = nextChild ? indentationAt(xml, nextChild.start) : `${parentIndent}  `;
    const newline = xml.includes('\r\n') ? '\r\n' : '\n';
    const column = [
        `${indent}<column caption='${escapeXmlAttribute(input.caption)}' datatype='${metadata.datatype}' name='${internalName}' role='${metadata.role}' type='${metadata.type}'>`,
        `${indent}  <calculation class='tableau' formula='${escapeXmlAttribute(input.formula.trim())}' />`,
        `${indent}</column>`,
        '',
    ].join(newline);
    return {
        updatedXml: xml.slice(0, insertion) + column + xml.slice(insertion),
        internalName,
    };
}

function columnLabel(child: XmlChild): string {
    return attributeOf(child.openingTag, 'caption') ??
        (attributeOf(child.openingTag, 'name') ?? '').replace(/^\[|\]$/g, '');
}

export function addOrUpdateWorkbookCalculation(
    xml: string,
    rawInput: WorkbookCalculationInput
): WorkbookCalculationResult {
    const input: WorkbookCalculationInput = {
        ...rawInput,
        caption: rawInput.caption.trim(),
        datasource: rawInput.datasource.trim(),
        formula: rawInput.formula.trim(),
    };
    if (!input.caption) {
        throw new WorkbookCalculationError('Calculation name is required.', 'MISSING_CAPTION');
    }
    if (/[\[\]\r\n]/.test(input.caption)) {
        throw new WorkbookCalculationError('Calculation names cannot contain brackets or line breaks.', 'INVALID_CAPTION');
    }
    const formulaErrors = validateCalculationFormula(input.formula);
    if (formulaErrors.length) {
        throw new WorkbookCalculationError(formulaErrors.join(' '), 'INVALID_FORMULA');
    }

    const datasources = datasourceBlocks(xml);
    const datasource = datasources.find(item =>
        item.caption.toLowerCase() === input.datasource.toLowerCase() ||
        item.name.toLowerCase() === input.datasource.toLowerCase()
    );
    if (!datasource) {
        throw new WorkbookCalculationError(
            `Datasource "${input.datasource}" was not found in this workbook.`,
            'DATASOURCE_NOT_FOUND'
        );
    }
    const existing = datasource.children.find(child =>
        child.name === 'column' && columnLabel(child).toLowerCase() === input.caption.toLowerCase()
    );
    const metadata = calculationMetadata(input);
    let mutation: { updatedXml: string; internalName: string };
    let action: WorkbookCalculationResult['action'];
    if (existing) {
        if (!input.replaceExisting) {
            throw new WorkbookCalculationError(
                `A field named "${input.caption}" already exists in "${datasource.caption}". Enable replacement to update it.`,
                'DUPLICATE_CAPTION'
            );
        }
        mutation = replaceExistingCalculation(xml, existing, input, metadata);
        action = 'updated';
    } else {
        mutation = insertCalculation(xml, datasource, input, metadata);
        action = 'added';
    }
    validateXml(mutation.updatedXml);
    const roundTrip = datasourceBlocks(mutation.updatedXml).find(item => item.name === datasource.name);
    if (!roundTrip?.calculations.some(caption => caption.toLowerCase() === input.caption.toLowerCase())) {
        throw new WorkbookCalculationError('The calculated field failed the workbook round-trip check.', 'ROUND_TRIP_FAILED');
    }
    return {
        updatedXml: mutation.updatedXml,
        action,
        datasource: datasource.caption,
        caption: input.caption,
        internalName: mutation.internalName,
    };
}

export function validateWorkbookXml(xml: string): void {
    validateXml(xml);
}
