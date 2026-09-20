import { createHash } from 'crypto';
import { extname } from 'path';
import { validateWorkbookXml } from '../parsers/workbookCalculations.js';

export interface XmlReplacement { oldText: string; newText: string }
export interface XmlReadOptions { offset?: number; length?: number; search?: string }

export function workbookRevision(xml: string): string {
    return createHash('sha256').update(xml).digest('hex');
}

/** Exact replacements avoid reserializing unrelated Tableau XML and feature flags. */
export function planWorkbookXmlEdit(xml: string, expectedRevision: string, replacements: readonly XmlReplacement[]): string {
    if (workbookRevision(xml) !== expectedRevision) {
        throw new Error('The workbook changed since it was read. Read its XML again before editing.');
    }
    validateWorkbookXml(xml);
    if (!Array.isArray(replacements) || replacements.length < 1 || replacements.length > 30) {
        throw new Error('Provide between 1 and 30 exact XML replacements.');
    }
    let updated = xml;
    for (const [index, replacement] of replacements.entries()) {
        if (!replacement || typeof replacement.oldText !== 'string' || !replacement.oldText.length || typeof replacement.newText !== 'string') {
            throw new Error(`Replacement ${index + 1} needs nonempty oldText and a string newText.`);
        }
        const start = updated.indexOf(replacement.oldText);
        if (start < 0 || updated.indexOf(replacement.oldText, start + 1) >= 0) {
            throw new Error(`Replacement ${index + 1} must match exactly once. Include enough surrounding XML to identify the intended element.`);
        }
        updated = updated.slice(0, start) + replacement.newText + updated.slice(start + replacement.oldText.length);
    }
    validateWorkbookXml(updated);
    if (updated === xml) { throw new Error('The proposed XML edit makes no changes.'); }
    return updated;
}

export function readXmlPage(xml: string, options: XmlReadOptions): {
    xml: string; offset: number; nextOffset: number | null; totalLength: number; hasMore: boolean;
} {
    let offset = options.offset ?? 0;
    const length = options.length ?? 12000;
    if (!Number.isInteger(offset) || offset < 0 || offset > xml.length || !Number.isInteger(length) || length < 1 || length > 24000) {
        throw new Error('Use an offset within the XML and a length between 1 and 24000 characters.');
    }
    if (options.search !== undefined) {
        if (typeof options.search !== 'string' || !options.search.length) { throw new Error('Search must be a nonempty exact string.'); }
        offset = xml.indexOf(options.search, offset);
        if (offset < 0) { throw new Error('The exact search text was not found after the requested offset.'); }
    }
    const end = Math.min(xml.length, offset + length);
    return { xml: xml.slice(offset, end), offset, nextOffset: end < xml.length ? end : null, totalLength: xml.length, hasMore: end < xml.length };
}

/** The model chooses a filename, never a directory or an existing overwrite target. */
export function copyFileName(sourceName: string, requested?: string): string {
    const extension = extname(sourceName);
    const name = requested ?? `${sourceName.slice(0, -extension.length)}-edited${extension}`;
    if (!name.trim() || name !== name.trim() || /[<>:"/\\|?*\x00-\x1f]/.test(name) ||
        /[. ]$/.test(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) ||
        extname(name).toLowerCase() !== extension.toLowerCase() || name.toLowerCase() === sourceName.toLowerCase()) {
        throw new Error('Choose a different filename in the same workbook format, with no directory or reserved filename characters.');
    }
    return name;
}
