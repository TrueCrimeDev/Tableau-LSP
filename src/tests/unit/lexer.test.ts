// src/tests/unit/lexer.test.ts

import { tokenize, TokenType } from '../../lexer.js';

describe('Lexer', () => {
    describe('Basic Tokenization', () => {
        it('should tokenize simple function calls', () => {
            const tokens = tokenize('SUM([Sales])');
            
            expect(tokens).toBeDefined();
            expect(tokens.length).toBeGreaterThan(0);
            
            // Should have function name, parentheses, field reference.
            // In Tableau, [Sales] is a single FieldReference token (not split brackets).
            const tokenTypes = tokens.map(t => t.type);
            expect(tokenTypes).toContain(TokenType.Identifier);     // SUM
            expect(tokenTypes).toContain(TokenType.LParen);         // (
            expect(tokenTypes).toContain(TokenType.FieldReference); // [Sales]
            expect(tokenTypes).toContain(TokenType.RParen);         // )
        });
        
        it('should tokenize field references', () => {
            const tokens = tokenize('[Sales]');

            // [Sales] is one FieldReference token whose value keeps the brackets.
            expect(tokens.length).toBeGreaterThanOrEqual(2); // [Sales], EOF
            expect(tokens[0].type).toBe(TokenType.FieldReference);
            expect(tokens[0].value).toBe('[Sales]');
        });

        it('should tokenize field references with spaces', () => {
            const tokens = tokenize('[Customer Name]');

            // Spaces are preserved inside the single FieldReference token.
            expect(tokens.length).toBeGreaterThanOrEqual(2);
            expect(tokens[0].type).toBe(TokenType.FieldReference);
            expect(tokens[0].value).toContain('Customer');
        });
        
        it('should tokenize string literals', () => {
            const tokens = tokenize('"Hello World"');
            
            expect(tokens.length).toBeGreaterThanOrEqual(1);
            const stringToken = tokens.find(t => t.type === TokenType.String);
            expect(stringToken).toBeDefined();
            expect(stringToken?.value).toBe('"Hello World"');
        });
        
        it('should tokenize single-quoted strings', () => {
            const tokens = tokenize('\'Hello World\'');
            
            expect(tokens.length).toBeGreaterThanOrEqual(1);
            const stringToken = tokens.find(t => t.type === TokenType.String);
            expect(stringToken).toBeDefined();
            expect(stringToken?.value).toBe('\'Hello World\'');
        });
        
        it('should tokenize numeric literals', () => {
            const tokens = tokenize('123.45');
            
            expect(tokens.length).toBeGreaterThanOrEqual(1);
            const numberToken = tokens.find(t => t.type === TokenType.Number);
            expect(numberToken).toBeDefined();
            expect(numberToken?.value).toBe('123.45');
        });
        
        it('should tokenize integer literals', () => {
            const tokens = tokenize('42');
            
            expect(tokens.length).toBeGreaterThanOrEqual(1);
            const numberToken = tokens.find(t => t.type === TokenType.Number);
            expect(numberToken).toBeDefined();
            expect(numberToken?.value).toBe('42');
        });
    });
    
    describe('Operator Tokenization', () => {
        it('should tokenize arithmetic operators', () => {
            const tokens = tokenize('+ - * / %');
            
            const operatorTokens = tokens.filter(t => 
                t.type === TokenType.Plus ||
                t.type === TokenType.Minus ||
                t.type === TokenType.Multiply ||
                t.type === TokenType.Divide ||
                t.type === TokenType.Modulo
            );
            
            expect(operatorTokens.length).toBe(5);
        });
        
        it('should tokenize comparison operators', () => {
            const tokens = tokenize('> < >= <= = <>');
            
            const comparisonTokens = tokens.filter(t => 
                t.type === TokenType.Greater ||
                t.type === TokenType.Less ||
                t.type === TokenType.GreaterEqual ||
                t.type === TokenType.LessEqual ||
                t.type === TokenType.Equal ||
                t.type === TokenType.NotEqual
            );
            
            expect(comparisonTokens.length).toBe(6);
        });
        
        it('should tokenize logical operators', () => {
            const tokens = tokenize('AND OR NOT');
            
            const logicalTokens = tokens.filter(t => 
                t.type === TokenType.And ||
                t.type === TokenType.Or ||
                t.type === TokenType.Not
            );
            
            expect(logicalTokens.length).toBe(3);
        });
    });
    
    describe('Keyword Tokenization', () => {
        it('should tokenize IF/THEN/ELSE/END keywords', () => {
            const tokens = tokenize('IF THEN ELSE ELSEIF END');
            
            const keywordTokens = tokens.filter(t => 
                t.type === TokenType.If ||
                t.type === TokenType.Then ||
                t.type === TokenType.Else ||
                t.type === TokenType.ElseIf ||
                t.type === TokenType.End
            );
            
            expect(keywordTokens.length).toBe(5);
        });
        
        it('should tokenize CASE/WHEN keywords', () => {
            const tokens = tokenize('CASE WHEN');
            
            const caseTokens = tokens.filter(t => 
                t.type === TokenType.Case ||
                t.type === TokenType.When
            );
            
            expect(caseTokens.length).toBe(2);
        });
        
        it('should tokenize LOD keywords', () => {
            const tokens = tokenize('FIXED INCLUDE EXCLUDE');
            
            const lodTokens = tokens.filter(t => 
                t.type === TokenType.Fixed ||
                t.type === TokenType.Include ||
                t.type === TokenType.Exclude
            );
            
            expect(lodTokens.length).toBe(3);
        });
    });
    
    describe('Delimiter Tokenization', () => {
        it('should tokenize parentheses', () => {
            const tokens = tokenize('()');
            
            expect(tokens.some(t => t.type === TokenType.LParen)).toBe(true);
            expect(tokens.some(t => t.type === TokenType.RParen)).toBe(true);
        });
        
        it('should tokenize brackets', () => {
            const tokens = tokenize('[]');

            // [...] is lexed as a single FieldReference token in Tableau.
            expect(tokens.some(t => t.type === TokenType.FieldReference)).toBe(true);
        });
        
        it('should tokenize braces', () => {
            const tokens = tokenize('{}');
            
            expect(tokens.some(t => t.type === TokenType.LBrace)).toBe(true);
            expect(tokens.some(t => t.type === TokenType.RBrace)).toBe(true);
        });
        
        it('should tokenize commas and semicolons', () => {
            const tokens = tokenize(',;');
            
            expect(tokens.some(t => t.type === TokenType.Comma)).toBe(true);
            expect(tokens.some(t => t.type === TokenType.Semicolon)).toBe(true);
        });
    });
    
    describe('Complex Expression Tokenization', () => {
        it('should tokenize IF expressions', () => {
            const tokens = tokenize('IF [Sales] > 100 THEN "High" ELSE "Low" END');

            // [Sales] is a single token, so the stream is 10 tokens incl. EOF.
            expect(tokens.length).toBeGreaterThanOrEqual(10);
            
            // Should contain all expected token types
            const tokenTypes = tokens.map(t => t.type);
            expect(tokenTypes).toContain(TokenType.If);
            expect(tokenTypes).toContain(TokenType.Then);
            expect(tokenTypes).toContain(TokenType.Else);
            expect(tokenTypes).toContain(TokenType.End);
            expect(tokenTypes).toContain(TokenType.Greater);
        });
        
        it('should tokenize CASE expressions', () => {
            const tokens = tokenize('CASE [Category] WHEN "Furniture" THEN 1 ELSE 0 END');
            
            const tokenTypes = tokens.map(t => t.type);
            expect(tokenTypes).toContain(TokenType.Case);
            expect(tokenTypes).toContain(TokenType.When);
            expect(tokenTypes).toContain(TokenType.Then);
            expect(tokenTypes).toContain(TokenType.Else);
            expect(tokenTypes).toContain(TokenType.End);
        });
        
        it('should tokenize LOD expressions', () => {
            const tokens = tokenize('{ FIXED [Region] : SUM([Sales]) }');
            
            const tokenTypes = tokens.map(t => t.type);
            expect(tokenTypes).toContain(TokenType.LBrace);
            expect(tokenTypes).toContain(TokenType.Fixed);
            expect(tokenTypes).toContain(TokenType.Colon);
            expect(tokenTypes).toContain(TokenType.RBrace);
        });
        
        it('should tokenize nested function calls', () => {
            const tokens = tokenize('SUM(AVG([Sales]))');
            
            const identifiers = tokens.filter(t => t.type === TokenType.Identifier);
            // SUM and AVG are identifiers; Sales lives inside the FieldReference token.
            expect(identifiers.length).toBeGreaterThanOrEqual(2);
            
            const parens = tokens.filter(t => 
                t.type === TokenType.LParen || t.type === TokenType.RParen
            );
            expect(parens.length).toBe(4); // Two opening, two closing
        });
    });
    
    describe('Whitespace and Comments', () => {
        it('should handle whitespace correctly', () => {
            const tokens = tokenize('SUM ( [Sales] )');
            
            // Whitespace should be handled but not necessarily tokenized
            const nonWhitespaceTokens = tokens.filter(t => t.type !== TokenType.Whitespace);
            expect(nonWhitespaceTokens.length).toBeGreaterThan(0);
        });
        
        it('should tokenize single-line comments', () => {
            const tokens = tokenize('SUM([Sales]) // This is a comment');
            
            const commentToken = tokens.find(t => t.type === TokenType.Comment);
            expect(commentToken).toBeDefined();
            expect(commentToken?.value).toContain('This is a comment');
        });
        
        it('should tokenize multi-line comments', () => {
            const tokens = tokenize('SUM([Sales]) /* Multi\nline\ncomment */');
            
            const commentToken = tokens.find(t => t.type === TokenType.Comment);
            expect(commentToken).toBeDefined();
            expect(commentToken?.value).toContain('Multi');
        });
    });
    
    describe('Position Information', () => {
        it('should provide accurate line and column information', () => {
            const tokens = tokenize('SUM([Sales])');
            
            tokens.forEach(token => {
                expect(token.line).toBeGreaterThanOrEqual(0);
                expect(token.column).toBeGreaterThanOrEqual(0);
            });
            
            // First token should be at line 0, column 0
            expect(tokens[0].line).toBe(0);
            expect(tokens[0].column).toBe(0);
        });
        
        it('should handle multi-line input correctly', () => {
            const tokens = tokenize('SUM([Sales])\nAVG([Profit])');
            
            const secondLineTokens = tokens.filter(t => t.line === 1);
            expect(secondLineTokens.length).toBeGreaterThan(0);
            
            // First token on second line should be at column 0
            const firstSecondLineToken = secondLineTokens[0];
            expect(firstSecondLineToken.column).toBe(0);
        });
    });
    
    describe('Error Handling', () => {
        it('should handle empty input', () => {
            const tokens = tokenize('');
            
            expect(tokens).toBeDefined();
            expect(Array.isArray(tokens)).toBe(true);
            // Should have at least EOF token
            expect(tokens.length).toBeGreaterThanOrEqual(1);
            expect(tokens[tokens.length - 1].type).toBe(TokenType.EOF);
        });
        
        it('should handle whitespace-only input', () => {
            const tokens = tokenize('   \n  \t  ');
            
            expect(tokens).toBeDefined();
            expect(Array.isArray(tokens)).toBe(true);
        });
        
        it('should handle invalid characters gracefully', () => {
            const tokens = tokenize('SUM([Sales]) @#$');
            
            expect(tokens).toBeDefined();
            expect(Array.isArray(tokens)).toBe(true);
            
            // Should still tokenize the valid parts
            const identifiers = tokens.filter(t => t.type === TokenType.Identifier);
            expect(identifiers.some(t => t.value === 'SUM')).toBe(true);
            // Sales is captured inside the FieldReference token, not as an identifier.
            expect(tokens.some(t => t.type === TokenType.FieldReference && t.value.includes('Sales'))).toBe(true);
        });
        
        it('should handle unclosed strings', () => {
            const tokens = tokenize('"Unclosed string');
            
            expect(tokens).toBeDefined();
            expect(Array.isArray(tokens)).toBe(true);
            
            // Should handle gracefully, possibly with error token
            const stringTokens = tokens.filter(t => 
                t.type === TokenType.String || t.type === TokenType.Error
            );
            expect(stringTokens.length).toBeGreaterThan(0);
        });
        
        it('should handle unmatched delimiters', () => {
            const tokens = tokenize('SUM([Sales]');
            
            expect(tokens).toBeDefined();
            expect(Array.isArray(tokens)).toBe(true);
            
            // Should still tokenize what it can
            const identifiers = tokens.filter(t => t.type === TokenType.Identifier);
            expect(identifiers.some(t => t.value === 'SUM')).toBe(true);
        });
    });
    
    describe('Performance', () => {
        it('should tokenize quickly for normal input', () => {
            const input = 'IF [Sales] > 100 THEN SUM([Profit]) ELSE AVG([Discount]) END';
            
            const startTime = Date.now();
            const tokens = tokenize(input);
            const duration = Date.now() - startTime;
            
            expect(tokens).toBeDefined();
            expect(duration).toBeLessThan(50); // Should be very fast
        });
        
        it('should handle large input efficiently', () => {
            const largeInput = Array.from({ length: 1000 }, (_, i) => 
                `SUM([Field${i}])`
            ).join(' + ');
            
            const startTime = Date.now();
            const tokens = tokenize(largeInput);
            const duration = Date.now() - startTime;
            
            expect(tokens).toBeDefined();
            expect(duration).toBeLessThan(500); // Should handle large input
        });
    });
    
    describe('Token Properties', () => {
        it('should provide complete token information', () => {
            const tokens = tokenize('SUM([Sales])');
            
            tokens.forEach(token => {
                expect(token).toHaveProperty('type');
                expect(token).toHaveProperty('value');
                expect(token).toHaveProperty('line');
                expect(token).toHaveProperty('column');
                
                expect(typeof token.type).toBe('number');
                expect(typeof token.value).toBe('string');
                expect(typeof token.line).toBe('number');
                expect(typeof token.column).toBe('number');
            });
        });
        
        it('should have EOF token at the end', () => {
            const tokens = tokenize('SUM([Sales])');
            
            expect(tokens.length).toBeGreaterThan(0);
            expect(tokens[tokens.length - 1].type).toBe(TokenType.EOF);
        });
        
        it('should maintain token order', () => {
            const tokens = tokenize('SUM([Sales])');
            
            // Tokens should be in order of appearance
            let lastPosition = -1;
            tokens.forEach(token => {
                const position = token.line * 1000 + token.column;
                expect(position).toBeGreaterThanOrEqual(lastPosition);
                lastPosition = position;
            });
        });
    });
});
