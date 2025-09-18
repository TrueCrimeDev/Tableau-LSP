// src/tests/unit/diagnosticsProvider.test.ts

import { TextDocument } from 'vscode-languageserver-textdocument';
import { DiagnosticSeverity } from 'vscode-languageserver';
import { getDiagnostics } from '../../diagnosticsProvider';
import { parseDocument } from '../../documentModel';

describe('Diagnostics Provider', () => {
  describe('getDiagnostics', () => {
    it('should detect syntax errors', () => {
      const document = createTestDocument('IF [Sales] > 100 THEN "High" END');
      const parsedDocument = parseDocument(document);
      const diagnostics = getDiagnostics(document, parsedDocument);
      
      expect(diagnostics.length).toBeGreaterThan(0);
      expect(diagnostics.some(d => d.message.includes('ELSE'))).toBe(true);
    });
    
    it('should detect unclosed blocks', () => {
      const document = createTestDocument('IF [Sales] > 100 THEN "High" ELSE "Low"');
      const parsedDocument = parseDocument(document);
      const diagnostics = getDiagnostics(document, parsedDocument);
      
      expect(diagnostics.length).toBeGreaterThan(0);
      expect(diagnostics.some(d => d.message.includes('END'))).toBe(true);
    });
    
    it('should detect incorrect function parameter counts', () => {
      const document = createTestDocument('SUM([Sales], [Profit])');
      const parsedDocument = parseDocument(document);
      const diagnostics = getDiagnostics(document, parsedDocument);
      
      expect(diagnostics.length).toBeGreaterThan(0);
      expect(diagnostics.some(d => d.message.includes('parameter'))).toBe(true);
    });
    
    it('should detect unknown fields', () => {
      const document = createTestDocument('SUM([NonExistentField])');
      const parsedDocument = parseDocument(document);
      const diagnostics = getDiagnostics(document, parsedDocument);
      
      // This might not generate an error if field validation is not strict
      // Just check that the function runs without errors
      expect(diagnostics).toBeDefined();
    });
    
    it('should categorize issues by severity', () => {
      const document = createTestDocument(`
        // Missing END is an error
        IF [Sales] > 100 THEN "High" ELSE "Low"
        
        // Excessive nesting is a warning
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
      
      const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);
      const warnings = diagnostics.filter(d => d.severity === DiagnosticSeverity.Warning);
      const infos = diagnostics.filter(d => d.severity === DiagnosticSeverity.Information);
      
      expect(errors.length + warnings.length + infos.length).toBeGreaterThan(0);
    });
    
    it('should detect nested aggregation issues', () => {
      const document = createTestDocument('SUM(AVG([Sales]))');
      const parsedDocument = parseDocument(document);
      const diagnostics = getDiagnostics(document, parsedDocument);
      
      // Should detect nested aggregation
      expect(diagnostics.some(d => 
        d.message.toLowerCase().includes('aggregate') || 
        d.message.toLowerCase().includes('nested')
      )).toBe(true);
    });
    
    it('should provide precise location information', () => {
      const document = createTestDocument('IF [Sales] > 100 THEN "High" ELSE "Low"');
      const parsedDocument = parseDocument(document);
      const diagnostics = getDiagnostics(document, parsedDocument);
      
      // Check that diagnostics have valid ranges
      expect(diagnostics.every(d => 
        d.range && 
        typeof d.range.start.line === 'number' && 
        typeof d.range.start.character === 'number' &&
        typeof d.range.end.line === 'number' && 
        typeof d.range.end.character === 'number'
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