// Dynamic require to avoid type resolution issues in beta scaffold
// eslint-disable-next-line @typescript-eslint/no-var-requires
const FastXml: any = (() => { try { return require('fast-xml-parser'); } catch { return null; } })();
import { ExtractedCalculation } from './types';

// Placeholder XML extraction - to be replaced with real Tableau schema traversal.
export function extractCalcsFromXml(xml: string, workbookName: string): ExtractedCalculation[] {
        const parser = FastXml ? new FastXml.XMLParser({ ignoreAttributes: false, allowBooleanAttributes: true }) : null;
    let json: any;
    try {
        json = parser ? parser.parse(sanitize(xml)) : null;
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
