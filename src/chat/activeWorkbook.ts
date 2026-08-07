import * as vscode from 'vscode';
import { dirname } from 'path';

/**
 * Locates the workbook a chat request or language-model tool should act on.
 * Shared so the participant and the tools never disagree about which file is
 * "the live workbook" — a disagreement that would let the model read one
 * workbook and write to another.
 */

const WORKBOOK_GLOB = '*.{twb,twbx}';
const EXCLUDE_GLOB = '**/{node_modules,.git,.worktrees}/**';

export function isWorkbookUri(uri: vscode.Uri | undefined): uri is vscode.Uri {
    const path = uri?.path.toLowerCase() ?? '';
    return path.endsWith('.twb') || path.endsWith('.twbx');
}

function tabUri(tab: vscode.Tab | undefined): vscode.Uri | undefined {
    const input = tab?.input as { uri?: vscode.Uri } | null | undefined;
    return input?.uri;
}

/**
 * Whatever the user is looking at, workbook or not. A `.twbl` calculation open
 * without its workbook is the common case, and its location is the only signal
 * available for deciding which workbook it belongs to.
 */
function activeResourceUri(): vscode.Uri | undefined {
    return vscode.window.activeTextEditor?.document.uri ??
        tabUri(vscode.window.tabGroups.activeTabGroup.activeTab ?? undefined);
}

/**
 * Narrows several equally plausible workbooks by proximity to what the user is
 * editing: same directory first, then same workspace root. Anything short of
 * exactly one match stays ambiguous — guessing would point an edit at a
 * workbook the user never named.
 */
function pickByProximity(
    candidates: readonly vscode.Uri[],
    resource: vscode.Uri | undefined
): vscode.Uri | undefined {
    if (!resource) {
        return undefined;
    }
    const directory = dirname(resource.path);
    const sameDirectory = candidates.filter(uri => dirname(uri.path) === directory);
    if (sameDirectory.length === 1) {
        return sameDirectory[0];
    }
    const root = vscode.workspace.getWorkspaceFolder(resource);
    if (!root) {
        return undefined;
    }
    const sameRoot = candidates.filter(
        uri => vscode.workspace.getWorkspaceFolder(uri)?.uri.toString() === root.uri.toString()
    );
    return sameRoot.length === 1 ? sameRoot[0] : undefined;
}

/** A workbook is only an answer when it is the *only* match for the pattern. */
async function findOneWorkbook(pattern: vscode.GlobPattern): Promise<vscode.Uri | undefined> {
    const found = await vscode.workspace.findFiles(pattern, EXCLUDE_GLOB, 2);
    return found.length === 1 ? found[0] : undefined;
}

/**
 * Widening search for a workbook that is not open at all: the active file's own
 * folder, then its workspace root, then the whole workbench. Narrowest first,
 * so a workbook sitting beside the calculation wins over an unrelated one
 * elsewhere in the workspace.
 */
async function resolveFromDisk(resource: vscode.Uri | undefined): Promise<vscode.Uri | undefined> {
    if (resource) {
        const directory = vscode.Uri.file(dirname(resource.fsPath));
        const beside = await findOneWorkbook(new vscode.RelativePattern(directory, WORKBOOK_GLOB));
        if (beside) {
            return beside;
        }
        const root = vscode.workspace.getWorkspaceFolder(resource);
        if (root) {
            const inRoot = await findOneWorkbook(new vscode.RelativePattern(root, `**/${WORKBOOK_GLOB}`));
            if (inRoot) {
                return inRoot;
            }
        }
    }
    return findOneWorkbook(`**/${WORKBOOK_GLOB}`);
}

/**
 * Active editor, then the active tab of each group (active group first), then
 * any open .twb tab, breaking ties by proximity to the active file. VS Code
 * exposes no true MRU order, so callers also name the workbook they picked in
 * their reply.
 */
export async function resolveWorkbookUri(): Promise<vscode.Uri | undefined> {
    const active = vscode.window.activeTextEditor;
    if (active && isWorkbookUri(active.document.uri)) {
        return active.document.uri;
    }
    const twbOf = (tab: vscode.Tab | undefined): vscode.Uri | undefined => {
        const uri = tabUri(tab);
        return isWorkbookUri(uri) ? uri : undefined;
    };
    const activeTabWorkbook = twbOf(vscode.window.tabGroups.activeTabGroup.activeTab ?? undefined);
    if (activeTabWorkbook) {
        return activeTabWorkbook;
    }

    const candidates = new Map<string, vscode.Uri>();
    for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) {
            const uri = twbOf(tab);
            if (uri) { candidates.set(uri.toString(), uri); }
        }
    }
    if (candidates.size === 1) {
        return candidates.values().next().value;
    }
    // An open workbook outranks one merely present on disk, so an unresolved
    // tie ends here rather than widening into a filesystem search.
    if (candidates.size > 1) {
        return pickByProximity([...candidates.values()], activeResourceUri());
    }
    return resolveFromDisk(activeResourceUri());
}

export const NO_WORKBOOK_MESSAGE =
    'No unambiguous Tableau workbook is available. Open the `.twb` or `.twbx` workbook you want to work on, then ask again.';

export class NoWritableWorkbookError extends Error {}

/**
 * The workbook a mutation may target.
 *
 * The target is never taken from tool input. A language model reads untrusted
 * workbook content, so letting it name a path would make this a confused
 * deputy: it could steer a write at any `.twb` on the machine, and the model
 * could probe for their existence through the resulting error text.
 *
 * Packaged `.twbx` files are read-only here too: the transactional editor
 * rewrites plain XML, and rewriting the archive in place would silently drop
 * the extract and any packaged assets.
 */
export async function resolveWritableWorkbookUri(): Promise<vscode.Uri> {
    const uri = await resolveWorkbookUri();
    if (!uri) {
        throw new NoWritableWorkbookError(NO_WORKBOOK_MESSAGE);
    }
    if (!uri.path.toLowerCase().endsWith('.twb')) {
        throw new NoWritableWorkbookError(
            `Cannot write to \`${uri.path.split('/').pop() ?? uri.path}\`. ` +
            'Writing calculations is supported for plain `.twb` workbooks only — unpackage the `.twbx` first.'
        );
    }
    if (uri.scheme !== 'file') {
        throw new NoWritableWorkbookError(
            'Writing calculations is supported for workbooks on the local filesystem only.'
        );
    }
    return uri;
}
