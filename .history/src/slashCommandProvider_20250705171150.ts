import * as vscode from 'vscode';

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
        this.addSlashCommand('/doin', 'Generate District Office initials mapping', [
            'IIF([Investigating DO]="Chicago IL","CH",',
            'IIF([Investigating DO]="Columbus OH District Office","CO",',
            'IIF([Investigating DO]="Des Moines IA District Office","DM",',
            'IIF([Investigating DO]="Detroit MI District Office","DT",',
            'IIF([Investigating DO]="Grand Rapids MI District Office","GR",',
            'IIF([Investigating DO]="Indianapolis IN District Office","IN",',
            'IIF([Investigating DO]="Kansas City KS District Office","KC",',
            'IIF([Investigating DO]="Minneapolis MN District Office","MN",',
            'IIF([Investigating DO]="St. Louis MO District Office","SL",',
            '"",""))))))))))'
        ]);

        this.addSlashCommand('/don', 'Generate District Office names mapping', [
            'IIF([Investigating DO]="Chicago IL District Office","Chicago",',
            'IIF([Investigating DO]="Columbus OH District Office","Columbus",',
            'IIF([Investigating DO]="Des Moines IA District Office","Des Moines",',
            'IIF([Investigating DO]="Detroit MI District Office","Detroit",',
            'IIF([Investigating DO]="Grand Rapids MI District Office","Grand Rapids",',
            'IIF([Investigating DO]="Indianapolis IN District Office","Indianapolis",',
            'IIF([Investigating DO]="Kansas City KS District Office","Kansas City",',
            'IIF([Investigating DO]="Minneapolis MN District Office","Minneapolis",',
            'IIF([Investigating DO]="St. Louis MO District Office","St. Louis",',
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

import * as vscode from 'vscode';

export async function insertSlashSnippetMenu() {
    // Gather all slash commands
    const provider = new SlashCommandProvider();
    const items = [];
    for (const [key, value] of provider['slashCommands']) {
        items.push({
            label: key,
            description: value.documentation || '',
            snippet: value.insertText
        });
    }
    const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a slash snippet to insert'
    });
    if (!picked) return;

    // Find placeholders like ${1:default}
    let snippetText = Array.isArray(picked.snippet) ? picked.snippet.join('\n') : picked.snippet;
    const placeholderRegex = /\$\{(\d+):([^\}]+)\}/g;
    let match;
    const prompts = [];
    while ((match = placeholderRegex.exec(snippetText)) !== null) {
        prompts.push({ index: match[1], default: match[2] });
    }
    const values = {};
    for (const prompt of prompts) {
        const value = await vscode.window.showInputBox({
            prompt: `Value for ${prompt.default}`,
            value: prompt.default
        });
        if (value === undefined) return;
        values[prompt.index] = value;
    }
    // Replace placeholders with user input
    snippetText = snippetText.replace(placeholderRegex, (m, idx, def) => values[idx] ?? def);

    // Insert at cursor
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        editor.insertSnippet(new vscode.SnippetString(snippetText));
    }
}
