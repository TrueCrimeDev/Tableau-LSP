// src/tests/unit/performanceValidation.test.ts

import { TextDocument } from 'vscode-languageserver-textdocument';
import { DiagnosticSeverity } from 'vscode-languageserver';
import { getDiagnostics } from '../../diagnosticsProvider';
import { parseDocument } from '../../documentModel';

describe('Performance Validation', () => {
  describe('Excessive Nesting Detection', () => {
    it('should detect deeply nested expressions', () => {
      const document = createTestDocument(`
        IF [Sales] > 100 THEN
          IF [Profit] > 50 THEN
            IF [Discount] < 0.1 THEN
              IF [Quantity] > 10 THEN
                "Very Specific"
              ELSE
                "Almost Specific"
              END
            ELSE
              "Medium Specific"
            END
          ELSE
            "Not Specific"
          END
        ELSE
          "Low Sales"
        END
      `);
      const parsedDocument = parseDocument(document);
      const diagnostics = getDiagnostics(document, parsedDocument);
      
      // Should detect excessive nesting
      const nestingWarnings = diagnostics.filter(d => 
        d.message.includes('nesting depth') || 
        d.code === 'EXCESSIVE_NESTING'
      );
      
      expect(nestingWarnings.length).toBeGreaterThan(0);
      expect(nestingWarnings[0].severity).toBe(DiagnosticSeverity.Warning);
    });
  });
  
  describe('Nested Aggregation Detection', () => {
    it('should detect nested aggregations', () => {
      const document = createTestDocument('SUM(AVG([Sales]))');
      const parsedDocument = parseDocument(document);
      const diagnostics = getDiagnostics(document, parsedDocument);
      
      // Should detect nested aggregation
      const nestedAggWarnings = diagnostics.filter(d => 
        d.message.includes('Nested aggregation') || 
        d.message.includes('LOD expressions')
      );
      
      expect(nestedAggWarnings.length).toBeGreaterThan(0);
    });
  });
  
  describe('Complex String Operations', () => {
    it('should detect complex string operations', () => {
      const document = createTestDocument('REGEXP_REPLACE([Customer Name], "^(Mr\\.|Mrs\\.|Ms\\.) ", "")');
      const parsedDocument = parseDocument(document);
      const diagnostics = getDiagnostics(document, parsedDocument);
      
      // Should detect complex string operation
      const stringOpWarnings = diagnostics.filter(d => 
        d.message.includes('Complex string operation') || 
        d.message.includes('REGEXP_REPLACE')
      );
      
      expect(stringOpWarnings.length).toBeGreaterThan(0);
    });
  });
  
  describe('Complex Date Calculations', () => {
    it('should detect complex date calculations', () => {
      const document = createTestDocument('DATEDIFF("day", [Order Date], DATEADD("day", 7, TODAY()))');
      const parsedDocument = parseDocument(document);
      const diagnostics = getDiagnostics(document, parsedDocument);
      
      // Should detect complex date calculation
      const dateCalcWarnings = diagnostics.filter(d => 
        d.message.includes('Complex date calculation') || 
        d.message.includes('DATEADD')
      );
      
      expect(dateCalcWarnings.length).toBeGreaterThan(0);
    });
  });
  
  describe('High Complexity Score', () => {
    it('should detect high complexity calculations', () => {
      // Create a complex calculation with many functions and nested expressions
      const document = createTestDocument(`
        IF [Sales] > 100 THEN
          IF [Profit] > 50 THEN
            IF DATEPART('month', [Order Date]) = 12 THEN
              IF REGEXP_MATCH([Customer Name], '^(Mr\\.|Mrs\\.|Ms\\.)') THEN
                SUM([Sales]) / SUM([Quantity])
              ELSE
                WINDOW_AVG(SUM([Sales]), -3, 0)
              END
            ELSE
              RUNNING_SUM(SUM([Profit]))
            END
          ELSE
            LOOKUP(SUM([Sales]), -1)
          END
        ELSE
          { FIXED [Region], [Category]: SUM([Sales]) }
        END
      `);
      const parsedDocument = parseDocument(document);
      const diagnostics = getDiagnostics(document, parsedDocument);
      
      // Should detect high complexity
      const complexityWarnings = diagnostics.filter(d => 
        d.message.includes('Complex calculation') || 
        d.code === 'HIGH_COMPLEXITY'
      );
      
      expect(complexityWarnings.length).toBeGreaterThan(0);
    });
  });
  
  describe('Optimization Suggestions', () => {
    it('should provide optimization suggestions', () => {
      const document = createTestDocument(`
        // Nested IF statements
        IF [Sales] > 100 THEN
          IF [Profit] > 50 THEN
            IF [Discount] < 0.1 THEN
              "High Value"
            ELSE
              "Medium Value"
            END
          ELSE
            "Low Value"
          END
        ELSE
          "Not Valuable"
        END
      `);
      const parsedDocument = parseDocument(document);
      const diagnostics = getDiagnostics(document, parsedDocument);
      
      // Should provide optimization suggestions
      const suggestions = diagnostics.filter(d => 
        d.message.includes('Consider') || 
        d.code === 'PERFORMANCE_OPTIMIZATION'
      );
      
      expect(suggestions.length).toBeGreaterThan(0);
      // Check that suggestions include actionable advice
      expect(suggestions.some(d => 
        d.message.includes('simplifying') || 
        d.message.includes('using CASE')
      )).toBe(true);
    });
  });
});

/**
 * Helper function to create test documents
 */
function createTestDocument(content: string, version: number = 1, uri: string = 'test://test.twbl'): TextDocument {
  return TextDocument.create(uri, 'tableau', version, content);
}
</text>
</invoke>