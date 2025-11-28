// src/commands/reviewProblems.ts

import * as vscode from 'vscode';

let problemInspectorChannel: vscode.OutputChannel | undefined;

/**
 * Command: Analyze the current Tableau Problems list and provide contextual insights.
 * Scans active document diagnostics, looks at the surrounding source, and emits guidance
 * that explains why syntax might not be parsing correctly.
 */
export async function reviewProblemsCommand(): Promise<void> {
    const editor = vscode.window.activeTextEditor;

    if (!editor) {
        vscode.window.showErrorMessage('No active editor found to inspect problems.');
        return;
    }

    if (editor.document.languageId !== 'twbl') {
        vscode.window.showWarningMessage('Problem inspector only works for Tableau calculation files (.twbl).');
        return;
    }

    const diagnostics = vscode.languages
        .getDiagnostics(editor.document.uri)
        .filter(diag => diag.source === 'Tableau LSP');

    if (diagnostics.length === 0) {
        vscode.window.showInformationMessage('No Tableau diagnostics detected for the current document.');
        return;
    }

    const analyzer = new ProblemInsightGenerator(editor.document);
    const report = analyzer.generateReport(diagnostics);
    const channel = getProblemInspectorChannel();

    channel.clear();
    channel.appendLine(report);
    channel.show(true);

    vscode.window.showInformationMessage(
        `Tableau Problem Inspector analyzed ${diagnostics.length} issue${diagnostics.length === 1 ? '' : 's'}. ` +
        `See the "Tableau Problem Inspector" output for details.`
    );
}

function getProblemInspectorChannel(): vscode.OutputChannel {
    if (!problemInspectorChannel) {
        problemInspectorChannel = vscode.window.createOutputChannel('Tableau Problem Inspector');
    }
    return problemInspectorChannel;
}

class ProblemInsightGenerator {
    constructor(private readonly document: vscode.TextDocument) {}

    public generateReport(diagnostics: vscode.Diagnostic[]): string {
        const sorted = diagnostics.slice().sort((a, b) => {
            if (a.severity !== b.severity) {
                return a.severity - b.severity;
            }
            if (a.range.start.line !== b.range.start.line) {
                return a.range.start.line - b.range.start.line;
            }
            return a.range.start.character - b.range.start.character;
        });

        const now = new Date();
        const header = [
            '────────────────────────── Tableau Problem Inspector ──────────────────────────',
            `File      : ${this.document.fileName}`,
            `Generated : ${now.toLocaleString()}`,
            `Diagnostics analyzed: ${sorted.length}`,
            ''
        ];

        const sections: string[] = [];
        sorted.forEach((diag, index) => {
            sections.push(...this.describeDiagnostic(diag, index + 1));
            sections.push('');
        });

        return [...header, ...sections].join('\n').trimEnd();
    }

    private describeDiagnostic(diag: vscode.Diagnostic, index: number): string[] {
        const severity = this.describeSeverity(diag.severity);
        const code = this.extractCode(diag);
        const location = `Line ${diag.range.start.line + 1}, Column ${diag.range.start.character + 1}`;
        const snippet = this.extractSnippet(diag.range);

        const lines: string[] = [];
        lines.push(`${index}. ${severity} at ${location}`);
        lines.push(`   Message : ${diag.message}`);
        lines.push(`   Code    : ${code || 'n/a'}`);
        lines.push('   Context :');
        snippet.forEach(snippetLine => lines.push(`      ${snippetLine}`));

        const blockAnalysis = this.analyzeConditionalBlock(diag.range.start.line);
        const insights = this.buildInsights(diag, blockAnalysis);

        if (insights.length) {
            lines.push('   Insights:');
            insights.forEach(insight => lines.push(`      - ${insight}`));
        } else {
            lines.push('   Insights: No additional heuristics available for this diagnostic.');
        }

        return lines;
    }

    private describeSeverity(severity: vscode.DiagnosticSeverity): string {
        switch (severity) {
            case vscode.DiagnosticSeverity.Error:
                return 'Error';
            case vscode.DiagnosticSeverity.Warning:
                return 'Warning';
            case vscode.DiagnosticSeverity.Information:
                return 'Info';
            case vscode.DiagnosticSeverity.Hint:
                return 'Hint';
            default:
                return 'Unknown';
        }
    }

    private extractCode(diag: vscode.Diagnostic): string {
        if (!diag.code) {
            return '';
        }
        if (typeof diag.code === 'string') {
            return diag.code;
        }
        if (typeof diag.code === 'number') {
            return `${diag.code}`;
        }
        if ('value' in diag.code && typeof diag.code.value === 'string') {
            return diag.code.value;
        }
        return '';
    }

    private extractSnippet(range: vscode.Range): string[] {
        const startLine = Math.max(range.start.line - 2, 0);
        const endLine = Math.min(range.end.line + 2, this.document.lineCount - 1);
        const snippet: string[] = [];

        for (let line = startLine; line <= endLine; line++) {
            const prefix = line === range.start.line ? '>' : ' ';
            const text = this.document.lineAt(line).text;
            snippet.push(`${prefix} ${line + 1}: ${text}`);
        }

        return snippet;
    }

    private buildInsights(diag: vscode.Diagnostic, block: ConditionalBlockAnalysis | null): string[] {
        const code = this.extractCode(diag);
        const lowerMessage = diag.message.toLowerCase();
        const insights: string[] = [];

        if (code === 'Missing Branch' || lowerMessage.includes('then clause')) {
            insights.push(...this.describeMissingBranch(block));
        } else if (code === 'Unclosed Block' || lowerMessage.includes('missing end')) {
            insights.push(...this.describeUnclosedBlock(block));
        } else if (code === 'Conditional Logic' || lowerMessage.includes('else')) {
            insights.push(...this.describeConditionalOrdering(block));
        } else if (code === 'INVALID_FUNCTION' || lowerMessage.includes('unknown function')) {
            insights.push('Verify the function name and ensure it matches Tableau documentation. Fields often use square brackets while functions do not.');
        } else if (code === 'FUNCTION_ARGUMENT_COUNT') {
            insights.push('Check the number of arguments passed into the function. Tableau requires arguments to stay within the documented minimum/maximum range.');
        } else if (code === 'FIELD_REFERENCE') {
            insights.push('Field references must be wrapped in square brackets and match the data source field names exactly.');
        } else if (code === 'LOD Validation' || lowerMessage.includes('lod')) {
            insights.push('Level-of-detail expressions must wrap dimensions in curly braces with FIXED/INCLUDE/EXCLUDE. Ensure brackets and braces balance.');
        }

        if ((code === 'Missing Branch' || code === 'Unclosed Block' || code === 'Conditional Logic') && block?.nonAscii.length) {
            const preview = block.nonAscii
                .slice(0, 3)
                .map(charInfo => `'${charInfo.char}' at line ${charInfo.line + 1}, col ${charInfo.column + 1}`)
                .join('; ');
            insights.push(`Detected non-ASCII characters near this block (${preview}). Exotic punctuation can confuse the lexer; consider replacing them with ASCII equivalents.`);
        }

        if (!insights.length) {
            const asciiHotspots = this.findNonAsciiNearRange(diag.range);
            if (asciiHotspots.length > 0) {
                const preview = asciiHotspots
                    .slice(0, 3)
                    .map(charInfo => `'${charInfo.char}' at line ${charInfo.line + 1}, col ${charInfo.column + 1}`)
                    .join('; ');
                insights.push(`Found non-ASCII characters near the diagnostic (${preview}). Replace them with ASCII characters if Tableau cannot parse the expression.`);
            }
        }

        return insights;
    }

    private describeMissingBranch(block: ConditionalBlockAnalysis | null): string[] {
        if (!block) {
            return ['Could not locate the matching IF/CASE block. Ensure the statement starts with IF/CASE and ends with END.'];
        }

        const insights: string[] = [];
        if (block.keywordLines.THEN.length === 0) {
            insights.push(
                `No THEN keyword detected between lines ${block.startLine + 1}-${block.endLine + 1}. Add THEN immediately after the IF condition.`
            );
        } else {
            insights.push(
                `THEN found on line${block.keywordLines.THEN.length > 1 ? 's' : ''} ${block.keywordLines.THEN.join(', ')} ` +
                `but the parser still flagged the block. Inline THEN clauses or multiline conditions may prevent the branch from being recognized.`
            );
            if (block.inlineThenLines.length > 0) {
                insights.push(
                    `Line${block.inlineThenLines.length > 1 ? 's' : ''} ${block.inlineThenLines.join(', ')} contain IF/ELSEIF and THEN on the same line. ` +
                    `Move THEN to its own line to help the parser separate the branches.`
                );
            }
            if (block.multilineCondition) {
                insights.push(
                    'The IF condition spans multiple lines with AND/OR at the start of lines. Wrap the condition in parentheses or keep the logical operators on the same line as the IF.'
                );
            }
        }

        if (block.keywordLines.ELSE.length === 0 && block.keywordLines.ELSEIF.length >= 2) {
            insights.push('Multiple ELSEIF branches detected without a fallback ELSE. Consider adding ELSE to cover unmatched scenarios.');
        }

        return insights;
    }

    private describeUnclosedBlock(block: ConditionalBlockAnalysis | null): string[] {
        if (!block) {
            return ['Could not find the matching IF/CASE/LOD block near this line. Add END to close the block.'];
        }

        if (block.keywordLines.END.length > 0) {
            return [
                `END detected on line${block.keywordLines.END.length > 1 ? 's' : ''} ${block.keywordLines.END.join(', ')} ` +
                `but indentation or inline comments may hide it. Ensure END is alone on its line with no trailing content.`
            ];
        }

        return [
            `No END statement found for the ${block.blockType} block that starts on line ${block.startLine + 1}. Add END on its own line after the final branch.`
        ];
    }

    private describeConditionalOrdering(block: ConditionalBlockAnalysis | null): string[] {
        if (!block) {
            return ['Unable to analyze branch ordering because the enclosing IF/CASE block was not detected.'];
        }

        const insights: string[] = [];
        if (block.keywordLines.ELSE.length > 1) {
            insights.push('Multiple ELSE clauses detected. Tableau allows only one ELSE per IF block.');
        }

        if (block.keywordLines.ELSE.length && block.keywordLines.ELSEIF.some(line => line > block.keywordLines.ELSE[0])) {
            insights.push('Found ELSEIF appearing after ELSE. Reorder the branches so ELSE is the final clause.');
        }

        return insights.length ? insights : ['Branch ordering looks correct. Check indentation or stray text between clauses.'];
    }

    private analyzeConditionalBlock(anchorLine: number): ConditionalBlockAnalysis | null {
        const totalLines = this.document.lineCount;
        let start = anchorLine;

        while (start >= 0) {
            const trimmed = this.stripComments(this.document.lineAt(start).text).trim().toUpperCase();
            if (this.looksLikeConditionalStart(trimmed)) {
                break;
            }
            start--;
        }

        if (start < 0) {
            return null;
        }

        let end = anchorLine;
        while (end < totalLines) {
            const trimmed = this.stripComments(this.document.lineAt(end).text).trim().toUpperCase();
            if (trimmed === 'END' || trimmed.startsWith('END ')) {
                break;
            }
            end++;
        }
        end = Math.min(end, totalLines - 1);

        const keywordLines: ConditionalKeywordMap = {
            IF: [],
            CASE: [],
            THEN: [],
            ELSE: [],
            ELSEIF: [],
            WHEN: [],
            END: []
        };
        const inlineThenLines: number[] = [];
        const nonAscii: NonAsciiLocation[] = [];
        let multilineCondition = false;

        for (let line = start; line <= end; line++) {
            const rawText = this.document.lineAt(line).text;
            const text = this.stripComments(rawText);
            const upper = text.toUpperCase();

            this.trackKeyword('IF', line, upper, keywordLines);
            this.trackKeyword('CASE', line, upper, keywordLines);
            this.trackKeyword('THEN', line, upper, keywordLines);
            this.trackKeyword('ELSE', line, upper, keywordLines);
            this.trackKeyword('ELSEIF', line, upper, keywordLines);
            this.trackKeyword('WHEN', line, upper, keywordLines);
            this.trackKeyword('END', line, upper, keywordLines);

            if (/\b(THEN)\b/.test(upper) && /\b(IF|ELSEIF)\b/.test(upper)) {
                inlineThenLines.push(line + 1);
            }

            if (!multilineCondition) {
                const trimmed = upper.trim();
                if ((trimmed.startsWith('AND ') || trimmed.startsWith('OR ')) && !trimmed.startsWith('AND THEN') && !trimmed.startsWith('OR THEN')) {
                    multilineCondition = true;
                }
            }

            for (const match of rawText.matchAll(/[^\x00-\x7F]/g)) {
                nonAscii.push({
                    line,
                    column: match.index ?? 0,
                    char: match[0]
                });
            }
        }

        const blockType =
            keywordLines.CASE.length > 0 && (keywordLines.IF.length === 0 || keywordLines.CASE[0] <= keywordLines.IF[0])
                ? 'CASE'
                : 'IF';

        return {
            blockType,
            startLine: start,
            endLine: end,
            keywordLines,
            inlineThenLines,
            multilineCondition,
            nonAscii
        };
    }

    private looksLikeConditionalStart(line: string): boolean {
        const trimmed = line.trim();
        return /^IF\b/.test(trimmed) ||
            /^CASE\b/.test(trimmed) ||
            /^\{?( FIXED| INCLUDE| EXCLUDE)\b/.test(trimmed);
    }

    private stripComments(line: string): string {
        const commentIndex = line.indexOf('//');
        if (commentIndex === -1) {
            return line;
        }
        return line.slice(0, commentIndex);
    }

    private trackKeyword(keyword: keyof ConditionalKeywordMap, line: number, upperText: string, map: ConditionalKeywordMap): void {
        const regex = new RegExp(`\\b${keyword}\\b`);
        if (regex.test(upperText)) {
            map[keyword].push(line + 1);
        }
    }

    private findNonAsciiNearRange(range: vscode.Range): NonAsciiLocation[] {
        const start = Math.max(range.start.line - 1, 0);
        const end = Math.min(range.end.line + 1, this.document.lineCount - 1);
        const hits: NonAsciiLocation[] = [];

        for (let line = start; line <= end; line++) {
            const text = this.document.lineAt(line).text;
            for (const match of text.matchAll(/[^\x00-\x7F]/g)) {
                hits.push({
                    line,
                    column: match.index ?? 0,
                    char: match[0]
                });
            }
        }

        return hits;
    }
}

interface ConditionalKeywordMap {
    IF: number[];
    CASE: number[];
    THEN: number[];
    ELSE: number[];
    ELSEIF: number[];
    WHEN: number[];
    END: number[];
}

interface NonAsciiLocation {
    line: number;
    column: number;
    char: string;
}

interface ConditionalBlockAnalysis {
    blockType: 'IF' | 'CASE';
    startLine: number;
    endLine: number;
    keywordLines: ConditionalKeywordMap;
    inlineThenLines: number[];
    multilineCondition: boolean;
    nonAscii: NonAsciiLocation[];
}
