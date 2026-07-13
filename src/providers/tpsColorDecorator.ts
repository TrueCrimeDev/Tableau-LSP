import * as vscode from 'vscode';

/**
 * Decorator provider for Tableau Preferences (.tps) files
 * Highlights hex color values with their actual color for better visualization
 */
export class TpsColorDecorator {
    private decorationType: vscode.TextEditorDecorationType;
    private timeout: NodeJS.Timeout | undefined;
    private readonly colorInTagRegex = /<color>\s*(#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}))\s*<\/color>/gi;
    private readonly colorInValueAttrRegex = /\bvalue\s*=\s*(["'])(#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}))\1/gi;

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
            if (editor && this.isSupportedDocument(editor.document)) {
                this.updateDecorations(editor);
            }
        }, null, context.subscriptions);

        // Update decorations on document change
        vscode.workspace.onDidChangeTextDocument(event => {
            const editor = vscode.window.activeTextEditor;
            if (editor && event.document === editor.document && this.isSupportedDocument(event.document)) {
                this.triggerUpdateDecorations(editor);
            }
        }, null, context.subscriptions);

        // Initial decoration for active editor
        const editor = vscode.window.activeTextEditor;
        if (editor && this.isSupportedDocument(editor.document)) {
            this.updateDecorations(editor);
        }

        context.subscriptions.push(this.decorationType);
    }

    /**
     * Check if document is a .tps file
     */
    private isSupportedDocument(document: vscode.TextDocument): boolean {
        const lowerPath = document.fileName.toLowerCase();
        return (
            lowerPath.endsWith('.tps') ||
            lowerPath.endsWith('.twb') ||
            document.languageId === 'twb'
        );
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

        this.addDecorationsFromRegex(text, editor, decorations, this.colorInTagRegex, 1);
        this.addDecorationsFromRegex(text, editor, decorations, this.colorInValueAttrRegex, 2);

        editor.setDecorations(this.decorationType, decorations);
    }

    private addDecorationsFromRegex(
        text: string,
        editor: vscode.TextEditor,
        decorations: vscode.DecorationOptions[],
        regex: RegExp,
        hexGroupIndex: number
    ): void {
        regex.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(text)) !== null) {
            const hexColor = match[hexGroupIndex];
            if (!hexColor) {
                continue;
            }
            const start = match.index + match[0].indexOf(hexColor);
            const end = start + hexColor.length;
            const range = new vscode.Range(
                editor.document.positionAt(start),
                editor.document.positionAt(end)
            );

            decorations.push({
                range,
                renderOptions: {
                    before: {
                        backgroundColor: hexColor,
                        contentText: ''
                    }
                }
            });
        }
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
