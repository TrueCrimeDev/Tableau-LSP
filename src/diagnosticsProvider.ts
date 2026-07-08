import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ParsedDocument, FUNCTION_SIGNATURES, SymbolType, Symbol } from './common.js';
import { ConditionalExpressionValidator } from './conditionalExpressionValidator.js';
import { AdvancedErrorRecovery } from './errorRecovery.js';

/**
 * R2.1: Main diagnostic provider implementing comprehensive Tableau validation
 * Replaces all diagnostics for a document on each update
 * FIXED: Re-enabled with improved false positive prevention
 */
export function getDiagnostics(document: TextDocument, parsedDocument: ParsedDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    try {
        // R2.1: Enhanced document-level validation with false positive prevention
        diagnostics.push(...validateDocumentLevel(document, parsedDocument));

        // Softest-possible nudge: a calculation block with no leading header comment
        // gets a Hint (dotted underline only) plus a ready-to-insert suggestion.
        diagnostics.push(...validateMissingHeaderComment(document));

        // R2.4: Enhanced function signature validation with operator recognition
        diagnostics.push(...validateFunctionSignatures(parsedDocument));

        // R2.3: Enhanced conditional expression validation
        const conditionalValidator = new ConditionalExpressionValidator();
        diagnostics.push(...conditionalValidator.validateConditionalExpressions(document, parsedDocument));

        // R2.5: Enhanced error recovery with reduced false positives
        const errorRecovery = new AdvancedErrorRecovery();
        diagnostics.push(...errorRecovery.processDocument(document, parsedDocument));

        // Sort diagnostics by severity and position (de-duplicated first)
        return sortDiagnostics(dedupeDiagnostics(diagnostics));
    } catch (error) {
        // If validation fails, log error but don't crash the extension
        console.error('Error in diagnostics provider:', error);
        return [];
    }
}

/**
 * R2.4: Validate function signatures across the document
 * FIXED: Enhanced with better operator recognition and reduced false positives
 */
function validateFunctionSignatures(parsedDocument: ParsedDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    // Enhanced list of logical operators and keywords that should not be flagged as unknown functions
    const logicalOperators = new Set([
        'AND', 'OR', 'NOT', 'IN', 'IS', 'LIKE', 'BETWEEN',
        'NULL', 'TRUE', 'FALSE', 'THEN', 'ELSE', 'ELSEIF', 'WHEN', 'END'
    ]);

    // Common Tableau keywords that might be parsed as functions but aren't
    const tableauKeywords = new Set([
        'FIXED', 'INCLUDE', 'EXCLUDE', 'LEVEL', 'ASC', 'DESC'
    ]);

    function validateSymbol(symbol: Symbol): void {
        if (symbol.type === SymbolType.FunctionCall) {
            // Skip validation for logical operators and keywords
            if (logicalOperators.has(symbol.name) || tableauKeywords.has(symbol.name)) {
                return;
            }

            const signature = FUNCTION_SIGNATURES[symbol.name];
            if (!signature) {
                // Only report unknown functions for things that actually look like functions
                // Skip if it might be a field reference or other construct
                if (isLikelyFunction(symbol)) {
                    diagnostics.push({
                        severity: DiagnosticSeverity.Information, // Reduced from Warning
                        range: symbol.range,
                        message: `Unknown function: ${symbol.name}. Verify function name or check if this should be a field reference.`,
                        source: 'Tableau LSP',
                        code: 'UNKNOWN_FUNCTION'
                    });
                }
            } else {
                // Enhanced parameter validation with better multi-line handling
                validateFunctionParameters(symbol, signature, diagnostics);
            }
        }

        // Recursively validate children
        if (symbol.children) {
            for (const child of symbol.children) {
                validateSymbol(child);
            }
        }
    }

    /**
     * Check if a symbol is likely a function call vs other constructs
     */
    function isLikelyFunction(symbol: Symbol): boolean {
        // If it has arguments, it's likely a function
        if (symbol.arguments && symbol.arguments.length > 0) {
            return true;
        }

        // If it's all uppercase and doesn't look like a field, it might be a function
        if (symbol.name === symbol.name.toUpperCase() && !symbol.name.includes(' ')) {
            return true;
        }

        // If it contains underscores, it might be a Tableau function
        if (symbol.name.includes('_')) {
            return true;
        }

        return false;
    }

    /**
     * Enhanced parameter validation with multi-line expression support
     */
    function validateFunctionParameters(symbol: Symbol, signature: [number, number], diagnostics: Diagnostic[]): void {
        const [minArgs, maxArgs] = signature;

        // If arguments is undefined, it means the parser couldn't extract them
        // (likely due to multi-line expression). Skip validation.
        if (symbol.arguments === undefined) {
            return;
        }

        const argCount = symbol.arguments.length;

        // Skip validation in certain cases to reduce false positives:
        // 1. If we have no arguments but expect some (might be multi-line)
        if (argCount === 0 && minArgs > 0) {
            // Check if this might be a multi-line expression by looking at the symbol text
            if (symbol.text && (symbol.text.includes('\n') || symbol.text.trim().endsWith(','))) {
                return; // Skip validation for potential multi-line expressions
            }
        }

        // 2. Only validate if we have some arguments to work with
        if (argCount > 0 && (argCount < minArgs || (maxArgs !== Infinity && argCount > maxArgs))) {
            const expectedRange = maxArgs === Infinity ? `${minArgs}+` :
                                minArgs === maxArgs ? `${minArgs}` : `${minArgs}-${maxArgs}`;

            diagnostics.push({
                severity: DiagnosticSeverity.Warning, // Reduced from Error
                range: symbol.range,
                message: `Function ${symbol.name} expects ${expectedRange} arguments, got ${argCount}`,
                source: 'Tableau LSP',
                code: 'FUNCTION_ARGS_MISMATCH'
            });
        }
    }

    for (const symbol of parsedDocument.symbols) {
        validateSymbol(symbol);
    }

    return diagnostics;
}

/**
 * R2.2: Document-level validation
 * R2.3: Enhanced with performance validation
 */
function validateDocumentLevel(document: TextDocument, parsedDocument: ParsedDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    
    // Check for empty document
    if (document.getText().trim().length === 0) {
        diagnostics.push({
            severity: DiagnosticSeverity.Information,
            range: Range.create(0, 0, 0, 0),
            message: 'Empty calculation. Add an expression to get started.',
            source: 'Tableau LSP',
            code: 'EMPTY_CALCULATION'
        });
    }

    // R2.3: Enhanced performance validation with conservative thresholds
    diagnostics.push(...validatePerformance(parsedDocument.symbols));
    
    return diagnostics;
}

/**
 * Classify every line of the document as blank and/or containing real code,
 * tracking block-comment (slash-star) state across lines and string state within
 * a line. A line is a "comment line" when it is non-blank but has no code.
 */
function classifyLines(lines: string[]): { isBlank: boolean[]; hasCode: boolean[] } {
    const isBlank: boolean[] = [];
    const hasCode: boolean[] = [];
    let inBlock = false; // inside a slash-star ... star-slash comment

    for (const line of lines) {
        isBlank.push(line.trim().length === 0);
        let code = false;
        let inStr = false;
        let strCh = '';
        let j = 0;
        while (j < line.length) {
            const c = line[j];
            const n = j + 1 < line.length ? line[j + 1] : '';
            if (inBlock) {
                if (c === '*' && n === '/') { inBlock = false; j += 2; continue; }
                j++;
                continue;
            }
            if (inStr) {
                if (c === strCh) {
                    if (n === strCh) { j += 2; continue; } // doubled-quote escape
                    inStr = false;
                }
                j++;
                continue;
            }
            if (c === '/' && n === '/') { break; }              // line comment → rest is comment
            if (c === '/' && n === '*') { inBlock = true; j += 2; continue; }
            if (c === '"' || c === "'") { inStr = true; strCh = c; code = true; j++; continue; }
            if (!/\s/.test(c)) { code = true; }
            j++;
        }
        hasCode.push(code);
    }
    return { isBlank, hasCode };
}

/**
 * Convert an arbitrary label (e.g. a field name) into a PascalCase identifier
 * usable inside a suggested calculation name.
 */
function toPascalCase(s: string): string {
    const out = s
        .replace(/[^A-Za-z0-9]+/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join('');
    return out || 'Calc';
}

/**
 * Build a concrete, editable header-comment suggestion for a calculation block.
 * Derives a name + description from the dominant function and field references so
 * the user has a real starting point rather than an empty placeholder.
 */
function suggestHeaderComment(block: string): string {
    // Collect distinct field references (strip a leading '#' parameter sigil,
    // skip the [Parameters] namespace).
    const fields: string[] = [];
    const seen = new Set<string>();
    const fieldRe = /\[#?([^\]]+)\]/g;
    let fm: RegExpExecArray | null;
    while ((fm = fieldRe.exec(block)) !== null) {
        const name = fm[1].trim();
        const key = name.toLowerCase();
        if (key === 'parameters' || !name) { continue; }
        if (!seen.has(key)) { seen.add(key); fields.push(name); }
    }

    const fnMatch = block.match(/\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
    const outerFn = fnMatch ? fnMatch[1].toUpperCase() : '';
    const aggHuman: Record<string, string> = {
        SUM: 'Sum', AVG: 'Average', COUNT: 'Count', COUNTD: 'Distinct count',
        MIN: 'Minimum', MAX: 'Maximum', MEDIAN: 'Median', ATTR: 'Attribute'
    };
    const thenField = (block.match(/\bTHEN\s*\[#?([^\]]+)\]/i) || [])[1]?.trim();
    const primary = fields[0];

    let name = 'NewCalc';
    let desc = 'Describe what this calculation returns';

    if (aggHuman[outerFn]) {
        const measure = thenField || primary;
        if (measure) {
            name = aggHuman[outerFn].replace(/\s/g, '') + toPascalCase(measure);
            desc = `${aggHuman[outerFn]} of [${measure}]`;
            const cond = thenField && primary && primary.toLowerCase() !== thenField.toLowerCase()
                ? primary : fields[1];
            if (cond && cond.toLowerCase() !== measure.toLowerCase()) {
                desc += ` where [${cond}] matches`;
            }
        }
    } else if (/\b(IF|IIF|CASE)\b/i.test(block) && primary) {
        name = toPascalCase(primary) + 'Category';
        desc = `Categorize records by [${primary}]`;
    } else if (primary) {
        name = toPascalCase(primary);
        desc = `Computed from [${primary}]`;
    }

    return `// !${name} - ${desc}`;
}

/**
 * Softest-possible documentation nudge.
 *
 * Splits the document into blank-line-separated blocks. A code block is treated
 * as documented when its first line is a comment, or the block immediately before
 * it is comment-only (a header sitting one blank line above). Every undocumented
 * code block gets a single Hint (the least intrusive severity — a faint dotted
 * underline, no squiggle) carrying a ready-to-insert suggestion in `data` so the
 * quick fix can drop it in.
 */
function validateMissingHeaderComment(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const uri = document.uri || '';
    if (/\.d\.twbl$/i.test(uri)) { return diagnostics; } // skip definition stubs
    const text = document.getText();
    if (text.trim().length === 0) { return diagnostics; }

    const lines = text.split(/\r?\n/);
    const { isBlank, hasCode } = classifyLines(lines);

    let i = 0;
    let prevBlockWasCommentOnly = false;
    while (i < lines.length) {
        if (isBlank[i]) { i++; continue; }

        const start = i;
        let blockHasCode = false;
        let firstCodeLine = -1;
        while (i < lines.length && !isBlank[i]) {
            if (hasCode[i]) {
                blockHasCode = true;
                if (firstCodeLine < 0) { firstCodeLine = i; }
            }
            i++;
        }
        const end = i - 1;

        if (!blockHasCode) { prevBlockWasCommentOnly = true; continue; } // a header block

        const firstLineIsComment = !hasCode[start]; // leading comment within this block
        const documented = firstLineIsComment || prevBlockWasCommentOnly;
        prevBlockWasCommentOnly = false;
        if (documented) { continue; }

        const blockText = lines.slice(start, end + 1).join('\n');
        const header = suggestHeaderComment(blockText);
        const lineText = lines[firstCodeLine];
        const col = lineText.length - lineText.trimStart().length;
        const tokenLen = (lineText.slice(col).match(/^\S+/) || [''])[0].length || 1;

        diagnostics.push({
            severity: DiagnosticSeverity.Hint,
            range: Range.create(firstCodeLine, col, firstCodeLine, col + tokenLen),
            message: `Calculation has no header comment. Add a name and description above it — for example:\n${header}`,
            source: 'Tableau LSP',
            code: 'MISSING_HEADER_COMMENT',
            data: { insertLine: firstCodeLine, header }
        });
    }

    return diagnostics;
}

/**
 * R2.3: Calculate expression complexity score based on:
 * - Number of nested expressions
 * - Number of function calls
 * - Number of field references
 * - Presence of complex operations (LOD, table calcs)
 */
function calculateComplexity(symbols: Symbol[]): number {
    let complexity = 0;
    
    function processSymbol(symbol: Symbol, depth: number = 0): void {
        // Add complexity based on symbol type
        switch (symbol.type) {
            case SymbolType.FunctionCall:
                // More weight for complex functions
                const complexFunctions = ['WINDOW_SUM', 'WINDOW_AVG', 'LOOKUP', 'FIXED', 'INCLUDE', 'EXCLUDE'];
                complexity += complexFunctions.includes(symbol.name) ? 3 : 1;
                break;
            case SymbolType.LODExpression:
                // LOD expressions are inherently complex
                complexity += 5;
                break;
            case SymbolType.FieldReference:
                // Field references add minimal complexity
                complexity += 0.5;
                break;
        }
        
        // Add complexity for nesting depth
        complexity += depth * 0.5;
        
        // Process children recursively with increased depth
        if (symbol.children) {
            for (const child of symbol.children) {
                processSymbol(child, depth + 1);
            }
        }
        
        // Process function arguments
        if (symbol.arguments) {
            for (const arg of symbol.arguments) {
                // Add complexity for argument length
                complexity += arg.text.length > 50 ? 1 : 0.2;
            }
        }
    }
    
    // Process all top-level symbols
    for (const symbol of symbols) {
        processSymbol(symbol);
    }
    
    // Return rounded complexity score
    return Math.round(complexity);
}

/**
 * R2.3: Validate potential performance issues in Tableau expressions
 * Identifies:
 * - Excessive nesting depth
 * - Complex calculations that could be simplified
 * - Inefficient patterns that could impact performance
 * - Provides optimization suggestions
 */
function validatePerformance(symbols: Symbol[]): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    // Track complex patterns
    const complexPatterns: {
        pattern: string;
        range: Range;
        suggestion: string;
    }[] = [];

    function analyzeSymbol(symbol: Symbol, depth: number = 0): void {
        // Check for specific performance patterns
        if (symbol.type === SymbolType.FunctionCall) {
            // Pattern 1: Nested aggregations without LOD
            if (isAggregateFunction(symbol.name)) {
                checkNestedAggregations(symbol, depth);
            }
            
            // Pattern 2: Inefficient string operations
            if (isStringFunction(symbol.name)) {
                checkInefficientStringOps(symbol);
            }
            
            // Pattern 3: Complex date calculations
            if (isDateFunction(symbol.name)) {
                checkComplexDateCalcs(symbol);
            }
            // (Deeply nested IF/CASE/IIF is handled once per top-level expression below,
            // not per level, so a long IIF mapping chain is flagged at most once.)
        }
        
        // Process children recursively
        if (symbol.children) {
            for (const child of symbol.children) {
                analyzeSymbol(child, depth + 1);
            }
        }
    }
    
    // Table calculations (WINDOW_*/RUNNING_*/etc.) MUST wrap an aggregate — that is
    // required Tableau syntax, not a nested-aggregation anti-pattern.
    function isTableCalcFunction(name: string): boolean {
        return /^(WINDOW_|RUNNING_)/.test(name) ||
            ['INDEX', 'RANK', 'RANK_DENSE', 'RANK_MODIFIED', 'RANK_UNIQUE', 'RANK_PERCENTILE',
             'FIRST', 'LAST', 'SIZE', 'TOTAL', 'LOOKUP', 'PREVIOUS_VALUE'].includes(name);
    }

    // Check for nested aggregations (performance issue in Tableau)
    function checkNestedAggregations(symbol: Symbol, depth: number): void {
        // Table calcs legitimately take an aggregate argument (e.g. WINDOW_SUM(SUM([x]))).
        if (isTableCalcFunction(symbol.name)) { return; }
        if (symbol.arguments) {
            for (const arg of symbol.arguments) {
                // An aggregate wrapped in an LOD { ... } is the recommended pattern, not a
                // nested aggregation — strip LOD regions before testing.
                if (arg.text && containsAggregateFunction(stripLodRegions(arg.text))) {
                    complexPatterns.push({
                        pattern: `Nested aggregation in ${symbol.name}`,
                        range: symbol.range,
                        suggestion: `Use LOD expressions instead of nested aggregations for better performance`
                    });
                }
            }
        }
    }

    // Check for inefficient string operations
    function checkInefficientStringOps(symbol: Symbol): void {
        // A plain REPLACE/REGEXP_REPLACE is normal; only flag when an argument is itself
        // a nested function call (genuinely complex), not for trivial literal usage.
        if (symbol.name === 'REPLACE' || symbol.name === 'REGEXP_REPLACE') {
            const hasNestedCall = (symbol.arguments ?? []).some(a => a.text && /[A-Za-z_]\w*\s*\(/.test(a.text));
            if (hasNestedCall) {
                complexPatterns.push({
                    pattern: `Complex string operation: ${symbol.name}`,
                    range: symbol.range,
                    suggestion: `Consider pre-processing data or using calculated fields for complex string operations`
                });
            }
        }
    }

    // Check for complex date calculations
    function checkComplexDateCalcs(symbol: Symbol): void {
        if ((symbol.name === 'DATEADD' || symbol.name === 'DATEDIFF') && symbol.arguments && symbol.arguments.length > 0) {
            // Only flag when the date argument is itself a nested function call. A plain
            // [field reference] is ordinary usage, and TODAY()/NOW() nesting is the standard
            // relative-date idiom — strip both before checking for a remaining '('.
            const dateArg = symbol.arguments[symbol.arguments.length - 1];
            const withoutFields = dateArg.text
                ? dateArg.text.replace(/\[[^\]]*\]/g, '').replace(/\b(?:TODAY|NOW)\s*\(\s*\)/gi, '')
                : '';
            if (withoutFields.includes('(')) {
                complexPatterns.push({
                    pattern: `Complex date calculation in ${symbol.name}`,
                    range: symbol.range,
                    suggestion: `Consider simplifying date calculations or using multiple steps for better performance`
                });
            }
        }
    }
    
    // Helper functions to identify function types
    function isAggregateFunction(name: string): boolean {
        const aggregateFunctions = [
            'SUM', 'AVG', 'MIN', 'MAX', 'COUNT', 'COUNTD', 
            'ATTR', 'MEDIAN', 'PERCENTILE', 'STDEV', 'STDEVP', 
            'VAR', 'VARP', 'WINDOW_SUM', 'WINDOW_AVG', 'WINDOW_MIN', 
            'WINDOW_MAX', 'WINDOW_COUNT', 'WINDOW_MEDIAN', 'WINDOW_STDEV',
            'WINDOW_VAR', 'RUNNING_SUM', 'RUNNING_AVG', 'RUNNING_MIN',
            'RUNNING_MAX', 'RUNNING_COUNT'
        ];
        return aggregateFunctions.includes(name);
    }
    
    function isStringFunction(name: string): boolean {
        const stringFunctions = [
            'LEFT', 'RIGHT', 'MID', 'FIND', 'CONTAINS', 'REPLACE',
            'REGEXP_EXTRACT', 'REGEXP_MATCH', 'REGEXP_REPLACE',
            'SPLIT', 'TRIM', 'LTRIM', 'RTRIM', 'UPPER', 'LOWER'
        ];
        return stringFunctions.includes(name);
    }
    
    function isDateFunction(name: string): boolean {
        const dateFunctions = [
            'DATEADD', 'DATEDIFF', 'DATEPART', 'DATETRUNC',
            'DATENAME', 'MAKEDATE', 'MAKEDATETIME', 'MAKETIME'
        ];
        return dateFunctions.includes(name);
    }
    
    function containsAggregateFunction(text: string): boolean {
        const aggregatePattern = /\b(SUM|AVG|MIN|MAX|COUNT|COUNTD|ATTR|MEDIAN|STDEV|VAR)\s*\(/i;
        return aggregatePattern.test(text);
    }

    // Remove balanced { ... } LOD regions so aggregates inside an LOD are not counted
    // as nested aggregations (e.g. AVG({ INCLUDE [c] : SUM([x]) }) is correct usage).
    function stripLodRegions(text: string): string {
        let out = '';
        let depth = 0;
        for (const ch of text) {
            if (ch === '{') { depth++; continue; }
            if (ch === '}') { if (depth > 0) depth--; continue; }
            if (depth === 0) { out += ch; }
        }
        return out;
    }
    
    // Analyze all symbols (aggregation / string / date performance patterns).
    // Deep-nesting hints (DEEP_NESTING and the per-conditional depth hint) were
    // intentionally removed: a long IIF/CASE mapping chain is valid, idiomatic Tableau
    // and flagging it is noise, not a real defect.
    for (const symbol of symbols) {
        analyzeSymbol(symbol);
    }

    // R2.3: Add diagnostics for complex patterns
    for (const pattern of complexPatterns) {
        diagnostics.push({
            severity: DiagnosticSeverity.Information,
            range: pattern.range,
            message: `${pattern.pattern}. ${pattern.suggestion}`,
            source: 'Tableau LSP',
            code: 'PERFORMANCE_OPTIMIZATION'
        });
    }
    
    return diagnostics;
}

/**
 * R2.1: Sort diagnostics by severity and position for consistent display
 */
/**
 * Collapse duplicate diagnostics produced by overlapping validators (e.g. the
 * conditional validator and the signature validator both flag the same unknown
 * function or arg-count mismatch). Two diagnostics at the same position whose
 * messages describe the same issue are merged, keeping the most severe.
 */
function dedupeDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
    const norm = (m: string): string => m.toLowerCase().replace(/[.\s]+/g, ' ').trim();
    const severityRank = (s?: DiagnosticSeverity): number =>
        s === DiagnosticSeverity.Error ? 0 :
        s === DiagnosticSeverity.Warning ? 1 :
        s === DiagnosticSeverity.Information ? 2 : 3;

    const best = new Map<string, Diagnostic>();
    for (const d of diagnostics) {
        // Key on position + the leading phrase of the message so differently-worded
        // reports of the same issue (e.g. "Unknown function: X" vs
        // "Unknown function: X. Verify…") collapse together.
        const phrase = norm(d.message).split(':')[0];
        const key = `${d.range.start.line}:${d.range.start.character}:${phrase}`;
        const existing = best.get(key);
        if (!existing || severityRank(d.severity) < severityRank(existing.severity)) {
            best.set(key, d);
        }
    }
    return [...best.values()];
}

function sortDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
    return diagnostics.sort((a, b) => {
        // Sort by severity first (Error > Warning > Information > Hint)
        const severityOrder = [
            DiagnosticSeverity.Error,
            DiagnosticSeverity.Warning,
            DiagnosticSeverity.Information,
            DiagnosticSeverity.Hint
        ];
        
        const severityDiff = severityOrder.indexOf(a.severity || DiagnosticSeverity.Information) - 
                             severityOrder.indexOf(b.severity || DiagnosticSeverity.Information);
        if (severityDiff !== 0) return severityDiff;
        
        // Then sort by line number
        const lineDiff = a.range.start.line - b.range.start.line;
        if (lineDiff !== 0) return lineDiff;
        
        // Finally sort by character position
        return a.range.start.character - b.range.start.character;
    });
}
