

import { TextEdit, Range, Position, FormattingOptions } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { tokenize, TokenType } from './lexer';

export function format(document: TextDocument, options: FormattingOptions): TextEdit[] {
    const tokens = tokenize(document.getText());
    let indentLevel = 0;
    let formattedText = '';

    for (const token of tokens) {
        if (token.type === TokenType.EOF) {
            break;
        }

        if (token.type === TokenType.RBrace || token.type === TokenType.End) {
            indentLevel = Math.max(0, indentLevel - 1);
        }

        if (formattedText.length > 0 && formattedText.charAt(formattedText.length - 1) !== '\n') {
            formattedText += ' ';
        }

        if (formattedText.length === 0 || formattedText.charAt(formattedText.length - 1) === '\n') {
            formattedText += '\t'.repeat(indentLevel);
        }

        formattedText += token.value;

        if (token.type === TokenType.LBrace || token.type === TokenType.If || token.type === TokenType.Case || token.type === TokenType.Then || token.type === TokenType.Else || token.type === TokenType.Elseif || token.type === TokenType.When) {
            indentLevel++;
        }

        if (token.type === TokenType.RBrace || token.type === TokenType.End) {
            formattedText += '\n';
        }
    }

    return [
        TextEdit.replace(
            Range.create(
                { line: 0, character: 0 },
                document.positionAt(document.getText().length)
            ),
            formattedText
        ),
    ];
}
