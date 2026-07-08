import { readFileSync } from 'fs';
import { resolve } from 'path';

export interface CustomField {
    name: string;
    type: string;
    description: string;
}

export class FieldParser {
    private fieldMap = new Map<string, CustomField>();
    private overlayPath: string | null = null;

    constructor(private filePath: string) {
        this.parseDefinitionFile();
    }

    /**
     * Sets a second definition file (e.g. a workspace-level fields.d.twbl)
     * parsed after the primary one, so its definitions win on name clashes.
     * A missing overlay file is not an error — it is simply skipped.
     */
    public setOverlayPath(overlayPath: string | null): void {
        this.overlayPath = overlayPath;
        this.refresh();
    }

    /**
     * Reload the field definitions from disk.
     */
    public refresh(): void {
        try {
            this.fieldMap.clear();
            this.parseDefinitionFile();
            // eslint-disable-next-line no-console
            console.log(`[FieldParser] Reloaded field definitions from ${this.filePath}`);
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error('[FieldParser] Failed to refresh field definitions:', error);
        }
    }

    private parseDefinitionFile() {
        try {
            const content = readFileSync(this.filePath, 'utf-8');
            this.parseFields(content);
        } catch (error) {
            console.error(`Failed to parse field definition file ${this.filePath}:`, error);
        }

        if (this.overlayPath) {
            try {
                const overlayContent = readFileSync(this.overlayPath, 'utf-8');
                this.parseFields(overlayContent);
            } catch {
                // Overlay is optional — absent file is fine.
            }
        }
    }

    private parseFields(content: string) {
        const lines = content.split(/\r?\n/);
        let currentDescription = '';

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            if (line.startsWith('/**')) {
                // Handle single-line JSDoc: /** text */
                const singleLineMatch = line.match(/^\/\*\*\s*(.*?)\s*\*\/\s*$/);
                if (singleLineMatch) {
                    currentDescription = singleLineMatch[1].trim();
                    continue;
                }

                currentDescription = '';
                let j = i + 1;
                while (j < lines.length && !lines[j].trim().startsWith('*/')) {
                    const docLine = lines[j].trim().replace(/^\*\s?/, '');
                    if (docLine) {
                        currentDescription += `${docLine} `;
                    }
                    j++;
                }
                currentDescription = currentDescription.trim();
                i = j;
                continue;
            }

            if (!line.startsWith('[')) {
                continue;
            }

            const sanitizedLine = line.replace(/\/\/.*$/, '').trim();
            const fieldMatch = sanitizedLine.match(FieldParser.FIELD_DEFINITION_REGEX);
            if (!fieldMatch) {
                continue;
            }

            const name = fieldMatch[1].trim();
            const type = fieldMatch[2].trim();
            this.fieldMap.set(name.toUpperCase(), {
                name,
                type,
                description: currentDescription,
            });
            currentDescription = '';
        }
    }

    public getField(name: string): CustomField | undefined {
        return this.fieldMap.get(name.toUpperCase());
    }

    public getAllFields(): Map<string, CustomField> {
        return new Map(this.fieldMap);
    }

    public static findDefinitionFile(basePath: string): string | null {
        const possiblePaths = [
            resolve(basePath, 'syntaxes/fields.d.twbl'),
            resolve(basePath, '../syntaxes/fields.d.twbl'),
            resolve(basePath, '../../syntaxes/fields.d.twbl')
        ];

        for (const path of possiblePaths) {
            try {
                readFileSync(path, 'utf-8');
                return path;
            } catch {
                // File not found, continue
            }
        }
        return null;
    }

    private static readonly FIELD_DEFINITION_REGEX = /\[([^\]]+)\]\s*(?:=|:|=>)\s*([A-Za-z][A-Za-z0-9_<>|]*)/i;
}
