import {
    SemanticTokens,
    SemanticTokensBuilder,
    TextDocumentPositionParams,
    Range,
    Position
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ParsedDocument, SymbolType, FUNCTION_SIGNATURES } from './common';
import { tokenize, TokenType } from './lexer';

/**
 * R5.1: Token type mapping from lexer tokens to LSP semantic token types
 */
const TOKEN_TYPE_MAP: Record<string, number> = {
    // Semantic token legend: ['keyword', 'function', 'variable', 'constant', 'operator', 'string', 'comment']
    'keyword': 0,
    'function': 1,
    'variable': 2,
    'constant': 3,
    'operator': 4,
    'string': 5,
    'comment': 6
};

/**
 * R5.2: Map lexer token types to semantic token types
 */
function getSemanticTokenType(tokenType: TokenType, tokenValue: string): number {
    switch (tokenType) {
        // Keywords
        case TokenType.If:
        case TokenType.Then:
        case TokenType.Else:
        case TokenType.Elseif:
        case TokenType.End:
        case TokenType.Case:
        case TokenType.When:
        case TokenType.And:
        case TokenType.Or:
        case TokenType.Not:
        case TokenType.In:
        case TokenType.Fixed:
        case TokenType.Include:
        case TokenType.Exclude:
            return TOKEN_TYPE_MAP['keyword'];

        // Constants
        case TokenType.True:
        case TokenType.False:
        case TokenType.Null:
        case TokenType.Number:
            return TOKEN_TYPE_MAP['constant'];

        // Strings
        case TokenType.String:
            return TOKEN_TYPE_MAP['string'];

        // Field references
        case TokenType.FieldReference:
            return TOKEN_TYPE_MAP['variable'];

        // Operators
        case TokenType.Plus:
        case TokenType.Minus:
        case TokenType.Star:
        case TokenType.Slash:
        case TokenType.Percent:
        case TokenType.Equal:
        case TokenType.EqualEqual:
        case TokenType.Bang:
        case TokenType.BangEqual:
        case TokenType.Greater:
        case TokenType.GreaterEqual:
        case TokenType.Less:
        case TokenType.LessEqual:
            return TOKEN_TYPE_MAP['operator'];

        // Identifiers (check if they're functions)
        case TokenType.Identifier:
            const upperValue = tokenValue.toUpperCase();
            if (FUNCTION_SIGNATURES[upperValue]) {
                return TOKEN_TYPE_MAP['function'];
            }
            return TOKEN_TYPE_MAP['variable'];

        default:
            return TOKEN_TYPE_MAP['variable']; // Default fallback
    }
}

/**
 * R5.1: Provide semantic tokens for enhanced syntax highlighting
 */
export function provideSemanticTokens(
    document: TextDocument,
    parsedDocument: ParsedDocument
): SemanticTokens {
    const text = document.getText();
    const tokens = tokenize(text);
    const builder = new SemanticTokensBuilder();

    for (const token of tokens) {
        if (token.type === TokenType.EOF || token.type === TokenType.Unexpected) {
            continue;
        }

        const startPos = document.positionAt(token.start);
        const tokenType = getSemanticTokenType(token.type, token.value);
        const length = token.end - token.start;

        builder.push(
            startPos.line,
            startPos.character,
            length,
            tokenType,
            0 // No token modifiers for now
        );
    }

    return builder.build();
}

/**
 * R5.3: Provide semantic tokens for a range (if needed for future optimization)
 */
export function provideSemanticTokensRange(
    document: TextDocument,
    parsedDocument: ParsedDocument,
    range: Range
): SemanticTokens {
    // For now, just provide full document tokens
    // Could be optimized later to only tokenize the requested range
    return provideSemanticTokens(document, parsedDocument);
}

/**
 * Helper: Check if a position is within a range
 */
function isPositionInRange(position: Position, range: Range): boolean {
    if (position.line < range.start.line || position.line > range.end.line) {
        return false;
    }
    if (position.line === range.start.line && position.character < range.start.character) {
        return false;
    }
    if (position.line === range.end.line && position.character > range.end.character) {
        return false;
    }
    return true;
} 