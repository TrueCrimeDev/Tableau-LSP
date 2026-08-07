import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import {
    discoverTableauLibrary,
    isCalculationFile,
    isDeclarationFile,
    preferredDefinitionTarget,
} from '../../services/tableauWorkspaceFiles.js';
import { join } from 'path';
import { tmpdir } from 'os';

const roots: string[] = [];

function workspace(layout: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), 'tableau-lib-'));
    roots.push(root);
    for (const [relativePath, contents] of Object.entries(layout)) {
        const full = join(root, relativePath);
        mkdirSync(join(full, '..'), { recursive: true });
        writeFileSync(full, contents);
    }
    return root;
}

afterAll(() => {
    for (const root of roots) {
        rmSync(root, { recursive: true, force: true });
    }
});

describe('file classification', () => {
    it('separates declaration files from calculation files', () => {
        expect(isDeclarationFile('/w/tableau/fields.d.twbl')).toBe(true);
        expect(isDeclarationFile('/w/tableau/orders.D.TWBL')).toBe(true);
        expect(isDeclarationFile('/w/tableau/common.twbl')).toBe(false);

        expect(isCalculationFile('/w/tableau/common.twbl')).toBe(true);
        expect(isCalculationFile('/w/tableau/fields.d.twbl')).toBe(false);
        expect(isCalculationFile('/w/tableau/notes.md')).toBe(false);
    });
});

describe('discoverTableauLibrary', () => {
    it('finds declarations and calculations in a root tableau folder', () => {
        const root = workspace({
            'tableau/fields.d.twbl': '// fields',
            'tableau/common.twbl': '// Ratio\nSUM([A])',
        });
        const library = discoverTableauLibrary([root]);

        expect(library.definitions).toEqual([join(root, 'tableau', 'fields.d.twbl')]);
        expect(library.calculations).toEqual([join(root, 'tableau', 'common.twbl')]);
        expect(library.folders).toEqual([join(root, 'tableau')]);
    });

    it('still finds the pre-tableau root-level files', () => {
        const root = workspace({
            'fields.d.twbl': '// legacy fields',
            '_calc_bank.twbl': '// legacy bank',
        });
        const library = discoverTableauLibrary([root]);

        expect(library.definitions).toEqual([join(root, 'fields.d.twbl')]);
        expect(library.calculations).toEqual([join(root, '_calc_bank.twbl')]);
        expect(library.folders).toEqual([]);
    });

    it('orders root files before library files so the specific one wins', () => {
        const root = workspace({
            'fields.d.twbl': '// legacy',
            'tableau/fields.d.twbl': '// specific',
        });
        expect(discoverTableauLibrary([root]).definitions).toEqual([
            join(root, 'fields.d.twbl'),
            join(root, 'tableau', 'fields.d.twbl'),
        ]);
    });

    it('sorts by name so results never depend on filesystem order', () => {
        const root = workspace({
            'tableau/zebra.d.twbl': '',
            'tableau/alpha.d.twbl': '',
            'tableau/monkey.d.twbl': '',
        });
        expect(discoverTableauLibrary([root]).definitions.map(path => path.split(/[/\\]/).pop()))
            .toEqual(['alpha.d.twbl', 'monkey.d.twbl', 'zebra.d.twbl']);
    });

    it('descends into sub-folders of the library, files before folders', () => {
        const root = workspace({
            'tableau/base.d.twbl': '',
            'tableau/superstore/orders.d.twbl': '',
            'tableau/superstore/deep/nested.d.twbl': '',
        });
        expect(discoverTableauLibrary([root]).definitions).toEqual([
            join(root, 'tableau', 'base.d.twbl'),
            join(root, 'tableau', 'superstore', 'orders.d.twbl'),
            join(root, 'tableau', 'superstore', 'deep', 'nested.d.twbl'),
        ]);
    });

    it('stops descending past the depth limit', () => {
        const root = workspace({
            'tableau/a/b/c/toodeep.d.twbl': '',
        });
        expect(discoverTableauLibrary([root]).definitions).toEqual([]);
    });

    it('skips dependency and build folders', () => {
        const root = workspace({
            'tableau/node_modules/junk.d.twbl': '',
            'tableau/out/built.d.twbl': '',
            'tableau/real.d.twbl': '',
        });
        expect(discoverTableauLibrary([root]).definitions)
            .toEqual([join(root, 'tableau', 'real.d.twbl')]);
    });

    it('ignores files that are not .twbl at all', () => {
        const root = workspace({
            'tableau/readme.md': '',
            'tableau/fields.json': '',
            'tableau/fields.d.twbl': '',
        });
        const library = discoverTableauLibrary([root]);
        expect(library.definitions).toEqual([join(root, 'tableau', 'fields.d.twbl')]);
        expect(library.calculations).toEqual([]);
    });

    it('honours a custom folder name', () => {
        const root = workspace({ 'shared/fields.d.twbl': '' });

        expect(discoverTableauLibrary([root]).definitions).toEqual([]);
        expect(discoverTableauLibrary([root], ['shared']).definitions)
            .toEqual([join(root, 'shared', 'fields.d.twbl')]);
    });

    it('searches every workspace root and de-duplicates repeats', () => {
        const first = workspace({ 'tableau/one.d.twbl': '' });
        const second = workspace({ 'tableau/two.d.twbl': '' });

        expect(discoverTableauLibrary([first, second, first]).definitions).toEqual([
            join(first, 'tableau', 'one.d.twbl'),
            join(second, 'tableau', 'two.d.twbl'),
        ]);
    });

    it('terminates on a symlink cycle instead of walking forever', () => {
        const root = workspace({ 'tableau/real.d.twbl': '' });
        try {
            symlinkSync(join(root, 'tableau'), join(root, 'tableau', 'loop'), 'dir');
        } catch {
            return; // Symlink creation is not permitted here; nothing to assert.
        }
        expect(discoverTableauLibrary([root]).definitions)
            .toEqual([join(root, 'tableau', 'real.d.twbl')]);
    });

    it('counts one directory once when two folder names resolve to it', () => {
        const root = workspace({ 'tableau/one.d.twbl': '' });
        try {
            symlinkSync(join(root, 'tableau'), join(root, 'linked'), 'dir');
        } catch {
            return;
        }
        const library = discoverTableauLibrary([root], ['tableau', 'linked']);
        expect(library.definitions).toEqual([join(root, 'tableau', 'one.d.twbl')]);
        expect(library.folders).toEqual([join(root, 'tableau')]);
    });

    it('orders by code point so host and server agree regardless of locale', () => {
        const root = workspace({
            'tableau/B.d.twbl': '',
            'tableau/a.d.twbl': '',
        });
        // localeCompare would put "a" before "B"; code-point order does not.
        expect(discoverTableauLibrary([root]).definitions.map(path => path.split(/[/\\]/).pop()))
            .toEqual(['B.d.twbl', 'a.d.twbl']);
    });

    it('returns nothing for a root that does not exist', () => {
        const library = discoverTableauLibrary([join(tmpdir(), 'tableau-does-not-exist-xyz')]);
        expect(library).toEqual({ definitions: [], calculations: [], instructions: [], folders: [] });
    });
});

describe('preferredDefinitionTarget', () => {
    it('writes into the library folder when the workspace has one', () => {
        const root = workspace({ 'tableau/existing.d.twbl': '' });
        expect(preferredDefinitionTarget(root)).toBe(join(root, 'tableau', 'fields.d.twbl'));
    });

    it('falls back to the workspace root when there is no library folder', () => {
        const root = workspace({ 'notes.md': '' });
        expect(preferredDefinitionTarget(root)).toBe(join(root, 'fields.d.twbl'));
    });
});
