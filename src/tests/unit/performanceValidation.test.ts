// src/tests/unit/performanceValidation.test.ts

import { TextDocument } from 'vscode-languageserver-textdocument';
import { DiagnosticSeverity } from 'vscode-languageserver';
import { getDiagnostics } from '../../diagnosticsProvider.js';
import { parseDocument } from '../../documentModel.js';

describe('Performance Validation', () => {
  describe('Excessive Nesting Detection', () => {
    it('does not flag a deeply nested IF/ELSE ladder (removed as noise — see diagnosticsProvider.ts)', () => {
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

      // Deep-nesting hints (DEEP_NESTING / EXCESSIVE_NESTING) were intentionally
      // removed: a long IF/CASE/IIF ladder is valid, idiomatic Tableau and
      // flagging it is noise, not a real defect.
      const nestingWarnings = diagnostics.filter(d =>
        d.code === 'DEEP_NESTING' || d.code === 'EXCESSIVE_NESTING'
      );

      expect(nestingWarnings).toHaveLength(0);
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
      // checkInefficientStringOps now only flags REPLACE/REGEXP_REPLACE when an
      // argument is itself a nested function call — trivial literal usage (e.g.
      // a plain regex pattern string) is normal and no longer flagged. Nest
      // UPPER(...) in the input argument so this fixture still exercises the
      // (narrowed) detection.
      const document = createTestDocument('REGEXP_REPLACE(UPPER([Customer Name]), "^(MR\\.|MRS\\.|MS\\.) ", "")');
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

      // Should detect high complexity.
      // diagnosticsProvider no longer emits a single 'HIGH_COMPLEXITY' /
      // 'Complex calculation' score diagnostic. Highly complex calculations are
      // now surfaced through specific performance diagnostics: deep nesting,
      // complex nested expression boundaries, and nested aggregations. Accept
      // both the old score diagnostic and the current specific ones.
      const complexityWarnings = diagnostics.filter(d =>
        d.message.includes('Complex calculation') ||
        d.code === 'HIGH_COMPLEXITY' ||
        d.code === 'DEEP_NESTING' ||
        d.code === 'PERFORMANCE_OPTIMIZATION' ||
        d.message.includes('Complex')
      );

      expect(complexityWarnings.length).toBeGreaterThan(0);
    });
  });
  
  describe('Optimization Suggestions', () => {
    it('should provide optimization suggestions', () => {
      // A plain nested-IF ladder no longer produces an optimization suggestion
      // (see 'Excessive Nesting Detection' above) — use a complex date
      // calculation instead, which still goes through checkComplexDateCalcs.
      const document = createTestDocument('DATEDIFF("day", [Order Date], DATEADD("day", 7, TODAY()))');
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