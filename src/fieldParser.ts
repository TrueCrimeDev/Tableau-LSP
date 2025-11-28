import { readFileSync } from 'fs';
import { resolve } from 'path';

export interface CustomField {
    name: string;
    type: string;
    description: string;
}

export class FieldParser {
    private fieldMap = new Map<string, CustomField>();

    constructor(private filePath: string) {
        this.parseDefinitionFile();
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
    }

    private parseFields(content: string) {
        const lines = content.split(/\r?\n/);
        let currentDescription = '';

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            if (line.startsWith('/**')) {
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
