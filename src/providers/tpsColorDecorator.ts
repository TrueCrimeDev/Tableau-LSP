import * as vscode from 'vscode';

/**
 * Decorator provider for Tableau Preferences (.tps) files
 * Highlights hex color values with their actual color for better visualization
 */
export class TpsColorDecorator {
    private decorationType: vscode.TextEditorDecorationType;
    private timeout: NodeJS.Timeout | undefined;

    constructor() {
        this.decorationType = vscode.window.createTextEditorDecorationType({
            before: {
                width: '1.2em',
                height: '1.2em',
                contentText: '',
                border: '1px solid #00000033',
                margin: '0 0.3em 0 0'
            }
        });
    }

    /**
     * Activate the decorator
     */
    public activate(context: vscode.ExtensionContext): void {
        // Update decorations on active editor change
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor && this.isTpsFile(editor.document)) {
                this.updateDecorations(editor);
            }
        }, null, context.subscriptions);

        // Update decorations on document change
        vscode.workspace.onDidChangeTextDocument(event => {
            const editor = vscode.window.activeTextEditor;
            if (editor && event.document === editor.document && this.isTpsFile(event.document)) {
                this.triggerUpdateDecorations(editor);
            }
        }, null, context.subscriptions);

        // Initial decoration for active editor
        const editor = vscode.window.activeTextEditor;
        if (editor && this.isTpsFile(editor.document)) {
            this.updateDecorations(editor);
        }

        context.subscriptions.push(this.decorationType);
    }

    /**
     * Check if document is a .tps file
     */
    private isTpsFile(document: vscode.TextDocument): boolean {
        return document.fileName.endsWith('.tps') || document.languageId === 'xml';
    }

    /**
     * Trigger decoration update with debounce
     */
    private triggerUpdateDecorations(editor: vscode.TextEditor): void {
        if (this.timeout) {
            clearTimeout(this.timeout);
        }
        this.timeout = setTimeout(() => {
            this.updateDecorations(editor);
        }, 200);
    }

    /**
     * Update decorations for the editor
     */
    private updateDecorations(editor: vscode.TextEditor): void {
        const text = editor.document.getText();
        const decorations: vscode.DecorationOptions[] = [];

        // Match hex colors in <color>#RRGGBB</color> tags
        const colorRegex = /<color>(#[0-9A-Fa-f]{6})<\/color>/g;
        let match: RegExpExecArray | null;

        while ((match = colorRegex.exec(text)) !== null) {
            const hexColor = match[1]; // e.g., "#1F6E8C"
            const startPos = editor.document.positionAt(match.index + match[0].indexOf(hexColor));
            const endPos = editor.document.positionAt(match.index + match[0].indexOf(hexColor) + hexColor.length);

            const decoration: vscode.DecorationOptions = {
                range: new vscode.Range(startPos, endPos),
                renderOptions: {
                    before: {
                        backgroundColor: hexColor,
                        contentText: ''
                    }
                }
            };

            decorations.push(decoration);
        }

        editor.setDecorations(this.decorationType, decorations);
    }

    /**
     * Dispose the decorator
     */
    public dispose(): void {
        this.decorationType.dispose();
    }
}

/**
 * Register the TPS color decorator with VS Code
 */
export function registerTpsColorDecorator(context: vscode.ExtensionContext): TpsColorDecorator {
    const decorator = new TpsColorDecorator();
    decorator.activate(context);
    console.log('Tableau LSP: TPS color decorator registered');
    return decorator;
}
