import * as vscode from 'vscode';
import { CompletionItem, CompletionItemKind, InsertTextFormat } from 'vscode-languageserver';
import type { Position } from 'vscode-languageserver';
import type { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * Interface for a slash command snippet.
 */
export interface SlashCommand {
    prefix: string;
    description: string;
    body: string[] | string;
}

/**
 * Type guard for SlashCommand objects.
 * @param obj - The object to check.
 * @returns True if obj is a SlashCommand.
 */
export function isSlashCommand(obj: any): obj is SlashCommand {
    return !!obj && typeof obj.prefix === 'string' && typeof obj.description === 'string' && (typeof obj.body === 'string' || Array.isArray(obj.body));
}

export class SlashCommandProvider implements vscode.CompletionItemProvider {
    private slashCommands: Map<string, vscode.CompletionItem> = new Map();

    constructor() {
        this.initializeSlashCommands();
    }

    private initializeSlashCommands() {
        // Basic control structures
        this.addSlashCommand('/if', 'Generate basic IF-THEN-ELSE statement', [
            'IF ${1:condition} THEN ${2:value}',
            'ELSE ${3:value}',
            'END'
        ]);

        this.addSlashCommand('/case', 'Generate CASE statement with multiple conditions', [
            'CASE ${1:field}',
            '    WHEN \'${2:value1}\' THEN ${3:result1}',
            '    WHEN \'${4:value2}\' THEN ${5:result2}',
            '    ELSE ${6:default}',
            'END'
        ]);

        this.addSlashCommand('/when', 'Generate CASE WHEN statement with conditions', [
            'CASE',
            '    WHEN ${1:condition1} THEN ${2:result1}',
            '    WHEN ${3:condition2} THEN ${4:result2}',
            '    ELSE ${5:default}',
            'END'
        ]);

        this.addSlashCommand('/lod', 'Generate Level of Detail (LOD) expression', [
            '{ ${1|FIXED,INCLUDE,EXCLUDE|} ${2:[Dimension]} : ${3:AGG([Measure])} }'
        ]);

        // Custom business logic
        this.addSlashCommand('/doin', 'Generate initials mapping', [
            'IIF([Investigating DO]="Chicago IL","CH",',
            'IIF([Investigating DO]="Columbus OH","CO",',
            'IIF([Investigating DO]="Des Moines IA","DM",',
            'IIF([Investigating DO]="Detroit MI","DT",',
            'IIF([Investigating DO]="Grand Rapids MI","GR",',
            'IIF([Investigating DO]="Indianapolis IN","IN",',
            'IIF([Investigating DO]="Kansas City KS","KC",',
            'IIF([Investigating DO]="Minneapolis MN","MN",',
            'IIF([Investigating DO]="St. Louis MO","SL",',
            '"",""))))))))))'
        ]);

        this.addSlashCommand('/don', 'Generate names mapping', [
            'IIF([Investigating DO]="Chicago IL","Chicago",',
            'IIF([Investigating DO]="Columbus OH","Columbus",',
            'IIF([Investigating DO]="Des Moines IA","Des Moines",',
            'IIF([Investigating DO]="Detroit MI","Detroit",',
            'IIF([Investigating DO]="Grand Rapids MI","Grand Rapids",',
            'IIF([Investigating DO]="Indianapolis IN","Indianapolis",',
            'IIF([Investigating DO]="Kansas City KS","Kansas City",',
            'IIF([Investigating DO]="Minneapolis MN","Minneapolis",',
            'IIF([Investigating DO]="St. Louis MO","St. Louis",',
            '""))))))))))'
        ]);

        this.addSlashCommand('/ini', 'Generate Initiative index mapping with metadata comment', [
            '// Index2 | { type:quantitative, role:measure, datatype:integer, workbook:Test2.twb }',
            'CASE Initiative',
            '    WHEN \'Ag\' THEN 2',
            '    WHEN \'Building Services\' THEN 1',
            '    WHEN \'Care\' THEN 1',
            '    WHEN \'Food Services\' THEN 1',
            '    WHEN \'Government Contracts\' THEN 1',
            '    WHEN \'Residential Construction\' THEN 1',
            '    WHEN \'Warehousing\' THEN 1',
            '    WHEN \'None\' THEN NULL',
            'END'
        ]);

        // Additional useful templates
        this.addSlashCommand('/iif', 'Generate nested IIF statement template', [
            'IIF(${1:condition1}, ${2:value1},',
            'IIF(${3:condition2}, ${4:value2},',
            'IIF(${5:condition3}, ${6:value3},',
            '${7:default_value})))'
        ]);

        this.addSlashCommand('/running', 'Generate running calculation', [
            'RUNNING_${1|SUM,AVG,COUNT,MAX,MIN|}(${2:expression})'
        ]);

        this.addSlashCommand('/window', 'Generate window calculation', [
            'WINDOW_${1|SUM,AVG,COUNT,MAX,MIN|}(${2:expression}, ${3:start}, ${4:end})'
        ]);

        this.addSlashCommand('/date', 'Generate date part extraction', [
            'DATEPART(\'${1|year,quarter,month,week,day,weekday,hour,minute,second|}\', ${2:[Date Field]})'
        ]);
    }

    private addSlashCommand(command: string, description: string, body: string[]) {
        const item = new vscode.CompletionItem(command, vscode.CompletionItemKind.Snippet);
        item.detail = description;
        item.documentation = new vscode.MarkdownString(`**${command}**\n\n${description}\n\n\`\`\`twbl\n${body.join('\n')}\n\`\`\``);
        item.insertText = new vscode.SnippetString(body.join('\n'));
        item.sortText = command; // Ensure slash commands appear at the top
        item.filterText = command;
        
        // Remove the leading slash for the range replacement
        item.range = new vscode.Range(
            new vscode.Position(0, 0),
            new vscode.Position(0, command.length)
        );

        this.slashCommands.set(command, item);
    }

    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext
    ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
        
        const lineText = document.lineAt(position).text;
        const textBeforeCursor = lineText.substring(0, position.character);
        
        // Check if the user just typed a slash at the beginning of a line or after whitespace
        const slashMatch = textBeforeCursor.match(/(?:^|\s)(\/\w*)$/);
        
        if (!slashMatch) {
            return [];
        }

        const typedCommand = slashMatch[1];
        const completions: vscode.CompletionItem[] = [];

        // Filter slash commands based on what the user has typed
        for (const [command, item] of this.slashCommands) {
            if (command.startsWith(typedCommand)) {
                // Clone the item and adjust the range for proper replacement
                const clonedItem = new vscode.CompletionItem(item.label, item.kind);
                clonedItem.detail = item.detail;
                clonedItem.documentation = item.documentation;
                clonedItem.insertText = item.insertText;
                clonedItem.sortText = item.sortText;
                clonedItem.filterText = item.filterText;
                
                // Set the range to replace the typed slash command
                const startPos = new vscode.Position(position.line, position.character - typedCommand.length);
                clonedItem.range = new vscode.Range(startPos, position);
                
                completions.push(clonedItem);
            }
        }

        return completions;
    }
}

interface SnippetQuickPickItem extends vscode.QuickPickItem {
    snippet: string | vscode.SnippetString;
}

export async function insertSlashSnippetMenu() {
    // Gather all slash commands
    const provider = new SlashCommandProvider();
    const items: SnippetQuickPickItem[] = [];
    for (const [key, value] of provider['slashCommands']) {
        items.push({
            label: key,
            description: typeof value.documentation === 'string' ? value.documentation : value.documentation?.value,
            snippet: value.insertText || ''
        });
    }
    const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a slash snippet to insert'
    });
    if (!picked) return;

    // Find placeholders like ${1:default}
    let snippetText = typeof picked.snippet === 'string' ? picked.snippet : picked.snippet.value;
    const placeholderRegex = /\$\{(\d+):([^\}]+)\}/g;
    let match;
    const prompts: { index: string; default: string }[] = [];
    while ((match = placeholderRegex.exec(snippetText)) !== null) {
        prompts.push({ index: match[1], default: match[2] });
    }
    const values: { [key: string]: string } = {};
    for (const prompt of prompts) {
        const value = await vscode.window.showInputBox({
            prompt: `Value for ${prompt.default}`,
            value: prompt.default
        });
        if (value === undefined) return;
        values[prompt.index] = value;
    }
    // Replace placeholders with user input
    snippetText = snippetText.replace(placeholderRegex, (m: string, idx: string, def: string) => values[idx] ?? def);

    // Insert at cursor
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        editor.insertSnippet(new vscode.SnippetString(snippetText));
    }
}

// ---------------------------------------------------------------------------
// Functional facade (LSP-style API)
//
// The SlashCommandProvider class above is the VS Code extension entry point and
// emits snippet-style completions (with a leading "/"). The language-server
// layer and unit tests consume a lighter, dependency-free functional API that
// works directly on vscode-languageserver documents/types. These exports wrap a
// small registry of Tableau function/keyword slash commands and intentionally
// use vscode-languageserver's CompletionItemKind so the numeric enum values
// match what callers (and tests) compare against.
// ---------------------------------------------------------------------------

/** A single usage example for a slash command. */
export interface SlashCommandHelpExample {
    code: string;
    description: string;
}

/** Help metadata returned by getSlashCommandHelp(). */
export interface SlashCommandHelp {
    command: string;
    description: string;
    syntax: string;
    examples: SlashCommandHelpExample[];
}

/** A validation error produced by validateSlashCommand(). */
export interface SlashCommandValidationError {
    message: string;
}

/** Result of validating a slash command string. */
export interface SlashCommandValidationResult {
    isValid: boolean;
    errors: SlashCommandValidationError[];
    suggestions?: string[];
}

interface SlashCommandDef {
    name: string;
    kind: CompletionItemKind;
    category: 'aggregate' | 'string' | 'date' | 'control' | 'lod';
    description: string;
    syntax: string;
    insertText: string;
    examples: SlashCommandHelpExample[];
}

const FN = CompletionItemKind.Function;
const KW = CompletionItemKind.Keyword;

const SLASH_COMMAND_DEFS: SlashCommandDef[] = [
    // Control flow (keywords)
    {
        name: 'if', kind: KW, category: 'control',
        description: 'Evaluates a conditional expression and returns a value.',
        syntax: 'IF <condition> THEN <value> ELSE <value> END',
        insertText: 'IF ${1:condition} THEN ${2:result} ELSE ${3:default} END',
        examples: [{ code: 'IF [Sales] > 100 THEN "High" ELSE "Low" END', description: 'Bucket sales into two groups' }],
    },
    {
        name: 'case', kind: KW, category: 'control',
        description: 'Compares a field against a series of values and returns a result.',
        syntax: 'CASE <field> WHEN <value> THEN <result> ELSE <default> END',
        insertText: 'CASE ${1:field}\n    WHEN ${2:value} THEN ${3:result}\n    ELSE ${4:default}\nEND',
        examples: [{ code: "CASE [Region] WHEN 'East' THEN 1 ELSE 0 END", description: 'Map a region to a flag' }],
    },
    {
        name: 'iif', kind: KW, category: 'control',
        description: 'Returns one of two values based on a conditional test.',
        syntax: 'IIF(<test>, <then>, <else>)',
        insertText: 'IIF(${1:test}, ${2:then}, ${3:else})',
        examples: [{ code: 'IIF([Sales] > 100, "High", "Low")', description: 'Inline conditional' }],
    },
    // Aggregate functions
    {
        name: 'sum', kind: FN, category: 'aggregate',
        description: 'Returns the sum of all values in the expression.',
        syntax: 'SUM(expression)',
        insertText: 'SUM(${1:expression})',
        examples: [{ code: 'SUM([Sales])', description: 'Total sales' }],
    },
    {
        name: 'avg', kind: FN, category: 'aggregate',
        description: 'Returns the average of all values in the expression.',
        syntax: 'AVG(expression)',
        insertText: 'AVG(${1:expression})',
        examples: [{ code: 'AVG([Profit])', description: 'Average profit' }],
    },
    {
        name: 'count', kind: FN, category: 'aggregate',
        description: 'Returns the number of items in the expression.',
        syntax: 'COUNT(expression)',
        insertText: 'COUNT(${1:expression})',
        examples: [{ code: 'COUNT([Order ID])', description: 'Number of orders' }],
    },
    {
        name: 'min', kind: FN, category: 'aggregate',
        description: 'Returns the minimum value in the expression.',
        syntax: 'MIN(expression)',
        insertText: 'MIN(${1:expression})',
        examples: [{ code: 'MIN([Sales])', description: 'Smallest sale' }],
    },
    {
        name: 'max', kind: FN, category: 'aggregate',
        description: 'Returns the maximum value in the expression.',
        syntax: 'MAX(expression)',
        insertText: 'MAX(${1:expression})',
        examples: [{ code: 'MAX([Sales])', description: 'Largest sale' }],
    },
    // String functions
    {
        name: 'left', kind: FN, category: 'string',
        description: 'Returns the leftmost characters of a string.',
        syntax: 'LEFT(string, number)',
        insertText: 'LEFT(${1:string}, ${2:number})',
        examples: [{ code: 'LEFT([Name], 3)', description: 'First three characters' }],
    },
    {
        name: 'right', kind: FN, category: 'string',
        description: 'Returns the rightmost characters of a string.',
        syntax: 'RIGHT(string, number)',
        insertText: 'RIGHT(${1:string}, ${2:number})',
        examples: [{ code: 'RIGHT([Name], 3)', description: 'Last three characters' }],
    },
    {
        name: 'mid', kind: FN, category: 'string',
        description: 'Returns characters from the middle of a string.',
        syntax: 'MID(string, start, [length])',
        insertText: 'MID(${1:string}, ${2:start})',
        examples: [{ code: 'MID([Name], 2, 3)', description: 'Three characters starting at position 2' }],
    },
    {
        name: 'len', kind: FN, category: 'string',
        description: 'Returns the number of characters in a string.',
        syntax: 'LEN(string)',
        insertText: 'LEN(${1:string})',
        examples: [{ code: 'LEN([Name])', description: 'Length of the name' }],
    },
    {
        name: 'upper', kind: FN, category: 'string',
        description: 'Converts a string to uppercase.',
        syntax: 'UPPER(string)',
        insertText: 'UPPER(${1:string})',
        examples: [{ code: 'UPPER([Name])', description: 'Uppercase the name' }],
    },
    {
        name: 'lower', kind: FN, category: 'string',
        description: 'Converts a string to lowercase.',
        syntax: 'LOWER(string)',
        insertText: 'LOWER(${1:string})',
        examples: [{ code: 'LOWER([Name])', description: 'Lowercase the name' }],
    },
    // Date functions
    {
        name: 'dateadd', kind: FN, category: 'date',
        description: 'Adds an interval to a date and returns the new date.',
        syntax: 'DATEADD(date_part, interval, date)',
        insertText: "DATEADD('${1:date_part}', ${2:interval}, ${3:date})",
        examples: [{ code: "DATEADD('month', 1, [Order Date])", description: 'Add one month' }],
    },
    {
        name: 'datediff', kind: FN, category: 'date',
        description: 'Returns the difference between two dates.',
        syntax: 'DATEDIFF(date_part, start_date, end_date)',
        insertText: "DATEDIFF('${1:date_part}', ${2:start_date}, ${3:end_date})",
        examples: [{ code: "DATEDIFF('day', [Order Date], [Ship Date])", description: 'Days to ship' }],
    },
    {
        name: 'datepart', kind: FN, category: 'date',
        description: 'Returns a part of a date as an integer.',
        syntax: 'DATEPART(date_part, date)',
        insertText: "DATEPART('${1:date_part}', ${2:date})",
        examples: [{ code: "DATEPART('year', [Order Date])", description: 'Extract the year' }],
    },
    {
        name: 'year', kind: FN, category: 'date',
        description: 'Returns the year of a date as an integer.',
        syntax: 'YEAR(date)',
        insertText: 'YEAR(${1:date})',
        examples: [{ code: 'YEAR([Order Date])', description: 'Year of the order' }],
    },
    {
        name: 'month', kind: FN, category: 'date',
        description: 'Returns the month of a date as an integer.',
        syntax: 'MONTH(date)',
        insertText: 'MONTH(${1:date})',
        examples: [{ code: 'MONTH([Order Date])', description: 'Month of the order' }],
    },
    {
        name: 'day', kind: FN, category: 'date',
        description: 'Returns the day of a date as an integer.',
        syntax: 'DAY(date)',
        insertText: 'DAY(${1:date})',
        examples: [{ code: 'DAY([Order Date])', description: 'Day of the order' }],
    },
    // Level of Detail (keywords)
    {
        name: 'fixed', kind: KW, category: 'lod',
        description: 'Computes an aggregate using a fixed Level of Detail.',
        syntax: '{ FIXED [Dimension] : AGG([Measure]) }',
        insertText: '{ FIXED ${1:[Dimension]} : ${2:SUM([Measure])} }',
        examples: [{ code: '{ FIXED [Region] : SUM([Sales]) }', description: 'Sales per region' }],
    },
    {
        name: 'include', kind: KW, category: 'lod',
        description: 'Computes an aggregate including specified dimensions (Level of Detail).',
        syntax: '{ INCLUDE [Dimension] : AGG([Measure]) }',
        insertText: '{ INCLUDE ${1:[Dimension]} : ${2:SUM([Measure])} }',
        examples: [{ code: '{ INCLUDE [Customer] : SUM([Sales]) }', description: 'Include customer dimension' }],
    },
    {
        name: 'exclude', kind: KW, category: 'lod',
        description: 'Computes an aggregate excluding specified dimensions (Level of Detail).',
        syntax: '{ EXCLUDE [Dimension] : AGG([Measure]) }',
        insertText: '{ EXCLUDE ${1:[Dimension]} : ${2:SUM([Measure])} }',
        examples: [{ code: '{ EXCLUDE [Region] : SUM([Sales]) }', description: 'Exclude region dimension' }],
    },
];

const SLASH_COMMAND_MAP: Map<string, SlashCommandDef> = new Map(
    SLASH_COMMAND_DEFS.map((d) => [d.name, d])
);

function detectSlashContext(textBeforeCursor: string): 'lod' | 'default' {
    // Inside an LOD brace block or after a FIXED/INCLUDE/EXCLUDE keyword.
    if (/\{[^}]*$/.test(textBeforeCursor) || /\b(FIXED|INCLUDE|EXCLUDE)\b/i.test(textBeforeCursor)) {
        return 'lod';
    }
    return 'default';
}

function categoryPriority(category: SlashCommandDef['category'], context: 'lod' | 'default'): number {
    const order: SlashCommandDef['category'][] = context === 'lod'
        ? ['aggregate', 'lod', 'control', 'string', 'date']
        : ['control', 'aggregate', 'lod', 'string', 'date'];
    const i = order.indexOf(category);
    return i === -1 ? order.length : i;
}

function matchesPartial(def: SlashCommandDef, partial: string): boolean {
    if (partial === '') return true;
    if (def.name.startsWith(partial)) return true;
    // Category aliases let "/agg", "/str", "/date", "/lod" surface a whole group.
    if (def.category.startsWith(partial)) return true;
    return false;
}

function toCompletionItem(def: SlashCommandDef): CompletionItem {
    return {
        label: def.name,
        kind: def.kind,
        detail: def.description,
        documentation: `${def.description}\n\nSyntax: ${def.syntax}`,
        insertText: def.insertText,
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: def.name,
        filterText: def.name,
    };
}

/**
 * Provide slash command completions for a document position.
 *
 * Detection finds the nearest "/" on the current line at or before the cursor,
 * extracts the partial word typed after it, and returns matching commands
 * (by name prefix or category alias). Returns [] when no slash token is present.
 */
export function provideSlashCommandCompletion(
    document: TextDocument,
    position: Position
): CompletionItem[] {
    const text = document.getText();
    const lines = text.split(/\r?\n/);
    const line = lines[position.line] ?? '';
    const textBeforeCursor = line.substring(0, position.character);

    // Find the rightmost "/" at index <= cursor on this line.
    let slashIndex = -1;
    for (let i = Math.min(position.character, line.length - 1); i >= 0; i--) {
        if (line[i] === '/') {
            slashIndex = i;
            break;
        }
    }
    if (slashIndex === -1) {
        return [];
    }

    const after = line.substring(slashIndex + 1, position.character);
    const partial = (after.match(/^\w*/) ?? [''])[0];
    const context = detectSlashContext(textBeforeCursor);

    return SLASH_COMMAND_DEFS
        .map((def, idx) => ({ def, idx }))
        .filter(({ def }) => matchesPartial(def, partial))
        .sort((a, b) => {
            const pa = categoryPriority(a.def.category, context);
            const pb = categoryPriority(b.def.category, context);
            return pa - pb || a.idx - b.idx;
        })
        .map(({ def }) => toCompletionItem(def));
}

/**
 * Return help metadata for a slash command, or undefined if unknown.
 */
export function getSlashCommandHelp(command: string): SlashCommandHelp | undefined {
    const def = SLASH_COMMAND_MAP.get(command);
    if (!def) {
        return undefined;
    }
    return {
        command: def.name,
        description: def.description,
        syntax: def.syntax,
        examples: def.examples,
    };
}

function isBalanced(s: string): boolean {
    const count = (ch: string): number => s.split(ch).length - 1;
    if (count('(') !== count(')')) return false;
    if (count('[') !== count(']')) return false;
    if (count('{') !== count('}')) return false;
    if (count('"') % 2 !== 0) return false;
    if (count("'") % 2 !== 0) return false;
    return true;
}

function levenshtein(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
        let prev = dp[0];
        dp[0] = i;
        for (let j = 1; j <= n; j++) {
            const tmp = dp[j];
            dp[j] = a[i - 1] === b[j - 1]
                ? prev
                : Math.min(prev, dp[j], dp[j - 1]) + 1;
            prev = tmp;
        }
    }
    return dp[n];
}

function suggestSimilar(name: string): string[] {
    const lower = name.toLowerCase();
    return SLASH_COMMAND_DEFS
        .map((def) => ({ name: def.name, dist: levenshtein(lower, def.name) }))
        .filter((x) => x.dist > 0 && x.dist <= 2)
        .sort((a, b) => a.dist - b.dist)
        .map((x) => x.name);
}

/**
 * Validate a slash command string (e.g. "/sum([Sales])").
 *
 * Reports unknown commands (with edit-distance suggestions) and unbalanced
 * parentheses/brackets/quotes as syntax errors.
 */
export function validateSlashCommand(text: string): SlashCommandValidationResult {
    const trimmed = text.trim();
    const match = trimmed.match(/^\/([A-Za-z_]\w*)([\s\S]*)$/);
    if (!match) {
        return {
            isValid: false,
            errors: [{ message: 'Invalid slash command syntax: a command must begin with "/"' }],
        };
    }

    const name = match[1];
    const rest = match[2];

    if (!SLASH_COMMAND_MAP.has(name)) {
        return {
            isValid: false,
            errors: [{ message: `"/${name}" is an unknown slash command` }],
            suggestions: suggestSimilar(name),
        };
    }

    if (!isBalanced(rest)) {
        return {
            isValid: false,
            errors: [{ message: `Invalid syntax in "/${name}": unbalanced parentheses, brackets, or quotes` }],
        };
    }

    return { isValid: true, errors: [] };
}
