

/**
 * @file lexer.ts
 * A lexer for the calculation language.
 * This file tokenizes a string of calculation syntax into a stream of tokens.
 */

/**
 * Defines the different types of tokens that the lexer can produce.
 * This enum is based on the categories found in the tmLanguage syntax file.
 */
export enum TokenType {
  // Single-character tokens
  LParen, RParen, LBrace, RBrace, Comma, Colon,

  // One or two character operators
  Plus, Minus, Star, Slash, Percent,
  Equal, EqualEqual, Bang, BangEqual,
  Greater, GreaterEqual, Less, LessEqual,

  // Literals
  Identifier,       // For functions (e.g., SUM, LEFT) and other names
  String,           // e.g., 'hello' or "world"
  Number,           // e.g., 123 or 45.6
  FieldReference,   // e.g., [Sales]

  // Keywords for control flow
  If, Then, Else, Elseif, End,
  Case, When,
  
  // Keywords for logical operators and Level of Detail (LOD) expressions
  And, Or, Not, In,
  Fixed, Include, Exclude,
  
  // Constant values
  True, False, Null,

  // Meta tokens
  Unexpected, // Represents a token that could not be recognized
  EOF,        // Represents the end of the input string
}

/**
 * Represents a single token scanned from the source code.
 * It contains the token's type, its string value, and location information.
 */
export interface Token {
  type: TokenType;
  value: string; // The raw substring from the source code
  line: number;
  column: number;
  start: number; // The starting index of the token in the source string
  end: number;   // The ending index (exclusive) of the token in the source string
}

// A map of reserved keywords and their corresponding token types.
// Keywords are case-insensitive, so we store them in uppercase.
const keywords: Map<string, TokenType> = new Map([
  ['IF', TokenType.If],
  ['THEN', TokenType.Then],
  ['ELSE', TokenType.Else],
  ['ELSEIF', TokenType.Elseif],
  ['END', TokenType.End],
  ['CASE', TokenType.Case],
  ['WHEN', TokenType.When],
  ['AND', TokenType.And],
  ['OR', TokenType.Or],
  ['NOT', TokenType.Not],
  ['IN', TokenType.In],
  ['FIXED', TokenType.Fixed],
  ['INCLUDE', TokenType.Include],
  ['EXCLUDE', TokenType.Exclude],
  ['TRUE', TokenType.True],
  ['FALSE', TokenType.False],
  ['NULL', TokenType.Null],
]);

export function tokenize(source: string): Token[] {
    const tokens: Token[] = [];
    let start = 0;
    let current = 0;
    let line = 1;
    let lineStart = 0;

    function isAtEnd(): boolean {
        return current >= source.length;
    }

    function advance(): string {
        return source.charAt(current++);
    }

    function peek(): string {
        if (isAtEnd()) return '\0';
        return source.charAt(current);
    }

    function peekNext(): string {
        if (current + 1 >= source.length) return '\0';
        return source.charAt(current + 1);
    }

    function match(expected: string): boolean {
        if (isAtEnd()) return false;
        if (source.charAt(current) !== expected) return false;
        current++;
        return true;
    }

    function makeToken(type: TokenType): void {
        const value = source.substring(start, current);
        tokens.push({
            type,
            value,
            line,
            column: start - lineStart + 1,
            start,
            end: current,
        });
    }

    function skipWhitespaceAndComments(): void {
        while (true) {
            const char = peek();
            switch (char) {
                case ' ':
                case '\r':
                case '\t':
                    advance();
                    break;
                case '\n':
                    line++;
                    advance();
                    lineStart = current;
                    break;
                case '/':
                    if (peekNext() === '/') { // Line comment
                        while (peek() !== '\n' && !isAtEnd()) advance();
                    } else if (peekNext() === '*') { // Block comment
                        advance(); // consume /
                        advance(); // consume *
                        while (!(peek() === '*' && peekNext() === '/') && !isAtEnd()) {
                            if (peek() === '\n') {
                                line++;
                                lineStart = current + 1;
                            }
                            advance();
                        }
                        if (!isAtEnd()) {
                            advance(); // consume *
                            advance(); // consume /
                        }
                    } else {
                        return; // Not a comment, but a division operator. Exit the loop.
                    }
                    break;
                default:
                    return;
            }
        }
    }

    function scanString(quote: string): void {
        while (peek() !== quote && !isAtEnd()) {
            if (peek() === '\n') {
                line++;
                lineStart = current + 1;
            }
            // Handle escape sequences as defined in tmLanguage (any escaped char is valid)
            if (peek() === '\\' && peekNext() !== '\0') {
                advance();
            }
            advance();
        }

        if (isAtEnd()) {
            makeToken(TokenType.Unexpected); // Unterminated string
            return;
        }

        advance(); // Consume the closing quote
        makeToken(TokenType.String);
    }

    function scanNumber(): void {
        while (isDigit(peek())) advance();

        // Look for a fractional part
        if (peek() === '.' && isDigit(peekNext())) {
            advance(); // Consume the "."
            while (isDigit(peek())) advance();
        }

        makeToken(TokenType.Number);
    }

    function scanIdentifier(): void {
        while (isAlphaNumeric(peek())) advance();

        const text = source.substring(start, current);
        const type = keywords.get(text.toUpperCase()) ?? TokenType.Identifier;

        makeToken(type);
    }

    function scanFieldReference(): void {
        // Field references are enclosed in square brackets.
        // This simple implementation reads until the closing bracket.
        while (peek() !== ']' && !isAtEnd()) {
            if (peek() === '\n') {
                line++;
                lineStart = current + 1;
            }
            advance();
        }

        if (isAtEnd()) {
            makeToken(TokenType.Unexpected); // Unterminated field reference
            return;
        }

        advance(); // Consume the closing ']'
        makeToken(TokenType.FieldReference);
    }

    function isDigit(char: string): boolean {
        return char >= '0' && char <= '9';
    }

    function isAlpha(char: string): boolean {
        return (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || char === '_';
    }

    function isAlphaNumeric(char: string): boolean {
        return isAlpha(char) || isDigit(char);
    }

    while (!isAtEnd()) {
        skipWhitespaceAndComments();

        start = current;

        if (isAtEnd()) {
            break;
        }

        const char = advance();
        switch (char) {
            // Single-character punctuators
            case '(': makeToken(TokenType.LParen); break;
            case ')': makeToken(TokenType.RParen); break;
            case '{': makeToken(TokenType.LBrace); break;
            case '}': makeToken(TokenType.RBrace); break;
            case ',': makeToken(TokenType.Comma); break;
            case ':': makeToken(TokenType.Colon); break;
            case '+': makeToken(TokenType.Plus); break;
            case '-': makeToken(TokenType.Minus); break;
            case '*': makeToken(TokenType.Star); break;
            case '%': makeToken(TokenType.Percent); break;

            // Operators that might be two characters
            case '!': makeToken(match('=') ? TokenType.BangEqual : TokenType.Bang); break;
            case '=': makeToken(match('=') ? TokenType.EqualEqual : TokenType.Equal); break;
            case '<': makeToken(match('=') ? TokenType.LessEqual : TokenType.Less); break;
            case '>': makeToken(match('=') ? TokenType.GreaterEqual : TokenType.Greater); break;

            // The slash is for division; comments are handled by `skipWhitespaceAndComments`.
            case '/': makeToken(TokenType.Slash); break;

            // Strings
            case "'":
            case '"':
                scanString(char);
                break;

            // Field References
            case '[':
                scanFieldReference();
                break;

            default:
                if (isDigit(char)) {
                    scanNumber();
                } else if (isAlpha(char)) {
                    scanIdentifier();
                } else {
                    // If the character is not recognized, return an 'Unexpected' token.
                    makeToken(TokenType.Unexpected);
                }
                break;
        }
    }

    start = current;
    makeToken(TokenType.EOF);
    return tokens;
}
