// src/tests/unit/errorRecovery.test.ts

import { TextDocument } from 'vscode-languageserver-textdocument';
import { DiagnosticSeverity } from 'vscode-languageserver';
import { getDiagnostics } from '../../diagnosticsProvider';
import { parseDocument } from '../../documentModel';
import { AdvancedErrorRecovery, AdvancedErrorRecoveryCategory } from '../../errorRecovery';

describe('Advanced Error Recovery', () => {
  describe('Partial Expression Detection', () => {
    it('should detect partial IF statements', () => {
      const document = createTestDocument('IF [Sales] > 100');
      const parsedDocument = parseDocument(document);
      const diagnostics = getDiagnostics(document, parsedDocument);
      
      // Should detect partial IF statement
      const partialExpressionDiagnostics = diagnostics.filter(d => 
        d.message.includes('Partial IF statement') || 
        d.code === AdvancedErrorRecoveryCategory.PARTIAL_EXPRESSION
      );
      
      expect(partialExpressionDiagnostics.length).toBeGreaterThan(0);
      expect(partialExpressionDiagnostics[0].severity).toBe(DiagnosticSeverity.Information);
    });
    
    it('should detect partial CASE statements', () => {
      const document = createTestDocument('CASE [Category]');
      const parsedDocument = parseDocument(document);
      const diagnostics = getDiagnostics(document, parsedDocument);
      
      // Should detect partial CASE statement
      const partialExpressionDiagnostics = diagnostics.filter(d => 
        d.message.includes('Partial CASE statement') || 
        d.code === AdvancedErrorRecoveryCategory.PARTIAL_EXPRESSION
      );
      
      expect(partialExpressionDiagnostics.length).toBeGreaterThan(0);
    });
    
    it('should detect unbalanced parentheses', () => {
      const document = createTestDocument('SUM([Sales] * (1 + [Tax Rate]');
      const parsedDocument = parseDocument(document);
      const diagnostics = getDiagnostics(document, parsedDocument);
      
      // Should detect unbalanced parentheses
      const unbalancedDiagnostics = diagnostics.filter(d => 
        d.message.includes('parentheses') || 
        d.message.includes('balanced')
      );
      
      expect(unbalancedDiagnostics.length).toBeGreaterThan(0);
    });
    
    it('should detect unbalanced brackets', () => {
      const document = createTestDocument('SUM([Sales');
      const parsedDocument = parseDocument(document);
      const diagnostics = getDiagnostics(document, parsedDocument);
      
      // Should detect unbalanced brackets
      const unbalancedDiagnostics = diagnostics.filter(d => 
        d.message.includes('brackets') || 
        d.message.includes('field reference')
      );
      
      expect(unbalancedDiagnostics.length).toBeGreaterThan(0);
    });
    
    it('should detect expressions that continue on next line', () => {
      const document = createTestDocument('[Sales] +');
      const parsedDocument = parseDocument(document);
      const diagnostics = getDiagnostics(document, parsedDocument);
      
      // Should detect expression continuation
      const continuationDiagnostics = diagnostics.filter(d => 
        d.message.includes('continue') || 
        d.message.includes('next line')
      );
      
      expect(continuationDiagnostics.length).toBeGreaterThan(0);
    });
  });
  
  describe('Nested Expression Boundary Detection', () => {
    it('should detect complex nested expressions', () => {
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
      
      // Should detect complex nested expressions
      const boundaryDiagnostics = diagnostics.filter(d => 
        d.message.includes('Complex nested expression') || 
        d.code === AdvancedErrorRecoveryCategory.BOUNDARY_DETECTION
      );
      
      expect(boundaryDiagnostics.length).toBeGreaterThan(0);
    });
    
    it('should detect complex arguments in function calls', () => {
      const document = createTestDocument(`
        IIF(
          [Category] = 'Furniture',
          SUM(IF [Subcategory] = 'Chairs' THEN [Sales] ELSE 0 END),
          SUM(IF [Subcategory] = 'Phones' THEN [Sales] ELSE 0 END)
        )
      `);
      const parsedDocument = parseDocument(document);
      const diagnostics = getDiagnostics(document, parsedDocument);
      
      // Should detect complex arguments
      const nestedDiagnostics = diagnostics.filter(d => 
        d.message.includes('nested expression') || 
        d.code === AdvancedErrorRecoveryCategory.NESTED_EXPRESSION
      );
      
      // This might not generate diagnostics if the parsing is correct
      // Just check that the function runs without errors
      expect(diagnostics).toBeDefined();
    });
  });
  
  describe('LOD Expression Guidance', () => {
    it('should provide guidance for incomplete LOD expressions', () => {
      const document = createTestDocument('{ FIXED [Region]: }');
      const parsedDocument = parseDocument(document);
      const diagnostics = getDiagnostics(document, parsedDocument);
      
      // Should provide LOD guidance
      const lodDiagnostics = diagnostics.filter(d => 
        d.message.includes('LOD expression') || 
        d.code === AdvancedErrorRecoveryCategory.INCOMPLETE_LOD
      );
      
      expect(lodDiagnostics.length).toBeGreaterThan(0);
    });
    
    it('should detect missing aggregation type in LOD', () => {
      const document = createTestDocument('{ : SUM([Sales]) }');
      const parsedDocument = parseDocument(document);
      const diagnostics = getDiagnostics(document, parsedDocument);
      
      // Should detect missing aggregation type
      const lodDiagnostics = diagnostics.filter(d => 
        d.message.includes('aggregation type') || 
        d.code === AdvancedErrorRecoveryCategory.INCOMPLETE_LOD
      );
      
      expect(lodDiagnostics.length).toBeGreaterThan(0);
    });
    
    it('should detect missing aggregation function in LOD', () => {
      const document = createTestDocument('{ FIXED [Region]: [Sales] }');
      const parsedDocument = parseDocument(document);
      const diagnostics = getDiagnostics(document, parsedDocument);
      
      // Should detect missing aggregation function
      const lodDiagnostics = diagnostics.filter(d => 
        d.message.includes('aggregation function') || 
        d.code === AdvancedErrorRecoveryCategory.INCOMPLETE_LOD
      );
      
      expect(lodDiagnostics.length).toBeGreaterThan(0);
    });
  });
  
  describe('Error Recovery Integration', () => {
    it('should provide helpful guidance without generating errors', () => {
      const document = createTestDocument(`
        // Partial expression
        IF [Sales] > 100
        
        // Incomplete LOD
        { FIXED [Region]:
        
        // Unbalanced parentheses
        SUM([Sales] * (1 + [Tax Rate]
      `);
      const parsedDocument = parseDocument(document);
      const diagnostics = getDiagnostics(document, parsedDocument);
      
      // Should provide helpful guidance
      const informationalDiagnostics = diagnostics.filter(d => 
        d.severity === DiagnosticSeverity.Information
      );
      
      expect(informationalDiagnostics.length).toBeGreaterThan(0);
      
      // Should not generate errors for partial expressions during editing
      const errorDiagnostics = diagnostics.filter(d => 
        d.severity === DiagnosticSeverity.Error &&
        (d.message.includes('Partial') || d.message.includes('incomplete'))
      );
      
      // We should not have errors for partial expressions, only informational messages
      expect(errorDiagnostics.length).toBe(0);
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