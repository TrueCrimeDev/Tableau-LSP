export interface ExtractedCalculation {
    workbook: string;
    datasource: string;
    title: string;
    formula: string;
    raw?: string;
}

export interface ExtractionSummary {
    workbooks: number;
    datasources: number;
    calculations: number;
}

export interface ExtractionResult {
    calculations: ExtractedCalculation[];
    summary: ExtractionSummary;
}
