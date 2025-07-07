import {
    SemanticTokens,
    SemanticTokensBuilder,
    SemanticTokensParams,
    SemanticTokenTypes,
    SemanticTokenModifiers
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { Lexer, TokenType } from './tableauexer';

// A map to translate our custom TokenType enum to the standard LSP SemanticTokenTypes.
// This makes the logic cleaner and easier to manage.
const tokenTypeToSemanticType = new Map<TokenType, SemanticTokenTypes>([
    // Literals
    [TokenType.String, SemanticTokenTypes.string],
    [TokenType.Number, SemanticTokenTypes.number],
    [TokenType.FieldReference, SemanticTokenTypes.variable], // Treat field refs like variables

    // Keywords
    [TokenType.If, SemanticTokenTypes.keyword],
    [TokenType.Then, SemanticTokenTypes.keyword],
    [TokenType.Else, SemanticTokenTypes.keyword],
    [TokenType.Elseif, SemanticTokenTypes.keyword],
    [TokenType.End, SemanticTokenTypes.keyword],
    [TokenType.Case, SemanticTokenTypes.keyword],
    [TokenType.When, SemanticTokenTypes.keyword],

    // Logical & LOD Keywords
    [TokenType.And, SemanticTokenTypes.keyword],
    [TokenType.Or, SemanticTokenTypes.keyword],
    [TokenType.Not, SemanticTokenTypes.keyword],
    [TokenType.In, SemanticTokenTypes.keyword],
    [TokenType.Fixed, SemanticTokenTypes.keyword],
    [TokenType.Include, SemanticTokenTypes.keyword],
    [TokenType.Exclude, SemanticTokenTypes.keyword],

    // Constants
    [TokenType.True, SemanticTokenTypes.keyword],
    [TokenType.False, SemanticTokenTypes.keyword],
    [TokenType.Null, SemanticTokenTypes.keyword],

    // Operators
    [TokenType.Plus, SemanticTokenTypes.operator],
    [TokenType.Minus, SemanticTokenTypes.operator],
    [TokenType.Star, SemanticTokenTypes.operator],
    [TokenType.Slash, SemanticTokenTypes.operator],
    [TokenType.Percent, SemanticTokenTypes.operator],
    [TokenType.Equal, SemanticTokenTypes.operator],
    [TokenType.EqualEqual, SemanticTokenTypes.operator],
    [TokenType.Bang, SemanticTokenTypes.operator],
    [TokenType.BangEqual, SemanticTokenTypes.operator],
    [TokenType.Greater, SemanticTokenTypes.operator],
    [TokenType.GreaterEqual, SemanticTokenTypes.operator],
    [TokenType.Less, SemanticTokenTypes.operator],
    [TokenType.LessEqual, SemanticTokenTypes.operator],
]);

/**
 * Handles the request for semantic tokens for an entire document.
 * This is the primary function that will be called by the client (e.g., VS Code)
 * to provide syntax highlighting.
 * @param params The request parameters, including the text document.
 * @param documents A map-like object to get the document from. Can be a simple map or a TextDocuments manager.
 * @returns A SemanticTokens object containing the encoded token data.
 */
export function provideSemanticTokens(params: SemanticTokensParams, documents: { get(uri: string): TextDocument | undefined }): SemanticTokens {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        return { data: [] };
    }

    const builder = new SemanticTokensBuilder();
    const lexer = new Lexer(document.getText());

    let token;
    while ((token = lexer.getNextToken()) && token.type !== TokenType.EOF) {
        let semanticType: SemanticTokenTypes | undefined;

        if (token.type === TokenType.Identifier) {
            // In Tableau, identifiers are almost always function calls.
            // A more advanced implementation would use a symbol table to check
            // if it's a known function. For now, we'll assume all are functions.
            semanticType = SemanticTokenTypes.function;
        } else {
            semanticType = tokenTypeToSemanticType.get(token.type);
        }

        if (semanticType) {
            // The builder needs the line, character, length, type, and modifiers.
            // We can push tokens one by one. The builder handles the delta encoding.
            builder.push(
                token.line - 1,       // Line number (0-indexed)
                token.column - 1,     // Character start (0-indexed)
                token.value.length,   // Length of the token
                getTokenTypeIndex(semanticType), // The integer index of the token type
                0                     // Modifiers (e.g., static, readonly) - none for now
            );
        }
    }

    return builder.build();
}

/**
 * The legend that tells the client which token types and modifiers our server supports.
 * This MUST be consistent with the indexes returned by `getTokenTypeIndex`.
 */
export const tokenLegend = {
    tokenTypes: [
        SemanticTokenTypes.keyword,
        SemanticTokenTypes.variable, // For [Field References]
        SemanticTokenTypes.string,
        SemanticTokenTypes.number,
        SemanticTokenTypes.operator,
        SemanticTokenTypes.function,
        // Add other types as needed
    ],
    tokenModifiers: [
        // e.g., SemanticTokenModifiers.readonly, SemanticTokenModifiers.static
    ],
};

// Helper to get the integer index for a given token type string from our legend.
// This is required because the LSP protocol sends integer indexes, not strings.
const tokenTypeMap = new Map<string, number>(tokenLegend.tokenTypes.map((t, i) => [t, i]));

function getTokenTypeIndex(tokenType: SemanticTokenTypes): number {
    return tokenTypeMap.get(tokenType) ?? -1;
}