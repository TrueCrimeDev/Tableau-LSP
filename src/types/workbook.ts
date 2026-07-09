import { PaletteDefinition } from '../preferences/preferencesFile.js';

export interface RichWorkbookData {
    fileName: string;
    filePath: string;
    tableauVersion: string;
    datasourceCount: number;
    calcCount: number;
    sheetCount: number;
    datasources: Array<{
        caption: string;
        connectionClass: string;
        fields: Array<{
            name: string;
            datatype: string;
            role: string;
        }>;
    }>;
    calculations: Array<{
        caption: string;
        datatype: string;
        formula: string;
        datasource: string;
    }>;
    fields: Array<{
        name: string;
        datatype: string;
    }>;
    worksheets: string[];
    palettes: PaletteDefinition[];
}

export interface WorkbookDocument {
    readonly xml: string;
    readonly palettes: PaletteDefinition[];
}

export interface WorkbookUpdateResult {
    readonly updatedXml: string;
    readonly hasChanges: boolean;
    readonly action: 'added' | 'updated' | 'none';
}

export class WorkbookError extends Error {
    public readonly code: string;

    public constructor(message: string, code = 'WORKBOOK_ERROR') {
        super(message);
        this.name = 'WorkbookError';
        this.code = code;
    }
}

