export const WORKBOOK_FIELD_CONTEXT_NOTIFICATION = 'tableau/workbookFieldContext';

export type WorkbookFieldKind = 'field' | 'calculation' | 'parameter';

export interface WorkbookFieldDefinition {
    name: string;
    type: string;
    description: string;
    datatype?: string;
    role?: string;
    datasource?: string;
    workbook?: string;
    kind?: WorkbookFieldKind;
    sourceUri?: string;
    sourceLine?: number;
    sourceCharacter?: number;
}

export interface WorkbookFieldContextNotification {
    workbook: string;
    sourceUri?: string;
    /** Caption-collapsed definitions used for unqualified [Field] references. */
    fields: WorkbookFieldDefinition[];
    /** Exact datasource/field pairs used for [Datasource].[Field] references. */
    datasourceFields: WorkbookFieldDefinition[];
    definitionPath: string | null;
}
