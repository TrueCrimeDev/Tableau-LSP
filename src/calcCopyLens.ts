import {
    CodeLens,
    CodeLensProvider,
    Event,
    EventEmitter,
    Range,
    TextDocument,
    workspace
} from 'vscode';

export const COPY_CALC_BLOCK_COMMAND = 'tableau-language-support.copyCalcBlock';

/**
 * Emits a dimmed "Copy" CodeLens above each calculation block — a run of
 * consecutive non-blank lines, typically a `// header` comment plus its formula.
 * Clicking copies just that block (comment header + calculation) to the clipboard.
 *
 * CodeLens text is rendered in the muted editorCodeLens.foreground colour, so the
 * affordance stays subtle without any custom styling.
 */
export class CalcCopyCodeLensProvider implements CodeLensProvider {
    private readonly _onDidChange = new EventEmitter<void>();
    readonly onDidChangeCodeLenses: Event<void> = this._onDidChange.event;

    /** Ask VS Code to re-query lenses (e.g. after a settings change). */
    refresh(): void {
        this._onDidChange.fire();
    }

    provideCodeLenses(document: TextDocument): CodeLens[] {
        // Declaration files (twbl.d.twbl, fields.d.twbl) are reference docs,
        // not user calculations — same exclusion the server applies to diagnostics.
        if (document.uri.path.toLowerCase().endsWith('.d.twbl')) { return []; }

        const cfg = workspace.getConfiguration('tableau-language-support');
        if (!cfg.get<boolean>('codeLens.enabled', true)) { return []; }
        if (!cfg.get<boolean>('codeLens.copyWithComment', true)) { return []; }

        const lenses: CodeLens[] = [];
        const lines = document.getText().split(/\r?\n/);

        let i = 0;
        while (i < lines.length) {
            if (lines[i].trim() === '') { i++; continue; }

            const start = i;
            let hasCode = false;
            while (i < lines.length && lines[i].trim() !== '') {
                if (!lines[i].trim().startsWith('//')) { hasCode = true; }
                i++;
            }
            const end = i - 1;

            // Skip pure-comment blocks — a standalone note with no calculation.
            if (!hasCode) { continue; }

            const blockText = lines.slice(start, end + 1).join('\n');
            lenses.push(new CodeLens(new Range(start, 0, start, 0), {
                title: '$(copy) Copy',
                tooltip: 'Copy this calculation and its comment header',
                command: COPY_CALC_BLOCK_COMMAND,
                arguments: [blockText]
            }));
        }
        return lenses;
    }
}
