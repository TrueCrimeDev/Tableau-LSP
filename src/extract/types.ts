export interface ExtractedCalculation {
    workbook: string;
    datasource: string;
    title: string;
    formula: string;
    raw?: string;
}

export interface ExtractedField {
    workbook: string;
    datasource: string;
    name: string;
    caption?: string;
    datatype?: string;
    role?: string;
}

export interface ExtractedDatasource {
    workbook: string;
    name: string;
    caption?: string;
}

export interface ExtractionSummary {
    workbooks: number;
    datasources: number;
    calculations: number;
    fields?: number;
}

export interface ExtractionResult {
    calculations: ExtractedCalculation[];
    datasources?: ExtractedDatasource[];
    fields?: ExtractedField[];
    summary: ExtractionSummary;
}
