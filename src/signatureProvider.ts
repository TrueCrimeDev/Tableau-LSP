import {
  SignatureHelp,
  SignatureInformation,
  MarkupKind,
  Position,
  Range
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { performance } from 'perf_hooks';
import { ParsedDocument, Symbol, SymbolType, FUNCTION_SIGNATURES } from './common.js';

/**
 * R5.4: Performance optimization configuration
 */
const SIGNATURE_PERFORMANCE_CONFIG = {
    ENABLE_PERFORMANCE_LOGGING: false,
    CACHE_TTL_MS: 3 * 60 * 1000, // 3 minutes
    MAX_CACHE_SIZE: 200,
    ENABLE_SYMBOL_INDEXING: true,
    MAX_NESTING_DEPTH: 10
};

/**
 * R5.4: Signature cache for performance optimization
 */
interface SignatureCacheEntry {
    signature: SignatureHelp;
    timestamp: number;
    documentVersion: number;
}

const signatureCache = new Map<string, SignatureCacheEntry>();

/**
 * R5.4: Symbol index for efficient signature detection
 */
interface SignatureSymbolIndex {
    functionCalls: Map<string, Symbol[]>; // Function name -> symbols
    conditionalBlocks: Symbol[]; // IF/CASE blocks
    symbolsByLine: Map<number, Symbol[]>; // Line -> symbols
    lastUpdated: number;
}

const symbolIndexCache = new Map<string, SignatureSymbolIndex>();

// Branch context for signature help
interface BranchContext {
  type: 'condition' | 'expression' | 'unknown';
  branch: 'if' | 'then' | 'elseif' | 'else' | 'when' | 'case' | 'unknown';
  index?: number;
}

/**
 * R3.2: Find deepest enclosing conditional block (IF/CASE)
 * Walk up the symbol tree to find the innermost conditional expression block
 * that contains the given position.
 */
function findEnclosingConditionalBlock(
  symbols: Symbol[],
  position: Position
): Symbol | null {
  for (const sym of symbols) {
    if (isPositionWithinSymbol(position, sym)) {
      // R3.2: Check children first (deepest first)
      if (sym.children && sym.children.length > 0) {
        const childResult = findEnclosingConditionalBlock(sym.children, position);
        if (childResult) return childResult;
      }
      
      // R3.2: Only return IF/CASE blocks for signature help
      if (sym.name === 'IF' || sym.name === 'CASE') {
        return sym;
      }
    }
  }
  return null;
}

/**
 * Helper function to check if position is within a symbol's range
 */
function isPositionWithinSymbol(position: Position, symbol: Symbol): boolean {
  const { start, end } = {
    start: symbol.range.start,
    end: symbol.end ? symbol.end.range.end : symbol.range.end
  };
  
  return (
    (position.line > start.line ||
      (position.line === start.line && position.character >= start.character)) &&
    (position.line < end.line ||
      (position.line === end.line && position.character <= end.character))
  );
}

/**
 * R3.2: Determine branch context for position within IF/CASE block
 */
function getBranchContext(position: Position, block: Symbol): BranchContext {
  if (!block.children) {
    return { type: 'unknown', branch: 'unknown' };
  }
  
  for (let i = 0; i < block.children.length; i++) {
    const child = block.children[i];
    
    if (isConditionalBranch(child) && isPositionWithinSymbol(position, child)) {
      // Determine if we're in the condition or expression part
      const isInCondition = isPositionInBranchCondition(position, child);
      
      return {
        type: isInCondition ? 'condition' : 'expression',
        branch: child.name.toLowerCase() as any,
        index: child.name === 'ELSEIF' ? i : undefined
      };
    }
  }
  
  return { type: 'unknown', branch: 'unknown' };
}

/**
 * Check if symbol is a conditional branch
 */
function isConditionalBranch(symbol: Symbol): boolean {
  return ['THEN', 'ELSEIF', 'ELSE', 'WHEN'].includes(symbol.name);
}

/**
 * Check if position is in the condition part of a branch
 */
function isPositionInBranchCondition(position: Position, branch: Symbol): boolean {
  // For ELSEIF and WHEN, the condition is typically on the same line as the keyword
  if (branch.name === 'ELSEIF' || branch.name === 'WHEN') {
    return position.line === branch.range.start.line;
  }
  // For THEN, we're typically in the condition before THEN
  return false;
}

/**
 * R3.3: Build multi-line signature display with active branch highlighting
 * R5.4: Enhanced with performance optimization, caching, and efficient parsing
 */
export function buildSignatureHelp(
  document: TextDocument,
  position: Position,
  parsed: ParsedDocument
): SignatureHelp | null {
  // The returned signature is computed by scanning the source text up to the
  // cursor (see computeSignatureHelp): signature help is requested mid-edit,
  // when the call under the cursor is almost always unclosed, and for such
  // calls the parsed symbol ranges only cover the function name (and
  // IF/CASE/LOD block ranges only cover the keyword), which is too coarse to
  // resolve the active parameter or the innermost nested call.
  //
  // `parsed` is still used to maintain the per-document symbol index, which
  // backs the performance API (symbol-index cache + stats) and lets repeated
  // requests on the same document reuse the index.
  getOrCreateSymbolIndex(document, parsed);

  const cacheKey = generateSignatureCacheKey(document.uri, position, document.version);
  const cachedSignature = getFromSignatureCache(cacheKey);
  if (cachedSignature) {
    return cachedSignature;
  }

  const signature = computeSignatureHelp(document, position);

  if (signature) {
    addToSignatureCache(cacheKey, signature, document.version);
  }
  return signature;
}

// Words that look like a function call (NAME `(`) but are operators, not functions.
const NON_FUNCTION_WORDS = new Set(['AND', 'OR', 'NOT', 'IN']);

/**
 * Text-based signature detection driven by the source up to the cursor.
 * Priority: innermost open function call, then LOD expression, then IF/CASE.
 */
function computeSignatureHelp(document: TextDocument, position: Position): SignatureHelp | null {
  const offset = document.offsetAt(position);
  const before = document.getText().slice(0, offset);

  // 0. Function name directly under the cursor. Handles the cursor resting on a
  //    function name before its '(' has been scanned as an enclosing open call
  //    (e.g. cursor on `SUM` in `SUM([Sales])`, or on the inner `AVG` in
  //    `SUM(AVG([Sales]))`). Takes priority so the innermost name the user is
  //    pointing at wins over any outer enclosing call.
  const nameAtCursor = findFunctionNameAtCursor(
    getLineText(document, position.line),
    position.character
  );
  if (nameAtCursor) {
    const nameSignature = buildFunctionSignature(nameAtCursor, 0);
    if (nameSignature) {
      return nameSignature;
    }
  }

  // 1. Innermost still-open function call (the cursor is inside its parens).
  const fnCall = findEnclosingFunctionCall(before);
  if (fnCall) {
    const fnSignature = buildFunctionSignature(fnCall.name, fnCall.activeParameter);
    if (fnSignature) {
      return fnSignature;
    }
    // Unknown function name: fall through (no useful signature to show).
  }

  // 2. Level-of-detail expression context: { FIXED | INCLUDE | EXCLUDE ... }.
  const lod = findEnclosingLOD(before);
  if (lod) {
    return buildLODSignature(lod);
  }

  // 3. Conditional context: an open IF / CASE block.
  const conditional = findEnclosingConditional(before);
  if (conditional) {
    return buildConditionalKeywordSignature(conditional);
  }

  return null;
}

function isIdentifierChar(c: string): boolean {
  return /[A-Za-z0-9_]/.test(c);
}

/**
 * Scan `text` tracking parenthesis depth (skipping strings and [field] refs)
 * and return the innermost still-open function call together with the number
 * of top-level commas seen inside it before the cursor (the active parameter).
 */
function findEnclosingFunctionCall(
  text: string
): { name: string; activeParameter: number } | null {
  interface Frame { name: string | null; commas: number; }
  const stack: Frame[] = [];
  let inString = false;
  let stringChar = '';
  let bracketDepth = 0;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inString) {
      if (c === stringChar) { inString = false; }
      continue;
    }
    if (c === '"' || c === "'") { inString = true; stringChar = c; continue; }
    if (c === '[') { bracketDepth++; continue; }
    if (c === ']') { if (bracketDepth > 0) { bracketDepth--; } continue; }
    if (bracketDepth > 0) { continue; }

    if (c === '(') {
      stack.push({ name: readFunctionNameBefore(text, i), commas: 0 });
    } else if (c === ')') {
      if (stack.length > 0) { stack.pop(); }
    } else if (c === ',') {
      if (stack.length > 0) { stack[stack.length - 1].commas++; }
    }
  }

  for (let s = stack.length - 1; s >= 0; s--) {
    const frame = stack[s];
    if (frame.name) {
      return { name: frame.name, activeParameter: frame.commas };
    }
  }
  return null;
}

/**
 * Read the identifier immediately preceding an opening parenthesis. Returns the
 * upper-cased name, or null for a grouping paren or a logical operator.
 */
function readFunctionNameBefore(text: string, parenIndex: number): string | null {
  let end = parenIndex;
  while (end > 0 && /\s/.test(text[end - 1])) { end--; }
  let start = end;
  while (start > 0 && isIdentifierChar(text[start - 1])) { start--; }
  if (start === end) { return null; }
  const name = text.slice(start, end).toUpperCase();
  if (NON_FUNCTION_WORDS.has(name)) { return null; }
  return name;
}

/**
 * Resolve the function name the cursor is pointing at on a single line.
 *
 * The cursor "touches" a function when it sits within / immediately adjacent to
 * an identifier (or on whitespace just before one) that is followed by `(`. This
 * surfaces the signature for a function whose name is under the cursor before
 * its opening paren has been typed/scanned. Returns the upper-cased name, or
 * null when the cursor is not on such a call.
 */
function findFunctionNameAtCursor(lineText: string, col: number): string | null {
  const isId = (c: string | undefined): boolean => c !== undefined && isIdentifierChar(c);
  let start = col;
  let end = col;

  if (isId(lineText[col]) || isId(lineText[col - 1])) {
    // Cursor within / adjacent to an identifier: expand to its full span.
    while (start > 0 && isId(lineText[start - 1])) { start--; }
    while (end < lineText.length && isId(lineText[end])) { end++; }
  } else if (lineText[col] !== undefined && /\s/.test(lineText[col])) {
    // Cursor on whitespace: skip forward to the next identifier on the line.
    let i = col;
    while (i < lineText.length && /\s/.test(lineText[i])) { i++; }
    if (!isId(lineText[i])) { return null; }
    start = i;
    end = i;
    while (end < lineText.length && isId(lineText[end])) { end++; }
  } else {
    return null;
  }

  if (end <= start) { return null; }

  // Require the identifier to be immediately followed by '(' (optionally after
  // whitespace) to qualify as a function call rather than a field/keyword.
  let k = end;
  while (k < lineText.length && /\s/.test(lineText[k])) { k++; }
  if (lineText[k] !== '(') { return null; }

  const name = lineText.slice(start, end).toUpperCase();
  if (NON_FUNCTION_WORDS.has(name)) { return null; }
  return name;
}

/**
 * Build signature help for a known function, using FUNCTION_SIGNATURES for the
 * expected argument count. Optional parameters (beyond the minimum) are shown
 * in [brackets]; variadic functions grow to cover the active parameter.
 */
function buildFunctionSignature(name: string, activeParameter: number): SignatureHelp | null {
  const signature = FUNCTION_SIGNATURES[name];
  if (!signature) { return null; }
  const [minArgs, maxArgs] = signature;

  const paramCount = Math.max(
    minArgs,
    maxArgs === Infinity ? activeParameter + 1 : maxArgs,
    activeParameter + 1
  );

  const parameters: { label: string }[] = [];
  let label = `${name}(`;
  for (let i = 0; i < paramCount; i++) {
    if (i > 0) { label += ', '; }
    const optional = i >= minArgs;
    const paramLabel = optional ? `[arg${i + 1}]` : `arg${i + 1}`;
    parameters.push({ label: paramLabel });
    label += paramLabel;
  }
  label += ')';

  const argRange = maxArgs === Infinity
    ? `${minArgs}+`
    : (maxArgs === minArgs ? `${minArgs}` : `${minArgs}-${maxArgs}`);
  const plural = (maxArgs === 1 && minArgs === 1) ? '' : 's';

  return {
    signatures: [{
      label,
      documentation: {
        kind: MarkupKind.Markdown,
        value: `Function **${name}** expects ${argRange} argument${plural}`
      },
      parameters
    }],
    activeSignature: 0,
    activeParameter: Math.max(0, Math.min(activeParameter, parameters.length - 1))
  };
}

/**
 * Find the keyword of the innermost unclosed LOD brace before the cursor.
 */
function findEnclosingLOD(text: string): 'FIXED' | 'INCLUDE' | 'EXCLUDE' | null {
  const stack: Array<'FIXED' | 'INCLUDE' | 'EXCLUDE' | null> = [];
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === stringChar) { inString = false; }
      continue;
    }
    if (c === '"' || c === "'") { inString = true; stringChar = c; continue; }
    if (c === '{') {
      stack.push(readLODKeywordAfter(text, i));
    } else if (c === '}') {
      if (stack.length > 0) { stack.pop(); }
    }
  }

  for (let s = stack.length - 1; s >= 0; s--) {
    if (stack[s]) { return stack[s]; }
  }
  return null;
}

function readLODKeywordAfter(text: string, braceIndex: number): 'FIXED' | 'INCLUDE' | 'EXCLUDE' | null {
  let i = braceIndex + 1;
  while (i < text.length && /\s/.test(text[i])) { i++; }
  let j = i;
  while (j < text.length && isIdentifierChar(text[j])) { j++; }
  const word = text.slice(i, j).toUpperCase();
  if (word === 'FIXED' || word === 'INCLUDE' || word === 'EXCLUDE') { return word; }
  return null;
}

function buildLODSignature(keyword: 'FIXED' | 'INCLUDE' | 'EXCLUDE'): SignatureHelp {
  return {
    signatures: [{
      label: `{ ${keyword} [dimension, ...] : <aggregate expression> }`,
      documentation: {
        kind: MarkupKind.Markdown,
        value: `**${keyword}** level-of-detail expression`
      },
      parameters: []
    }],
    activeSignature: 0,
    activeParameter: 0
  };
}

/**
 * Return the keyword of the innermost IF/CASE block that is still open
 * (no matching END) before the cursor.
 */
function findEnclosingConditional(text: string): 'IF' | 'CASE' | null {
  const stack: Array<'IF' | 'CASE'> = [];
  let inString = false;
  let stringChar = '';
  let bracketDepth = 0;
  let i = 0;

  while (i < text.length) {
    const c = text[i];
    if (inString) {
      if (c === stringChar) { inString = false; }
      i++;
      continue;
    }
    if (c === '"' || c === "'") { inString = true; stringChar = c; i++; continue; }
    if (c === '[') { bracketDepth++; i++; continue; }
    if (c === ']') { if (bracketDepth > 0) { bracketDepth--; } i++; continue; }
    if (bracketDepth > 0) { i++; continue; }

    if (/[A-Za-z_]/.test(c)) {
      const prev = i > 0 ? text[i - 1] : '';
      let j = i;
      while (j < text.length && isIdentifierChar(text[j])) { j++; }
      if (!isIdentifierChar(prev)) {
        const word = text.slice(i, j).toUpperCase();
        if (word === 'IF' || word === 'CASE') {
          stack.push(word);
        } else if (word === 'END') {
          stack.pop();
        }
      }
      i = j;
      continue;
    }
    i++;
  }

  return stack.length > 0 ? stack[stack.length - 1] : null;
}

function buildConditionalKeywordSignature(keyword: 'IF' | 'CASE'): SignatureHelp {
  const label = keyword === 'IF'
    ? 'IF <condition> THEN <result> [ ELSEIF <condition> THEN <result> ] [ ELSE <result> ] END'
    : 'CASE <expression> WHEN <value> THEN <result> [ ... ] [ ELSE <default> ] END';
  return {
    signatures: [{
      label,
      documentation: {
        kind: MarkupKind.Markdown,
        value: `**${keyword}** conditional expression`
      },
      parameters: []
    }],
    activeSignature: 0,
    activeParameter: 0
  };
}

/**
 * R5.4: Generate cache key for signature requests
 */
function generateSignatureCacheKey(
  documentUri: string, 
  position: Position, 
  documentVersion: number
): string {
  return `${documentUri}:${position.line}:${position.character}:${documentVersion}`;
}

/**
 * R5.4: Get signature from cache if valid
 */
function getFromSignatureCache(cacheKey: string): SignatureHelp | null {
  const entry = signatureCache.get(cacheKey);
  if (!entry) {
    return null;
  }
  
  // Check if cache entry is still valid
  const now = Date.now();
  if (now - entry.timestamp > SIGNATURE_PERFORMANCE_CONFIG.CACHE_TTL_MS) {
    signatureCache.delete(cacheKey);
    return null;
  }
  
  return entry.signature;
}

/**
 * R5.4: Add signature to cache with cleanup
 */
function addToSignatureCache(cacheKey: string, signature: SignatureHelp, documentVersion: number): void {
  // Clean up cache if it's getting too large
  if (signatureCache.size >= SIGNATURE_PERFORMANCE_CONFIG.MAX_CACHE_SIZE) {
    cleanupSignatureCache();
  }
  
  signatureCache.set(cacheKey, {
    signature,
    timestamp: Date.now(),
    documentVersion
  });
}

/**
 * R5.4: Clean up old signature cache entries
 */
function cleanupSignatureCache(): void {
  const now = Date.now();
  const keysToDelete: string[] = [];
  
  for (const [key, entry] of signatureCache.entries()) {
    if (now - entry.timestamp > SIGNATURE_PERFORMANCE_CONFIG.CACHE_TTL_MS) {
      keysToDelete.push(key);
    }
  }
  
  // Remove oldest entries if still too large
  if (keysToDelete.length === 0 && signatureCache.size >= SIGNATURE_PERFORMANCE_CONFIG.MAX_CACHE_SIZE) {
    const entries = Array.from(signatureCache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toRemove = Math.floor(SIGNATURE_PERFORMANCE_CONFIG.MAX_CACHE_SIZE * 0.2); // Remove 20%
    keysToDelete.push(...entries.slice(0, toRemove).map(([key]) => key));
  }
  
  keysToDelete.forEach(key => signatureCache.delete(key));
}

/**
 * R5.4: Get or create symbol index for efficient lookup
 */
function getOrCreateSymbolIndex(document: TextDocument, parsed: ParsedDocument): SignatureSymbolIndex {
  const documentUri = document.uri;
  
  // Check if we have a valid cached index
  const cachedIndex = symbolIndexCache.get(documentUri);
  if (cachedIndex && 
      Date.now() - cachedIndex.lastUpdated < SIGNATURE_PERFORMANCE_CONFIG.CACHE_TTL_MS) {
    return cachedIndex;
  }
  
  // Create new index
  const symbolIndex = createSignatureSymbolIndex(parsed.symbols);
  
  // Cache the index
  symbolIndexCache.set(documentUri, symbolIndex);
  
  // Clean up old indexes
  cleanupSymbolIndexCache();
  
  return symbolIndex;
}

/**
 * R5.4: Create efficient symbol index for signature detection
 */
function createSignatureSymbolIndex(symbols: Symbol[]): SignatureSymbolIndex {
  const functionCalls = new Map<string, Symbol[]>();
  const conditionalBlocks: Symbol[] = [];
  const symbolsByLine = new Map<number, Symbol[]>();
  
  function indexSymbol(symbol: Symbol, depth: number = 0): void {
    // Prevent excessive recursion
    if (depth > SIGNATURE_PERFORMANCE_CONFIG.MAX_NESTING_DEPTH) {
      return;
    }
    
    // Index by line for position-based lookup
    for (let line = symbol.range.start.line; line <= symbol.range.end.line; line++) {
      if (!symbolsByLine.has(line)) {
        symbolsByLine.set(line, []);
      }
      symbolsByLine.get(line)!.push(symbol);
    }
    
    // Index function calls by name
    if (symbol.type === SymbolType.FunctionCall) {
      const functionName = symbol.name.toUpperCase();
      if (!functionCalls.has(functionName)) {
        functionCalls.set(functionName, []);
      }
      functionCalls.get(functionName)!.push(symbol);
    }
    
    // Index conditional blocks
    if (symbol.name === 'IF' || symbol.name === 'CASE') {
      conditionalBlocks.push(symbol);
    }
    
    // Recursively index children
    if (symbol.children) {
      for (const child of symbol.children) {
        indexSymbol(child, depth + 1);
      }
    }
  }
  
  for (const symbol of symbols) {
    indexSymbol(symbol);
  }
  
  return {
    functionCalls,
    conditionalBlocks,
    symbolsByLine,
    lastUpdated: Date.now()
  };
}

/**
 * R5.4: Clean up old symbol index cache entries
 */
function cleanupSymbolIndexCache(): void {
  const now = Date.now();
  const keysToDelete: string[] = [];
  
  for (const [key, index] of symbolIndexCache.entries()) {
    if (now - index.lastUpdated > SIGNATURE_PERFORMANCE_CONFIG.CACHE_TTL_MS) {
      keysToDelete.push(key);
    }
  }
  
  keysToDelete.forEach(key => symbolIndexCache.delete(key));
}

/**
 * R5.4: Optimized function to find enclosing conditional block
 */
function findEnclosingConditionalBlockOptimized(
  position: Position,
  symbolIndex: SignatureSymbolIndex
): Symbol | null {
  // Get symbols on the current line first
  const symbolsOnLine = symbolIndex.symbolsByLine.get(position.line) || [];
  
  // Find the most specific conditional block containing the position
  let bestMatch: Symbol | null = null;
  let bestMatchSize = Infinity;
  
  for (const block of symbolIndex.conditionalBlocks) {
    if (isPositionWithinSymbol(position, block)) {
      // Calculate block size to find the most specific match
      const blockSize = (block.range.end.line - block.range.start.line) * 1000 + 
                       (block.range.end.character - block.range.start.character);
      
      if (blockSize < bestMatchSize) {
        bestMatch = block;
        bestMatchSize = blockSize;
      }
    }
  }
  
  return bestMatch;
}

/**
 * R5.4: Optimized function signature help
 */
function buildFunctionSignatureHelpOptimized(
  document: TextDocument,
  position: Position,
  symbolIndex: SignatureSymbolIndex
): SignatureHelp | null {
  // Get symbols on the current line for efficient lookup
  const symbolsOnLine = symbolIndex.symbolsByLine.get(position.line) || [];
  
  // Find function call at position
  let functionSymbol: Symbol | null = null;
  let bestMatchSize = Infinity;
  
  for (const symbol of symbolsOnLine) {
    if (symbol.type === SymbolType.FunctionCall && isPositionWithinSymbol(position, symbol)) {
      // Find the most specific function call
      const symbolSize = (symbol.range.end.line - symbol.range.start.line) * 1000 + 
                        (symbol.range.end.character - symbol.range.start.character);
      
      if (symbolSize < bestMatchSize) {
        functionSymbol = symbol;
        bestMatchSize = symbolSize;
      }
    }
  }
  
  if (!functionSymbol) return null;
  
  return buildFunctionSignatureHelpFromSymbol(functionSymbol, position);
}

/**
 * R5.4: Build function signature help from symbol (extracted for reuse)
 */
function buildFunctionSignatureHelpFromSymbol(
  functionSymbol: Symbol,
  position: Position
): SignatureHelp | null {
  const signature = FUNCTION_SIGNATURES[functionSymbol.name];
  if (!signature) return null;
  
  const [minArgs, maxArgs] = signature;
  const argCount = functionSymbol.arguments?.length || 0;
  const activeParamIndex = getActiveParameterIndexOptimized(position, functionSymbol);
  
  let label = `${functionSymbol.name}(`;
  const parameters: string[] = [];
  
  // Build parameter list
  for (let i = 0; i < Math.max(minArgs, argCount + 1); i++) {
    if (i > 0) label += ', ';
    const paramName = `arg${i + 1}`;
    const isOptional = i >= minArgs;
    const paramLabel = isOptional ? `[${paramName}]` : paramName;
    
    parameters.push(paramLabel);
    label += paramLabel;
  }
  
  label += ')';
  
  return {
    signatures: [{
      label,
      documentation: {
        kind: MarkupKind.Markdown,
        value: `Function **${functionSymbol.name}** expects ${minArgs}${maxArgs === Infinity ? '+' : `-${maxArgs}`} arguments`
      },
      parameters: parameters.map(p => ({ label: p }))
    }],
    activeSignature: 0,
    activeParameter: Math.max(0, Math.min(activeParamIndex, parameters.length - 1))
  };
}

/**
 * R5.4: Optimized active parameter index calculation
 */
function getActiveParameterIndexOptimized(position: Position, functionSymbol: Symbol): number {
  if (!functionSymbol.arguments || functionSymbol.arguments.length === 0) return 0;
  
  // Use binary search-like approach for large argument lists
  const args = functionSymbol.arguments;
  let left = 0;
  let right = args.length - 1;
  let activeIndex = 0;
  
  // Find the argument that contains or is closest to the position
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const arg = args[mid];
    
    if (isPositionWithinRange(position, arg.range)) {
      return mid;
    }
    
    if (isPositionBefore(position, arg.range.start)) {
      right = mid - 1;
      activeIndex = Math.max(0, mid - 1);
    } else {
      left = mid + 1;
      activeIndex = Math.min(mid + 1, args.length - 1);
    }
  }
  
  return activeIndex;
}

/**
 * R5.4: Helper function to check if position is within range
 */
function isPositionWithinRange(position: Position, range: Range): boolean {
  return (
    (position.line > range.start.line ||
      (position.line === range.start.line && position.character >= range.start.character)) &&
    (position.line < range.end.line ||
      (position.line === range.end.line && position.character <= range.end.character))
  );
}

/**
 * R5.4: Helper function to check if position is before a given position
 */
function isPositionBefore(position: Position, target: Position): boolean {
  return position.line < target.line || 
         (position.line === target.line && position.character < target.character);
}

/**
 * R5.4: Performance logging utility
 */
function logPerformance(operation: string, startTime: number): void {
  if (SIGNATURE_PERFORMANCE_CONFIG.ENABLE_PERFORMANCE_LOGGING && startTime > 0) {
    const duration = Date.now() - startTime;
    console.log(`[Signature Performance] ${operation}: ${duration}ms`);
  }
}

/**
 * R3.3: Build conditional signature with complete block structure
 */
function buildConditionalSignature(
  block: Symbol,
  position: Position,
  document: TextDocument
): SignatureHelp {
  const displayLines: string[] = [];
  let activeParameter = 0;
  const branchContext = getBranchContext(position, block);

  // R3.3: Extract and display all branches
  for (const child of block.children || []) {
    if (isConditionalBranch(child)) {
      const lineText = extractBranchLine(child, document);
      
      // R3.3: Bold the active branch
      if (isPositionWithinSymbol(position, child)) {
        activeParameter = displayLines.length;
        displayLines.push(`**${lineText}**`);
      } else {
        displayLines.push(lineText);
      }
    }
  }

  // R3.3: Always show END line
  displayLines.push(extractEndLine(block, document));

  const signature: SignatureInformation = {
    label: displayLines.join('\n'),
    documentation: {
      kind: MarkupKind.Markdown,
      value: buildSignatureDocumentation(block, branchContext)
    },
    parameters: displayLines.map(line => ({ label: line }))
  };

  return {
    signatures: [signature],
    activeSignature: 0,
    activeParameter
  };
}

/**
 * Extract the complete line text for a branch
 */
function extractBranchLine(branch: Symbol, document: TextDocument): string {
  const line = branch.range.start.line ?? 0;
  return getLineText(document, line);
}

/**
 * Extract the END line text
 */
function extractEndLine(block: Symbol, document: TextDocument): string {
  const endLn = block.end?.range.start.line ??
    (block.children?.slice(-1)[0]?.range.end.line ?? 0);
  return getLineText(document, endLn);
}

function getLineText(document: TextDocument, line: number): string {
  const safeLine = Math.max(0, Math.min(line, Math.max(document.lineCount - 1, 0)));
  const lineStartOffset = document.offsetAt(Position.create(safeLine, 0));
  const nextLineOffset = safeLine + 1 < document.lineCount
    ? document.offsetAt(Position.create(safeLine + 1, 0))
    : document.getText().length;

  return document.getText().slice(lineStartOffset, nextLineOffset).replace(/\r?\n$/, '');
}

/**
 * Build contextual documentation for signature help
 */
function buildSignatureDocumentation(block: Symbol, context: BranchContext): string {
  const blockType = block.name;
  let doc = `${blockType} block structure`;
  
  if (context.type !== 'unknown') {
    doc += `\n\n**Current context**: ${context.type} in ${context.branch.toUpperCase()} branch`;
    
    if (context.type === 'condition') {
      doc += '\n\n💡 You are in a condition expression. Use boolean logic and field references.';
    } else if (context.type === 'expression') {
      doc += '\n\n💡 You are in a value expression. This will be the result if the condition is met.';
    }
  }
  
  return doc;
}

/**
 * Build signature help for function calls (legacy function - kept for compatibility)
 */
function buildFunctionSignatureHelp(
  document: TextDocument,
  position: Position,
  parsed: ParsedDocument
): SignatureHelp | null {
  // Find function call at position
  const functionSymbol = findFunctionAtPosition(parsed.symbols, position);
  if (!functionSymbol) return null;
  
  return buildFunctionSignatureHelpFromSymbol(functionSymbol, position);
}

/**
 * Find function call symbol at position
 */
function findFunctionAtPosition(symbols: Symbol[], position: Position): Symbol | null {
  for (const symbol of symbols) {
    if (symbol.type === SymbolType.FunctionCall && isPositionWithinSymbol(position, symbol)) {
      return symbol;
    }
    
    if (symbol.children && symbol.children.length > 0) {
      const result = findFunctionAtPosition(symbol.children, position);
      if (result) return result;
    }
  }
  
  return null;
}

/**
 * Check if a function call is complex (has nested expressions)
 */
function isComplexFunctionCall(symbol: Symbol): boolean {
  return symbol.children ? symbol.children.length > 0 : false;
}

/**
 * Get active parameter index for function calls (legacy function - kept for compatibility)
 */
function getActiveParameterIndex(position: Position, functionSymbol: Symbol): number {
  return getActiveParameterIndexOptimized(position, functionSymbol);
}

/**
 * R5.4: Public API for signature help performance management
 */
export const SignaturePerformanceAPI = {
  /**
   * Clear signature help caches
   */
  clearCaches(): void {
    signatureCache.clear();
    symbolIndexCache.clear();
  },
  
  /**
   * Get signature help cache statistics
   */
  getCacheStats(): {
    signatureCacheSize: number;
    symbolIndexCacheSize: number;
    hitRate?: number;
  } {
    return {
      signatureCacheSize: signatureCache.size,
      symbolIndexCacheSize: symbolIndexCache.size
    };
  },
  
  /**
   * Configure performance settings
   */
  configurePerformance(config: Partial<typeof SIGNATURE_PERFORMANCE_CONFIG>): void {
    Object.assign(SIGNATURE_PERFORMANCE_CONFIG, config);
  },
  
  /**
   * Force cleanup of caches
   */
  forceCleanup(): void {
    cleanupSignatureCache();
    cleanupSymbolIndexCache();
  },
  
  /**
   * Invalidate cache for specific document
   */
  invalidateDocument(documentUri: string): void {
    // Remove signature cache entries for this document
    const keysToDelete: string[] = [];
    for (const key of signatureCache.keys()) {
      if (key.startsWith(documentUri + ':')) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => signatureCache.delete(key));
    
    // Remove symbol index for this document
    symbolIndexCache.delete(documentUri);
  },
  
  /**
   * Get performance configuration
   */
  getPerformanceConfig(): typeof SIGNATURE_PERFORMANCE_CONFIG {
    return { ...SIGNATURE_PERFORMANCE_CONFIG };
  },
  
  /**
   * Test signature help performance with sample data
   */
  async testPerformance(samplePositions: Array<{ line: number; character: number }>): Promise<{
    averageTime: number;
    maxTime: number;
    minTime: number;
    totalTests: number;
  }> {
    const times: number[] = [];

    for (const pos of samplePositions) {
      // Use a high-resolution timer: each sample does sub-millisecond work, so
      // Date.now()'s 1ms granularity rounds every measurement down to 0.
      // performance.now() returns fractional milliseconds, giving an accurate
      // (and strictly positive) duration for this micro-benchmark.
      const start = performance.now();

      // Simulate signature help processing
      const mockSymbols: Symbol[] = [
        {
          name: 'SUM',
          type: SymbolType.FunctionCall,
          range: {
            start: { line: pos.line, character: pos.character },
            end: { line: pos.line, character: pos.character + 10 }
          },
          arguments: [
            {
              text: '[Sales]',
              range: {
                start: { line: pos.line, character: pos.character + 4 },
                end: { line: pos.line, character: pos.character + 11 }
              }
            }
          ]
        }
      ];
      
      const mockIndex = createSignatureSymbolIndex(mockSymbols);
      findEnclosingConditionalBlockOptimized({ line: pos.line, character: pos.character }, mockIndex);

      const duration = performance.now() - start;
      times.push(duration);
    }
    
    return {
      averageTime: times.reduce((a, b) => a + b, 0) / times.length,
      maxTime: Math.max(...times),
      minTime: Math.min(...times),
      totalTests: times.length
    };
  },
  
  /**
   * Get symbol index statistics
   */
  getSymbolIndexStats(documentUri: string): {
    functionCallCount: number;
    conditionalBlockCount: number;
    totalSymbolsIndexed: number;
    indexAge: number;
  } | null {
    const index = symbolIndexCache.get(documentUri);
    if (!index) return null;
    
    let totalSymbols = 0;
    for (const symbols of index.symbolsByLine.values()) {
      totalSymbols += symbols.length;
    }
    
    return {
      functionCallCount: Array.from(index.functionCalls.values()).reduce((sum, arr) => sum + arr.length, 0),
      conditionalBlockCount: index.conditionalBlocks.length,
      totalSymbolsIndexed: totalSymbols,
      indexAge: Date.now() - index.lastUpdated
    };
  }
};
