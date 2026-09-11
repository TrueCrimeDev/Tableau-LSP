import * as vscode from 'vscode';
import { resolveWorkbookUri, resolveWritableWorkbookUri } from '../../chat/activeWorkbook.js';
import { bindWorkbookSource, unbindWorkbookSource } from '../../services/workbookUri.js';

/**
 * Which staged query the resolver issued. The directory stage is scoped to a
 * folder with a flat glob, the root stage to a WorkspaceFolder with a
 * recursive one, and the workbench stage is the plain workspace-wide string.
 */
type Stage = 'directory' | 'root' | 'workbench';

function stageOf(pattern: unknown): Stage {
    if (typeof pattern === 'string') {
        return 'workbench';
    }
    const { pattern: glob } = pattern as { pattern: string };
    return glob.startsWith('**/') ? 'root' : 'directory';
}

function uri(filePath: string): vscode.Uri {
    return {
        scheme: 'file',
        path: filePath,
        fsPath: filePath,
        toString: () => `file://${filePath}`,
    } as unknown as vscode.Uri;
}

function tab(resource: vscode.Uri): vscode.Tab {
    return { input: { uri: resource } } as unknown as vscode.Tab;
}

function folder(rootPath: string, index: number): vscode.WorkspaceFolder {
    return { uri: uri(rootPath), name: rootPath, index } as vscode.WorkspaceFolder;
}

const ROOT_A = '/work/proj-a';
const ROOT_B = '/work/proj-b';
const CALC_A = `${ROOT_A}/calc.twbl`;
const WORKBOOK_A = `${ROOT_A}/A.twb`;
const WORKBOOK_B = `${ROOT_B}/B.twb`;

describe('resolveWorkbookUri', () => {
    let workspaceState: any;
    let windowState: any;
    let findFiles: jest.Mock;

    /** Results the staged disk search should return, per stage. */
    function diskContains(results: Partial<Record<Stage, vscode.Uri[]>>): void {
        findFiles = jest.fn((pattern: unknown) => Promise.resolve(results[stageOf(pattern)] ?? []));
        workspaceState.findFiles = findFiles;
    }

    /** The stages the resolver actually queried, in order. */
    function queriedStages(): Stage[] {
        return findFiles.mock.calls.map(call => stageOf(call[0]));
    }

    /** Open workbook (and other) tabs, none of them the active tab. */
    function openTabs(...resources: vscode.Uri[]): void {
        windowState.tabGroups.all = [{ tabs: resources.map(tab) }];
    }

    /** Focus a non-workbook file — the case the proximity tiers exist for. */
    function focusCalculation(filePath: string): void {
        const resource = uri(filePath);
        windowState.activeTextEditor = { document: { uri: resource } };
        windowState.tabGroups.activeTabGroup.activeTab = tab(resource);
    }

    beforeEach(() => {
        workspaceState = vscode.workspace as any;
        windowState = vscode.window as any;

        windowState.activeTextEditor = undefined;
        windowState.tabGroups = {
            activeTabGroup: { activeTab: undefined },
            all: [],
        };
        workspaceState.workspaceFolders = [];
        workspaceState.getWorkspaceFolder = jest.fn().mockReturnValue(undefined);
        diskContains({});
    });

    describe('existing resolution order', () => {
        it('returns the workbook that is the active editor', async () => {
            windowState.activeTextEditor = { document: { uri: uri(WORKBOOK_A) } };

            await expect(resolveWorkbookUri()).resolves.toMatchObject({ fsPath: WORKBOOK_A });
        });

        it('returns the active tab workbook when the active editor is not one', async () => {
            windowState.activeTextEditor = { document: { uri: uri(CALC_A) } };
            windowState.tabGroups.activeTabGroup.activeTab = tab(uri(WORKBOOK_B));

            await expect(resolveWorkbookUri()).resolves.toMatchObject({ fsPath: WORKBOOK_B });
        });

        it('returns the only open workbook tab when it is not the active tab', async () => {
            focusCalculation(CALC_A);
            openTabs(uri(CALC_A), uri(WORKBOOK_B));

            await expect(resolveWorkbookUri()).resolves.toMatchObject({ fsPath: WORKBOOK_B });
        });

        it('returns the only workbook on disk when none are open', async () => {
            diskContains({ workbench: [uri(WORKBOOK_A)] });

            await expect(resolveWorkbookUri()).resolves.toMatchObject({ fsPath: WORKBOOK_A });
        });

        it('returns undefined when no workbook is open or on disk', async () => {
            await expect(resolveWorkbookUri()).resolves.toBeUndefined();
        });

        it('returns undefined when the whole workbench holds several workbooks', async () => {
            diskContains({ workbench: [uri(WORKBOOK_A), uri(WORKBOOK_B)] });

            await expect(resolveWorkbookUri()).resolves.toBeUndefined();
        });
    });

    describe('proximity tie-break across open workbook tabs', () => {
        it('prefers the open workbook in the active calculation directory', async () => {
            focusCalculation(CALC_A);
            openTabs(uri(WORKBOOK_A), uri(WORKBOOK_B));

            await expect(resolveWorkbookUri()).resolves.toMatchObject({ fsPath: WORKBOOK_A });
        });

        it('prefers the open workbook sharing the active calculation workspace root', async () => {
            const folderA = folder(ROOT_A, 0);
            const nested = `${ROOT_A}/sub/nested.twbl`;
            focusCalculation(nested);
            openTabs(uri(WORKBOOK_A), uri(WORKBOOK_B));
            workspaceState.getWorkspaceFolder = jest.fn((resource: vscode.Uri) =>
                resource.fsPath.startsWith(ROOT_A) ? folderA : folder(ROOT_B, 1)
            );

            // Not in the calculation's own directory, but in its root — while
            // B.twb is in neither.
            await expect(resolveWorkbookUri()).resolves.toMatchObject({ fsPath: WORKBOOK_A });
        });

        it('stays ambiguous when neither tier narrows the open workbooks', async () => {
            const sibling = `${ROOT_A}/A2.twb`;
            focusCalculation(CALC_A);
            openTabs(uri(WORKBOOK_A), uri(sibling));

            await expect(resolveWorkbookUri()).resolves.toBeUndefined();
        });

        it('never falls through to a disk search while workbook tabs are open', async () => {
            focusCalculation(CALC_A);
            openTabs(uri(WORKBOOK_A), uri(WORKBOOK_B));
            diskContains({ workbench: [uri(WORKBOOK_B)] });

            await resolveWorkbookUri();

            expect(queriedStages()).toEqual([]);
        });
    });

    describe('staged disk search', () => {
        it('finds the workbook beside the active calculation without searching wider', async () => {
            focusCalculation(CALC_A);
            diskContains({ directory: [uri(WORKBOOK_A)], workbench: [uri(WORKBOOK_B)] });

            await expect(resolveWorkbookUri()).resolves.toMatchObject({ fsPath: WORKBOOK_A });
            expect(queriedStages()).toEqual(['directory']);
        });

        it('scopes the directory stage to the active calculation folder', async () => {
            focusCalculation(CALC_A);
            diskContains({ directory: [uri(WORKBOOK_A)] });

            await resolveWorkbookUri();

            const [pattern] = findFiles.mock.calls[0] as [{ baseUri: vscode.Uri }];
            expect(pattern.baseUri.fsPath).toBe(ROOT_A);
        });

        it('widens to the workspace root when the directory holds no workbook', async () => {
            const folderA = folder(ROOT_A, 0);
            focusCalculation(`${ROOT_A}/sub/nested.twbl`);
            workspaceState.getWorkspaceFolder = jest.fn(() => folderA);
            diskContains({ root: [uri(WORKBOOK_A)], workbench: [uri(WORKBOOK_B)] });

            await expect(resolveWorkbookUri()).resolves.toMatchObject({ fsPath: WORKBOOK_A });
            expect(queriedStages()).toEqual(['directory', 'root']);
        });

        it('widens to the whole workbench when the root holds no single workbook', async () => {
            const folderA = folder(ROOT_A, 0);
            focusCalculation(CALC_A);
            workspaceState.getWorkspaceFolder = jest.fn(() => folderA);
            diskContains({ workbench: [uri(WORKBOOK_B)] });

            await expect(resolveWorkbookUri()).resolves.toMatchObject({ fsPath: WORKBOOK_B });
            expect(queriedStages()).toEqual(['directory', 'root', 'workbench']);
        });

        it('skips the root stage when the active calculation is outside every root', async () => {
            focusCalculation(CALC_A);
            diskContains({ workbench: [uri(WORKBOOK_B)] });

            await expect(resolveWorkbookUri()).resolves.toMatchObject({ fsPath: WORKBOOK_B });
            expect(queriedStages()).toEqual(['directory', 'workbench']);
        });

        it('searches only the whole workbench when nothing is focused', async () => {
            diskContains({ workbench: [uri(WORKBOOK_A)] });

            await expect(resolveWorkbookUri()).resolves.toMatchObject({ fsPath: WORKBOOK_A });
            expect(queriedStages()).toEqual(['workbench']);
        });
    });
});

describe('resolveWritableWorkbookUri', () => {
    let windowState: any;

    beforeEach(() => {
        windowState = vscode.window as any;
        windowState.activeTextEditor = undefined;
        windowState.tabGroups = { activeTabGroup: { activeTab: undefined }, all: [] };
        (vscode.workspace as any).findFiles = jest.fn().mockResolvedValue([]);
        (vscode.workspace as any).getWorkspaceFolder = jest.fn().mockReturnValue(undefined);
    });

    it('resolves a local packaged workbook for the transactional writer', async () => {
        windowState.activeTextEditor = { document: { uri: uri(`${ROOT_A}/Packaged.twbx`) } };

        await expect(resolveWritableWorkbookUri()).resolves.toMatchObject({ fsPath: `${ROOT_A}/Packaged.twbx` });
    });

    it('counts an XML editor and its package tab as the same workbook', async () => {
        const source = uri(`${ROOT_A}/Packaged.twbx`);
        const virtual = { ...uri(`${ROOT_A}/Packaged.twbx/Book.twb`), scheme: 'tableau-workbook', toString: () => 'tableau-workbook:/Packaged.twbx/Book.twb' } as vscode.Uri;
        bindWorkbookSource(virtual, source);
        windowState.activeTextEditor = { document: { uri: uri(CALC_A) } };
        windowState.tabGroups.all = [{ tabs: [tab(source), tab(virtual)] }];
        try {
            await expect(resolveWritableWorkbookUri()).resolves.toMatchObject({ fsPath: source.fsPath });
        } finally {
            unbindWorkbookSource(virtual);
        }
    });

    it('refuses a workbook that is not on the local filesystem', async () => {
        const remote = { ...uri(WORKBOOK_A), scheme: 'vscode-remote' } as vscode.Uri;
        windowState.activeTextEditor = { document: { uri: remote } };

        await expect(resolveWritableWorkbookUri()).rejects.toThrow('local filesystem');
    });

    it('refuses when no workbook can be resolved at all', async () => {
        await expect(resolveWritableWorkbookUri()).rejects.toThrow('No unambiguous Tableau workbook');
    });
});
