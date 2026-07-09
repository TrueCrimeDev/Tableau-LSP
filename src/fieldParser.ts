import { readFileSync } from 'fs';
import { resolve } from 'path';
import { pathToFileURL } from 'url';

export interface CustomField {
    name: string;
    type: string;
    description: string;
    datatype?: string;
    role?: string;
    datasource?: string;
    workbook?: string;
    kind?: 'field' | 'calculation' | 'parameter';
    sourceUri?: string;
    sourceLine?: number;
    sourceCharacter?: number;
}

export interface DatasourceInfo {
    name: string;
    fieldCount: number;
}

export class FieldParser {
    private fieldMap = new Map<string, CustomField>();
    private datasourceFieldMaps = new Map<string, { name: string; fields: Map<string, CustomField> }>();
    private overlayPath: string | null = null;
    private runtimeFields: CustomField[] = [];
    private runtimeDatasourceFields: CustomField[] = [];
    private runtimeContextActive = false;

    constructor(private filePath: string | null) {
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
     * Sets fields extracted directly from the active Tableau workbook. These
     * replace bundled/workspace fallback declarations while the workbook is
     * authoritative.
     */
    public setRuntimeFields(
        fields: CustomField[],
        contextActive: boolean = true,
        datasourceFields: CustomField[] = fields
    ): void {
        this.runtimeContextActive = contextActive;
        this.runtimeFields = fields
            .filter(field => Boolean(field?.name && field?.type))
            .map(field => ({ ...field }));
        this.runtimeDatasourceFields = datasourceFields
            .filter(field => Boolean(field?.name && field?.type && field?.datasource))
            .map(field => ({ ...field }));
        this.refresh();
    }

    /**
     * Reload the field definitions from disk.
     */
    public refresh(): void {
        try {
            this.fieldMap.clear();
            this.datasourceFieldMaps.clear();
            this.parseDefinitionFile();
            // eslint-disable-next-line no-console
            console.log('[FieldParser] Reloaded field definitions');
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error('[FieldParser] Failed to refresh field definitions:', error);
        }
    }

    private parseDefinitionFile() {
        // Bundled fields are examples/fallbacks, not members of every Tableau
        // workbook. Once a workbook context is known, replace them entirely.
        if (this.filePath && !this.runtimeContextActive) {
            try {
                const content = readFileSync(this.filePath, 'utf-8');
                this.parseFields(content, this.filePath);
            } catch (error) {
                console.error(`Failed to parse field definition file ${this.filePath}:`, error);
            }
        }

        // Workbook metadata replaces bundled fallbacks for matching captions.
        for (const field of this.runtimeFields) {
            this.fieldMap.set(field.name.toUpperCase(), { ...field });
        }

        // Preserve exact provenance alongside the caption-collapsed map. This
        // lets every LSP feature distinguish [Orders].[Amount] from the same
        // caption in another datasource.
        for (const field of this.runtimeDatasourceFields) {
            const datasource = field.datasource?.trim();
            if (!datasource) {
                continue;
            }
            const key = datasource.toUpperCase();
            let entry = this.datasourceFieldMaps.get(key);
            if (!entry) {
                entry = { name: datasource, fields: new Map<string, CustomField>() };
                this.datasourceFieldMaps.set(key, entry);
            }
            entry.fields.set(field.name.toUpperCase(), { ...field, datasource });
        }

        // A workspace declaration file is a fallback for calculation-only
        // projects. Mixing it into a live workbook context can resurrect stale
        // fields from another workbook and make diagnostics/completions wrong.
        if (this.overlayPath && !this.runtimeContextActive) {
            try {
                const overlayContent = readFileSync(this.overlayPath, 'utf-8');
                this.parseFields(overlayContent, this.overlayPath);
            } catch {
                // Overlay is optional — absent file is fine.
            }
        }
    }

    private parseFields(content: string, sourcePath?: string) {
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
                sourceUri: sourcePath
                    ? (/^[a-z][a-z0-9+.-]*:\/\//i.test(sourcePath)
                        ? sourcePath
                        : pathToFileURL(sourcePath).toString())
                    : undefined,
                sourceLine: i,
                sourceCharacter: 0,
            });
            currentDescription = '';
        }
    }

    public getField(name: string, datasource?: string): CustomField | undefined {
        if (datasource && this.runtimeContextActive) {
            return this.datasourceFieldMaps
                .get(datasource.trim().toUpperCase())
                ?.fields.get(name.toUpperCase());
        }
        return this.fieldMap.get(name.toUpperCase());
    }

    public getAllFields(): Map<string, CustomField> {
        return new Map(this.fieldMap);
    }

    public getFieldsForDatasource(datasource: string): Map<string, CustomField> {
        const fields = this.datasourceFieldMaps.get(datasource.trim().toUpperCase())?.fields;
        return fields ? new Map(fields) : new Map<string, CustomField>();
    }

    public getDatasources(): DatasourceInfo[] {
        return [...this.datasourceFieldMaps.values()]
            .map(entry => ({ name: entry.name, fieldCount: entry.fields.size }))
            .sort((left, right) => left.name.localeCompare(right.name));
    }

    public getDatasource(name: string): DatasourceInfo | undefined {
        const entry = this.datasourceFieldMaps.get(name.trim().toUpperCase());
        return entry ? { name: entry.name, fieldCount: entry.fields.size } : undefined;
    }

    public hasDatasource(name: string): boolean {
        return this.datasourceFieldMaps.has(name.trim().toUpperCase());
    }

    /** True when fields came from a live workbook, not bundled examples. */
    public hasRuntimeFieldContext(): boolean {
        return this.runtimeContextActive;
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
