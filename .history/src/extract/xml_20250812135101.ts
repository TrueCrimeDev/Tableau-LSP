import { ExtractedCalculation } from './types';

// Minimal placeholder (beta): returns no calculations.
// A future implementation will parse Tableau workbook XML structure for calculated fields.
export function extractCalcsFromXml(_xml: string, _workbookName: string): ExtractedCalculation[] {
    return [];
}
