import { basename, extname, posix } from 'path';
import JSZip from 'jszip';
import { validateWorkbookXml } from '../parsers/workbookCalculations.js';

const decoder = new TextDecoder('utf-8', { fatal: true });
const encoder = new TextEncoder();

export interface WorkbookPackageSource {
    xml: string;
    workbookName: string;
    /** Full archive path; never substitute the package's filename. */
    entryPath?: string;
}

function workbookKind(fileName: string): '.twb' | '.twbx' {
    const extension = extname(fileName).toLowerCase();
    if (extension !== '.twb' && extension !== '.twbx') {
        throw new Error('Select a .twb workbook or .twbx packaged workbook.');
    }
    return extension;
}

function decodeXml(bytes: Uint8Array): string {
    let xml: string;
    try {
        xml = decoder.decode(bytes);
    } catch {
        throw new Error('The workbook XML must use UTF-8 encoding.');
    }
    const declaredEncoding = /^\s*<\?xml\s[^?]*encoding\s*=\s*['"]([^'"]+)/i.exec(xml)?.[1];
    if (declaredEncoding && !/^utf-?8$/i.test(declaredEncoding)) {
        throw new Error(`The workbook declares unsupported ${declaredEncoding} encoding. Save it as UTF-8 before editing.`);
    }
    validateWorkbookXml(xml);
    return xml;
}

function encodeXml(xml: string, original: Uint8Array): Uint8Array {
    const hasBom = original[0] === 0xef && original[1] === 0xbb && original[2] === 0xbf;
    return encoder.encode(hasBom && !xml.startsWith('\uFEFF') ? `\uFEFF${xml}` : xml);
}

interface ArchiveDirectory {
    count: bigint;
    offset: bigint;
    size: bigint;
}

/** Read the original directory before JSZip normalizes or merges its filenames. */
function archiveDirectory(bytes: Uint8Array): ArchiveDirectory {
    const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--) {
        if (data.getUint32(offset, true) !== 0x06054b50 || offset + 22 + data.getUint16(offset + 20, true) !== bytes.length) {
            continue;
        }
        if (data.getUint16(offset + 4, true) !== 0 || data.getUint16(offset + 6, true) !== 0) {
            throw new Error('Multi-disk workbook packages are not supported.');
        }
        const count = data.getUint16(offset + 10, true);
        const directoryOffset = data.getUint32(offset + 16, true);
        const directorySize = data.getUint32(offset + 12, true);
        if (count !== 0xffff && directoryOffset !== 0xffffffff && directorySize !== 0xffffffff) {
            return { count: BigInt(count), offset: BigInt(directoryOffset), size: BigInt(directorySize) };
        }
        const locator = offset - 20;
        if (locator < 0 || data.getUint32(locator, true) !== 0x07064b50) {
            break;
        }
        const record = data.getBigUint64(locator + 8, true);
        if (record > BigInt(bytes.length - 56)) {
            break;
        }
        const position = Number(record);
        if (data.getUint32(position, true) !== 0x06064b50) {
            break;
        }
        return {
            count: data.getBigUint64(position + 32, true),
            offset: data.getBigUint64(position + 48, true),
            size: data.getBigUint64(position + 40, true),
        };
    }
    throw new Error('The workbook package has an invalid ZIP directory.');
}

function requireSafeArchivePath(name: string): void {
    // Empty segments, dot segments and backslashes can be normalized differently
    // by ZIP readers. Reject them for both files and directory-only entries.
    if (!name || name.startsWith('/') || name.includes('\\') || /^[a-z]:/i.test(name)
        || name.split('/').slice(0, name.endsWith('/') ? -1 : undefined).some(part => !part || part === '.' || part === '..')) {
        throw new Error('The package contains unsafe archive paths and cannot be edited without changing them.');
    }
}

function validateArchivePaths(bytes: Uint8Array, directory: ArchiveDirectory): void {
    const limit = directory.offset + directory.size;
    if (limit > BigInt(bytes.length) || directory.count > BigInt(Math.floor(bytes.length / 46))) {
        throw new Error('The workbook package has an invalid ZIP directory.');
    }
    const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let position = Number(directory.offset);
    for (let index = 0n; index < directory.count; index++) {
        if (position + 46 > Number(limit) || data.getUint32(position, true) !== 0x02014b50) {
            throw new Error('The workbook package has an invalid ZIP directory.');
        }
        const nameLength = data.getUint16(position + 28, true);
        const extraLength = data.getUint16(position + 30, true);
        const commentLength = data.getUint16(position + 32, true);
        const extraStart = position + 46 + nameLength;
        const next = extraStart + extraLength + commentLength;
        if (next > Number(limit)) {
            throw new Error('The workbook package has an invalid ZIP directory.');
        }
        requireSafeArchivePath(Buffer.from(bytes.subarray(position + 46, extraStart)).toString('utf8'));
        // Unicode path fields can override the raw filename, including directory
        // names for which JSZip does not retain unsafeOriginalName.
        for (let extra = extraStart; extra + 4 <= extraStart + extraLength;) {
            const kind = data.getUint16(extra, true);
            const length = data.getUint16(extra + 2, true);
            const end = extra + 4 + length;
            if (end > extraStart + extraLength) {
                throw new Error('The workbook package has an invalid ZIP extra field.');
            }
            if (kind === 0x7075 && length >= 5) {
                requireSafeArchivePath(Buffer.from(bytes.subarray(extra + 9, end)).toString('utf8'));
            }
            extra = end;
        }
        position = next;
    }
}

async function loadPackage(bytes: Uint8Array): Promise<{ zip: JSZip; workbook: JSZip.JSZipObject }> {
    const directory = archiveDirectory(bytes);
    validateArchivePaths(bytes, directory);
    const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
    const entries = Object.values(zip.files);
    if (directory.count !== BigInt(entries.length)) {
        throw new Error('The package contains duplicate or inconsistent archive entries and cannot be preserved safely.');
    }
    // JSZip normalizes traversal segments when reading. Refuse to silently rename
    // archive members when saving a package whose paths cannot be preserved.
    if (entries.some(entry => !entry.dir && entry.unsafeOriginalName && entry.unsafeOriginalName !== entry.name)) {
        throw new Error('The package contains unsafe archive paths and cannot be edited without changing them.');
    }
    const workbooks = entries.filter(entry => !entry.dir && entry.name.toLowerCase().endsWith('.twb'));
    if (workbooks.length === 0) {
        throw new Error('No .twb workbook was found inside the .twbx package.');
    }
    if (workbooks.length !== 1) {
        throw new Error('The .twbx package contains multiple .twb workbooks. Open an unambiguous package containing one workbook.');
    }
    return { zip, workbook: workbooks[0] };
}

/** Read a supported workbook, validating its XML and packaged-file integrity. */
export async function readWorkbookPackage(bytes: Uint8Array, fileName: string): Promise<WorkbookPackageSource> {
    if (workbookKind(fileName) === '.twb') {
        return { xml: decodeXml(bytes), workbookName: basename(fileName) };
    }
    const { workbook } = await loadPackage(bytes);
    return {
        xml: decodeXml(await workbook.async('uint8array')),
        workbookName: posix.basename(workbook.name),
        entryPath: workbook.name,
    };
}

/** Replace the XML without changing any other archive member's path or bytes. */
export async function replaceWorkbookXml(bytes: Uint8Array, fileName: string, updatedXml: string): Promise<Uint8Array> {
    validateWorkbookXml(updatedXml);
    if (workbookKind(fileName) === '.twb') {
        decodeXml(bytes);
        const output = encodeXml(updatedXml, bytes);
        decodeXml(output);
        return output;
    }
    const { zip, workbook } = await loadPackage(bytes);
    const originalWorkbookBytes = await workbook.async('uint8array');
    decodeXml(originalWorkbookBytes);
    const originalEntries = { ...zip.files };
    zip.file(workbook.name, encodeXml(updatedXml, originalWorkbookBytes), {
        date: workbook.date,
        comment: workbook.comment,
        unixPermissions: workbook.unixPermissions,
        dosPermissions: workbook.dosPermissions,
        createFolders: false,
    });
    const output = await zip.generateAsync({
        type: 'uint8array',
        compression: 'DEFLATE',
        platform: Object.values(originalEntries).some(entry => entry.unixPermissions !== null) ? 'UNIX' : 'DOS',
    });
    const { zip: reopened, workbook: reopenedWorkbook } = await loadPackage(output);
    if (Object.keys(originalEntries).sort().join('\n') !== Object.keys(reopened.files).sort().join('\n')) {
        throw new Error('Package verification failed: archive entries changed.');
    }
    for (const [name, original] of Object.entries(originalEntries)) {
        if (name === workbook.name) {
            continue;
        }
        const restored = reopened.files[name];
        if (original.dir !== restored.dir || !Buffer.from(await original.async('uint8array')).equals(Buffer.from(await restored.async('uint8array')))) {
            throw new Error(`Package verification failed: ${name} changed.`);
        }
    }
    if (decodeXml(await reopenedWorkbook.async('uint8array')) !== updatedXml.replace(/^\uFEFF/, '')) {
        throw new Error('Package verification failed: the workbook XML does not match the edit.');
    }
    return output;
}
