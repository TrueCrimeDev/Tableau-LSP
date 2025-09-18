// src/tests/unit/multiLineFormatting.test.ts

import { TextDocument } from 'vscode-languageserver-textdocument';
import { FormattingOptions } from 'vscode-languageserver';
import { format, MultiLineFormattingAPI } from '../../format';

describe('Multi-Line Expression Formatting', () => {
  describe('Basic Multi-Line Formatting', () => {
    it('should preserve logical line breaks in IF statements', () => {
      const document = createTestDocument(`
        IF [Sales] > 100
        THEN "High Sales"
        ELSE "Low Sales"
        END
      `);
      
      const options: FormattingOptions = { tabSize: 4, insertSpaces: true };
      const edits = format(document, options);
      
      expect(edits.length).toBe(1);
      const formattedText = edits[0].newText;
      
      // Should preserve the multi-line structure
      expect(formattedText).toContain('IF [Sales] > 100');
      expect(formattedText).toContain('THEN "High Sales"');
      expect(formattedText).toContain('ELSE "Low Sales"');
      expect(formattedText).toContain('END');
      
      // Should have proper indentation
      const lines = formattedText.split('\n');
      expect(lines.some(line => line.includes('    THEN'))).toBe(true);
      expect(lines.some(line => line.includes('    ELSE'))).toBe(true);
    });

    it('should format complex nested IF statements', () => {
      const document = createTestDocument(`
        IF [Sales] > 100 THEN
          IF [Profit] > 50 THEN
            "High Value"
          ELSE
            "Medium Value"
          END
        ELSE
          "Low Value"
        END
      `);
      
      const options: FormattingOptions = { tabSize: 4, insertSpaces: true };
      const edits = format(document, options);
      
      expect(edits.length).toBe(1);
      const formattedText = edits[0].newText;
      
      // Should have proper nested indentation
      const lines = formattedText.split('\n').map(line => line.trimEnd());
      const nonEmptyLines = lines.filter(line => line.trim());
      
      expect(nonEmptyLines.length).toBeGreaterThan(5);
      
      // Check indentation levels
      const ifLine = nonEmptyLines.find(line => line.includes('IF [Sales]'));
      const nestedIfLine = nonEmptyLines.find(line => line.includes('IF [Profit]'));
      const highValueLine = nonEmptyLines.find(line => line.includes('"High Value"'));
      
      expect(ifLine).toBeDefined();
      expect(nestedIfLine).toBeDefined();
      expect(highValueLine).toBeDefined();
      
      // Nested IF should be more indented than outer IF
      if (nestedIfLine && ifLine) {
        expect(nestedIfLine.search(/\S/)).toBeGreaterThan(ifLine.search(/\S/));
      }
    });

    it('should format CASE statements with proper line breaks', () => {
      const document = createTestDocument(`
        CASE [Category]
          WHEN 'Furniture' THEN 'F'
          WHEN 'Technology' THEN 'T'
          ELSE 'O'
        END
      `);
      
      const options: FormattingOptions = { tabSize: 4, insertSpaces: true };
      const edits = format(document, options);
      
      expect(edits.length).toBe(1);
      const formattedText = edits[0].newText;
      
      // Should preserve CASE structure
      expect(formattedText).toContain('CASE [Category]');
      expect(formattedText).toContain('WHEN \'Furniture\'');
      expect(formattedText).toContain('WHEN \'Technology\'');
      expect(formattedText).toContain('ELSE \'O\'');
      expect(formattedText).toContain('END');
    });
  });

  describe('LOD Expression Formatting', () => {
    it('should format simple LOD expressions', () => {
      const document = createTestDocument('{ FIXED [Region] : SUM([Sales]) }');
      
      const options: FormattingOptions = { tabSize: 4, insertSpaces: true };
      const edits = format(document, options);
      
      expect(edits.length).toBe(1);
      const formattedText = edits[0].newText;
      
      expect(formattedText).toContain('{ FIXED [Region] : SUM([Sales]) }');
    });

    it('should format complex LOD expressions with line breaks', () => {
      const document = createTestDocument(`
        {
          FIXED [Region], [Category] :
          SUM([Sales]) / SUM([Quantity])
        }
      `);
      
      const options: FormattingOptions = { tabSize: 4, insertSpaces: true };
      const edits = format(document, options);
      
      expect(edits.length).toBe(1);
      const formattedText = edits[0].newText;
      
      // Should preserve the multi-line LOD structure
      expect(formattedText).toContain('FIXED');
      expect(formattedText).toContain('SUM([Sales])');
    });
  });

  describe('Function Call Formatting', () => {
    it('should format simple function calls on single line', () => {
      const document = createTestDocument('SUM([Sales])');
      
      const options: FormattingOptions = { tabSize: 4, insertSpaces: true };
      const edits = format(document, options);
      
      expect(edits.length).toBe(1);
      const formattedText = edits[0].newText;
      
      expect(formattedText.trim()).toBe('SUM([Sales])');
    });

    it('should format complex nested function calls', () => {
      const document = createTestDocument('IIF([Sales] > 100, SUM([Profit]), AVG([Discount]))');
      
      const options: FormattingOptions = { tabSize: 4, insertSpaces: true };
      const edits = format(document, options);
      
      expect(edits.length).toBe(1);
      const formattedText = edits[0].newText;
      
      // Should maintain proper spacing
      expect(formattedText).toContain('IIF(');
      expect(formattedText).toContain('[Sales] > 100');
      expect(formattedText).toContain('SUM([Profit])');
      expect(formattedText).toContain('AVG([Discount])');
    });
  });

  describe('Operator Formatting', () => {
    it('should format arithmetic operators with proper spacing', () => {
      const document = createTestDocument('[Sales]+[Tax]-[Discount]');
      
      const options: FormattingOptions = { tabSize: 4, insertSpaces: true };
      const edits = format(document, options);
      
      expect(edits.length).toBe(1);
      const formattedText = edits[0].newText;
      
      expect(formattedText.trim()).toBe('[Sales] + [Tax] - [Discount]');
    });

    it('should format logical operators with proper spacing', () => {
      const document = createTestDocument('[Sales]>100AND[Profit]>50');
      
      const options: FormattingOptions = { tabSize: 4, insertSpaces: true };
      const edits = format(document, options);
      
      expect(edits.length).toBe(1);
      const formattedText = edits[0].newText;
      
      expect(formattedText.trim()).toBe('[Sales] > 100 AND [Profit] > 50');
    });

    it('should format comparison operators with proper spacing', () => {
      const document = createTestDocument('[Category]="Furniture"');
      
      const options: FormattingOptions = { tabSize: 4, insertSpaces: true };
      const edits = format(document, options);
      
      expect(edits.length).toBe(1);
      const formattedText = edits[0].newText;
      
      expect(formattedText.trim()).toBe('[Category] = "Furniture"');
    });
  });

  describe('Complex Expression Formatting', () => {
    it('should format complex business logic expressions', () => {
      const document = createTestDocument(`
        IF [Sales] > 100 AND [Profit] > 50 THEN
          CASE [Category]
            WHEN 'Furniture' THEN [Sales] * 0.1
            WHEN 'Technology' THEN [Sales] * 0.15
            ELSE [Sales] * 0.05
          END
        ELSEIF [Sales] > 50 THEN
          [Sales] * 0.03
        ELSE
          0
        END
      `);
      
      const options: FormattingOptions = { tabSize: 4, insertSpaces: true };
      const edits = format(document, options);
      
      expect(edits.length).toBe(1);
      const formattedText = edits[0].newText;
      
      // Should preserve complex structure
      expect(formattedText).toContain('IF [Sales] > 100 AND [Profit] > 50');
      expect(formattedText).toContain('CASE [Category]');
      expect(formattedText).toContain('ELSEIF [Sales] > 50');
      
      // Should have proper indentation
      const lines = formattedText.split('\n');
      const nonEmptyLines = lines.filter(line => line.trim());
      expect(nonEmptyLines.length).toBeGreaterThan(8);
    });

    it('should handle mixed expression types', () => {
      const document = createTestDocument(`
        { FIXED [Region] : 
          IF SUM([Sales]) > AVG([Sales]) THEN
            "Above Average"
          ELSE
            "Below Average"
          END
        }
      `);
      
      const options: FormattingOptions = { tabSize: 4, insertSpaces: true };
      const edits = format(document, options);
      
      expect(edits.length).toBe(1);
      const formattedText = edits[0].newText;
      
      // Should handle LOD with nested IF
      expect(formattedText).toContain('{ FIXED [Region]');
      expect(formattedText).toContain('IF SUM([Sales])');
      expect(formattedText).toContain('"Above Average"');
    });
  });

  describe('Formatting API', () => {
    it('should provide default configuration', () => {
      const config = MultiLineFormattingAPI.getDefaultConfig();
      
      expect(config).toHaveProperty('preserveLogicalLineBreaks');
      expect(config).toHaveProperty('maxLineLength');
      expect(config).toHaveProperty('indentSize');
      expect(config).toHaveProperty('useSpaces');
      expect(config.preserveLogicalLineBreaks).toBe(true);
      expect(config.maxLineLength).toBe(120);
    });

    it('should format with custom configuration', () => {
      const document = createTestDocument(`
        IF [Sales] > 100 THEN
          "High"
        ELSE
          "Low"
        END
      `);
      
      const customConfig = {
        indentSize: 2,
        useSpaces: true
      };
      
      const edits = MultiLineFormattingAPI.formatWithConfig(document, customConfig);
      
      expect(edits.length).toBe(1);
      const formattedText = edits[0].newText;
      
      // Should use 2-space indentation
      const lines = formattedText.split('\n');
      const indentedLine = lines.find(line => line.includes('THEN') && line.startsWith('  '));
      expect(indentedLine).toBeDefined();
    });

    it('should analyze expression structure', () => {
      const document = createTestDocument(`
        IF [Sales] > 100 THEN
          CASE [Category]
            WHEN 'Furniture' THEN 'F'
            ELSE 'O'
          END
        END
      `);
      
      const expressions = MultiLineFormattingAPI.analyzeExpressions(document);
      
      expect(expressions.length).toBeGreaterThan(0);
      expect(expressions.some(expr => expr.type === 'if')).toBe(true);
      expect(expressions.some(expr => expr.type === 'case')).toBe(true);
    });

    it('should detect if document needs multi-line formatting', () => {
      const simpleDocument = createTestDocument('SUM([Sales])');
      const complexDocument = createTestDocument(`
        IF [Sales] > 100 THEN
          "High"
        ELSE
          "Low"
        END
      `);
      
      expect(MultiLineFormattingAPI.needsMultiLineFormatting(simpleDocument)).toBe(false);
      expect(MultiLineFormattingAPI.needsMultiLineFormatting(complexDocument)).toBe(true);
    });

    it('should provide formatting statistics', () => {
      const document = createTestDocument(`
        IF [Sales] > 100 THEN
          CASE [Category]
            WHEN 'Furniture' THEN SUM([Profit])
            ELSE AVG([Discount])
          END
        END
      `);
      
      const stats = MultiLineFormattingAPI.getFormattingStats(document);
      
      expect(stats).toHaveProperty('totalExpressions');
      expect(stats).toHaveProperty('multiLineExpressions');
      expect(stats).toHaveProperty('complexExpressions');
      expect(stats).toHaveProperty('maxNestingDepth');
      expect(stats).toHaveProperty('expressionTypes');
      
      expect(stats.totalExpressions).toBeGreaterThan(0);
      expect(stats.expressionTypes).toHaveProperty('if');
      expect(stats.expressionTypes).toHaveProperty('case');
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed expressions gracefully', () => {
      const document = createTestDocument('IF [Sales] > 100 THEN'); // Missing END
      
      const options: FormattingOptions = { tabSize: 4, insertSpaces: true };
      const edits = format(document, options);
      
      // Should not throw error and return some result
      expect(Array.isArray(edits)).toBe(true);
    });

    it('should handle empty documents', () => {
      const document = createTestDocument('');
      
      const options: FormattingOptions = { tabSize: 4, insertSpaces: true };
      const edits = format(document, options);
      
      expect(edits).toEqual([]);
    });

    it('should handle documents with only whitespace', () => {
      const document = createTestDocument('   \n  \t  \n   ');
      
      const options: FormattingOptions = { tabSize: 4, insertSpaces: true };
      const edits = format(document, options);
      
      // Should handle gracefully
      expect(Array.isArray(edits)).toBe(true);
    });
  });

  describe('Indentation Options', () => {
    it('should respect tab size setting', () => {
      const document = createTestDocument(`
        IF [Sales] > 100 THEN
          "High"
        END
      `);
      
      const options: FormattingOptions = { tabSize: 2, insertSpaces: true };
      const edits = format(document, options);
      
      expect(edits.length).toBe(1);
      const formattedText = edits[0].newText;
      
      // Should use 2-space indentation
      const lines = formattedText.split('\n');
      const indentedLine = lines.find(line => line.includes('"High"') && line.startsWith('  '));
      expect(indentedLine).toBeDefined();
    });

    it('should respect insertSpaces setting', () => {
      const document = createTestDocument(`
        IF [Sales] > 100 THEN
          "High"
        END
      `);
      
      const options: FormattingOptions = { tabSize: 4, insertSpaces: false };
      const edits = format(document, options);
      
      expect(edits.length).toBe(1);
      const formattedText = edits[0].newText;
      
      // Should use tabs for indentation
      const lines = formattedText.split('\n');
      const indentedLine = lines.find(line => line.includes('"High"') && line.startsWith('\t'));
      expect(indentedLine).toBeDefined();
    });
  });
});

/**
 * Helper function to create test documents
 */
function createTestDocument(
  content: string, 
  version: number = 1, 
  uri: string = 'test://test.twbl'
): TextDocument {
  return TextDocument.create(uri, 'tableau', version, content.trim());
}
</text>