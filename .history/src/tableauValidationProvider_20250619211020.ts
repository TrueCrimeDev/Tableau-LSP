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
        
        // Get document model
        const documentManager = TableauDocumentManager.getInstance();
        const documentModel = documentManager.getDocumentModel(document);
        const expressions = documentModel.expressions;

        // Clear existing test items for this document
        this.validationController.items.delete(uri.toString());

        const documentItem = this.validationController.createTestItem(
            uri.toString(),
            `Expressions in ${path.basename(document.fileName)}`,
            uri
        );

        // Create test items for each expression
        for (let i = 0; i < expressions.length; i++) {
            const expression = expressions[i];
            const expressionText = expression.text;
            const displayText = expressionText.replace(/\n/g, ' ').substring(0, 50) + (expressionText.length > 50 ? '...' : '');
            
            const expressionItem = this.validationController.createTestItem(
                `${uri.toString()}_expr_${i.toString()}`,
                `Expression ${(i + 1).toString()}: ${displayText}`,
                uri
            );
            
            // Create range from start to end line
            expressionItem.range = new vscode.Range(
                expression.startLine, 0,
                expression.endLine, document.lineAt(expression.endLine).text.length
            );
            
            documentItem.children.add(expressionItem);
        }

        if (expressions.length > 0) {
            this.validationController.items.add(documentItem);
        }
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

        // Get document model and expression
        const documentManager = TableauDocumentManager.getInstance();
        const documentModel = documentManager.getDocumentModel(document);
        
        // Find the expression that contains this range
        const expression = documentModel.expressions.find(expr =>
            expr.startLine <= testItem.range!.start.line &&
            expr.endLine >= testItem.range!.end.line
        );
        
        if (!expression) {
            return { isValid: false, error: "Expression not found in document model", duration: Date.now() - startTime };
        }
        
        const text = expression.text;

        // Enhanced syntax validation
        const validationErrors: string[] = [];

        // Check bracket matching
        if (!this.validateBrackets(text)) {
            validationErrors.push("Mismatched brackets");
        }

        // Check IF/THEN/END structure for multi-line expressions
        if (expression.type === 'if') {
            if (!(/\bTHEN\b/i.test(text))) {
                validationErrors.push("IF statement missing THEN");
            }
            if (!(/\bEND\b/i.test(text))) {
                validationErrors.push("IF statement missing END");
            }
            
            // Check for balanced ELSEIF/ELSE
            const elseIfCount = (text.match(/\bELSEIF\b/gi) || []).length;
            const elseCount = (text.match(/\bELSE\b/gi) || []).length;
            
            if (elseCount > 1) {
                validationErrors.push("Multiple ELSE clauses in IF statement");
            }
            
            // Check for ELSE after ELSEIF
            if (elseIfCount > 0 && elseCount > 0) {
                const lastElseIfPos = text.toUpperCase().lastIndexOf('ELSEIF');
                const lastElsePos = text.toUpperCase().lastIndexOf('ELSE');
                
                if (lastElseIfPos > lastElsePos) {
                    validationErrors.push("ELSEIF after ELSE in IF statement");
                }
            }
        }

        // Check CASE/WHEN/END structure for multi-line expressions
        if (expression.type === 'case') {
            if (!(/\bWHEN\b/i.test(text))) {
                validationErrors.push("CASE statement missing WHEN");
            }
            if (!(/\bEND\b/i.test(text))) {
                validationErrors.push("CASE statement missing END");
            }
            
            // Check for at least one WHEN clause
            const whenCount = (text.match(/\bWHEN\b/gi) || []).length;
            if (whenCount === 0) {
                validationErrors.push("CASE statement requires at least one WHEN clause");
            }
        }

        // Check LOD expressions
        if (expression.type === 'lod') {
            if (!(/\{.*:.*\}/s.test(text))) {
                validationErrors.push("Invalid LOD expression format, missing colon");
            }
            
            // Check for valid LOD keywords
            if (!(/\b(FIXED|INCLUDE|EXCLUDE)\b/i.test(text))) {
                validationErrors.push("LOD expression missing FIXED, INCLUDE, or EXCLUDE keyword");
            }
        }

        // Check function names and parameters
        const functionMatches = text.matchAll(/\b([A-Z_][A-Z0-9_]*)\s*\(/gi);
        if (tableauProvider) {
            for (const match of Array.from(functionMatches)) {
                const functionName = match[1].toUpperCase();
                const symbol = tableauProvider.getSymbol(functionName);
                
                if (!symbol || symbol.type !== 'function') {
                    validationErrors.push(`Unknown function: ${functionName}`);
                    continue;
                }
                
                // Check for parameter count if we have parameter info
                if (symbol.parameters) {
                    // Find the closing parenthesis for this function call
                    const startPos = match.index! + match[0].length;
                    let endPos = startPos;
                    let depth = 1;
                    
                    while (endPos < text.length && depth > 0) {
                        if (text[endPos] === '(') depth++;
                        else if (text[endPos] === ')') depth--;
                        endPos++;
                    }
                    
                    if (depth === 0) {
                        const argsText = text.substring(startPos, endPos - 1).trim();
                        
                        // Count arguments (handle empty argument list)
                        const argCount = argsText === '' ? 0 : this.countArguments(argsText);
                        
                        // Count required parameters
                        const requiredParamCount = symbol.parameters.filter(p => !p.optional).length;
                        const totalParamCount = symbol.parameters.length;
                        
                        if (argCount < requiredParamCount) {
                            validationErrors.push(`Function ${functionName} requires at least ${requiredParamCount} arguments, but got ${argCount}`);
                        } else if (argCount > totalParamCount) {
                            validationErrors.push(`Function ${functionName} accepts at most ${totalParamCount} arguments, but got ${argCount}`);
                        }
                    }
                }
            }
        }

        const duration = Date.now() - startTime;
        
        if (validationErrors.length > 0) {
            return { isValid: false, error: validationErrors.join('; '), duration };
        }

        return { isValid: true, error: "", duration };
    }
    
    /**
     * Count the number of arguments in a comma-separated list
     * Handles nested expressions with commas inside parentheses
     */
    private countArguments(argsText: string): number {
        let count = 1; // Start with 1 for non-empty string
        let depth = 0;
        
        for (let i = 0; i < argsText.length; i++) {
            const char = argsText[i];
            
            if (char === '(') {
                depth++;
            } else if (char === ')') {
                depth--;
            } else if (char === ',' && depth === 0) {
                count++;
            }
        }
        
        return count;
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