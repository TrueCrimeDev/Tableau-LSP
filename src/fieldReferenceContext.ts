/** True when a bracket token is the qualifier in [Datasource].[Field]. */
export function isDatasourceQualifier(text: string, tokenEnd: number): boolean {
    return /^\s*\./.test(text.slice(tokenEnd));
}

/** Datasource immediately qualifying the bracket token that starts at tokenStart. */
export function precedingDatasource(text: string, tokenStart: number): string | undefined {
    const match = /\[([^\]]+)\]\s*\.\s*$/.exec(text.slice(0, tokenStart));
    const datasource = match?.[1].trim();
    return datasource?.length ? datasource : undefined;
}

/** True when offset is executable text rather than a string or comment. */
export function isCodeOffset(text: string, offset: number): boolean {
    let state: 'code' | 'bracket' | 'single' | 'double' | 'lineComment' | 'blockComment' = 'code';
    const limit = Math.min(Math.max(0, offset), text.length);
    for (let index = 0; index < limit; index++) {
        const current = text[index];
        const next = text[index + 1];
        if (state === 'lineComment') {
            if (current === '\n' || current === '\r') {
                state = 'code';
            }
            continue;
        }
        if (state === 'blockComment') {
            if (current === '*' && next === '/') {
                state = 'code';
                index++;
            }
            continue;
        }
        if (state === 'bracket') {
            if (current === ']') {
                state = 'code';
            }
            continue;
        }
        if (state === 'single' || state === 'double') {
            const quote = state === 'single' ? "'" : '"';
            if (current === '\\') {
                index++;
            } else if (current === quote && next === quote) {
                // Tableau accepts doubled quote characters inside literals.
                index++;
            } else if (current === quote) {
                state = 'code';
            }
            continue;
        }
        if (current === '/' && next === '/') {
            state = 'lineComment';
            index++;
        } else if (current === '/' && next === '*') {
            state = 'blockComment';
            index++;
        } else if (current === "'") {
            state = 'single';
        } else if (current === '"') {
            state = 'double';
        } else if (current === '[') {
            state = 'bracket';
        }
    }
    return state === 'code' || state === 'bracket';
}
