import vscode from "vscode";
// Simple throttle implementation to avoid lodash dependency
function throttle(
    func: (change: vscode.TextDocumentChangeEvent) => void,
    wait: number,
    options?: { trailing?: boolean }
): (change: vscode.TextDocumentChangeEvent) => void {
    let timeout: NodeJS.Timeout | null = null;
    let previous = 0;
    const trailing = options?.trailing ?? true;

    return (change: vscode.TextDocumentChangeEvent) => {
        const now = Date.now();
        if (now - previous > wait) {
            if (timeout) {
                clearTimeout(timeout);
                timeout = null;
            }
            previous = now;
            func(change);
            return;
        }
        if (!timeout && trailing) {
            timeout = setTimeout(() => {
                previous = Date.now();
                timeout = null;
                func(change);
            }, wait - (now - previous));
        }
    };
}
import * as tableauLsp from "./tableauLsp";

export default class TableauDiagnosticsProvider {
    private syntaxDiagnostics!: vscode.DiagnosticCollection;
    private dirtyChange = new WeakMap<vscode.Uri, boolean>();

    private doSyntaxCheck: (change: vscode.TextDocumentChangeEvent) => void;

    constructor() {
        this.doSyntaxCheck = throttle(
            (change: vscode.TextDocumentChangeEvent) => {
                this._doSyntaxCheck(change.document);
            },
            500, // Check syntax after 500ms of inactivity
            {
                trailing: true,
            },
        ) as (change: vscode.TextDocumentChangeEvent) => void;
    }

    public activate(subscriptions: vscode.Disposable[]) {
        this.syntaxDiagnostics = vscode.languages.createDiagnosticCollection("tableau");

        subscriptions.push(
            this.syntaxDiagnostics,
            vscode.workspace.onDidChangeTextDocument((change) => {
                this.maybeDoSyntaxCheck(change);
            }),
            vscode.workspace.onDidSaveTextDocument((document) => {
                this.onDocumentSave(document);
            }),
        );
    }

    maybeDoSyntaxCheck(change: vscode.TextDocumentChangeEvent) {
        if (change.document.languageId !== "twbl") {
            return;
        }
        
        // If LSP client is running, let it handle diagnostics
        // Note: Using in-process providers, so we always handle diagnostics here
        
        if (change.document.isClosed) {
            this.syntaxDiagnostics.delete(change.document.uri);
            return;
        }

        this.doSyntaxCheck(change);
    }

    onDocumentSave(document: vscode.TextDocument) {
        if (document.languageId !== "twbl") return;
        if (document.isUntitled) return;

        this.dirtyChange.set(document.uri, document.isDirty);
    }

    private _doSyntaxCheck(textDocument: vscode.TextDocument) {
        // Basic Tableau syntax validation
        const diagnostics: vscode.Diagnostic[] = [];
        const text = textDocument.getText();
        const lines = text.split('\n');

        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const line = lines[lineIndex];
            const lineNumber = lineIndex;

            // Check for common Tableau syntax issues
            this.checkBracketMatching(line, lineNumber, diagnostics);
            this.checkIFThenEndStructure(lines, lineIndex, diagnostics);
            this.checkCaseWhenStructure(lines, lineIndex, diagnostics);
            this.checkFieldReferences(line, lineNumber, diagnostics);
            this.checkLODExpressions(line, lineNumber, diagnostics);
        }

        this.syntaxDiagnostics.set(textDocument.uri, diagnostics);
    }

    private checkBracketMatching(line: string, lineNumber: number, diagnostics: vscode.Diagnostic[]) {
        const brackets = { "[": "]", "(": ")", "{": "}" };
        const stack: { char: string, pos: number }[] = [];
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (Object.keys(brackets).includes(char)) {
                stack.push({ char, pos: i });
            } else if (Object.values(brackets).includes(char)) {
                const last = stack.pop();
                if (!last || brackets[last.char as keyof typeof brackets] !== char) {
                    diagnostics.push(new vscode.Diagnostic(
                        new vscode.Range(lineNumber, i, lineNumber, i + 1),
                        `Unmatched closing bracket '${char}'`,
                        vscode.DiagnosticSeverity.Error
                    ));
                }
            }
        }
        
        // Check for unclosed brackets
        stack.forEach(({ char, pos }) => {
            diagnostics.push(new vscode.Diagnostic(
                new vscode.Range(lineNumber, pos, lineNumber, pos + 1),
                `Unclosed bracket '${char}'`,
                vscode.DiagnosticSeverity.Error
            ));
        });
    }

    private checkIFThenEndStructure(lines: string[], lineIndex: number, diagnostics: vscode.Diagnostic[]) {
        const line = lines[lineIndex].trim().toUpperCase();
        
        if (line.startsWith('IF ')) {
            // Check if this IF has a corresponding THEN
            const fullExpression = this.getFullExpression(lines, lineIndex);
            if (!fullExpression.includes('THEN')) {
                diagnostics.push(new vscode.Diagnostic(
                    new vscode.Range(lineIndex, 0, lineIndex, lines[lineIndex].length),
                    'IF statement missing THEN clause',
                    vscode.DiagnosticSeverity.Error
                ));
            }
            if (!fullExpression.includes('END')) {
                diagnostics.push(new vscode.Diagnostic(
                    new vscode.Range(lineIndex, 0, lineIndex, lines[lineIndex].length),
                    'IF statement missing END clause',
                    vscode.DiagnosticSeverity.Error
                ));
            }
        }
    }

    private checkCaseWhenStructure(lines: string[], lineIndex: number, diagnostics: vscode.Diagnostic[]) {
        const line = lines[lineIndex].trim().toUpperCase();
        
        if (line.startsWith('CASE ')) {
            const fullExpression = this.getFullExpression(lines, lineIndex);
            if (!fullExpression.includes('WHEN')) {
                diagnostics.push(new vscode.Diagnostic(
                    new vscode.Range(lineIndex, 0, lineIndex, lines[lineIndex].length),
                    'CASE statement missing WHEN clause',
                    vscode.DiagnosticSeverity.Error
                ));
            }
            if (!fullExpression.includes('END')) {
                diagnostics.push(new vscode.Diagnostic(
                    new vscode.Range(lineIndex, 0, lineIndex, lines[lineIndex].length),
                    'CASE statement missing END clause',
                    vscode.DiagnosticSeverity.Error
                ));
            }
        }
    }

    private checkFieldReferences(line: string, lineNumber: number, diagnostics: vscode.Diagnostic[]) {
        // Check for malformed field references
        const fieldRefRegex = /\[([^\]]*)\]/g;
        let match;
        
        while ((match = fieldRefRegex.exec(line)) !== null) {
            const fieldName = match[1];
            if (fieldName.trim() === '') {
                diagnostics.push(new vscode.Diagnostic(
                    new vscode.Range(lineNumber, match.index, lineNumber, match.index + match[0].length),
                    'Empty field reference',
                    vscode.DiagnosticSeverity.Warning
                ));
            }
        }
    }

    private checkLODExpressions(line: string, lineNumber: number, diagnostics: vscode.Diagnostic[]) {
        // Check LOD expression syntax
        const lodRegex = /\{(\s*(FIXED|INCLUDE|EXCLUDE)\s+[^:]*:[^}]*)\}/gi;
        let match;
        
        while ((match = lodRegex.exec(line)) !== null) {
            const lodContent = match[1];
            if (!lodContent.includes(':')) {
                diagnostics.push(new vscode.Diagnostic(
                    new vscode.Range(lineNumber, match.index, lineNumber, match.index + match[0].length),
                    'LOD expression missing colon (:) separator',
                    vscode.DiagnosticSeverity.Error
                ));
            }
        }
    }

    private getFullExpression(lines: string[], startIndex: number): string {
        // Get the full multi-line expression for context
        let expression = '';
        let depth = 0;
        
        for (let i = startIndex; i < lines.length; i++) {
            const line = lines[i].toUpperCase();
            expression += ' ' + line;
            
            if (line.includes('IF') || line.includes('CASE')) depth++;
            if (line.includes('END')) {
                depth--;
                if (depth <= 0) break;
            }
        }
        
        return expression;
    }
}