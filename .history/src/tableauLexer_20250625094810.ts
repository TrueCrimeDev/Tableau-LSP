/**
 * @file lexer.ts
 * A lexer for the Tableau Calculation Language.
 * This file tokenizes a string of Tableau calculation syntax into a stream of tokens.
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
// Tableau keywords are case-insensitive, so we store them in uppercase.
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

/**
 * The Lexer class, which takes source code and breaks it into a sequence of tokens.
 */
export class Lexer {
  private readonly source: string;
  private start: number = 0;
  private current: number = 0;
  private line: number = 1;
  private lineStart: number = 0; // The index of the start of the current line

  constructor(source: string) {
    this.source = source;
  }

  /**
   * Scans and returns the next token from the source.
   * Call this method repeatedly to get all tokens from the input.
   * It returns an EOF token when the end of the source is reached.
   */
  public getNextToken(): Token {
    this.skipWhitespaceAndComments();
    
    this.start = this.current;

    if (this.isAtEnd()) {
      return this.makeToken(TokenType.EOF);
    }

    const char = this.advance();
    switch (char) {
      // Single-character punctuators
      case '(': return this.makeToken(TokenType.LParen);
      case ')': return this.makeToken(TokenType.RParen);
      case '{': return this.makeToken(TokenType.LBrace);
      case '}': return this.makeToken(TokenType.RBrace);
      case ',': return this.makeToken(TokenType.Comma);
      case ':': return this.makeToken(TokenType.Colon);
      case '+': return this.makeToken(TokenType.Plus);
      case '-': return this.makeToken(TokenType.Minus);
      case '*': return this.makeToken(TokenType.Star);
      case '%': return this.makeToken(TokenType.Percent);

      // Operators that might be two characters
      case '!': return this.makeToken(this.match('=') ? TokenType.BangEqual : TokenType.Bang);
      case '=': return this.makeToken(this.match('=') ? TokenType.EqualEqual : TokenType.Equal);
      case '<': return this.makeToken(this.match('=') ? TokenType.LessEqual : TokenType.Less);
      case '>': return this.makeToken(this.match('=') ? TokenType.GreaterEqual : TokenType.Greater);
      
      // The slash is for division; comments are handled by `skipWhitespaceAndComments`.
      case '/': return this.makeToken(TokenType.Slash);

      // Strings
      case "'":
      case '"':
        return this.scanString(char);

      // Field References
      case '[':
        return this.scanFieldReference();

      default:
        if (this.isDigit(char)) {
          return this.scanNumber();
        }
        if (this.isAlpha(char)) {
          return this.scanIdentifier();
        }
        // If the character is not recognized, return an 'Unexpected' token.
        return this.makeToken(TokenType.Unexpected);
    }
  }

  // --- Private Scanner Methods ---

  private skipWhitespaceAndComments(): void {
    while (true) {
      const char = this.peek();
      switch (char) {
        case ' ':
        case '\r':
        case '\t':
          this.advance();
          break;
        case '\n':
          this.line++;
          this.advance();
          this.lineStart = this.current;
          break;
        case '/':
          if (this.peekNext() === '/') { // Line comment
            while (this.peek() !== '\n' && !this.isAtEnd()) this.advance();
          } else if (this.peekNext() === '*') { // Block comment
            this.advance(); // consume /
            this.advance(); // consume *
            while (!(this.peek() === '*' && this.peekNext() === '/') && !this.isAtEnd()) {
              if (this.peek() === '\n') {
                this.line++;
                this.lineStart = this.current + 1;
              }
              this.advance();
            }
            if (!this.isAtEnd()) {
              this.advance(); // consume *
              this.advance(); // consume /
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

  private scanString(quote: string): Token {
    while (this.peek() !== quote && !this.isAtEnd()) {
      if (this.peek() === '\n') {
        this.line++;
        this.lineStart = this.current + 1;
      }
      // Handle escape sequences as defined in tmLanguage (any escaped char is valid)
      if (this.peek() === '\\' && this.peekNext() !== '\0') {
          this.advance();
      }
      this.advance();
    }
    
    if (this.isAtEnd()) {
      return this.makeToken(TokenType.Unexpected); // Unterminated string
    }
    
    this.advance(); // Consume the closing quote
    return this.makeToken(TokenType.String);
  }

  private scanNumber(): Token {
    while (this.isDigit(this.peek())) this.advance();
    
    // Look for a fractional part
    if (this.peek() === '.' && this.isDigit(this.peekNext())) {
      this.advance(); // Consume the "."
      while (this.isDigit(this.peek())) this.advance();
    }
    
    return this.makeToken(TokenType.Number);
  }
  
  private scanIdentifier(): Token {
    while (this.isAlphaNumeric(this.peek())) this.advance();
    
    const text = this.source.substring(this.start, this.current);
    const type = keywords.get(text.toUpperCase()) ?? TokenType.Identifier;
    
    return this.makeToken(type);
  }
  
  private scanFieldReference(): Token {
    // Tableau field references are enclosed in square brackets.
    // This simple implementation reads until the closing bracket.
    while (this.peek() !== ']' && !this.isAtEnd()) {
      if (this.peek() === '\n') {
        this.line++;
        this.lineStart = this.current + 1;
      }
      this.advance();
    }
    
    if (this.isAtEnd()) {
      return this.makeToken(TokenType.Unexpected); // Unterminated field reference
    }
    
    this.advance(); // Consume the closing ']'
    return this.makeToken(TokenType.FieldReference);
  }

  // --- Core Utility Methods ---

  private isAtEnd(): boolean {
    return this.current >= this.source.length;
  }
  
  private advance(): string {
    return this.source.charAt(this.current++);
  }

  private peek(): string {
    if (this.isAtEnd()) return '\0';
    return this.source.charAt(this.current);
  }

  private peekNext(): string {
    if (this.current + 1 >= this.source.length) return '\0';
    return this.source.charAt(this.current + 1);
  }

  private match(expected: string): boolean {
    if (this.isAtEnd()) return false;
    if (this.source.charAt(this.current) !== expected) return false;
    this.current++;
    return true;
  }

  private makeToken(type: TokenType): Token {
    const value = this.source.substring(this.start, this.current);
    return {
      type,
      value,
      line: this.line,
      column: this.start - this.lineStart + 1,
      start: this.start,
      end: this.current,
    };
  }

  // --- Character Classification Helpers ---

  private isDigit(char: string): boolean {
    return char >= '0' && char <= '9';
  }
  
  private isAlpha(char: string): boolean {
    return (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || char === '_';
  }
  
  private isAlphaNumeric(char: string): boolean {
    return this.isAlpha(char) || this.isDigit(char);
  }
}