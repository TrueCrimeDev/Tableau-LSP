import { basename, join, resolve, sep } from 'path';
import { existsSync, readdirSync, realpathSync, statSync } from 'fs';

/**
 * Discovers a workspace's shared Tableau library: field declarations and
 * reusable calculations kept in a `tableau/` folder at a workspace root.
 *
 * Both the extension host and the language server resolve these paths, and a
 * disagreement between them shows up as IntelliSense that knows about fields
 * the diagnostics do not. So the rules live here, in a module with no `vscode`
 * dependency, and both sides call it.
 *
 * Classification is by extension, which the declaration-file convention
 * already established elsewhere in the codebase:
 *   *.d.twbl    — field declarations, parsed into the field catalogue
 *   *.twbl      — Tableau calculations, surfaced through the Calc Bank
 *   *.agent.md  — project instructions appended to the @tableau agent prompt
 *   agent.md / instructions.md — the same, under their conventional names
 */

/** Folder names searched at each workspace root, in precedence order. */
export const TABLEAU_LIBRARY_FOLDERS = ['tableau', '.tableau'] as const;

/** Root-level files kept working from before the `tableau/` folder existed. */
const LEGACY_ROOT_FILES = ['fields.d.twbl', '_calc_bank.twbl'] as const;

/**
 * How many levels of sub-folder are searched below a library folder. The
 * folder is opt-in, but it is still someone's working directory, not a whole
 * repo to crawl.
 */
const MAX_SUBFOLDER_DEPTH = 3;

const SKIP_DIRECTORIES = new Set(['node_modules', '.git', '.worktrees', 'out', 'dist', 'coverage']);

export interface TableauLibrary {
    /** `*.d.twbl` field declaration files, workspace order then path order. */
    definitions: string[];
    /** `*.twbl` calculation files (never `*.d.twbl`). */
    calculations: string[];
    /** Markdown files appended to the @tableau agent prompt. */
    instructions: string[];
    /** The library folders that exist — what a file watcher should cover. */
    folders: string[];
}

/** Conventional bare names for a project's agent instructions. */
const INSTRUCTION_NAMES = new Set(['agent.md', 'instructions.md']);

export function isDeclarationFile(filePath: string): boolean {
    return filePath.toLowerCase().endsWith('.d.twbl');
}

export function isCalculationFile(filePath: string): boolean {
    const lower = filePath.toLowerCase();
    return lower.endsWith('.twbl') && !lower.endsWith('.d.twbl');
}

/**
 * Instruction files are opt-in by name rather than "any .md", so a README or
 * a data dictionary sitting in the same folder is not silently prepended to
 * every model request.
 */
export function isInstructionFile(filePath: string): boolean {
    const name = basename(filePath).toLowerCase();
    return INSTRUCTION_NAMES.has(name) || name.endsWith('.agent.md');
}

function isDirectory(candidate: string): boolean {
    try {
        return statSync(candidate).isDirectory();
    } catch {
        return false;
    }
}

/** Resolved directory identity, so a symlink cycle cannot be walked twice. */
function directoryIdentity(candidate: string): string | undefined {
    try {
        return realpathSync(candidate);
    } catch {
        return undefined;
    }
}

/**
 * Files under one library folder.
 *
 * Sorted by code point rather than `localeCompare`: the extension host and the
 * language server both derive their merge order from this list, and a
 * locale-sensitive collation could order them differently in the same
 * workspace, so the last-file-wins result would depend on the process locale.
 */
function walk(folder: string, depth: number, found: string[], visited: Set<string>): void {
    const identity = directoryIdentity(folder);
    if (identity !== undefined) {
        if (visited.has(identity)) {
            return; // Symlink cycle, or the same folder reached two ways.
        }
        visited.add(identity);
    }

    let entries: string[];
    try {
        entries = readdirSync(folder).sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
    } catch {
        return; // Unreadable folder — not an error, just nothing to contribute.
    }
    const subFolders: string[] = [];
    for (const entry of entries) {
        const full = join(folder, entry);
        if (isDirectory(full)) {
            if (depth < MAX_SUBFOLDER_DEPTH && !SKIP_DIRECTORIES.has(entry.toLowerCase())) {
                subFolders.push(full);
            }
            continue;
        }
        if (entry.toLowerCase().endsWith('.twbl') || isInstructionFile(full)) {
            found.push(full);
        }
    }
    // Files before sub-folders: a general declaration should be parsed before
    // the more specific one that is meant to override it.
    for (const subFolder of subFolders) {
        walk(subFolder, depth + 1, found, visited);
    }
}

/**
 * Scans each workspace root for its Tableau library.
 *
 * Later entries win on a name clash downstream, so ordering is deliberate:
 * legacy root files first, then `tableau/`, then `.tableau/` — the more
 * specific location overrides the more general one.
 */
export function discoverTableauLibrary(
    workspaceRoots: readonly string[],
    folderNames: readonly string[] = TABLEAU_LIBRARY_FOLDERS
): TableauLibrary {
    const files: string[] = [];
    const folders: string[] = [];
    const seenRoots = new Set<string>();
    // Shared across roots and folder names so one directory reachable two ways
    // — a symlink, or two configured names resolving to the same place — is
    // walked once and contributes one set of files.
    const visited = new Set<string>();

    for (const root of workspaceRoots) {
        if (!root) {
            continue;
        }
        const normalizedRoot = resolve(root);
        if (seenRoots.has(normalizedRoot)) {
            continue;
        }
        seenRoots.add(normalizedRoot);

        for (const legacy of LEGACY_ROOT_FILES) {
            const candidate = join(normalizedRoot, legacy);
            if (existsSync(candidate) && !isDirectory(candidate)) {
                files.push(candidate);
            }
        }
        for (const folderName of folderNames) {
            const folder = join(normalizedRoot, folderName);
            if (!isDirectory(folder) || visited.has(directoryIdentity(folder) ?? folder)) {
                continue;
            }
            folders.push(folder);
            walk(folder, 1, files, visited);
        }
    }

    const seenFiles = new Set<string>();
    const definitions: string[] = [];
    const calculations: string[] = [];
    const instructions: string[] = [];
    for (const file of files) {
        const key = process.platform === 'win32' ? file.toLowerCase() : file;
        if (seenFiles.has(key)) {
            continue;
        }
        seenFiles.add(key);
        if (isDeclarationFile(file)) {
            definitions.push(file);
        } else if (isCalculationFile(file)) {
            calculations.push(file);
        } else if (isInstructionFile(file)) {
            instructions.push(file);
        }
    }
    return { definitions, calculations, instructions, folders };
}

/**
 * Where a newly generated `fields.d.twbl` should be written: into the library
 * folder when the workspace has one, so generated declarations land beside the
 * hand-written ones instead of at the root.
 */
export function preferredDefinitionTarget(
    workspaceRoot: string,
    folderNames: readonly string[] = TABLEAU_LIBRARY_FOLDERS
): string {
    for (const folderName of folderNames) {
        const folder = join(resolve(workspaceRoot), folderName);
        if (isDirectory(folder)) {
            return join(folder, 'fields.d.twbl');
        }
    }
    return join(resolve(workspaceRoot), 'fields.d.twbl');
}

/** Human-facing label for a discovered file, relative to its workspace root. */
export function describeLibraryFile(filePath: string, workspaceRoots: readonly string[]): string {
    const normalizedFile = resolve(filePath);
    for (const root of workspaceRoots) {
        const normalizedRoot = resolve(root);
        // A filesystem or drive root already ends in a separator; appending a
        // second one would stop it ever matching. Sibling directories that
        // merely share a prefix (/w/proj vs /w/proj2) must not match either,
        // which is why the separator is required rather than a bare prefix.
        const prefix = normalizedRoot.endsWith(sep) ? normalizedRoot : normalizedRoot + sep;
        if (normalizedFile.startsWith(prefix)) {
            return normalizedFile.slice(prefix.length).replace(/\\/g, '/');
        }
    }
    return basename(filePath);
}
