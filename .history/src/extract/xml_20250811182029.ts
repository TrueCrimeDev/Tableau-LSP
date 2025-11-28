import { XMLParser } from 'fast-xml-parser';
import { ExtractedCalculation } from './types';

// Placeholder XML extraction - to be replaced with real Tableau schema traversal.
export function extractCalcsFromXml(xml: string, workbookName: string): ExtractedCalculation[] {
  const parser = new XMLParser({ ignoreAttributes: false, allowBooleanAttributes: true });
  let json: any;
  try {
    json = parser.parse(sanitize(xml));
  } catch (e) {
    console.error('XML parse error', e);
    return [];
  }
  // Tableau XML specifics omitted; stub returns empty list for now.
  return [];
}

function sanitize(xml: string): string {
  // Basic entity fix & control char strip
  return xml.replace(/&(?![a-zA-Z#0-9]+;)/g, '&amp;')
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}
