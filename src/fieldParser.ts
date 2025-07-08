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
                currentDescription = ''; // Reset for new JSDoc block
                let j = i + 1;
                while (j < lines.length && !lines[j].trim().startsWith('*/')) {
                    const docLine = lines[j].trim().replace(/^\*\s?/, '');
                    if (docLine) {
                        currentDescription += docLine + ' ';
                    }
                    j++;
                }
                currentDescription = currentDescription.trim();
                i = j; // Move index past the comment block
                continue;
            }

            if (line.startsWith('[')) {
                const fieldMatch = line.match(/\[([^\]]+)\]\s*=\s*(\w+)/);
                if (fieldMatch) {
                    const name = fieldMatch[1];
                    const type = fieldMatch[2];
                    this.fieldMap.set(name.toUpperCase(), {
                        name,
                        type,
                        description: currentDescription,
                    });
                    currentDescription = ''; // Reset description after use
                }
            }
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
}
