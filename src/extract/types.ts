export interface ExtractedCalculation {
    workbook: string;
    datasource: string;
    title: string;
    formula: string;
    raw?: string;
    datatype?: string;
}

export interface ExtractedField {
    workbook: string;
    datasource: string;
    name: string;
    caption?: string;
    datatype?: string;
    role?: string;
    /** Column carries a <calculation> child (calculated field). */
    isCalculation?: boolean;
    /** Column carries param-domain-type (parameter). */
    isParameter?: boolean;
}

export interface ExtractedDatasource {
    workbook: string;
    name: string;
    caption?: string;
    connection?: ExtractedConnection;
}

export interface ExtractedConnection {
    class: string;
    server?: string;
    dbname?: string;
    username?: string;
    filename?: string;
    schema?: string;
    authentication?: string;
    port?: string;
}

export interface ExtractedParameter {
    workbook: string;
    datasource: string;
    name: string;
    caption?: string;
    datatype?: string;
    value?: string;
    domainType?: 'list' | 'range' | 'all';
    minValue?: string;
    maxValue?: string;
    allowableValues?: string[];
    formula?: string;
}

export interface ExtractedFilter {
    workbook: string;
    worksheet: string;
    class: 'categorical' | 'quantitative' | 'relative-date' | string;
    column: string;
    function?: string;
    members?: string[];
    minValue?: string;
    maxValue?: string;
}

export interface ExtractedDashboard {
    workbook: string;
    name: string;
    width?: number;
    height?: number;
    zones?: DashboardZone[];
}

export interface DashboardZone {
    name?: string;
    type: string;
    x: number;
    y: number;
    w: number;
    h: number;
    worksheet?: string;
}

export interface ExtractedWorksheet {
    workbook: string;
    name: string;
    datasources: string[];
    filters?: number;
    calculated_fields?: number;
}

export interface ExtractedHierarchy {
    workbook: string;
    datasource: string;
    name: string;
    caption?: string;
    fields: string[];
}

export interface ExtractionSummary {
    workbooks: number;
    datasources: number;
    calculations: number;
    fields?: number;
    parameters?: number;
    filters?: number;
    dashboards?: number;
    worksheets?: number;
    hierarchies?: number;
}

export interface ExtractionResult {
    calculations: ExtractedCalculation[];
    datasources?: ExtractedDatasource[];
    fields?: ExtractedField[];
    parameters?: ExtractedParameter[];
    filters?: ExtractedFilter[];
    dashboards?: ExtractedDashboard[];
    worksheets?: ExtractedWorksheet[];
    hierarchies?: ExtractedHierarchy[];
    summary: ExtractionSummary;
}
