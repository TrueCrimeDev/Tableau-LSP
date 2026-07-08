// src/tests/unit/slashCommandProvider.test.ts

// The source module imports the VS Code extension API ("vscode"), which is not
// resolvable under Jest. The functional facade under test does not use it, so a
// minimal virtual mock is enough to let the module load.
jest.mock('vscode', () => ({}), { virtual: true });

import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position, CompletionItem, CompletionItemKind } from 'vscode-languageserver';
import { provideSlashCommandCompletion, getSlashCommandHelp, validateSlashCommand } from '../../slashCommandProvider.js';

describe('Slash Command Provider', () => {
    function createTestDocument(content: string): TextDocument {
        return TextDocument.create('test://test.twbl', 'tableau', 1, content);
    }

    describe('Slash Command Completion', () => {
        it('should provide slash command completions after /', () => {
            const document = createTestDocument('/');
            const position: Position = { line: 0, character: 1 };
            
            const completions = provideSlashCommandCompletion(document, position);
            
            expect(completions).toBeDefined();
            expect(completions.length).toBeGreaterThan(0);
            
            // Should include common slash commands
            const commandLabels = completions.map(c => c.label);
            expect(commandLabels).toContain('if');
            expect(commandLabels).toContain('case');
            expect(commandLabels).toContain('sum');
            expect(commandLabels).toContain('avg');
        });

        it('should filter completions based on partial input', () => {
            const document = createTestDocument('/su');
            const position: Position = { line: 0, character: 3 };
            
            const completions = provideSlashCommandCompletion(document, position);
            
            expect(completions).toBeDefined();
            expect(completions.length).toBeGreaterThan(0);
            
            // Should only include commands starting with 'su'
            const commandLabels = completions.map(c => c.label);
            expect(commandLabels).toContain('sum');
            expect(commandLabels.every(label => label.startsWith('su'))).toBe(true);
        });

        it('should not provide completions when not after /', () => {
            const document = createTestDocument('SUM([Sales])');
            const position: Position = { line: 0, character: 5 };
            
            const completions = provideSlashCommandCompletion(document, position);
            
            expect(completions).toEqual([]);
        });

        it('should provide completions in the middle of expressions', () => {
            const document = createTestDocument('IF [Sales] > 100 THEN / ELSE "Low" END');
            const position: Position = { line: 0, character: 24 }; // After the /
            
            const completions = provideSlashCommandCompletion(document, position);
            
            expect(completions).toBeDefined();
            expect(completions.length).toBeGreaterThan(0);
        });

        it('should handle multi-line documents', () => {
            const document = createTestDocument(`
                IF [Sales] > 100 THEN
                    /
                ELSE
                    "Low"
                END
            `);
            const position: Position = { line: 2, character: 21 }; // After the /
            
            const completions = provideSlashCommandCompletion(document, position);
            
            expect(completions).toBeDefined();
            expect(completions.length).toBeGreaterThan(0);
        });
    });

    describe('Command Categories', () => {
        it('should provide aggregate function commands', () => {
            const document = createTestDocument('/agg');
            const position: Position = { line: 0, character: 4 };
            
            const completions = provideSlashCommandCompletion(document, position);
            
            const aggregateCommands = completions.filter(c => 
                ['sum', 'avg', 'count', 'min', 'max'].includes(c.label)
            );
            
            expect(aggregateCommands.length).toBeGreaterThan(0);
            aggregateCommands.forEach(cmd => {
                expect(cmd.kind).toBe(CompletionItemKind.Function);
            });
        });

        it('should provide string function commands', () => {
            const document = createTestDocument('/str');
            const position: Position = { line: 0, character: 4 };
            
            const completions = provideSlashCommandCompletion(document, position);
            
            const stringCommands = completions.filter(c => 
                ['left', 'right', 'mid', 'len', 'upper', 'lower'].includes(c.label)
            );
            
            expect(stringCommands.length).toBeGreaterThan(0);
            stringCommands.forEach(cmd => {
                expect(cmd.kind).toBe(CompletionItemKind.Function);
            });
        });

        it('should provide date function commands', () => {
            const document = createTestDocument('/date');
            const position: Position = { line: 0, character: 5 };
            
            const completions = provideSlashCommandCompletion(document, position);
            
            const dateCommands = completions.filter(c => 
                ['dateadd', 'datediff', 'datepart', 'year', 'month', 'day'].includes(c.label)
            );
            
            expect(dateCommands.length).toBeGreaterThan(0);
            dateCommands.forEach(cmd => {
                expect(cmd.kind).toBe(CompletionItemKind.Function);
            });
        });

        it('should provide control flow commands', () => {
            const document = createTestDocument('/');
            const position: Position = { line: 0, character: 1 };
            
            const completions = provideSlashCommandCompletion(document, position);
            
            const controlCommands = completions.filter(c => 
                ['if', 'case', 'iif'].includes(c.label)
            );
            
            expect(controlCommands.length).toBeGreaterThan(0);
            controlCommands.forEach(cmd => {
                expect(cmd.kind).toBe(CompletionItemKind.Keyword);
            });
        });

        it('should provide LOD expression commands', () => {
            const document = createTestDocument('/lod');
            const position: Position = { line: 0, character: 4 };
            
            const completions = provideSlashCommandCompletion(document, position);
            
            const lodCommands = completions.filter(c => 
                ['fixed', 'include', 'exclude'].includes(c.label)
            );
            
            expect(lodCommands.length).toBeGreaterThan(0);
            lodCommands.forEach(cmd => {
                expect(cmd.kind).toBe(CompletionItemKind.Keyword);
            });
        });
    });

    describe('Command Details and Documentation', () => {
        it('should provide detailed information for commands', () => {
            const document = createTestDocument('/sum');
            const position: Position = { line: 0, character: 4 };
            
            const completions = provideSlashCommandCompletion(document, position);
            const sumCommand = completions.find(c => c.label === 'sum');
            
            expect(sumCommand).toBeDefined();
            expect(sumCommand?.detail).toBeDefined();
            expect(sumCommand?.documentation).toBeDefined();
            expect(sumCommand?.insertText).toBeDefined();
        });

        it('should provide insert text with placeholders', () => {
            const document = createTestDocument('/if');
            const position: Position = { line: 0, character: 3 };
            
            const completions = provideSlashCommandCompletion(document, position);
            const ifCommand = completions.find(c => c.label === 'if');
            
            expect(ifCommand).toBeDefined();
            expect(ifCommand?.insertText).toContain('${');
            expect(ifCommand?.insertText).toContain('THEN');
            expect(ifCommand?.insertText).toContain('ELSE');
            expect(ifCommand?.insertText).toContain('END');
        });

        it('should provide function signatures in insert text', () => {
            const document = createTestDocument('/dateadd');
            const position: Position = { line: 0, character: 8 };
            
            const completions = provideSlashCommandCompletion(document, position);
            const dateaddCommand = completions.find(c => c.label === 'dateadd');
            
            expect(dateaddCommand).toBeDefined();
            expect(dateaddCommand?.insertText).toContain('(');
            expect(dateaddCommand?.insertText).toContain(')');
            expect(dateaddCommand?.insertText).toContain('${');
        });

        it('should provide appropriate completion item kinds', () => {
            const document = createTestDocument('/');
            const position: Position = { line: 0, character: 1 };
            
            const completions = provideSlashCommandCompletion(document, position);
            
            completions.forEach(completion => {
                expect([
                    CompletionItemKind.Function,
                    CompletionItemKind.Keyword,
                    CompletionItemKind.Snippet
                ]).toContain(completion.kind);
            });
        });
    });

    describe('Slash Command Help', () => {
        it('should provide help for specific commands', () => {
            const help = getSlashCommandHelp('sum');
            
            expect(help).toBeDefined();
            expect(help.command).toBe('sum');
            expect(help.description).toBeDefined();
            expect(help.syntax).toBeDefined();
            expect(help.examples).toBeDefined();
            expect(help.examples.length).toBeGreaterThan(0);
        });

        it('should provide help for control flow commands', () => {
            const help = getSlashCommandHelp('if');
            
            expect(help).toBeDefined();
            expect(help.command).toBe('if');
            expect(help.description).toContain('conditional');
            expect(help.syntax).toContain('THEN');
            expect(help.syntax).toContain('ELSE');
            expect(help.syntax).toContain('END');
        });

        it('should provide help for LOD expressions', () => {
            const help = getSlashCommandHelp('fixed');
            
            expect(help).toBeDefined();
            expect(help.command).toBe('fixed');
            expect(help.description).toContain('Level of Detail');
            expect(help.syntax).toContain('{');
            expect(help.syntax).toContain('}');
        });

        it('should return undefined for unknown commands', () => {
            const help = getSlashCommandHelp('unknown-command');
            expect(help).toBeUndefined();
        });

        it('should provide comprehensive examples', () => {
            const help = getSlashCommandHelp('case');
            
            expect(help).toBeDefined();
            expect(help.examples).toBeDefined();
            expect(help.examples.length).toBeGreaterThan(0);
            
            help.examples.forEach(example => {
                expect(example.code).toBeDefined();
                expect(example.description).toBeDefined();
            });
        });
    });

    describe('Command Validation', () => {
        it('should validate correct slash command usage', () => {
            const validation = validateSlashCommand('/sum([Sales])');
            
            expect(validation.isValid).toBe(true);
            expect(validation.errors).toHaveLength(0);
        });

        it('should detect invalid slash command syntax', () => {
            const validation = validateSlashCommand('/sum(');
            
            expect(validation.isValid).toBe(false);
            expect(validation.errors.length).toBeGreaterThan(0);
            expect(validation.errors[0].message).toContain('syntax');
        });

        it('should detect unknown slash commands', () => {
            const validation = validateSlashCommand('/unknowncommand');
            
            expect(validation.isValid).toBe(false);
            expect(validation.errors.length).toBeGreaterThan(0);
            expect(validation.errors[0].message).toContain('unknown');
        });

        it('should validate complex slash command expressions', () => {
            const validation = validateSlashCommand('/if([Sales] > 100, "High", "Low")');
            
            expect(validation.isValid).toBe(true);
            expect(validation.errors).toHaveLength(0);
        });

        it('should provide suggestions for invalid commands', () => {
            const validation = validateSlashCommand('/summ([Sales])');
            
            expect(validation.isValid).toBe(false);
            expect(validation.suggestions).toBeDefined();
            expect(validation.suggestions?.length).toBeGreaterThan(0);
            expect(validation.suggestions).toContain('sum');
        });
    });

    describe('Context-Aware Completions', () => {
        it('should provide relevant completions based on context', () => {
            const document = createTestDocument('IF [Sales] > 100 THEN /');
            const position: Position = { line: 0, character: 24 };
            
            const completions = provideSlashCommandCompletion(document, position);
            
            // In a THEN clause, should prioritize value-returning functions
            const valueCommands = completions.filter(c => 
                ['sum', 'avg', 'count', 'left', 'right'].includes(c.label)
            );
            
            expect(valueCommands.length).toBeGreaterThan(0);
        });

        it('should prioritize aggregate functions in appropriate contexts', () => {
            const document = createTestDocument('{ FIXED [Region] : / }');
            const position: Position = { line: 0, character: 19 };
            
            const completions = provideSlashCommandCompletion(document, position);
            
            // In LOD expression, should prioritize aggregate functions
            const aggregateCommands = completions.filter(c => 
                ['sum', 'avg', 'count', 'min', 'max'].includes(c.label)
            );
            
            expect(aggregateCommands.length).toBeGreaterThan(0);
            
            // Aggregate functions should appear early in the list
            const firstFew = completions.slice(0, 10).map(c => c.label);
            expect(firstFew.some(label => ['sum', 'avg', 'count'].includes(label))).toBe(true);
        });

        it('should handle nested expression contexts', () => {
            const document = createTestDocument('CASE [Category] WHEN "Furniture" THEN / ELSE "Other" END');
            const position: Position = { line: 0, character: 43 };
            
            const completions = provideSlashCommandCompletion(document, position);
            
            expect(completions).toBeDefined();
            expect(completions.length).toBeGreaterThan(0);
        });
    });

    describe('Performance and Edge Cases', () => {
        it('should handle large documents efficiently', () => {
            const largeContent = 'SUM([Sales])\n'.repeat(1000) + '/';
            const document = createTestDocument(largeContent);
            const position: Position = { line: 1000, character: 1 };
            
            const startTime = Date.now();
            const completions = provideSlashCommandCompletion(document, position);
            const duration = Date.now() - startTime;
            
            expect(duration).toBeLessThan(100); // Should be fast
            expect(completions).toBeDefined();
        });

        it('should handle malformed documents gracefully', () => {
            const malformedContent = 'IF [Sales] > 100 THEN THEN ELSE / END';
            const document = createTestDocument(malformedContent);
            const position: Position = { line: 0, character: 33 };
            
            expect(() => {
                const completions = provideSlashCommandCompletion(document, position);
                expect(Array.isArray(completions)).toBe(true);
            }).not.toThrow();
        });

        it('should handle edge positions in documents', () => {
            const document = createTestDocument('/');
            
            // Test various edge positions
            const positions = [
                { line: 0, character: 0 },  // Before /
                { line: 0, character: 1 },  // After /
                { line: 0, character: 2 },  // Beyond end
                { line: 1, character: 0 }   // Next line
            ];
            
            positions.forEach(position => {
                expect(() => {
                    const completions = provideSlashCommandCompletion(document, position);
                    expect(Array.isArray(completions)).toBe(true);
                }).not.toThrow();
            });
        });

        it('should handle empty documents', () => {
            const document = createTestDocument('');
            const position: Position = { line: 0, character: 0 };
            
            const completions = provideSlashCommandCompletion(document, position);
            expect(completions).toEqual([]);
        });

        it('should handle documents with only whitespace', () => {
            const document = createTestDocument('   \n  \t  \n   ');
            const position: Position = { line: 1, character: 2 };
            
            const completions = provideSlashCommandCompletion(document, position);
            expect(completions).toEqual([]);
        });
    });

    describe('Integration with Other Features', () => {
        it('should work with field references in commands', () => {
            const document = createTestDocument('/sum([');
            const position: Position = { line: 0, character: 6 };
            
            const completions = provideSlashCommandCompletion(document, position);
            
            // Should still provide completions even with incomplete field reference
            expect(Array.isArray(completions)).toBe(true);
        });

        it('should handle commands with string literals', () => {
            const document = createTestDocument('/left("Hello World", /');
            const position: Position = { line: 0, character: 21 };
            
            const completions = provideSlashCommandCompletion(document, position);
            
            expect(completions).toBeDefined();
            expect(completions.length).toBeGreaterThan(0);
        });

        it('should work with nested function calls', () => {
            const document = createTestDocument('/sum(/avg([Sales]))');
            const position: Position = { line: 0, character: 6 };
            
            const completions = provideSlashCommandCompletion(document, position);
            
            expect(completions).toBeDefined();
            expect(completions.length).toBeGreaterThan(0);
        });
    });
});
