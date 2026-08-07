import { XMLParser, XMLValidator } from 'fast-xml-parser';
import {
    ExtractedCalculation,
    ExtractedField,
    ExtractedParameter,
    WorksheetFieldUsage,
} from '../extract/types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RemoveCalculationTarget {
    caption: string;
    datasource: string;
}

export interface RemovedCalculation {
    caption: string;
    datasource: string;
}

export interface SkippedCalculation {
    caption: string;
    datasource: string;
    reason: string;
}

export interface RemoveCalculationsResult {
    updatedXml: string;
    removed: RemovedCalculation[];
    skipped: SkippedCalculation[];
}

export interface WorkbookHealthCalculation {
    title: string;
    datasource: string;
    formula: string;
    unused?: boolean;
    uses?: string[];
}

export interface WorkbookHealthInput {
    calculations: WorkbookHealthCalculation[];
    datasourceCount: number;
    worksheetCount: number;
    filters: Array<{ worksheet: string }>;
    dashboards: Array<{ name: string; width?: number; height?: number }>;
    xml: string;
}

export interface HealthFinding {
    rule: string;
    severity: 'warn' | 'info';
    label: string;
    detail: string;
    items: string[];
}

// ---------------------------------------------------------------------------
// Position-aware XML scanning (mirrors src/parsers/workbookCalculations.ts)
// ---------------------------------------------------------------------------

interface XmlChild {
    name: string;
    start: number;
    openEnd: number;
    end: number;
    openingTag: string;
}

interface CalcColumn {
    start: number;
    end: number;
    caption: string;
    internalName: string;
    calculationCount: number;
}

interface DatasourceBlock {
    caption: string;
    name: string;
    /** Absolute span of the <datasource>…</datasource> element in the document. */
    start: number;
    end: number;
    calcColumns: CalcColumn[];
}

/** Blank out CDATA sections and comments so tag scans cannot match inside them. */
function maskIgnoredXml(xml: string): string {
    return xml.replace(/<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->/g, value =>
        value.replace(/[^\r\n]/g, ' ')
    );
}

function decodeEntities(value: string): string {
    return value
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&gt;/g, '>')
        .replace(/&lt;/g, '<')
        .replace(/&amp;/g, '&');
}

function attributeOf(tag: string, name: string): string | undefined {
    const match = new RegExp(`\\b${name}=(['"])([\\s\\S]*?)\\1`, 'i').exec(tag);
    return match?.[2] === undefined ? undefined : decodeEntities(match[2]);
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

function countCalculationTags(masked: string, start: number, end: number): number {
    return (masked.slice(start, end).match(/<calculation\b/gi) ?? []).length;
}

function datasourceBlocks(xml: string): DatasourceBlock[] {
    const masked = maskIgnoredXml(xml);
    const containerOpen = /<datasources\b[^>]*>/i.exec(masked);
    if (containerOpen?.index === undefined) {
        return [];
    }
    const contentStart = containerOpen.index + containerOpen[0].length;
    const closeStart = masked.indexOf('</datasources>', contentStart);
    if (closeStart < 0) {
        throw new Error('The workbook datasources container is not closed.');
    }
    return scanDirectChildren(xml, contentStart, closeStart)
        .filter(child => child.name === 'datasource')
        .map(child => {
            const datasourceCloseStart = child.end - '</datasource>'.length;
            const children = scanDirectChildren(xml, child.openEnd, datasourceCloseStart);
            const caption = attributeOf(child.openingTag, 'caption') ??
                attributeOf(child.openingTag, 'name') ?? 'Unknown Datasource';
            const name = attributeOf(child.openingTag, 'name') ?? caption;
            const calcColumns = children
                .filter(item => item.name === 'column')
                .map(item => ({
                    start: item.start,
                    end: item.end,
                    caption: attributeOf(item.openingTag, 'caption') ?? '',
                    internalName: attributeOf(item.openingTag, 'name') ?? '',
                    calculationCount: countCalculationTags(masked, item.start, item.end),
                }))
                .filter(item => item.calculationCount > 0);
            return { caption, name, start: child.start, end: child.end, calcColumns };
        });
}

/**
 * Attribute values referenced inside <datasource-dependencies> blocks, keyed
 * by the block's own datasource attribute (lowercased internal name). Used to
 * refuse removal of in-use fields without borrowing references from blocks
 * that belong to a different datasource.
 */
function dependencyReferences(xml: string): Map<string, Set<string>> {
    const masked = maskIgnoredXml(xml);
    const references = new Map<string, Set<string>>();
    const blockPattern = /(<datasource-dependencies\b[^>]*>)[\s\S]*?<\/datasource-dependencies>/gi;
    let block: RegExpExecArray | null;
    while ((block = blockPattern.exec(masked)) !== null) {
        const datasource = (attributeOf(block[1], 'datasource') ?? '').toLowerCase();
        let set = references.get(datasource);
        if (!set) {
            set = new Set<string>();
            references.set(datasource, set);
        }
        const attributePattern = /\b(?:name|caption|column|field)=(['"])([\s\S]*?)\1/gi;
        let attribute: RegExpExecArray | null;
        while ((attribute = attributePattern.exec(block[0])) !== null) {
            set.add(decodeEntities(attribute[2]).toLowerCase());
        }
    }
    return references;
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Encode a value the way it would appear inside an XML attribute. */
function encodeAttributeEntities(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Whether an internal column name is still referenced anywhere in (already
 * comment/CDATA-masked) XML. Matches the bare name as a standalone token —
 * which covers both the bracketed form ([Calculation_N] in formula=, level=,
 * member=, column=, name= attributes, sets, hierarchies, …) and unbracketed
 * embeddings like [none:Calculation_N:nk] — in raw and entity-encoded form.
 */
function referencesInternalName(maskedXml: string, internalName: string): boolean {
    const bare = internalName.replace(/^\[|\]$/g, '');
    if (bare === '') {
        return false;
    }
    const variants = new Set([bare, encodeAttributeEntities(bare)]);
    for (const variant of variants) {
        const pattern = new RegExp(`(?<!\\w)${escapeRegExp(variant)}(?!\\w)`, 'i');
        if (pattern.test(maskedXml)) {
            return true;
        }
    }
    return false;
}

// ---------------------------------------------------------------------------
// Deletion range assembly
// ---------------------------------------------------------------------------

interface DeletionRange {
    start: number;
    end: number;
}

/** Widen an element range to swallow leading indentation and one trailing newline. */
function widenToLine(xml: string, start: number, end: number): DeletionRange {
    let widenedStart = start;
    const lineFeed = xml.lastIndexOf('\n', start - 1);
    const lineStart = lineFeed < 0 ? 0 : lineFeed + 1;
    if (/^[\t ]*$/.test(xml.slice(lineStart, start))) {
        widenedStart = lineStart;
    }
    let widenedEnd = end;
    if (xml.startsWith('\r\n', widenedEnd)) {
        widenedEnd += 2;
    } else if (xml.startsWith('\n', widenedEnd)) {
        widenedEnd += 1;
    }
    return { start: widenedStart, end: widenedEnd };
}

/**
 * Self-closing <folder-item name='…'/> and <field-sort-custom-order field='…'/>
 * elements that reference an internal column name. Never matches container
 * tags. Internal names are only unique per datasource (Tableau preserves them
 * when a datasource is duplicated), so the scan is confined to the owning
 * datasource block's span — metadata in other datasources is never collateral.
 */
function relatedElementRanges(
    xml: string,
    masked: string,
    internalName: string,
    scopeStart: number,
    scopeEnd: number
): DeletionRange[] {
    const wanted = internalName.toLowerCase();
    const ranges: DeletionRange[] = [];
    const selfClosingPattern = /<(folder-item|field-sort-custom-order)\b[^<>]*\/>/gi;
    selfClosingPattern.lastIndex = scopeStart;
    let match: RegExpExecArray | null;
    while ((match = selfClosingPattern.exec(masked)) !== null) {
        if (match.index >= scopeEnd) {
            break;
        }
        const tag = xml.slice(match.index, match.index + match[0].length);
        const attributeName = match[1].toLowerCase() === 'folder-item' ? 'name' : 'field';
        const value = attributeOf(tag, attributeName);
        if (value !== undefined && value.toLowerCase() === wanted) {
            ranges.push(widenToLine(xml, match.index, match.index + match[0].length));
        }
    }
    return ranges;
}

/** Replace every range with spaces so offsets stay stable for later scans. */
function blankRanges(text: string, ranges: DeletionRange[]): string {
    if (ranges.length === 0) {
        return text;
    }
    const ascending = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
    let output = '';
    let cursor = 0;
    for (const range of ascending) {
        const start = Math.max(range.start, cursor);
        if (start >= range.end) {
            continue; // Fully covered by an earlier range.
        }
        output += text.slice(cursor, start) + ' '.repeat(range.end - start);
        cursor = range.end;
    }
    return output + text.slice(cursor);
}

function applyDeletions(xml: string, ranges: DeletionRange[]): string {
    // Merge overlapping/contained ranges first (e.g. a folder-item nested
    // inside a removed column) so no deletion can slice unrelated content.
    const ascending = [...ranges].sort((a, b) => a.start - b.start || b.end - a.end);
    const merged: DeletionRange[] = [];
    for (const range of ascending) {
        const last = merged[merged.length - 1];
        if (last && range.start <= last.end) {
            last.end = Math.max(last.end, range.end);
        } else {
            merged.push({ ...range });
        }
    }
    // Apply in descending start order so earlier deletions cannot shift later offsets.
    merged.sort((a, b) => b.start - a.start);
    let output = xml;
    for (const range of merged) {
        output = output.slice(0, range.start) + output.slice(range.end);
    }
    return output;
}

// ---------------------------------------------------------------------------
// removeCalculationsFromXml
// ---------------------------------------------------------------------------

function parsesCleanly(xml: string): boolean {
    if (XMLValidator.validate(xml) !== true) {
        return false;
    }
    try {
        new XMLParser({ ignoreAttributes: false }).parse(xml);
        return true;
    } catch {
        return false;
    }
}

function allSkipped(
    xml: string,
    targets: RemoveCalculationTarget[],
    reason: string
): RemoveCalculationsResult {
    return {
        updatedXml: xml,
        removed: [],
        skipped: targets.map(target => ({
            caption: target.caption,
            datasource: target.datasource,
            reason,
        })),
    };
}

interface RemovalCandidate {
    record: RemovedCalculation;
    blockName: string;
    caption: string;
    internalName: string;
    /** The column's own span plus its (datasource-scoped) related elements. */
    ranges: DeletionRange[];
}

/**
 * Remove calculated-field <column> elements (plus their folder-item and
 * field-sort-custom-order references) from workbook XML.
 *
 * This deletes user content, so every doubt resolves to a skip, and the
 * transformed document is self-verified before being returned. Any
 * verification failure returns the original XML untouched.
 */
export function removeCalculationsFromXml(
    xml: string,
    targets: Array<{ caption: string; datasource: string }>
): RemoveCalculationsResult {
    if (targets.length === 0) {
        return { updatedXml: xml, removed: [], skipped: [] };
    }
    if (!parsesCleanly(xml)) {
        return allSkipped(xml, targets, 'invalid workbook xml');
    }

    let blocks: DatasourceBlock[];
    try {
        blocks = datasourceBlocks(xml);
    } catch {
        return allSkipped(xml, targets, 'invalid workbook xml');
    }
    const masked = maskIgnoredXml(xml);
    const dependencyRefsByDatasource = dependencyReferences(xml);

    const skipped: SkippedCalculation[] = [];
    const candidates: RemovalCandidate[] = [];
    const claimedStarts = new Set<number>();

    // -- Phase 1: resolve each target to a concrete column + deletion ranges.
    for (const target of targets) {
        const record = { caption: target.caption, datasource: target.datasource };
        const wantedDatasource = target.datasource.trim().toLowerCase();
        const wantedCaption = target.caption.trim().toLowerCase();
        const matchingBlocks = blocks.filter(item =>
            item.caption.toLowerCase() === wantedDatasource ||
            item.name.toLowerCase() === wantedDatasource
        );
        if (matchingBlocks.length === 0) {
            skipped.push({ ...record, reason: 'datasource not found' });
            continue;
        }
        if (matchingBlocks.length > 1) {
            // Two datasource blocks answer to the same caption/name string, so
            // a caption-addressed target could delete from the wrong one.
            skipped.push({ ...record, reason: 'ambiguous datasource' });
            continue;
        }
        const block = matchingBlocks[0];
        const matches = block.calcColumns.filter(column =>
            column.caption.toLowerCase() === wantedCaption
        );
        if (matches.length === 0) {
            skipped.push({ ...record, reason: 'not found' });
            continue;
        }
        if (matches.length > 1) {
            skipped.push({ ...record, reason: 'ambiguous' });
            continue;
        }
        const column = matches[0];
        if (claimedStarts.has(column.start)) {
            skipped.push({ ...record, reason: 'duplicate target' });
            continue;
        }
        if (column.calculationCount !== 1 || column.internalName === '') {
            // Without exactly one <calculation> child and an internal name the
            // column cannot be safely deleted or checked for references.
            skipped.push({ ...record, reason: 'unsupported' });
            continue;
        }
        const dependencyRefs = dependencyRefsByDatasource.get(block.name.toLowerCase());
        const referenced = dependencyRefs !== undefined && (
            dependencyRefs.has(column.internalName.toLowerCase()) ||
            (column.caption !== '' && dependencyRefs.has(column.caption.toLowerCase()))
        );
        if (referenced) {
            skipped.push({ ...record, reason: 'in use' });
            continue;
        }

        claimedStarts.add(column.start);
        const ranges = [widenToLine(xml, column.start, column.end)];
        ranges.push(...relatedElementRanges(xml, masked, column.internalName, block.start, block.end));
        candidates.push({
            record,
            blockName: block.name.toLowerCase(),
            caption: wantedCaption,
            internalName: column.internalName,
            ranges,
        });
    }

    // -- Phase 2: universal in-use guard. A candidate survives only when its
    // internal name appears nowhere outside the deletion ranges — formulas,
    // sets, hierarchies, column-instances, dependencies, anywhere. The first
    // pass excludes ALL candidates' ranges so mutually-referencing targets
    // stay removable together. Every candidate that trips the guard is
    // skipped, and because it then survives in the document its own ranges
    // re-enter the scan base — the demotion loop repeats until stable so a
    // surviving skipped calc can never be left referencing a removed one.
    // Demotion is monotone (accepted only shrinks), so the loop terminates.
    let accepted = candidates;
    let demoted = true;
    let excludedRanges = candidates.flatMap(candidate => candidate.ranges);
    while (demoted && accepted.length > 0) {
        demoted = false;
        const scanBase = blankRanges(masked, excludedRanges);
        accepted = accepted.filter(candidate => {
            if (referencesInternalName(scanBase, candidate.internalName)) {
                skipped.push({ ...candidate.record, reason: 'in use' });
                demoted = true;
                return false;
            }
            return true;
        });
        excludedRanges = accepted.flatMap(candidate => candidate.ranges);
    }

    if (accepted.length === 0) {
        return { updatedXml: xml, removed: [], skipped };
    }

    const removed = accepted.map(candidate => candidate.record);
    const removedByDatasource = new Map<string, Set<string>>();
    for (const candidate of accepted) {
        const captions = removedByDatasource.get(candidate.blockName) ?? new Set<string>();
        captions.add(candidate.caption);
        removedByDatasource.set(candidate.blockName, captions);
    }

    const updatedXml = applyDeletions(xml, excludedRanges);

    // -- Self-verification: never hand back a half-transformed document. -----
    const verified = ((): boolean => {
        if (!parsesCleanly(updatedXml)) {
            return false;
        }
        let updatedBlocks: DatasourceBlock[];
        try {
            updatedBlocks = datasourceBlocks(updatedXml);
        } catch {
            return false;
        }
        for (const [datasourceName, captions] of removedByDatasource) {
            const block = updatedBlocks.find(item => item.name.toLowerCase() === datasourceName);
            if (!block) {
                continue; // Datasource had only removed calc columns left in scope.
            }
            for (const caption of captions) {
                if (block.calcColumns.some(column => column.caption.toLowerCase() === caption)) {
                    return false;
                }
            }
        }
        // No removed internal name may survive anywhere in the output — a
        // leftover reference means the document is broken for Tableau.
        const updatedMasked = maskIgnoredXml(updatedXml);
        for (const candidate of accepted) {
            if (referencesInternalName(updatedMasked, candidate.internalName)) {
                return false;
            }
        }
        const before = countCalculationTags(masked, 0, xml.length);
        const after = countCalculationTags(updatedMasked, 0, updatedXml.length);
        return before - after === removed.length;
    })();

    if (!verified) {
        return {
            updatedXml: xml,
            removed: [],
            skipped: [
                ...skipped,
                ...removed.map(item => ({ ...item, reason: 'verification failed' })),
            ],
        };
    }

    return { updatedXml, removed, skipped };
}

// ---------------------------------------------------------------------------
// Formula lexing + calculation usage (shared with the parsing-guide view)
// ---------------------------------------------------------------------------

/** Per-calculation usage + lineage facts posted with 'workbookParsed'. */
export interface CalcUsageInfo {
    /** Worksheets referencing the calculation directly, sorted. */
    sheets: string[];
    /** Calc/field/parameter captions the formula references. */
    uses: string[];
    /** Calculations whose formulas reference this one. */
    usedBy: string[];
    /** Not on any sheet and not referenced by any live calculation. */
    unused: boolean;
}

// Captions are matched loosely across extractor outputs: brackets stripped,
// trimmed, case-insensitive.
function normalizeUsageKey(value: string): string {
    return value.replace(/^\[|\]$/g, '').trim().toLowerCase();
}

// Single pass over the formula that blanks out string literals and both
// comment forms, so bracket text inside them never looks like a reference
// (mirrors the webview highlighter's stash precedence, minus HTML escaping).
export function stripCommentsAndStrings(formula: string): string {
    // Tableau stores formulas in XML attributes with newlines encoded as
    // numeric character references. Decode them first (same replace chain as
    // normalizeFormula) so a '//' line comment ends at the real newline
    // instead of swallowing the rest of the formula.
    const decoded = formula
        .replace(/&#13;/g, '\r')
        .replace(/&#10;/g, '\n')
        .replace(/&#xD;/gi, '\r')
        .replace(/&#xA;/gi, '\n');
    let out = '';
    let i = 0;
    const n = decoded.length;
    while (i < n) {
        const ch = decoded[i];
        // Bracketed identifiers are opaque tokens with the highest scanning
        // precedence (Tableau's lexer: ']]' escapes ']'). Copied through
        // verbatim so quotes or '//' inside a field name never open a
        // string or comment.
        if (ch === '[') {
            out += ch;
            i += 1;
            while (i < n) {
                if (decoded[i] === ']') {
                    if (decoded[i + 1] === ']') {
                        out += ']]';
                        i += 2;
                        continue;
                    }
                    out += ']';
                    i += 1;
                    break;
                }
                out += decoded[i];
                i += 1;
            }
            continue;
        }
        if (ch === '/' && decoded[i + 1] === '/') {
            while (i < n && decoded[i] !== '\n') { i += 1; }
            continue;
        }
        if (ch === '/' && decoded[i + 1] === '*') {
            i += 2;
            while (i < n && !(decoded[i] === '*' && decoded[i + 1] === '/')) { i += 1; }
            i += 2;
            continue;
        }
        if (ch === '"' || ch === '\'') {
            const quote = ch;
            i += 1;
            while (i < n && decoded[i] !== quote) { i += 1; }
            i += 1;
            out += ' ';
            continue;
        }
        out += ch;
        i += 1;
    }
    return out;
}

// [Token] references in a formula, with [Parameters].[X] pulled out first so
// the two-token parameter form doesn't also surface as a 'Parameters' ref.
function collectFormulaRefs(formula: string): { refs: string[]; paramRefs: string[] } {
    const stripped = stripCommentsAndStrings(formula);
    const paramRefs: string[] = [];
    const withoutParams = stripped.replace(
        /\[Parameters\]\s*\.\s*\[([^\]]+)\]/gi,
        (_match, name: string) => {
            paramRefs.push(name);
            return ' ';
        }
    );
    const refs: string[] = [];
    const pattern = /\[([^\]]+)\]/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(withoutParams)) !== null) {
        refs.push(match[1]);
    }
    return { refs, paramRefs };
}

// Builds per-calculation usage facts: direct worksheet usage, a dependency
// graph over calc/field/parameter references, and transitive liveness.
// Everything is map-based — O(calcs × refs), no per-calc scans of the XML.
export function computeCalculationUsage(
    calculations: ExtractedCalculation[],
    fields: ExtractedField[],
    parameters: ExtractedParameter[],
    fieldUsage: WorksheetFieldUsage[]
): CalcUsageInfo[] {
    // Worksheet usage: (field name, datasource) -> set of worksheet names.
    // Exact pair keys only — a caption-only, any-datasource fallback would
    // borrow other datasources' sheets and suppress legitimate 'unused' flags.
    const sheetsByNameAndDs = new Map<string, Set<string>>();
    for (const usage of fieldUsage) {
        const dsKey = normalizeUsageKey(usage.datasource);
        for (const field of usage.fields) {
            const nameKey = normalizeUsageKey(field);
            const pairKey = `${nameKey}${dsKey}`;
            let pair = sheetsByNameAndDs.get(pairKey);
            if (!pair) {
                pair = new Set<string>();
                sheetsByNameAndDs.set(pairKey, pair);
            }
            pair.add(usage.worksheet);
        }
    }

    // Reference resolution lookups. Precedence per token: same-datasource
    // calc, then same-datasource field, then parameter, then — label only —
    // a cross-datasource calc.
    const calcIndicesByName = new Map<string, number[]>();
    calculations.forEach((calc, index) => {
        const key = normalizeUsageKey(calc.title);
        const list = calcIndicesByName.get(key);
        if (list) {
            list.push(index);
        } else {
            calcIndicesByName.set(key, [index]);
        }
    });
    const fieldLabelByNameAndDs = new Map<string, string>();
    for (const field of fields) {
        const display = field.caption ?? field.name;
        const fieldDsKey = normalizeUsageKey(field.datasource);
        for (const key of [normalizeUsageKey(display), normalizeUsageKey(field.name)]) {
            const pairKey = `${key}${fieldDsKey}`;
            if (!fieldLabelByNameAndDs.has(pairKey)) {
                fieldLabelByNameAndDs.set(pairKey, display);
            }
        }
    }
    const paramLabelByKey = new Map<string, string>();
    for (const parameter of parameters) {
        const display = parameter.caption ?? parameter.name;
        for (const key of [normalizeUsageKey(display), normalizeUsageKey(parameter.name)]) {
            if (!paramLabelByKey.has(key)) {
                paramLabelByKey.set(key, display);
            }
        }
    }

    const usesByIndex: string[][] = [];
    const calcEdgesByIndex: number[][] = [];
    const usedBySources: Array<Set<number>> = calculations.map(() => new Set<number>());

    calculations.forEach((calc, index) => {
        const uses: string[] = [];
        const usesSeen = new Set<string>();
        const addUse = (label: string): void => {
            const key = normalizeUsageKey(label);
            if (!usesSeen.has(key)) {
                usesSeen.add(key);
                uses.push(label);
            }
        };
        const calcEdges: number[] = [];
        const calcDsKey = normalizeUsageKey(calc.datasource);
        const { refs, paramRefs } = collectFormulaRefs(calc.formula);
        for (const ref of refs) {
            const key = normalizeUsageKey(ref);
            const candidates = calcIndicesByName.get(key);
            // 1. Same-datasource calculation: full lineage + liveness edge.
            const sameDs = candidates?.find(
                candidate => normalizeUsageKey(calculations[candidate].datasource) === calcDsKey
            );
            if (sameDs !== undefined) {
                if (sameDs !== index) {
                    calcEdges.push(sameDs);
                    addUse(calculations[sameDs].title);
                    usedBySources[sameDs].add(index);
                }
                continue;
            }
            // 2. Field in the formula's own datasource.
            const fieldLabel = fieldLabelByNameAndDs.get(`${key}${calcDsKey}`);
            if (fieldLabel !== undefined) {
                addUse(fieldLabel);
                continue;
            }
            // 3. Parameter.
            const paramLabel = paramLabelByKey.get(key);
            if (paramLabel !== undefined) {
                addUse(paramLabel);
                continue;
            }
            // 4. Cross-datasource calc, last resort. A bare [X] reference
            // cannot actually target another datasource, so record the label
            // for the tooltip but create no liveness or usedBy edge.
            if (candidates && candidates.length > 0 && candidates[0] !== index) {
                addUse(calculations[candidates[0]].title);
            }
        }
        for (const ref of paramRefs) {
            // The [Parameters].[X] form is unambiguous even when X is not in
            // the extracted parameter list, so keep the token itself then.
            addUse(paramLabelByKey.get(normalizeUsageKey(ref)) ?? ref);
        }
        usesByIndex.push(uses);
        calcEdgesByIndex.push(calcEdges);
    });

    // Direct sheet usage per calc: exact (caption, datasource) key only.
    const sheetsByIndex: string[][] = calculations.map(calc => {
        const nameKey = normalizeUsageKey(calc.title);
        const set = sheetsByNameAndDs.get(`${nameKey}${normalizeUsageKey(calc.datasource)}`);
        return set ? Array.from(set).sort((a, b) => a.localeCompare(b)) : [];
    });

    // Transitive liveness: live calcs are those on a sheet plus everything a
    // live calc (transitively) references. The live set doubles as the
    // visited set, so cyclic calc graphs terminate.
    const live = new Set<number>();
    const queue: number[] = [];
    sheetsByIndex.forEach((sheets, index) => {
        if (sheets.length > 0) {
            live.add(index);
            queue.push(index);
        }
    });
    while (queue.length > 0) {
        const current = queue.pop() as number;
        for (const dependency of calcEdgesByIndex[current]) {
            if (!live.has(dependency)) {
                live.add(dependency);
                queue.push(dependency);
            }
        }
    }

    // With no worksheet usage data at all (calc-only workbook, or the
    // dependency blocks did not survive cleaning/resolution) the liveness
    // seed is empty and 'unused' would be pure noise — flag nothing then.
    const usageDataAvailable = fieldUsage.length > 0;

    return calculations.map((_calc, index) => ({
        sheets: sheetsByIndex[index],
        uses: usesByIndex[index],
        usedBy: Array.from(new Set(
            Array.from(usedBySources[index]).map(source => calculations[source].title)
        )),
        unused: usageDataAvailable ? !live.has(index) : false
    }));
}

// ---------------------------------------------------------------------------
// computeWorkbookHealth
// ---------------------------------------------------------------------------

const LONG_FORMULA_THRESHOLD = 600;
const DEEP_NESTING_THRESHOLD = 4;
const LOD_HEAVY_THRESHOLD = 3;
const MANY_FILTERS_THRESHOLD = 7;
const MANY_DATASOURCES_THRESHOLD = 5;
const UNUSED_LIST_LIMIT = 10;

function calcKey(datasource: string, title: string): string {
    return `${datasource.toLowerCase()}\0${title.toLowerCase()}`;
}

/** Depth of the calc-to-calc reference chain rooted at a calc, cycle-safe. */
function referenceDepths(calculations: WorkbookHealthCalculation[]): Map<string, number> {
    const byKey = new Map<string, WorkbookHealthCalculation>();
    const byTitle = new Map<string, WorkbookHealthCalculation>();
    for (const calc of calculations) {
        byKey.set(calcKey(calc.datasource, calc.title), calc);
        if (!byTitle.has(calc.title.toLowerCase())) {
            byTitle.set(calc.title.toLowerCase(), calc);
        }
    }
    const depths = new Map<string, number>();
    const inStack = new Set<string>();
    const depthOf = (calc: WorkbookHealthCalculation): number => {
        const key = calcKey(calc.datasource, calc.title);
        const memoized = depths.get(key);
        if (memoized !== undefined) {
            return memoized;
        }
        if (inStack.has(key)) {
            return 0; // Cycle guard: do not recurse into an in-progress node.
        }
        inStack.add(key);
        let deepestChild = 0;
        for (const used of calc.uses ?? []) {
            const child = byKey.get(calcKey(calc.datasource, used)) ?? byTitle.get(used.toLowerCase());
            if (child) {
                deepestChild = Math.max(deepestChild, depthOf(child));
            }
        }
        inStack.delete(key);
        const depth = deepestChild + 1;
        depths.set(key, depth);
        return depth;
    };
    for (const calc of calculations) {
        depthOf(calc);
    }
    return depths;
}

function countLodExpressions(formula: string): number {
    return (formula.match(/\{\s*(?:FIXED|INCLUDE|EXCLUDE)\b/gi) ?? []).length;
}

function plural(count: number, singular: string, pluralForm?: string): string {
    return count === 1 ? singular : (pluralForm ?? `${singular}s`);
}

/**
 * Conservative, Workbook Optimizer-inspired health findings.
 * Rules only appear in the output when triggered.
 */
export function computeWorkbookHealth(input: WorkbookHealthInput): HealthFinding[] {
    const findings: HealthFinding[] = [];

    const longCalcs = input.calculations.filter(calc => calc.formula.length > LONG_FORMULA_THRESHOLD);
    if (longCalcs.length > 0) {
        findings.push({
            rule: 'long-calc',
            severity: 'warn',
            label: 'Long calculations',
            detail: `${longCalcs.length} ${plural(longCalcs.length, 'calculation')} exceed ${LONG_FORMULA_THRESHOLD} characters. Long formulas are hard to maintain and can slow query generation.`,
            items: longCalcs.map(calc => calc.title),
        });
    }

    const depths = referenceDepths(input.calculations);
    const deepCalcs = input.calculations
        .map(calc => ({ calc, depth: depths.get(calcKey(calc.datasource, calc.title)) ?? 1 }))
        .filter(entry => entry.depth >= DEEP_NESTING_THRESHOLD);
    if (deepCalcs.length > 0) {
        findings.push({
            rule: 'deep-nesting',
            severity: 'warn',
            label: 'Deeply nested calculations',
            detail: `${deepCalcs.length} ${plural(deepCalcs.length, 'calculation')} sit at the top of reference chains ${DEEP_NESTING_THRESHOLD}+ levels deep. Consider flattening or moving logic to the data source.`,
            items: deepCalcs.map(entry => `${entry.calc.title} (depth ${entry.depth})`),
        });
    }

    const lodHeavy = input.calculations.filter(calc =>
        countLodExpressions(calc.formula) >= LOD_HEAVY_THRESHOLD
    );
    if (lodHeavy.length > 0) {
        findings.push({
            rule: 'lod-heavy',
            severity: 'info',
            label: 'LOD-heavy calculations',
            detail: `${lodHeavy.length} ${plural(lodHeavy.length, 'calculation')} contain ${LOD_HEAVY_THRESHOLD} or more LOD expressions, which can be expensive to evaluate.`,
            items: lodHeavy.map(calc => calc.title),
        });
    }

    const maskedXml = maskIgnoredXml(input.xml);
    const relevantFilterCount =
        (maskedXml.match(/<groupfilter\b[^<>]*\bui-domain=(['"])relevant\1[^<>]*>/gi) ?? []).length;
    if (relevantFilterCount > 0) {
        findings.push({
            rule: 'relevant-values-filters',
            severity: 'warn',
            label: 'Only Relevant Values filters',
            detail: 'Filters set to "Only Relevant Values" trigger extra queries whenever other filters change.',
            items: [`${relevantFilterCount} ${plural(relevantFilterCount, 'filter uses', 'filters use')} Only Relevant Values`],
        });
    }

    const autoSized = input.dashboards.filter(dashboard =>
        !(Number.isFinite(dashboard.width) && (dashboard.width as number) > 0 &&
            Number.isFinite(dashboard.height) && (dashboard.height as number) > 0)
    );
    if (autoSized.length > 0) {
        findings.push({
            rule: 'auto-sized-dashboard',
            severity: 'warn',
            label: 'Auto-sized dashboards',
            detail: `${autoSized.length} ${plural(autoSized.length, 'dashboard')} without a fixed size. Fixed-size dashboards cache better and render more predictably.`,
            items: autoSized.map(dashboard => dashboard.name),
        });
    }

    const unused = input.calculations.filter(calc => calc.unused === true);
    if (unused.length > 0) {
        const items = unused.slice(0, UNUSED_LIST_LIMIT).map(calc => calc.title);
        if (unused.length > UNUSED_LIST_LIMIT) {
            items.push(`… and ${unused.length - UNUSED_LIST_LIMIT} more`);
        }
        findings.push({
            rule: 'unused-calcs',
            severity: 'info',
            label: 'Unused calculations',
            detail: `${unused.length} ${plural(unused.length, 'calculation is', 'calculations are')} not used by any worksheet.`,
            items,
        });
    }

    const filtersBySheet = new Map<string, number>();
    for (const filter of input.filters) {
        filtersBySheet.set(filter.worksheet, (filtersBySheet.get(filter.worksheet) ?? 0) + 1);
    }
    const busySheets = [...filtersBySheet.entries()].filter(([, count]) => count > MANY_FILTERS_THRESHOLD);
    if (busySheets.length > 0) {
        findings.push({
            rule: 'many-filters-per-sheet',
            severity: 'info',
            label: 'Many filters on a worksheet',
            detail: `${busySheets.length} ${plural(busySheets.length, 'worksheet has', 'worksheets have')} more than ${MANY_FILTERS_THRESHOLD} filters, which multiplies query complexity.`,
            items: busySheets.map(([sheet, count]) => `${sheet} (${count} filters)`),
        });
    }

    if (input.datasourceCount > MANY_DATASOURCES_THRESHOLD) {
        findings.push({
            rule: 'many-datasources',
            severity: 'info',
            label: 'Many data sources',
            detail: `The workbook uses ${input.datasourceCount} data sources. Consolidating sources simplifies maintenance and can improve load time.`,
            items: [`${input.datasourceCount} data sources`],
        });
    }

    return findings;
}
