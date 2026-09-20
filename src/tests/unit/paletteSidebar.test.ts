import { readFileSync } from 'fs';
import { join } from 'path';
import { runInNewContext } from 'vm';

// Execute the shipped webview script and drive its real event handlers. The
// minimal DOM exposes only palette controls, keeping this test browser-free.
class Control {
    value = '';
    textContent = '';
    innerHTML = '';
    style: Record<string, string> = {};
    dataset: Record<string, string> = {};
    classList = { add: jest.fn(), remove: jest.fn(), contains: () => false };
    listeners = new Map<string, (event: unknown) => void>();
    addEventListener(type: string, listener: (event: unknown) => void): void { this.listeners.set(type, listener); }
    fire(type: string): void { this.listeners.get(type)?.({ target: this }); }
    appendChild(): void {}
    querySelector(): null { return null; }
}

function createSidebar() {
    const controls = new Map<string, Control>();
    for (const id of [
        'palette-list', 'palette-name', 'palette-type', 'colors-list', 'save-palette',
        'save-file', 'reload-file', 'palette-unsaved-state', 'palette-status', 'palette-status-text',
        'scale-base-swatch', 'scale-base-hex', 'scale-steps', 'scale-easing',
        'scale-generate', 'scale-preview', 'scale-apply', 'blend-start-swatch', 'blend-start-hex',
        'blend-end-swatch', 'blend-end-hex', 'blend-steps', 'blend-easing', 'blend-colorspace',
        'blend-generate', 'blend-preview', 'blend-apply', 'theme-list',
    ]) { controls.set(id, new Control()); }
    const messages: Record<string, unknown>[] = [];
    const listeners: ((event: { data: unknown }) => void)[] = [];
    const consoleErrors = jest.fn();
    runInNewContext(readFileSync(join(__dirname, '../../../media/parsingGuideSidebar.js'), 'utf8'), {
        acquireVsCodeApi: () => ({ postMessage: (message: Record<string, unknown>) => messages.push(JSON.parse(JSON.stringify(message))) }),
        document: {
            getElementById: (id: string) => controls.get(id) ?? null,
            querySelectorAll: () => [], addEventListener: () => undefined,
            createElement: () => new Control(), body: new Control(),
        },
        window: { addEventListener: (type: string, listener: (event: { data: unknown }) => void) => { if (type === 'message') { listeners.push(listener); } } },
        HTMLElement: Control, Element: Control,
        console: { error: consoleErrors, log: () => undefined },
    });
    return {
        control: (id: string) => controls.get(id)!, messages, consoleErrors,
        receive: (data: unknown) => listeners.forEach(listener => listener({ data })),
    };
}

const palette = { name: 'Original', type: 'regular', colors: ['#112233'] };

describe('palette sidebar persistence', () => {
    it('writes Save Palette to the preferences service and clears the unsaved indicator only after the saved data returns', () => {
        const ui = createSidebar();
        ui.receive({ type: 'palettesLoaded', palettes: [palette] });
        ui.control('palette-name').value = 'Updated';
        ui.control('palette-name').fire('input');
        expect(ui.control('palette-unsaved-state').textContent).toContain('Unsaved');
        ui.control('save-palette').fire('click');
        expect(ui.messages.at(-1)).toEqual({ type: 'savePalettes', palettes: [palette, { ...palette, name: 'Updated' }] });
        expect(ui.control('palette-unsaved-state').textContent).toContain('Unsaved');
        ui.receive({ type: 'palettesLoaded', palettes: [palette, { ...palette, name: 'Updated' }] });
        expect(ui.control('palette-unsaved-state').textContent).toBe('No unsaved palette changes.');
        expect(ui.consoleErrors).not.toHaveBeenCalled();
    });

    it('preserves an edited palette through background refresh and a delayed save response', () => {
        const ui = createSidebar();
        ui.receive({ type: 'palettesLoaded', palettes: [palette] });
        ui.control('palette-name').value = 'Draft';
        ui.control('palette-name').fire('input');
        ui.receive({ type: 'palettesLoaded', palettes: [palette] });
        expect(ui.control('palette-name').value).toBe('Draft');
        ui.control('save-palette').fire('click');
        ui.control('palette-name').value = 'Newer draft';
        ui.control('palette-name').fire('input');
        ui.receive({ type: 'palettesLoaded', palettes: [palette, { ...palette, name: 'Draft' }] });
        expect(ui.control('palette-name').value).toBe('Newer draft');
        expect(ui.control('palette-unsaved-state').textContent).toContain('Unsaved');
        expect(ui.consoleErrors).not.toHaveBeenCalled();
    });

    it('requests confirmation before replacing unsaved changes with a reload', () => {
        const ui = createSidebar();
        ui.receive({ type: 'palettesLoaded', palettes: [palette] });
        ui.control('palette-name').value = 'Draft';
        ui.control('palette-name').fire('input');
        ui.control('reload-file').fire('click');
        expect(ui.messages.at(-1)).toEqual({ type: 'reloadPalettes', hasUnsavedChanges: true });
        expect(ui.control('palette-name').value).toBe('Draft');
        ui.receive({ type: 'palettesLoaded', palettes: [palette], replaceDraft: true });
        expect(ui.control('palette-name').value).toBe('Original');
        expect(ui.control('palette-unsaved-state').textContent).toBe('No unsaved palette changes.');
    });
});
