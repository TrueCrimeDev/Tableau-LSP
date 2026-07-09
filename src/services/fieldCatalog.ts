/**
 * Workspace-wide catalog of plain datasource fields (no calculations or
 * parameters). Pushed by the sidebar whenever it parses a workbook; consumed
 * by the field-swap hover. Falls back to parsing generated fields.d.twbl
 * declarations when no workbook has been parsed yet.
 */

export interface CatalogField {
    name: string;
    datatype: string;
    role: string;
    datasource: string;
}

let catalog: CatalogField[] = [];

export function setFieldCatalog(fields: CatalogField[]): void {
    const seen = new Set<string>();
    catalog = fields.filter(f => {
        const key = `${f.datasource}::${f.name}`.toLowerCase();
        if (seen.has(key)) { return false; }
        seen.add(key);
        return true;
    });
}

export function getFieldCatalog(): CatalogField[] {
    return catalog;
}

/**
 * Parses fields.d.twbl declaration blocks produced by generateFieldDefsSection:
 *
 *   /**
 *    * Order Date — dimension, date · Orders (Book.twb)
 *    *​/
 *   [Order Date] = Date
 */
export function parseFieldDefs(text: string): CatalogField[] {
    const fields: CatalogField[] = [];
    let pendingMeta: { name: string; role: string; datatype: string; datasource: string } | null = null;

    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        const meta = line.match(/^\*\s+(.+?)\s+—\s+([\w-]+),\s+([\w-]+)\s+·\s+(.+?)\s+\(/);
        if (meta) {
            pendingMeta = { name: meta[1], role: meta[2], datatype: meta[3], datasource: meta[4] };
            continue;
        }
        const decl = line.match(/^\[([^\]]+)\]\s*=/);
        if (decl) {
            const name = decl[1];
            const matches = pendingMeta && pendingMeta.name === name;
            fields.push({
                name,
                datatype: matches && pendingMeta ? pendingMeta.datatype : '',
                role: matches && pendingMeta ? pendingMeta.role : '',
                datasource: matches && pendingMeta ? pendingMeta.datasource : '',
            });
            pendingMeta = null;
        }
    }
    return fields;
}
