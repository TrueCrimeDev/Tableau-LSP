import { TextDocument } from 'vscode-languageserver-textdocument';
import { Range, Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { Symbol, SymbolType } from './common.js';
import { AdvancedErrorRecovery } from './errorRecovery.js';

// REGEX CONSTANTS
const FIELD_REGEX = /\[([^\]]+)\]/g;
const LOD_REGEX = /\{\s*(FIXED|INCLUDE|EXCLUDE)\b[^}]*\}/ig;
const COMMENT_LINE_REGEX = /\/\/.*/g;
const COMMENT_BLOCK_REGEX = /\/\*[\s\S]*?\*\//g;
const KEYWORD_REGEX = /^\s*(IF|THEN|ELSEIF|ELSE|END|CASE|WHEN)\b/i;
const FUNCTION_CALL_REGEX = /\b([A-Z_][A-Z0-9_]*)\s*\(/gi;
const IIF_REGEX = /\bIIF\s*\(/gi;

// Enhanced parsing constants
const LOGICAL_OPERATORS = new Set(['AND', 'OR', 'NOT', 'IN']);
const STRING_LITERAL_REGEX = /(['"])((?:(?!\1)[^\\]|\\.)*)(\1)/g;
const OPERATOR_REGEX = /\b(AND|OR|NOT|IN)\b/gi;

/**
 * Parses a calculation document to identify all relevant symbols and perform basic validation.
 * This function performs a full parse of the document with enhanced error recovery.
 */
export function parseDocument(document: TextDocument): {
    symbols: Symbol[];
    diagnostics: Diagnostic[];
} {
    // Use the legacy parsing function for now
    const result = parseDocumentLegacy(document);
    
    // Apply advanced error recovery to the parsed result
    const errorRecovery = new AdvancedErrorRecovery();
    const recoveryDiagnostics = errorRecovery.processDocument(document, {
        document,
        symbols: result.symbols,
        diagnostics: result.diagnostics
    });
    
    return {
        symbols: result.symbols,
        diagnostics: [...result.diagnostics, ...recoveryDiagnostics]
    };
}

/**
 * Legacy parsing function for backward compatibility and fallback scenarios
 * This function performs the original parsing logic without error recovery
 */
export function parseDocumentLegacy(document: TextDocument): {
    symbols: Symbol[];
    diagnostics: Diagnostic[];
} {
    const text = document.getText();
    const lines = text.split(/\r?\n/);
    const symbols: Symbol[] = [];
    const diagnostics: Diagnostic[] = [];

    // Enhanced parsing with multi-line expression support
    const root: Symbol = { name: 'root', type: SymbolType.CalculationName, range: Range.create(
        { line: 0, character: 0 },
        { line: 0, character: 0 }
    ), children: [] };
    const blockStack: Symbol[] = [root];
    let currentBranch: Symbol | null = null;
    let multiLineExpression = '';
    let multiLineStartLine = -1;

    // Conditional keywords that affect block structure.
    const COND_KEYWORDS = new Set(['IF', 'THEN', 'ELSEIF', 'ELSE', 'END', 'CASE', 'WHEN']);

    // Find every top-level conditional keyword in a line, skipping string literals,
    // [bracketed] field refs, and characters inside identifiers (so IIF / ENDED never match).
    const scanConditionalKeywords = (code: string): Array<{ kw: string; index: number }> => {
        const out: Array<{ kw: string; index: number }> = [];
        let inStr = false; let strCh = ''; let bracket = 0;
        for (let k = 0; k < code.length; k++) {
            const c = code[k];
            if (inStr) { if (c === strCh) { inStr = false; } continue; }
            // Bracket handling must precede the quote check so a ' or " inside a
            // [field name] (e.g. [Customer's Type]) does not start a phantom string.
            if (c === '[') { bracket++; continue; }
            if (c === ']') { if (bracket > 0) { bracket--; } continue; }
            if (bracket > 0) { continue; }
            if (c === '"' || c === "'") { inStr = true; strCh = c; continue; }
            if (/[A-Za-z]/.test(c)) {
                const prev = k > 0 ? code[k - 1] : '';
                let j = k;
                while (j < code.length && /[A-Za-z0-9_]/.test(code[j])) { j++; }
                if (!/[A-Za-z0-9_]/.test(prev)) {
                    const word = code.slice(k, j).toUpperCase();
                    if (COND_KEYWORDS.has(word)) { out.push({ kw: word, index: k }); }
                }
                k = j - 1;
            }
        }
        return out;
    };

    // Strip // and /* */ comments from a line (positions preserved, comment text blanked)
    // and emit a Comment symbol for each. Tracks multi-line block-comment state across lines.
    const extractLineComments = (rawLine: string, lineIndex: number, inBlock: boolean): { code: string; commentSymbols: Symbol[]; inBlock: boolean } => {
        let out = ''; const commentSymbols: Symbol[] = [];
        let inStr = false; let strCh = ''; let blk = inBlock; let blkStart = blk ? 0 : -1; let k = 0;
        const pushComment = (s: number, e: number): void => {
            commentSymbols.push({
                name: rawLine.slice(s, e), type: SymbolType.Comment,
                range: Range.create({ line: lineIndex, character: s }, { line: lineIndex, character: e }),
                text: rawLine.slice(s, e), children: [],
            });
        };
        while (k < rawLine.length) {
            const c = rawLine[k]; const c2 = rawLine[k + 1];
            if (blk) {
                if (c === '*' && c2 === '/') { pushComment(blkStart, k + 2); out += '  '; blk = false; k += 2; continue; }
                out += ' '; k++; continue;
            }
            if (inStr) { out += c; if (c === strCh) { inStr = false; } k++; continue; }
            if (c === '"' || c === "'") { inStr = true; strCh = c; out += c; k++; continue; }
            if (c === '/' && c2 === '/') { pushComment(k, rawLine.length); out += ' '.repeat(rawLine.length - k); break; }
            if (c === '/' && c2 === '*') { blk = true; blkStart = k; out += '  '; k += 2; continue; }
            out += c; k++;
        }
        if (blk) { pushComment(blkStart, rawLine.length); }
        return { code: out, commentSymbols, inBlock: blk };
    };

    const attachTo = (target: Symbol, sym: Symbol): void => {
        sym.parent = target;
        target.children!.push(sym);
        symbols.push(sym);
    };

    // Parse a free-text segment into expression symbols (functions, fields, operators,
    // LODs, strings) and attach them to the active branch/block.
    const emitSegment = (segText: string, lineIndex: number, startChar: number): void => {
        if (!segText.trim()) { return; }
        const target = currentBranch ?? blockStack[blockStack.length - 1];
        const lead = segText.length - segText.trimStart().length;
        const delta = startChar + lead;
        for (const s of parseExpression(segText, lineIndex)) {
            if (delta > 0) { s.range.start.character += delta; s.range.end.character += delta; }
            attachTo(target, s);
        }
    };

    const handleKeyword = (kw: string, lineIndex: number, ch: number): void => {
        const sym: Symbol = {
            name: kw, type: SymbolType.Keyword,
            range: Range.create({ line: lineIndex, character: ch }, { line: lineIndex, character: ch + kw.length }),
            children: [],
        };
        if (kw === 'IF' || kw === 'CASE') {
            attachTo(currentBranch ?? blockStack[blockStack.length - 1], sym);
            blockStack.push(sym);
            currentBranch = null;
        } else if (kw === 'END') {
            if (blockStack.length > 1) {
                const b = blockStack.pop();
                if (b) {
                    b.end = sym;
                    // Extend block range to END so the whole CASE/IF block is
                    // recognized as a valid multi-line expression by error recovery.
                    b.range = Range.create(b.range.start, sym.range.end);
                }
            }
            attachTo(blockStack[blockStack.length - 1], sym);
            currentBranch = null;
        } else { // THEN / ELSEIF / ELSE / WHEN
            attachTo(blockStack[blockStack.length - 1], sym);
            currentBranch = sym;
        }
    };

    const flushMultiLine = (): void => {
        if (multiLineExpression && multiLineStartLine >= 0) {
            const target = currentBranch ?? blockStack[blockStack.length - 1];
            for (const s of parseMultiLineExpression(multiLineExpression, multiLineStartLine)) { attachTo(target, s); }
        }
        multiLineExpression = '';
        multiLineStartLine = -1;
    };

    const handleExpressionLine = (codeText: string, lineIndex: number): void => {
        const t = codeText.trim();
        if (isIncompleteExpression(t)) {
            if (multiLineExpression === '') { multiLineStartLine = lineIndex; }
            multiLineExpression += (multiLineExpression ? '\n' : '') + codeText;
        } else if (multiLineExpression) {
            multiLineExpression += '\n' + codeText;
            flushMultiLine();
        } else {
            const target = currentBranch ?? blockStack[blockStack.length - 1];
            for (const s of parseExpression(codeText, lineIndex)) { attachTo(target, s); }
        }
    };

    let inBlockComment = false;
    for (let i = 0; i < lines.length; i++) {
        const rawLine = lines[i];
        const { code, commentSymbols, inBlock } = extractLineComments(rawLine, i, inBlockComment);
        inBlockComment = inBlock;
        for (const cmt of commentSymbols) { attachTo(currentBranch ?? blockStack[blockStack.length - 1], cmt); }

        if (code.trim() === '') {
            if (multiLineExpression) { multiLineExpression += '\n'; }
            continue;
        }

        const tokens = scanConditionalKeywords(code);
        if (tokens.length === 0) {
            handleExpressionLine(code, i);
            continue;
        }

        // A keyword line terminates any pending free-text multi-line expression.
        flushMultiLine();

        let segStart = 0;
        for (const tok of tokens) {
            emitSegment(code.slice(segStart, tok.index), i, segStart);
            handleKeyword(tok.kw, i, tok.index);
            segStart = tok.index + tok.kw.length;
        }
        emitSegment(code.slice(segStart), i, segStart);
    }
    flushMultiLine();

    return { symbols: root.children!, diagnostics };
}

/**
 * Enhanced expression parsing to detect function calls, field references, and other symbols
 */
function parseExpression(line: string, lineNumber: number): Symbol[] {
    const symbols: Symbol[] = [];
    const trimmed = line.trim();
    
    if (!trimmed) return symbols;

    // First, remove string literals AND bracketed field contents to avoid parsing
    // their contents. A field like [Profit (USD)] or [Profit and Loss] would otherwise
    // match the function/operator regexes below (phantom PROFIT() call, phantom AND).
    // Length is preserved so symbol column offsets stay correct.
    const cleanedLine = removeFieldBrackets(removeStringLiterals(trimmed));

    // Check for logical operators first (to avoid misclassifying as functions)
    const operatorMatches = Array.from(cleanedLine.matchAll(OPERATOR_REGEX));
    for (const match of operatorMatches) {
        if (match.index !== undefined) {
            const operatorName = match[1].toUpperCase();
            const symbol: Symbol = {
                name: operatorName,
                type: SymbolType.Keyword, // Treat logical operators as keywords
                range: Range.create(
                    { line: lineNumber, character: match.index },
                    { line: lineNumber, character: match.index + match[0].length }
                ),
                text: operatorName,
                children: []
            };
            symbols.push(symbol);
        }
    }

    // Check for function calls (excluding logical operators)
    const functionMatches = Array.from(cleanedLine.matchAll(FUNCTION_CALL_REGEX));
    for (const match of functionMatches) {
        if (match.index !== undefined) {
            const functionName = match[1].toUpperCase();
            
            // Skip if this is a logical operator
            if (LOGICAL_OPERATORS.has(functionName)) {
                continue;
            }
            
            const startChar = match.index;
            const endChar = match.index + match[0].length - 1; // Exclude the opening parenthesis
            
            const symbol: Symbol = {
                name: functionName,
                type: SymbolType.FunctionCall,
                range: Range.create(
                    { line: lineNumber, character: startChar },
                    { line: lineNumber, character: endChar }
                ),
                text: functionName,
                arguments: extractFunctionArguments(trimmed, match.index + match[1].length),
                children: []
            };
            symbols.push(symbol);
        }
    }

    // Check for field references
    const fieldMatches = Array.from(trimmed.matchAll(FIELD_REGEX));
    for (const match of fieldMatches) {
        if (match.index !== undefined) {
            const fieldName = match[1];
            const symbol: Symbol = {
                name: fieldName,
                type: SymbolType.FieldReference,
                range: Range.create(
                    { line: lineNumber, character: match.index },
                    { line: lineNumber, character: match.index + match[0].length }
                ),
                text: match[0],
                children: []
            };
            symbols.push(symbol);
        }
    }

    // Check for LOD expressions
    const lodMatches = Array.from(trimmed.matchAll(LOD_REGEX));
    for (const match of lodMatches) {
        if (match.index !== undefined) {
            const lodType = match[1].toUpperCase();
            const symbol: Symbol = {
                name: lodType,
                type: SymbolType.LODExpression,
                range: Range.create(
                    { line: lineNumber, character: match.index },
                    { line: lineNumber, character: match.index + match[0].length }
                ),
                text: match[0],
                children: []
            };
            symbols.push(symbol);
        }
    }

    // Check for string literals
    const stringMatches = Array.from(trimmed.matchAll(STRING_LITERAL_REGEX));
    for (const match of stringMatches) {
        if (match.index !== undefined) {
            const stringValue = match[0];
            const symbol: Symbol = {
                name: stringValue,
                type: SymbolType.Expression,
                range: Range.create(
                    { line: lineNumber, character: match.index },
                    { line: lineNumber, character: match.index + match[0].length }
                ),
                text: stringValue,
                children: []
            };
            symbols.push(symbol);
        }
    }

    // If no specific symbols found, create a general expression symbol for non-empty lines
    if (symbols.length === 0 && trimmed.length > 0) {
        const symbol: Symbol = {
            name: trimmed,
            type: SymbolType.Expression,
            range: Range.create(
                { line: lineNumber, character: 0 },
                { line: lineNumber, character: line.length }
            ),
            text: trimmed,
            children: []
        };
        symbols.push(symbol);
    }

    return symbols;
}

/**
 * Remove string literals from a line to avoid parsing their contents
 */
function removeStringLiterals(text: string): string {
    return text.replace(STRING_LITERAL_REGEX, (match, quote) => {
        // Replace string content with spaces to preserve positions
        return quote + ' '.repeat(match.length - 2) + quote;
    });
}

/**
 * Blank the contents of [bracketed field references], preserving brackets and length,
 * so identifier/operator scans never match text inside a field name.
 */
function removeFieldBrackets(text: string): string {
    return text.replace(/\[[^\]]*\]/g, (match) => {
        return '[' + ' '.repeat(match.length - 2) + ']';
    });
}

/**
 * Enhanced function argument extraction with better multi-line support
 */
function extractFunctionArguments(text: string, startPos: number): Array<{text: string, range: Range}> | undefined {
    const parenStart = text.indexOf('(', startPos);
    if (parenStart === -1) return undefined;
    
    // Find matching closing parenthesis, handling nested parentheses
    let parenCount = 1;
    let parenEnd = parenStart + 1;
    
    while (parenEnd < text.length && parenCount > 0) {
        if (text[parenEnd] === '(') parenCount++;
        else if (text[parenEnd] === ')') parenCount--;
        parenEnd++;
    }
    
    if (parenCount > 0) {
        // Unclosed parentheses - this is a multi-line expression
        // Return undefined to signal that arguments couldn't be extracted
        // This prevents false "expects X arguments, got 0" errors
        return undefined;
    }
    
    parenEnd--; // Adjust to point to the closing parenthesis
    
    const argsText = text.substring(parenStart + 1, parenEnd).trim();
    if (!argsText) return [];
    
    // Enhanced comma-separated argument parsing that respects nested parentheses
    const args: string[] = [];
    let currentArg = '';
    let nestedParens = 0;
    let nestedBrackets = 0; // [field refs] — commas inside a multi-dim FIXED LOD live here
    let nestedBraces = 0;   // { LOD expressions }
    let inString = false;
    let stringChar = '';

    for (let i = 0; i < argsText.length; i++) {
        const char = argsText[i];

        if (!inString && (char === '"' || char === "'")) {
            inString = true;
            stringChar = char;
        } else if (inString && char === stringChar) {
            inString = false;
            stringChar = '';
        } else if (!inString) {
            if (char === '(') nestedParens++;
            else if (char === ')') nestedParens--;
            else if (char === '[') nestedBrackets++;
            else if (char === ']') { if (nestedBrackets > 0) nestedBrackets--; }
            else if (char === '{') nestedBraces++;
            else if (char === '}') { if (nestedBraces > 0) nestedBraces--; }
            else if (char === ',' && nestedParens === 0 && nestedBrackets === 0 && nestedBraces === 0) {
                args.push(currentArg.trim());
                currentArg = '';
                continue;
            }
        }

        currentArg += char;
    }
    
    if (currentArg.trim()) {
        args.push(currentArg.trim());
    }
    
    return args.map((arg, index) => ({
        text: arg,
        range: Range.create(
            { line: 0, character: 0 }, // Simplified for now
            { line: 0, character: arg.length }
        )
    }));
}

/**
 * Check if an expression appears to be incomplete (likely continues on next line)
 */
function isIncompleteExpression(line: string): boolean {
    const trimmed = line.trim();
    
    // Check for unclosed parentheses, brackets, or braces
    let parenCount = 0;
    let bracketCount = 0;
    let braceCount = 0;
    let inString = false;
    let stringChar = '';
    
    for (const char of trimmed) {
        if (!inString && (char === '"' || char === "'")) {
            inString = true;
            stringChar = char;
        } else if (inString && char === stringChar) {
            inString = false;
            stringChar = '';
        } else if (!inString) {
            if (char === '(') parenCount++;
            else if (char === ')') parenCount--;
            else if (char === '[') bracketCount++;
            else if (char === ']') bracketCount--;
            else if (char === '{') braceCount++;
            else if (char === '}') braceCount--;
        }
    }
    
    // Expression is incomplete if there are unclosed structures
    if (parenCount > 0 || bracketCount > 0 || braceCount > 0) return true;
    
    // Check for common continuation patterns
    if (trimmed.endsWith(',') || trimmed.endsWith('+') || trimmed.endsWith('-') || 
        trimmed.endsWith('*') || trimmed.endsWith('/') || trimmed.endsWith('AND') || 
        trimmed.endsWith('OR') || trimmed.endsWith('=') || trimmed.endsWith('<') ||
        trimmed.endsWith('>') || trimmed.endsWith('<=') || trimmed.endsWith('>=') ||
        trimmed.endsWith('<>') || trimmed.endsWith('!=')) {
        return true;
    }
    
    return false;
}

/**
 * Recursively parse an expression string into a NESTED symbol tree: each function
 * call holds its argument sub-expressions as children, so nested IIF/IF calls and
 * field references are captured at every depth (not just the outermost call). Used
 * for multi-line function expressions such as long nested IIF ladders.
 */
function parseExpressionTree(text: string, startLine: number, startChar: number): Symbol[] {
    const offPos = (off: number): { line: number; character: number } => {
        let line = startLine, ch = startChar;
        for (let i = 0; i < off && i < text.length; i++) {
            if (text[i] === '\n') { line++; ch = 0; } else { ch++; }
        }
        return { line, character: ch };
    };
    const splitArgs = (lo: number, hi: number): Array<{ text: string; range: Range }> => {
        const args: Array<{ text: string; range: Range }> = [];
        let depth = 0, start = lo;
        for (let i = lo; i < hi; i++) {
            const c = text[i];
            if (c === '"' || c === "'") { const q = c; i++; while (i < hi && text[i] !== q) { i++; } }
            else if (c === '(' || c === '[' || c === '{') { depth++; }
            else if (c === ')' || c === ']' || c === '}') { depth--; }
            else if (c === ',' && depth === 0) { args.push({ text: text.slice(start, i).trim(), range: Range.create(offPos(start), offPos(i)) }); start = i + 1; }
        }
        const tail = text.slice(start, hi).trim();
        if (tail) { args.push({ text: tail, range: Range.create(offPos(start), offPos(hi)) }); }
        return args;
    };
    const parse = (lo: number, hi: number, sink: Symbol[]): void => {
        let i = lo;
        while (i < hi) {
            const c = text[i];
            if (c === '"' || c === "'") { const q = c; i++; while (i < hi && text[i] !== q) { i++; } i++; continue; }
            if (c === '[') {
                const s = i; i++; while (i < hi && text[i] !== ']') { i++; } i++;
                sink.push({ name: text.slice(s + 1, i - 1), type: SymbolType.FieldReference, range: Range.create(offPos(s), offPos(i)), text: text.slice(s, i), children: [] });
                continue;
            }
            if (c === '{') {
                const s = i; let d = 1; i++; while (i < hi && d > 0) { if (text[i] === '{') { d++; } else if (text[i] === '}') { d--; } i++; }
                const kw = (text.slice(s + 1, i - 1).match(/^\s*(FIXED|INCLUDE|EXCLUDE)\b/i) || [])[1];
                const lod: Symbol = { name: (kw || 'LOD').toUpperCase(), type: SymbolType.LODExpression, range: Range.create(offPos(s), offPos(i)), text: text.slice(s, i), children: [] };
                parse(s + 1, i - 1, lod.children!);
                sink.push(lod);
                continue;
            }
            if (/[A-Za-z_]/.test(c)) {
                const s = i; while (i < hi && /[A-Za-z0-9_]/.test(text[i])) { i++; }
                const word = text.slice(s, i);
                let j = i; while (j < hi && /\s/.test(text[j])) { j++; }
                if (text[j] === '(' && !LOGICAL_OPERATORS.has(word.toUpperCase())) {
                    let d = 0, k = j;
                    for (; k < hi; k++) {
                        const ck = text[k];
                        if (ck === '"' || ck === "'") { const q = ck; k++; while (k < hi && text[k] !== q) { k++; } }
                        else if (ck === '(') { d++; }
                        else if (ck === ')') { d--; if (d === 0) { k++; break; } }
                    }
                    // d > 0 means no matching ')' was found — the call spans beyond this
                    // text fragment (multi-line flush). Signal with undefined so argument-count
                    // validators skip rather than reporting "got 0".
                    const fn: Symbol = { name: word.toUpperCase(), type: SymbolType.FunctionCall, range: Range.create(offPos(s), offPos(k)), text: word.toUpperCase(), arguments: d > 0 ? undefined : splitArgs(j + 1, k - 1), children: [] };
                    parse(j + 1, k - 1, fn.children!);
                    sink.push(fn);
                    i = k;
                    continue;
                }
                if (LOGICAL_OPERATORS.has(word.toUpperCase())) {
                    sink.push({ name: word.toUpperCase(), type: SymbolType.Keyword, range: Range.create(offPos(s), offPos(i)), text: word.toUpperCase(), children: [] });
                }
                i = j;
                continue;
            }
            i++;
        }
    };
    const out: Symbol[] = [];
    parse(0, text.length, out);
    return out;
}

/**
 * Parse a multi-line expression as a single unit
 */
function parseMultiLineExpression(expression: string, startLine: number): Symbol[] {
    const symbols: Symbol[] = [];
    const trimmedExpression = expression.trim();

    // Check if this is a multi-line function call
    const functionMatch = trimmedExpression.match(/^([A-Z_][A-Z0-9_]*)\s*\(/i);
    if (functionMatch && !LOGICAL_OPERATORS.has(functionMatch[1].toUpperCase())) {
        // Recursively parse the whole call into a nested tree so inner IIF/IF calls
        // and field references at every depth become real symbols.
        const tree = parseExpressionTree(expression, startLine, 0);
        if (tree.length > 0) { return tree; }
        // Fall through to line-by-line if nothing was extracted.
    }
    // Parse line by line for non-function expressions
    const lines = expression.split('\n');
    for (let i = 0; i < lines.length; i++) {
        symbols.push(...parseExpression(lines[i], startLine + i));
    }
    return symbols;
}

/**
 * Parse a specific range of lines from a document
 * Used by incremental parser for efficient partial parsing
 */
export function parseDocumentRange(document: TextDocument, startLine: number, endLine: number): {
    symbols: Symbol[];
    diagnostics: Diagnostic[];
} {
    const text = document.getText();
    const lines = text.split(/\r?\n/);
    const rangeLines = lines.slice(startLine, endLine + 1);
    
    // Create a temporary document for the range
    const rangeText = rangeLines.join('\n');
    const rangeDocument = TextDocument.create(
        document.uri + '#range',
        document.languageId,
        document.version,
        rangeText
    );
    
    // Parse the range
    const result = parseDocument(rangeDocument);
    
    // Adjust symbol ranges to match the original document
    const adjustedSymbols = result.symbols.map(symbol => adjustSymbolRange(symbol, startLine));
    
    return {
        symbols: adjustedSymbols,
        diagnostics: result.diagnostics.map(diagnostic => ({
            ...diagnostic,
            range: {
                start: { line: diagnostic.range.start.line + startLine, character: diagnostic.range.start.character },
                end: { line: diagnostic.range.end.line + startLine, character: diagnostic.range.end.character }
            }
        }))
    };
}

/**
 * Adjust a symbol's range to account for line offset
 */
function adjustSymbolRange(symbol: Symbol, lineOffset: number): Symbol {
    return {
        ...symbol,
        range: Range.create(
            { line: symbol.range.start.line + lineOffset, character: symbol.range.start.character },
            { line: symbol.range.end.line + lineOffset, character: symbol.range.end.character }
        ),
        children: symbol.children ? symbol.children.map(child => adjustSymbolRange(child, lineOffset)) : undefined
    };
}

/**
 * Check if a document change affects parsing context
 * Used to determine if incremental parsing is safe
 */
export function isContextualChange(document: TextDocument, changedLines: Set<number>): boolean {
    const text = document.getText();
    const lines = text.split(/\r?\n/);
    
    // Check if any changed line contains keywords that affect parsing context
    for (const lineNum of changedLines) {
        if (lineNum >= 0 && lineNum < lines.length) {
            const line = lines[lineNum].trim();
            
            // Keywords that affect parsing context
            if (line.match(/^\s*(IF|THEN|ELSEIF|ELSE|END|CASE|WHEN)\b/i)) {
                return true;
            }
            
            // Multi-line expressions that might affect context
            if (isIncompleteExpression(line)) {
                return true;
            }
        }
    }
    
    return false;
}
