import {
  SignatureHelp,
  SignatureInformation,
  MarkupKind,
  Position,
  Range
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ParsedDocument, Symbol, SymbolType, FUNCTION_SIGNATURES } from './common';

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
  const startTime = SIGNATURE_PERFORMANCE_CONFIG.ENABLE_PERFORMANCE_LOGGING ? Date.now() : 0;
  const documentUri = document.uri;
  const documentVersion = document.version;
  
  // R5.4: Check cache first
  const cacheKey = generateSignatureCacheKey(documentUri, position, documentVersion);
  const cachedSignature = getFromSignatureCache(cacheKey);
  if (cachedSignature) {
    logPerformance('Signature cache hit', startTime);
    return cachedSignature;
  }
  
  // R5.4: Get or create symbol index for efficient lookup
  const symbolIndex = getOrCreateSymbolIndex(document, parsed);
  
  // R5.4: Use efficient symbol lookup
  const block = findEnclosingConditionalBlockOptimized(position, symbolIndex);
  let signature: SignatureHelp | null = null;
  
  if (block) {
    // R3.3: Show complete block structure with active branch highlighted
    signature = buildConditionalSignature(block, position, document);
  } else {
    // Check if we're in a function call that needs signature help
    signature = buildFunctionSignatureHelpOptimized(document, position, symbolIndex);
  }
  
  // R5.4: Cache the result if we found a signature
  if (signature) {
    addToSignatureCache(cacheKey, signature, documentVersion);
  }
  
  logPerformance('Total signature help processing', startTime);
  return signature;
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
  return document
    .getText(
      Range.create(
        { line: branch.range.start.line ?? 0, character: 0 },
        { line: branch.range.start.line ?? 0, character: Number.MAX_SAFE_INTEGER }
      )
    )
    .trimEnd();
}

/**
 * Extract the END line text
 */
function extractEndLine(block: Symbol, document: TextDocument): string {
  const endLn = block.end?.range.start.line ??
    (block.children?.slice(-1)[0]?.range.end.line ?? 0);

  return document.getText(
    Range.create(
      { line: endLn, character: 0 },
      { line: endLn, character: Number.MAX_SAFE_INTEGER }
    )
  ).trimEnd();
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
      const start = Date.now();
      
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
      
      const duration = Date.now() - start;
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
