import * as vscode from 'vscode';
import { CatalogField, getFieldCatalog, parseFieldDefs, setFieldCatalog } from '../services/fieldCatalog.js';

export const SWAP_FIELD_COMMAND = 'tableau-language-support.swapFieldReference';

const MAX_SAME_TYPE_LINKS = 6;
const MAX_OTHER_LINKS = 4;

/** Finds the [Field] token containing `character` on a line. Exported for tests. */
export function findBracketToken(
    line: string,
    character: number
): { start: number; end: number; name: string } | null {
    const re = /\[([^\[\]]+)\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
        const start = m.index;
        const end = m.index + m[0].length;
        if (character >= start && character <= end) {
            return { start, end, name: m[1] };
        }
        if (start > character) {
            break;
        }
    }
    return null;
}

/**
 * Splits swap candidates: fields sharing the hovered field's datatype first,
 * everything else after. The hovered field itself is excluded. Exported for tests.
 */
export function orderSwapCandidates(
    currentName: string,
    fields: CatalogField[]
): { current: CatalogField | undefined; sameType: CatalogField[]; other: CatalogField[] } {
    const lower = currentName.toLowerCase();
    const current = fields.find(f => f.name.toLowerCase() === lower);
    const rest = fields.filter(f => f.name.toLowerCase() !== lower);
    if (!current || !current.datatype) {
        return { current, sameType: [], other: rest };
    }
    return {
        current,
        sameType: rest.filter(f => f.datatype === current.datatype),
        other: rest.filter(f => f.datatype !== current.datatype),
    };
}

function swapLink(
    field: CatalogField,
    uri: vscode.Uri,
    line: number,
    start: number,
    end: number
): string {
    const args = encodeURIComponent(JSON.stringify([uri.toString(), line, start, end, field.name]));
    const label = `\`[${field.name}]\``;
    return `[${label}](command:${SWAP_FIELD_COMMAND}?${args} "Swap to [${field.name}]${field.datatype ? ` (${field.datatype})` : ''}")`;
}

async function catalogWithFallback(): Promise<CatalogField[]> {
    const live = getFieldCatalog();
    if (live.length) {
        return live;
    }
    // No workbook parsed yet this session — read generated field declarations.
    try {
        const defs = await vscode.workspace.findFiles('**/fields.d.twbl', '**/node_modules/**', 3);
        const collected: CatalogField[] = [];
        for (const uri of defs) {
            const data = await vscode.workspace.fs.readFile(uri);
            collected.push(...parseFieldDefs(Buffer.from(data).toString('utf8')));
        }
        if (collected.length) {
            setFieldCatalog(collected);
        }
        return getFieldCatalog();
    } catch {
        return [];
    }
}

async function provideSwapHover(
    document: vscode.TextDocument,
    position: vscode.Position
): Promise<vscode.Hover | undefined> {
    const token = findBracketToken(document.lineAt(position.line).text, position.character);
    if (!token) {
        return undefined;
    }

    const fields = await catalogWithFallback();
    if (!fields.length) {
        return undefined;
    }

    const { current, sameType, other } = orderSwapCandidates(token.name, fields);
    if (!sameType.length && !other.length) {
        return undefined;
    }

    const lines: string[] = [];
    if (current) {
        const meta = [current.datatype, current.role].filter(Boolean).join(', ');
        lines.push(`**\`[${current.name}]\`**${meta ? ` — ${meta}` : ''}${current.datasource ? ` · ${current.datasource}` : ''}`);
        lines.push('');
    }

    const link = (f: CatalogField) => swapLink(f, document.uri, position.line, token.start, token.end);

    if (sameType.length) {
        const shown = sameType.slice(0, MAX_SAME_TYPE_LINKS);
        const label = current?.datatype ? `Swap with (${current.datatype})` : 'Swap with';
        lines.push(`${label}: ${shown.map(link).join(' · ')}${sameType.length > shown.length ? ` · +${sameType.length - shown.length} more` : ''}`);
    }
    if (other.length) {
        const shown = other.slice(0, MAX_OTHER_LINKS);
        lines.push(`${sameType.length ? 'Other fields' : 'Swap with'}: ${shown.map(link).join(' · ')}${other.length > shown.length ? ` · +${other.length - shown.length} more` : ''}`);
    }

    const md = new vscode.MarkdownString(lines.join('\n\n'));
    md.isTrusted = { enabledCommands: [SWAP_FIELD_COMMAND] };
    return new vscode.Hover(md, new vscode.Range(position.line, token.start, position.line, token.end));
}

export function registerFieldSwapFeature(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand(
            SWAP_FIELD_COMMAND,
            async (uriStr: string, line: number, start: number, end: number, name: string) => {
                const uri = vscode.Uri.parse(uriStr);
                const edit = new vscode.WorkspaceEdit();
                edit.replace(uri, new vscode.Range(line, start, line, end), `[${name}]`);
                await vscode.workspace.applyEdit(edit);
            }
        ),
        vscode.languages.registerHoverProvider(
            [{ language: 'twbl' }],
            { provideHover: provideSwapHover }
        )
    );
}
