import {
  SignatureHelp,
  SignatureInformation,
  MarkupKind,
  Position,
  Range
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ParsedDocument, Symbol, SymbolType } from './common';

/**
 * Walk up the symbol tree to find the innermost IF/CASE block
 * that contains the given position.
 */
function findEnclosingBlock(
  symbols: Symbol[],
  position: Position
): Symbol | null {
  for (const sym of symbols) {
    const { start, end } = {
      start: sym.range.start,
      end: sym.end ? sym.end.range.end : sym.range.end
    };
    const within =
      (position.line > start.line ||
        (position.line === start.line && position.character >= start.character)) &&
      (position.line < end.line ||
        (position.line === end.line && position.character <= end.character));

    if (within) {
      if (sym.name === 'IF' || sym.name === 'CASE') {
        return sym;
      }
      if (sym.children?.length) {
        const inner = findEnclosingBlock(sym.children, position);
        if (inner) return inner;
      }
    }
  }
  return null;
}

/**
 * Given a caret position, build a multiline signature of the IF/CASE block.
 */
export function buildSignatureHelp(
  document: TextDocument,
  position: Position,
  parsed: ParsedDocument
): SignatureHelp | null {
  const block = findEnclosingBlock(parsed.symbols, position);
  if (!block) return null;

  // Collect branch lines for display
  const displayLines: string[] = [];
  let activeParameter = 0;

  for (const child of block.children || []) {
    if (
      child.name === 'THEN' ||
      child.name === 'ELSEIF' ||
      child.name === 'ELSE' ||
      child.name === 'WHEN'
    ) {
      // Capture the entire source line for the branch keyword
      const lineText = document
        .getText(
          Range.create(
            { line: child.range.start.line, character: 0 },
            { line: child.range.start.line, character: Number.MAX_SAFE_INTEGER }
          )
        )
        .trimEnd();

      if (
        position.line === child.range.start.line ||
        (child.children &&
          child.children.some(
            (v) =>
              position.line >= v.range.start.line &&
              position.line <= v.range.end.line
          ))
      ) {
        activeParameter = displayLines.length;
        displayLines.push(`**${lineText}**`);
      } else {
        displayLines.push(lineText);
      }
    }
  }

  // Add END line
  const endLine = document.getText(
    Range.create(
      { line: block.end!.range.start.line, character: 0 },
      { line: block.end!.range.start.line, character: Number.MAX_SAFE_INTEGER }
    )
  );
  displayLines.push(endLine.trimEnd());

  const signature: SignatureInformation = {
    label: displayLines.join('\n'),
    documentation: {
      kind: MarkupKind.Markdown,
      value: 'IF/CASE branch context'
    },
    parameters: displayLines.map((l) => ({ label: l }))
  };

  return {
    signatures: [signature],
    activeSignature: 0,
    activeParameter
  };
}
