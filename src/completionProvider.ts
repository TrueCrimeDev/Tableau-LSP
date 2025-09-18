import {
    CompletionItem,
    CompletionItemKind,
    MarkupKind,
    Position,
    TextDocumentPositionParams,
    CompletionList,
    InsertTextFormat
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ParsedDocument, FUNCTION_SIGNATURES, SymbolType } from './common';
import { FieldParser } from './fieldParser';
import * as fs from 'fs';
import * as path from 'path';

/**
 * R4.1: Tableau keywords for completion
 */
const TABLEAU_KEYWORDS = [
    'IF', 'THEN', 'ELSE', 'ELSEIF', 'END',
    'CASE', 'WHEN', 'ELSE', 'END',
    'AND', 'OR', 'NOT',
    'TRUE', 'FALSE', 'NULL',
    'FIXED', 'INCLUDE', 'EXCLUDE',
    'ASC', 'DESC'
];

/**
 * R4.1: Tableau operators for completion
 */
const TABLEAU_OPERATORS = [
    { label: '=', detail: 'Equals', kind: CompletionItemKind.Operator },
    { label: '<>', detail: 'Not equals', kind: CompletionItemKind.Operator },
    { label: '!=', detail: 'Not equals', kind: CompletionItemKind.Operator },
    { label: '<', detail: 'Less than', kind: CompletionItemKind.Operator },
    { label: '>', detail: 'Greater than', kind: CompletionItemKind.Operator },
    { label: '<=', detail: 'Less than or equal', kind: CompletionItemKind.Operator },
    { label: '>=', detail: 'Greater than or equal', kind: CompletionItemKind.Operator },
    { label: '+', detail: 'Addition', kind: CompletionItemKind.Operator },
    { label: '-', detail: 'Subtraction', kind: CompletionItemKind.Operator },
    { label: '*', detail: 'Multiplication', kind: CompletionItemKind.Operator },
    { label: '/', detail: 'Division', kind: CompletionItemKind.Operator },
    { label: '%', detail: 'Modulo', kind: CompletionItemKind.Operator }
];

/**
 * R4.4: Snippet interface for template-based completions
 */
interface TableauSnippet {
    prefix: string;
    body: string | string[];
    description: string;
    category?: string;
}

/**
 * R4.4: Cached snippets loaded from snippet files
 */
let cachedSnippets: Map<string, TableauSnippet> | null = null;
let snippetLoadTime = 0;
const SNIPPET_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * R4.5: Performance optimization configuration
 */
const COMPLETION_PERFORMANCE_CONFIG = {
    MAX_COMPLETION_ITEMS: 100,
    ENABLE_PERFORMANCE_LOGGING: false,
    FUZZY_MATCH_THRESHOLD: 0.3,
    CACHE_TTL_MS: 2 * 60 * 1000, // 2 minutes
    DEBOUNCE_DELAY_MS: 50
};

/**
 * R4.5: Completion cache for performance optimization
 */
interface CompletionCacheEntry {
    items: CompletionItem[];
    timestamp: number;
    documentVersion: number;
}

const completionCache = new Map<string, CompletionCacheEntry>();

/**
 * R4.5: Relevance scoring interface
 */
interface ScoredCompletionItem extends CompletionItem {
    relevanceScore: number;
    matchType: 'exact' | 'prefix' | 'fuzzy' | 'contains';
}

/**
 * R4.1: Provide completion items for Tableau calculations
 * R4.5: Enhanced with performance optimization, relevance ranking, and duplicate filtering
 */
export function provideCompletion(
    params: TextDocumentPositionParams,
    document: TextDocument,
    parsedDocument: ParsedDocument,
    fieldParser: FieldParser | null
): CompletionList {
    const startTime = COMPLETION_PERFORMANCE_CONFIG.ENABLE_PERFORMANCE_LOGGING ? Date.now() : 0;
    const position = params.position;
    const documentUri = document.uri;
    const documentVersion = document.version;
    
    // Get the word being typed
    const wordRange = getWordRangeAtPosition(document, position);
    const word = wordRange ? document.getText(wordRange) : '';
    const upperWord = word.toUpperCase();
    
    // Get line context
    const lineText = document.getText({
        start: { line: position.line, character: 0 },
        end: { line: position.line, character: position.character }
    });
    
    // R4.5: Check cache first
    const cacheKey = generateCompletionCacheKey(documentUri, position, word, documentVersion);
    const cachedResult = getFromCompletionCache(cacheKey);
    if (cachedResult) {
        logPerformance('Completion cache hit', startTime);
        return {
            isIncomplete: false,
            items: cachedResult
        };
    }
    
    // R4.6: Context-specific completions
    if (isInFieldBrackets(lineText, position.character)) {
        // Only show field completions when inside brackets
        const fieldCompletions = fieldParser ? getFieldCompletions(upperWord, fieldParser) : [];
        const optimizedFieldCompletions = optimizeCompletions(fieldCompletions, word);
        
        addToCompletionCache(cacheKey, optimizedFieldCompletions, documentVersion);
        logPerformance('Field-only completion', startTime);
        
        return {
            isIncomplete: false,
            items: optimizedFieldCompletions
        };
    }
    
    // Collect all completions
    const allCompletions: CompletionItem[] = [];
    
    // R4.2: Add function completions
    allCompletions.push(...getFunctionCompletions(upperWord));
    
    // R4.3: Add keyword completions
    allCompletions.push(...getKeywordCompletions(upperWord));
    
    // R4.4: Add field completions
    if (fieldParser) {
        allCompletions.push(...getFieldCompletions(upperWord, fieldParser));
    }
    
    // R4.5: Add operator completions
    allCompletions.push(...getOperatorCompletions(upperWord));
    
    // R4.4: Add snippet completions
    allCompletions.push(...getSnippetCompletions(upperWord, lineText));
    
    // R4.5: Optimize completions (rank, filter duplicates, limit)
    const optimizedCompletions = optimizeCompletions(allCompletions, word);
    
    // R4.5: Cache the result
    addToCompletionCache(cacheKey, optimizedCompletions, documentVersion);
    
    logPerformance('Total completion processing', startTime);
    
    return {
        isIncomplete: optimizedCompletions.length >= COMPLETION_PERFORMANCE_CONFIG.MAX_COMPLETION_ITEMS,
        items: optimizedCompletions
    };
}

/**
 * R4.5: Generate cache key for completion requests
 */
function generateCompletionCacheKey(
    documentUri: string, 
    position: Position, 
    word: string, 
    documentVersion: number
): string {
    return `${documentUri}:${position.line}:${position.character}:${word}:${documentVersion}`;
}

/**
 * R4.5: Get completion from cache if valid
 */
function getFromCompletionCache(cacheKey: string): CompletionItem[] | undefined {
    const entry = completionCache.get(cacheKey);
    if (!entry) {
        return undefined;
    }
    
    // Check if cache entry is still valid
    const now = Date.now();
    if (now - entry.timestamp > COMPLETION_PERFORMANCE_CONFIG.CACHE_TTL_MS) {
        completionCache.delete(cacheKey);
        return undefined;
    }
    
    return entry.items;
}

/**
 * R4.5: Add completion to cache with cleanup
 */
function addToCompletionCache(cacheKey: string, items: CompletionItem[], documentVersion: number): void {
    // Clean up cache if it's getting too large
    if (completionCache.size >= 500) {
        cleanupCompletionCache();
    }
    
    completionCache.set(cacheKey, {
        items,
        timestamp: Date.now(),
        documentVersion
    });
}

/**
 * R4.5: Clean up old completion cache entries
 */
function cleanupCompletionCache(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];
    
    for (const [key, entry] of completionCache.entries()) {
        if (now - entry.timestamp > COMPLETION_PERFORMANCE_CONFIG.CACHE_TTL_MS) {
            keysToDelete.push(key);
        }
    }
    
    // Remove oldest entries if still too large
    if (keysToDelete.length === 0 && completionCache.size >= 500) {
        const entries = Array.from(completionCache.entries());
        entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
        const toRemove = Math.floor(500 * 0.2); // Remove 20%
        keysToDelete.push(...entries.slice(0, toRemove).map(([key]) => key));
    }
    
    keysToDelete.forEach(key => completionCache.delete(key));
}

/**
 * R4.5: Optimize completions with ranking, deduplication, and limiting
 */
function optimizeCompletions(completions: CompletionItem[], query: string): CompletionItem[] {
    // Step 1: Score completions for relevance
    const scoredCompletions = scoreCompletions(completions, query);
    
    // Step 2: Remove duplicates
    const deduplicatedCompletions = removeDuplicateCompletions(scoredCompletions);
    
    // Step 3: Sort by relevance score
    deduplicatedCompletions.sort((a, b) => {
        // Primary sort: relevance score (higher is better)
        if (b.relevanceScore !== a.relevanceScore) {
            return b.relevanceScore - a.relevanceScore;
        }
        
        // Secondary sort: match type priority
        const matchTypePriority = { 'exact': 4, 'prefix': 3, 'fuzzy': 2, 'contains': 1 };
        const aPriority = matchTypePriority[a.matchType] || 0;
        const bPriority = matchTypePriority[b.matchType] || 0;
        
        if (bPriority !== aPriority) {
            return bPriority - aPriority;
        }
        
        // Tertiary sort: original sort text
        return (a.sortText || a.label).localeCompare(b.sortText || b.label);
    });
    
    // Step 4: Limit results
    const limitedCompletions = deduplicatedCompletions.slice(0, COMPLETION_PERFORMANCE_CONFIG.MAX_COMPLETION_ITEMS);
    
    // Step 5: Update sort text based on final ranking
    return limitedCompletions.map((item, index) => ({
        ...item,
        sortText: `${String(index).padStart(3, '0')}_${item.label}`
    }));
}

/**
 * R4.5: Score completions based on relevance to query
 */
function scoreCompletions(completions: CompletionItem[], query: string): ScoredCompletionItem[] {
    const lowerQuery = query.toLowerCase();
    
    return completions.map(item => {
        const label = item.label.toLowerCase();
        const filterText = (item.filterText || item.label).toLowerCase();
        
        let score = 0;
        let matchType: ScoredCompletionItem['matchType'] = 'contains';
        
        // Exact match (highest score)
        if (label === lowerQuery || filterText === lowerQuery) {
            score = 100;
            matchType = 'exact';
        }
        // Prefix match (high score)
        else if (label.startsWith(lowerQuery) || filterText.startsWith(lowerQuery)) {
            score = 80 + (lowerQuery.length / Math.max(label.length, filterText.length)) * 20;
            matchType = 'prefix';
        }
        // Fuzzy match (medium score)
        else {
            const fuzzyScore = calculateFuzzyScore(lowerQuery, label);
            const filterFuzzyScore = calculateFuzzyScore(lowerQuery, filterText);
            const bestFuzzyScore = Math.max(fuzzyScore, filterFuzzyScore);
            
            if (bestFuzzyScore >= COMPLETION_PERFORMANCE_CONFIG.FUZZY_MATCH_THRESHOLD) {
                score = 40 + bestFuzzyScore * 40;
                matchType = 'fuzzy';
            }
            // Contains match (low score)
            else if (label.includes(lowerQuery) || filterText.includes(lowerQuery)) {
                score = 20 + (lowerQuery.length / Math.max(label.length, filterText.length)) * 20;
                matchType = 'contains';
            }
        }
        
        // Boost score based on completion type
        const typeBoost = getCompletionTypeBoost(item.kind);
        score += typeBoost;
        
        return {
            ...item,
            relevanceScore: score,
            matchType
        } as ScoredCompletionItem;
    }).filter(item => item.relevanceScore > 0);
}

/**
 * R4.5: Calculate fuzzy matching score
 */
function calculateFuzzyScore(query: string, target: string): number {
    if (query.length === 0) return 1;
    if (target.length === 0) return 0;
    
    let queryIndex = 0;
    let targetIndex = 0;
    let matches = 0;
    
    while (queryIndex < query.length && targetIndex < target.length) {
        if (query[queryIndex] === target[targetIndex]) {
            matches++;
            queryIndex++;
        }
        targetIndex++;
    }
    
    // Score based on percentage of query characters matched
    const matchRatio = matches / query.length;
    
    // Bonus for consecutive matches
    let consecutiveBonus = 0;
    queryIndex = 0;
    targetIndex = 0;
    let consecutive = 0;
    
    while (queryIndex < query.length && targetIndex < target.length) {
        if (query[queryIndex] === target[targetIndex]) {
            consecutive++;
            queryIndex++;
        } else {
            if (consecutive > 1) {
                consecutiveBonus += consecutive * 0.1;
            }
            consecutive = 0;
        }
        targetIndex++;
    }
    
    if (consecutive > 1) {
        consecutiveBonus += consecutive * 0.1;
    }
    
    return Math.min(1, matchRatio + consecutiveBonus);
}

/**
 * R4.5: Get completion type boost for scoring
 */
function getCompletionTypeBoost(kind?: CompletionItemKind): number {
    switch (kind) {
        case CompletionItemKind.Snippet: return 15;
        case CompletionItemKind.Function: return 10;
        case CompletionItemKind.Keyword: return 8;
        case CompletionItemKind.Field: return 5;
        case CompletionItemKind.Operator: return 2;
        default: return 0;
    }
}

/**
 * R4.5: Remove duplicate completions
 */
function removeDuplicateCompletions(completions: ScoredCompletionItem[]): ScoredCompletionItem[] {
    const seen = new Set<string>();
    const result: ScoredCompletionItem[] = [];
    
    for (const completion of completions) {
        // Create a unique key based on label and kind
        const key = `${completion.label}:${completion.kind}`;
        
        if (!seen.has(key)) {
            seen.add(key);
            result.push(completion);
        } else {
            // If we've seen this completion before, keep the one with higher score
            const existingIndex = result.findIndex(item => 
                item.label === completion.label && item.kind === completion.kind
            );
            
            if (existingIndex !== -1 && completion.relevanceScore > result[existingIndex].relevanceScore) {
                result[existingIndex] = completion;
            }
        }
    }
    
    return result;
}

/**
 * R4.5: Performance logging utility
 */
function logPerformance(operation: string, startTime: number): void {
    if (COMPLETION_PERFORMANCE_CONFIG.ENABLE_PERFORMANCE_LOGGING && startTime > 0) {
        const duration = Date.now() - startTime;
        console.log(`[Completion Performance] ${operation}: ${duration}ms`);
    }
}

/**
 * R4.2: Get function completions from FUNCTION_SIGNATURES
 */
function getFunctionCompletions(prefix: string): CompletionItem[] {
    const completions: CompletionItem[] = [];
    
    for (const [functionName, signature] of Object.entries(FUNCTION_SIGNATURES)) {
        if (functionName.startsWith(prefix)) {
            const [minArgs, maxArgs] = signature;
            const argRange = maxArgs === Infinity ? `${minArgs}+` : 
                           minArgs === maxArgs ? `${minArgs}` : `${minArgs}-${maxArgs}`;
            
            completions.push({
                label: functionName,
                kind: CompletionItemKind.Function,
                detail: `Function (${argRange} args)`,
                documentation: {
                    kind: MarkupKind.Markdown,
                    value: `**${functionName}**\n\nTableau function that expects ${argRange} arguments.`
                },
                insertText: `${functionName}($1)$0`,
                insertTextFormat: 2, // Snippet format
                sortText: `1_${functionName}` // High priority
            });
        }
    }
    
    return completions;
}

/**
 * R4.3: Get keyword completions
 */
function getKeywordCompletions(prefix: string): CompletionItem[] {
    const completions: CompletionItem[] = [];
    
    for (const keyword of TABLEAU_KEYWORDS) {
        if (keyword.startsWith(prefix)) {
            completions.push({
                label: keyword,
                kind: CompletionItemKind.Keyword,
                detail: `Keyword`,
                documentation: {
                    kind: MarkupKind.Markdown,
                    value: `**${keyword}**\n\nTableau keyword`
                },
                insertText: keyword,
                sortText: `2_${keyword}` // Medium priority
            });
        }
    }
    
    return completions;
}

/**
 * R4.4: Get field completions from field parser
 */
function getFieldCompletions(prefix: string, fieldParser: FieldParser): CompletionItem[] {
    const completions: CompletionItem[] = [];
    
    // Get all available fields
    const fieldsMap = fieldParser.getAllFields();
    
    for (const [key, field] of fieldsMap) {
        if (field.name.toUpperCase().includes(prefix)) {
            completions.push({
                label: `[${field.name}]`,
                kind: CompletionItemKind.Field,
                detail: `Field (${field.type || 'Unknown'})`,
                documentation: {
                    kind: MarkupKind.Markdown,
                    value: `**${field.name}**\n\n${field.description || 'Tableau field reference'}`
                },
                insertText: `[${field.name}]`,
                sortText: `3_${field.name}` // Lower priority
            });
        }
    }
    
    return completions;
}

/**
 * R4.5: Get operator completions
 */
function getOperatorCompletions(prefix: string): CompletionItem[] {
    return TABLEAU_OPERATORS.filter(op => 
        op.label.startsWith(prefix) || op.detail.toUpperCase().includes(prefix)
    ).map(op => ({
        ...op,
        sortText: `4_${op.label}` // Lower priority
    }));
}

/**
 * R4.4: Get snippet completions from cached snippet files
 */
function getSnippetCompletions(prefix: string, lineText: string): CompletionItem[] {
    const snippets = loadSnippets();
    const completions: CompletionItem[] = [];
    
    for (const [key, snippet] of snippets.entries()) {
        // Match by prefix or partial prefix
        if (snippet.prefix.toUpperCase().includes(prefix) || 
            (prefix.length > 0 && snippet.prefix.toUpperCase().startsWith(prefix))) {
            
            // Determine if this is a slash command
            const isSlashCommand = snippet.prefix.startsWith('/');
            
            // Skip slash commands if not typing a slash command
            if (isSlashCommand && !lineText.includes('/')) {
                continue;
            }
            
            // Skip regular snippets if typing a slash command
            if (!isSlashCommand && lineText.includes('/') && !lineText.endsWith('/')) {
                continue;
            }
            
            const insertText = Array.isArray(snippet.body) 
                ? snippet.body.join('\n') 
                : snippet.body;
            
            completions.push({
                label: snippet.prefix,
                kind: CompletionItemKind.Snippet,
                detail: `Snippet - ${snippet.description}`,
                documentation: {
                    kind: MarkupKind.Markdown,
                    value: createSnippetDocumentation(snippet)
                },
                insertText: insertText,
                insertTextFormat: InsertTextFormat.Snippet,
                sortText: `0_${snippet.prefix}`, // Highest priority for snippets
                filterText: snippet.prefix,
                data: {
                    type: 'snippet',
                    category: snippet.category || 'general'
                }
            });
        }
    }
    
    return completions;
}

/**
 * R4.4: Load and cache snippets from snippet files
 */
function loadSnippets(): Map<string, TableauSnippet> {
    const now = Date.now();
    
    // Return cached snippets if still valid
    if (cachedSnippets && (now - snippetLoadTime) < SNIPPET_CACHE_TTL) {
        return cachedSnippets;
    }
    
    const snippets = new Map<string, TableauSnippet>();
    
    try {
        // Load main snippets
        const mainSnippetsPath = path.join(__dirname, '..', 'snippets', 'twbl.json');
        if (fs.existsSync(mainSnippetsPath)) {
            const mainSnippets = JSON.parse(fs.readFileSync(mainSnippetsPath, 'utf8'));
            parseSnippetFile(mainSnippets, snippets, 'main');
        }
        
        // Load slash command snippets
        const slashSnippetsPath = path.join(__dirname, '..', 'snippets', 'slash-commands.json');
        if (fs.existsSync(slashSnippetsPath)) {
            const slashSnippets = JSON.parse(fs.readFileSync(slashSnippetsPath, 'utf8'));
            parseSnippetFile(slashSnippets, snippets, 'slash');
        }
        
    } catch (error) {
        console.error('Error loading snippets:', error);
    }
    
    cachedSnippets = snippets;
    snippetLoadTime = now;
    
    return snippets;
}

/**
 * R4.4: Parse snippet file and add to snippets map
 */
function parseSnippetFile(
    snippetData: any, 
    snippets: Map<string, TableauSnippet>, 
    category: string
): void {
    for (const [key, value] of Object.entries(snippetData)) {
        // Skip comment entries (keys starting with ---)
        if (key.startsWith('---')) {
            continue;
        }
        
        const snippet = value as any;
        if (snippet.prefix && snippet.body && snippet.description) {
            snippets.set(key, {
                prefix: snippet.prefix,
                body: snippet.body,
                description: snippet.description,
                category: category
            });
        }
    }
}

/**
 * R4.4: Create documentation for snippet completion items
 */
function createSnippetDocumentation(snippet: TableauSnippet): string {
    const parts: string[] = [];
    
    // Title
    parts.push(`**${snippet.prefix}** - ${snippet.description}`);
    
    // Preview of the snippet
    const preview = Array.isArray(snippet.body) 
        ? snippet.body.join('\n') 
        : snippet.body;
    
    // Clean up snippet variables for preview
    const cleanPreview = preview
        .replace(/\$\{\d+:([^}]+)\}/g, '$1') // ${1:condition} -> condition
        .replace(/\$\{\d+\|([^}]+)\|\}/g, '$1') // ${1|option1,option2|} -> option1,option2
        .replace(/\$\{\d+\}/g, '...') // ${1} -> ...
        .replace(/\$\d+/g, '...') // $1 -> ...
        .replace(/\$0/g, ''); // Remove final cursor position
    
    parts.push('\n**Preview:**');
    parts.push('```twbl');
    parts.push(cleanPreview);
    parts.push('```');
    
    // Category information
    if (snippet.category) {
        parts.push(`\n*Category: ${snippet.category}*`);
    }
    
    return parts.join('\n');
}

/**
 * R4.4: Public API for snippet management
 */
export const SnippetCompletionAPI = {
    /**
     * Clear snippet cache to force reload
     */
    clearCache(): void {
        cachedSnippets = null;
        snippetLoadTime = 0;
    },
    
    /**
     * Get all available snippets
     */
    getAllSnippets(): Map<string, TableauSnippet> {
        return loadSnippets();
    },
    
    /**
     * Get snippets by category
     */
    getSnippetsByCategory(category: string): TableauSnippet[] {
        const snippets = loadSnippets();
        const result: TableauSnippet[] = [];
        
        for (const snippet of snippets.values()) {
            if (snippet.category === category) {
                result.push(snippet);
            }
        }
        
        return result;
    },
    
    /**
     * Get snippet statistics
     */
    getSnippetStats(): {
        totalSnippets: number;
        categoryCounts: { [category: string]: number };
        slashCommands: number;
        regularSnippets: number;
    } {
        const snippets = loadSnippets();
        const stats = {
            totalSnippets: snippets.size,
            categoryCounts: {} as { [category: string]: number },
            slashCommands: 0,
            regularSnippets: 0
        };
        
        for (const snippet of snippets.values()) {
            // Count by category
            const category = snippet.category || 'unknown';
            stats.categoryCounts[category] = (stats.categoryCounts[category] || 0) + 1;
            
            // Count slash commands vs regular snippets
            if (snippet.prefix.startsWith('/')) {
                stats.slashCommands++;
            } else {
                stats.regularSnippets++;
            }
        }
        
        return stats;
    },
    
    /**
     * Search snippets by description or prefix
     */
    searchSnippets(query: string): TableauSnippet[] {
        const snippets = loadSnippets();
        const result: TableauSnippet[] = [];
        const lowerQuery = query.toLowerCase();
        
        for (const snippet of snippets.values()) {
            if (snippet.prefix.toLowerCase().includes(lowerQuery) ||
                snippet.description.toLowerCase().includes(lowerQuery)) {
                result.push(snippet);
            }
        }
        
        return result;
    }
};

/**
 * R4.5: Public API for completion performance management
 */
export const CompletionPerformanceAPI = {
    /**
     * Clear completion cache
     */
    clearCache(): void {
        completionCache.clear();
    },
    
    /**
     * Get completion cache statistics
     */
    getCacheStats(): {
        cacheSize: number;
        hitRate?: number;
        averageResponseTime?: number;
    } {
        return {
            cacheSize: completionCache.size
        };
    },
    
    /**
     * Configure performance settings
     */
    configurePerformance(config: Partial<typeof COMPLETION_PERFORMANCE_CONFIG>): void {
        Object.assign(COMPLETION_PERFORMANCE_CONFIG, config);
    },
    
    /**
     * Force cleanup of caches
     */
    forceCleanup(): void {
        cleanupCompletionCache();
    },
    
    /**
     * Invalidate cache for specific document
     */
    invalidateDocument(documentUri: string): void {
        const keysToDelete: string[] = [];
        for (const key of completionCache.keys()) {
            if (key.startsWith(documentUri + ':')) {
                keysToDelete.push(key);
            }
        }
        keysToDelete.forEach(key => completionCache.delete(key));
    },
    
    /**
     * Get performance configuration
     */
    getPerformanceConfig(): typeof COMPLETION_PERFORMANCE_CONFIG {
        return { ...COMPLETION_PERFORMANCE_CONFIG };
    },
    
    /**
     * Test completion performance with sample data
     */
    async testPerformance(sampleQueries: string[]): Promise<{
        averageTime: number;
        maxTime: number;
        minTime: number;
        totalQueries: number;
    }> {
        const times: number[] = [];
        
        for (const query of sampleQueries) {
            const start = Date.now();
            
            // Simulate completion scoring
            const mockCompletions: CompletionItem[] = [
                { label: 'SUM', kind: CompletionItemKind.Function },
                { label: 'AVG', kind: CompletionItemKind.Function },
                { label: 'IF', kind: CompletionItemKind.Keyword }
            ];
            
            scoreCompletions(mockCompletions, query);
            
            const duration = Date.now() - start;
            times.push(duration);
        }
        
        return {
            averageTime: times.reduce((a, b) => a + b, 0) / times.length,
            maxTime: Math.max(...times),
            minTime: Math.min(...times),
            totalQueries: times.length
        };
    }
};

/**
 * Helper: Get word range at position
 */
function getWordRangeAtPosition(document: TextDocument, position: Position) {
    const text = document.getText();
    const offset = document.offsetAt(position);
    
    let start = offset;
    let end = offset;
    
    // Find start of word
    while (start > 0 && /[A-Z_0-9]/i.test(text[start - 1])) {
        start--;
    }
    
    // Find end of word
    while (end < text.length && /[A-Z_0-9]/i.test(text[end])) {
        end++;
    }
    
    if (start === end) return null;
    
    return {
        start: document.positionAt(start),
        end: document.positionAt(end)
    };
}

/**
 * Helper: Check if position is inside field brackets
 */
function isInFieldBrackets(lineText: string, character: number): boolean {
    let openBracket = -1;
    let closeBracket = -1;
    
    for (let i = 0; i < character; i++) {
        if (lineText[i] === '[') {
            openBracket = i;
        } else if (lineText[i] === ']') {
            closeBracket = i;
        }
    }
    
    return openBracket !== -1 && (closeBracket === -1 || openBracket > closeBracket);
} 