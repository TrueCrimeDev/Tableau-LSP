

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
  LParen, RParen, LBrace, RBrace, LBracket, RBracket, Comma, Colon, Semicolon,

  // One or two character operators
  Plus, Minus, Star, Slash, Percent, Caret,
  Equal, EqualEqual, Bang, BangEqual,
  Greater, GreaterEqual, Less, LessEqual,

  // Literals
  Identifier,       // For functions (e.g., SUM, LEFT) and other names
  String,           // e.g., 'hello' or "world"
  Number,           // e.g., 123 or 45.6
  FieldReference,   // e.g., [Sales]
  DateLiteral,      // e.g., #2020-01-01# or #2020-01-01 12:00:00#

  // Trivia
  Comment,          // e.g. // line comment or /* block comment */
  Whitespace,       // reserved: whitespace runs (not currently emitted)

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

  // Aliases (same underlying values) kept for a stable public API.
  Multiply = Star,
  Divide = Slash,
  Modulo = Percent,
  NotEqual = BangEqual,
  ElseIf = Elseif,
  Error = Unexpected,
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
    let line = 0; // 0-based to match the LSP line/character convention
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
            column: start - lineStart, // 0-based column
            start,
            end: current,
        });
    }

    function skipWhitespace(): void {
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
                default:
                    return;
            }
        }
    }

    // Scans a comment as a token. The opening '/' has already been consumed by
    // the main loop; the caller has verified the next char is '/' or '*'.
    function scanComment(): void {
        if (match('/')) { // Line comment
            while (peek() !== '\n' && !isAtEnd()) advance();
        } else if (match('*')) { // Block comment
            while (!(peek() === '*' && peekNext() === '/') && !isAtEnd()) {
                if (peek() === '\n') {
                    line++;
                    lineStart = current + 1;
                }
                advance();
            }
            if (!isAtEnd()) {
                advance(); // consume '*'
                advance(); // consume '/'
            }
        }
        makeToken(TokenType.Comment);
    }

    function scanString(quote: string): void {
        while (!isAtEnd()) {
            const char = peek();

            if (char === quote) {
                // Tableau doubled-quote escaping: '' (or "") inside a string of
                // the matching quote is a literal quote, not a terminator.
                if (peekNext() === quote) {
                    advance(); // consume the first quote
                    advance(); // consume the second (escaped) quote
                    continue;
                }
                // A quote is a hard terminator in Tableau; the only in-string escape is
                // the doubled quote handled above. (A single apostrophe inside a
                // single-quoted string must be written as '' or the string uses ".)
                break; // closing quote
            }

            if (char === '\n') {
                line++;
                lineStart = current + 1;
            }
            // Handle escape sequences as defined in tmLanguage (any escaped char is valid)
            if (char === '\\' && peekNext() !== '\0') {
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
        // Field references are enclosed in square brackets. Tableau escapes a literal
        // ']' inside a name by doubling it (]]), so [a]]b] is the single field `a]b`.
        while (!isAtEnd()) {
            if (peek() === ']') {
                if (peekNext() === ']') {
                    advance(); // consume the first ']'
                    advance(); // consume the second (escaped) ']'
                    continue;
                }
                break; // closing ']'
            }
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

    // Scans a Tableau date literal: #...# (e.g. #2020-01-01# or #2020-01-01 12:00:00#).
    // The opening '#' has already been consumed by the main loop.
    function scanDateLiteral(): void {
        while (!isAtEnd() && peek() !== '#' && peek() !== '\n') {
            advance();
        }

        if (peek() !== '#') {
            makeToken(TokenType.Unexpected); // Unterminated date literal
            return;
        }

        advance(); // consume the closing '#'
        makeToken(TokenType.DateLiteral);
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
        skipWhitespace();

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
            case ';': makeToken(TokenType.Semicolon); break;
            case '+': makeToken(TokenType.Plus); break;
            case '-': makeToken(TokenType.Minus); break;
            case '*': makeToken(TokenType.Star); break;
            case '%': makeToken(TokenType.Percent); break;
            case '^': makeToken(TokenType.Caret); break; // Tableau power operator (e.g. [Profit]^2)

            // Operators that might be two characters
            case '!': makeToken(match('=') ? TokenType.BangEqual : TokenType.Bang); break;
            case '=': makeToken(match('=') ? TokenType.EqualEqual : TokenType.Equal); break;
            case '<':
                if (match('=')) makeToken(TokenType.LessEqual);
                else if (match('>')) makeToken(TokenType.BangEqual); // Tableau '<>' is not-equal
                else makeToken(TokenType.Less);
                break;
            case '>': makeToken(match('=') ? TokenType.GreaterEqual : TokenType.Greater); break;

            // '/' starts a comment (// or /*), otherwise it is the division operator.
            case '/':
                if (peek() === '/' || peek() === '*') {
                    scanComment();
                } else {
                    makeToken(TokenType.Slash);
                }
                break;

            // Strings
            case "'":
            case '"':
                scanString(char);
                break;

            // Field References
            case '[':
                scanFieldReference();
                break;

            // Date literals
            case '#':
                scanDateLiteral();
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
