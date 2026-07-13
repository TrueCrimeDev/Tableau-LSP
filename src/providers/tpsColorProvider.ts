import * as vscode from 'vscode';

/**
 * Color provider for Tableau Preferences (.tps) files
 * Enables inline color picker for hex color values in XML color palette definitions
 */
export class TpsColorProvider implements vscode.DocumentColorProvider {
    private readonly colorInTagRegex = /<color>\s*(#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}))\s*<\/color>/gi;
    private readonly colorInValueAttrRegex = /\bvalue\s*=\s*(["'])(#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}))\1/gi;

    /**
     * Provide color information for all hex colors in the document
     */
    public provideDocumentColors(
        document: vscode.TextDocument
    ): vscode.ProviderResult<vscode.ColorInformation[]> {
        const colors: vscode.ColorInformation[] = [];
        const text = document.getText();

        this.collectColorsFromRegex(text, document, colors, this.colorInTagRegex, 1);
        this.collectColorsFromRegex(text, document, colors, this.colorInValueAttrRegex, 2);

        return colors;
    }

    private collectColorsFromRegex(
        text: string,
        document: vscode.TextDocument,
        colors: vscode.ColorInformation[],
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
            const matchStart = match.index + match[0].indexOf(hexColor);
            const matchEnd = matchStart + hexColor.length;

            const color = this.parseHexColor(hexColor);
            if (!color) {
                continue;
            }

            const range = new vscode.Range(
                document.positionAt(matchStart),
                document.positionAt(matchEnd)
            );
            colors.push(new vscode.ColorInformation(range, color));
        }
    }

    /**
     * Provide color presentations (how to represent the color in the document)
     */
    public provideColorPresentations(
        color: vscode.Color,
        context: { document: vscode.TextDocument; range: vscode.Range }
    ): vscode.ProviderResult<vscode.ColorPresentation[]> {
        const hexColor = this.formatHexColor(color);
        return [new vscode.ColorPresentation(hexColor)];
    }

    /**
     * Parse hex color string to vscode.Color
     * @param hex Hex color string (e.g., "#1F6E8C")
     * @returns vscode.Color object or null if invalid
     */
    private parseHexColor(hex: string): vscode.Color | null {
        // Remove # prefix
        const cleanHex = hex.replace('#', '');

        const normalizedHex = cleanHex.length === 3
            ? cleanHex.split('').map(char => char + char).join('')
            : cleanHex;

        if (normalizedHex.length !== 6) {
            return null;
        }

        try {
            const r = parseInt(normalizedHex.substring(0, 2), 16) / 255;
            const g = parseInt(normalizedHex.substring(2, 4), 16) / 255;
            const b = parseInt(normalizedHex.substring(4, 6), 16) / 255;

            return new vscode.Color(r, g, b, 1);
        } catch {
            return null;
        }
    }

    /**
     * Format vscode.Color to hex string
     * @param color vscode.Color object
     * @returns Hex color string (e.g., "#1F6E8C")
     */
    private formatHexColor(color: vscode.Color): string {
        const r = Math.round(color.red * 255);
        const g = Math.round(color.green * 255);
        const b = Math.round(color.blue * 255);

        const toHex = (value: number): string => {
            const hex = value.toString(16).toUpperCase();
            return hex.length === 1 ? '0' + hex : hex;
        };

        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }
}

/**
 * Register the TPS color provider with VS Code
 */
export function registerTpsColorProvider(context: vscode.ExtensionContext): void {
    const provider = new TpsColorProvider();

    // Register for Tableau preference/workbook documents
    const selector: vscode.DocumentSelector = [
        { scheme: 'file', language: 'xml', pattern: '**/*.tps' },
        { scheme: 'file', language: 'twb', pattern: '**/*.twb' },
        { scheme: 'file', pattern: '**/*.tps' },
        { scheme: 'file', pattern: '**/*.twb' }
    ];

    const disposable = vscode.languages.registerColorProvider(selector, provider);
    context.subscriptions.push(disposable);

    console.log('Tableau LSP: TPS color provider registered');
}
