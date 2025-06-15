import path from "path";
import vscode from "vscode";

import { DebouncedFunc, throttle } from "lodash-es";

import { getTableauProvider } from "./tableauLsp";
import { TableauProvider } from "./tableauProvider";

export default class TableauValidationProvider {
    private validationController: vscode.TestController;
    private updateValidationItems: DebouncedFunc<(document: vscode.TextDocument) => void>;

    constructor() {
        this.updateValidationItems = throttle(
            (document: vscode.TextDocument) => {
                this._updateValidationItems(document);
            },
            500,
            { trailing: true },
        );

        this.validationController = vscode.tests.createTestController("tableauValidationController", "Tableau Expression Validation");
        this.validationController.createRunProfile("Validate", vscode.TestRunProfileKind.Run, this.runValidation.bind(this), true);
    }

    activate(subscriptions: vscode.Disposable[]) {
        subscriptions.push(
            this.validationController,
            vscode.workspace.onDidChangeTextDocument((e) => {
                if (e.document.languageId === "twbl") {
                    this.updateValidationItems(e.document);
                }
            }),
            vscode.workspace.onDidOpenTextDocument((document) => {
                if (document.languageId === "twbl") {
                    this.updateValidationItems(document);
                }
            }),
        );
    }

    private _updateValidationItems(document: vscode.TextDocument) {
        const uri = document.uri;
        const text = document.getText();
        const lines = text.split('\n');

        // Clear existing test items for this document
        this.validationController.items.delete(uri.toString());

        const documentItem = this.validationController.createTestItem(
            uri.toString(),
            `Expressions in ${path.basename(document.fileName)}`,
            uri
        );

        let expressionCount = 0;

        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const line = lines[lineIndex].trim();
            
            // Skip empty lines and comments
            if (!line || line.startsWith('//') || line.startsWith('/*')) {
                continue;
            }

            // Check for Tableau expressions
            if (this.isTableauExpression(line)) {
                expressionCount++;
                const expressionItem = this.validationController.createTestItem(
                    `${uri.toString()}_expr_${lineIndex.toString()}`,
                    `Expression ${expressionCount.toString()}: ${line.substring(0, 50)}${line.length > 50 ? '...' : ''}`,
                    uri
                );
                
                expressionItem.range = new vscode.Range(lineIndex, 0, lineIndex, line.length);
                documentItem.children.add(expressionItem);
            }
        }

        if (expressionCount > 0) {
            this.validationController.items.add(documentItem);
        }
    }

    private isTableauExpression(line: string): boolean {
        // Check if line contains Tableau-specific patterns
        const patterns = [
            /\b(IF|CASE)\s+/i,                          // Control structures
            /\b(SUM|AVG|COUNT|MIN|MAX)\s*\(/i,          // Aggregate functions
            /\b(DATEPART|TODAY|NOW)\s*\(/i,             // Date functions
            /\b(LEN|LEFT|RIGHT|CONTAINS)\s*\(/i,        // String functions
            /\[[^\]]+\]/,                               // Field references
            /\{.*FIXED|INCLUDE|EXCLUDE.*\}/i,           // LOD expressions
        ];

        return patterns.some(pattern => pattern.test(line));
    }

    private async runValidation(request: vscode.TestRunRequest, token: vscode.CancellationToken) {
        const run = this.validationController.createTestRun(request);
        const tableauProvider = getTableauProvider();

        for (const testItem of this.getTestItems(request)) {
            if (token.isCancellationRequested) {
                run.skipped(testItem);
                continue;
            }

            run.started(testItem);

            try {
                if (!testItem.uri) {
                    run.failed(testItem, new vscode.TestMessage('Test item has no URI'));
                    continue;
                }
                const document = await vscode.workspace.openTextDocument(testItem.uri);
                const validation = this.validateExpression(document, testItem, tableauProvider);
                
                if (validation.isValid) {
                    run.passed(testItem, validation.duration);
                } else {
                    run.failed(testItem, new vscode.TestMessage(validation.error), validation.duration);
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                run.failed(testItem, new vscode.TestMessage(`Validation error: ${errorMessage}`));
            }
        }

        run.end();
    }

    private validateExpression(
        document: vscode.TextDocument,
        testItem: vscode.TestItem,
        tableauProvider: TableauProvider | null
    ): { isValid: boolean; error: string; duration: number } {
        const startTime = Date.now();
        
        if (!testItem.range) {
            return { isValid: false, error: "No range specified for test item", duration: Date.now() - startTime };
        }

        const line = document.lineAt(testItem.range.start.line);
        const text = line.text.trim();

        // Basic syntax validation
        const validationErrors: string[] = [];

        // Check bracket matching
        if (!this.validateBrackets(text)) {
            validationErrors.push("Mismatched brackets");
        }

        // Check IF/THEN/END structure
        if (/\bIF\b/i.test(text)) {
            if (!(/\bTHEN\b/i.test(text))) {
                validationErrors.push("IF statement missing THEN");
            }
            if (!(/\bEND\b/i.test(text))) {
                validationErrors.push("IF statement missing END");
            }
        }

        // Check CASE/WHEN/END structure
        if (/\bCASE\b/i.test(text)) {
            if (!(/\bWHEN\b/i.test(text))) {
                validationErrors.push("CASE statement missing WHEN");
            }
            if (!(/\bEND\b/i.test(text))) {
                validationErrors.push("CASE statement missing END");
            }
        }

        // Check function names
        const functionMatches = text.match(/\b([A-Z_][A-Z0-9_]*)\s*\(/gi);
        if (functionMatches && tableauProvider) {
            for (const match of functionMatches) {
                const functionName = match.replace(/\s*\($/, '');
                const symbol = tableauProvider.getSymbol(functionName);
                if (!symbol || symbol.type !== 'function') {
                    validationErrors.push(`Unknown function: ${functionName}`);
                }
            }
        }

        const duration = Date.now() - startTime;
        
        if (validationErrors.length > 0) {
            return { isValid: false, error: validationErrors.join('; '), duration };
        }

        return { isValid: true, error: "", duration };
    }

    private validateBrackets(text: string): boolean {
        const stack: string[] = [];
        const pairs: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
        
        for (const char of text) {
            if (Object.keys(pairs).includes(char)) {
                stack.push(char);
            } else if (Object.values(pairs).includes(char)) {
                const last = stack.pop();
                if (!last || pairs[last] !== char) {
                    return false;
                }
            }
        }
        
        return stack.length === 0;
    }

    private getTestItems(request: vscode.TestRunRequest): vscode.TestItem[] {
        const items: vscode.TestItem[] = [];
        
        if (request.include) {
            for (const item of request.include) {
                this.collectTestItems(item, items);
            }
        } else {
            this.validationController.items.forEach(item => {
                this.collectTestItems(item, items);
            });
        }
        
        return items;
    }

    private collectTestItems(item: vscode.TestItem, items: vscode.TestItem[]) {
        if (item.children.size === 0) {
            items.push(item);
        } else {
            item.children.forEach(child => {
                this.collectTestItems(child, items);
            });
        }
    }
}