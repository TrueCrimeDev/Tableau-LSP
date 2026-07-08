// src/tests/unit/realWorldCalcs.test.ts
//
// Regression fixtures drawn from real workbook calculations (Tableau/Tableau.twb).
// These deeply-nested IIF ladders are the exact shapes that produced the original
// "Expression appears to continue" / "expects N arguments, got 0" false positives,
// and they exercise nested-function parsing.

import { TextDocument } from 'vscode-languageserver-textdocument';
import { parseDocument } from '../../documentModel.js';
import { IncrementalParser } from '../../incrementalParser.js';
import { getDiagnostics } from '../../diagnosticsProvider.js';
import { Symbol, SymbolType } from '../../common.js';

function doc(src: string): TextDocument {
  return TextDocument.create('test://calc.twbl', 'tableau', 1, src);
}
function diagsFor(src: string) {
  const d = doc(src);
  return getDiagnostics(d, IncrementalParser.parseDocumentIncremental(d));
}
function treeOf(src: string): Symbol[] {
  return parseDocument(doc(src)).symbols;
}
function flatten(ss: Symbol[]): Symbol[] {
  const out: Symbol[] = [];
  const walk = (list: Symbol[]): void => { for (const s of list) { out.push(s); if (s.children) { walk(s.children); } } };
  walk(ss);
  return out;
}
function maxDepth(ss: Symbol[]): number {
  let m = 0;
  const walk = (list: Symbol[], d: number): void => { for (const s of list) { if (d > m) { m = d; } if (s.children) { walk(s.children, d + 1); } } };
  walk(ss, 1);
  return m;
}

// A nested-IIF "ladder" mapping long initiative names to categories (special chars: - / &).
const INITIATIVE =
`IIF([Strategic Initiative Name]="Cross-Regional Agriculture - Agent/Attorney Strategy","Cross-Regional Agriculture",
IIF([Strategic Initiative Name]="Cross-Regional Residential Construction - H2B Strategy","Cross-Regional Residential Construction",
IIF([Strategic Initiative Name]="Cross-Regional Building Services Workers - Franchise Strategy","Cross-Regional Building Services",
"Other")))`;

// Nested IIF with a function call (STARTSWITH) inside each condition, single-quoted strings, '&'.
const NAICS2 =
`IIF(STARTSWITH([NAICS],'11'),'Agriculture',
IIF(STARTSWITH([NAICS],'21'),'Mining & Gas',
IIF(STARTSWITH([NAICS],'23'),'Construction',
'Other')))`;

// The original District-Office initials pattern from the first bug report.
const DO_IN =
`IIF([Investigating DO]="Chicago IL District Office","CH",
IIF([Investigating DO]="Detroit MI District Office","DT",
""))`;

const CASE_CALC = `CASE [Region] WHEN "North" THEN "N" WHEN "South" THEN "S" ELSE "?" END`;

describe('real-world Tableau calculations', () => {
  describe('produce no false-positive diagnostics', () => {
    it.each([
      ['Initiative', INITIATIVE],
      ['NAICS2', NAICS2],
      ['DO_IN', DO_IN],
      ['CASE', CASE_CALC],
    ])('%s parses with zero diagnostics', (_name, src) => {
      // MISSING_HEADER_COMMENT is an unrelated style hint (suggests adding a
      // `// !Name - description` header) — these fixtures target parsing
      // false-positives, not header-comment style, so exclude it.
      const parsingDiags = diagsFor(src).filter(d => d.code !== 'MISSING_HEADER_COMMENT');
      expect(parsingDiags).toHaveLength(0);
    });
  });

  describe('nested IIF ladders parse into a nested symbol tree', () => {
    it('Initiative nests beyond depth 1 and captures every IIF + field reference', () => {
      const tree = treeOf(INITIATIVE);
      const all = flatten(tree);
      expect(maxDepth(tree)).toBeGreaterThan(1);
      expect(all.filter(s => s.name === 'IIF' && s.type === SymbolType.FunctionCall).length).toBeGreaterThanOrEqual(3);
      expect(all.filter(s => s.type === SymbolType.FieldReference && s.name === 'Strategic Initiative Name').length).toBeGreaterThanOrEqual(3);
    });

    it('NAICS2 captures the nested STARTSWITH calls and NAICS field', () => {
      const all = flatten(treeOf(NAICS2));
      expect(all.filter(s => s.name === 'STARTSWITH').length).toBeGreaterThanOrEqual(3);
      expect(all.filter(s => s.type === SymbolType.FieldReference && s.name === 'NAICS').length).toBeGreaterThanOrEqual(3);
    });

    it('DO_IN captures both branches', () => {
      const all = flatten(treeOf(DO_IN));
      expect(all.filter(s => s.name === 'IIF').length).toBeGreaterThanOrEqual(2);
    });
  });
});
