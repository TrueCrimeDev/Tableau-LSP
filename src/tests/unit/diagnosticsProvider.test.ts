// src/tests/unit/diagnosticsProvider.test.ts

import { TextDocument } from 'vscode-languageserver-textdocument';
import { DiagnosticSeverity } from 'vscode-languageserver';
import { getDiagnostics } from '../../diagnosticsProvider.js';
import { parseDocument } from '../../documentModel.js';
import { FieldParser } from '../../fieldParser.js';

describe('Diagnostics Provider', () => {
  describe('getDiagnostics', () => {
    it('should detect syntax errors', () => {
      // Missing THEN is a genuine syntax error (ELSE, by contrast, is optional in Tableau).
      const document = createTestDocument('IF [Sales] > 100 "High" ELSE "Low" END');
      const parsedDocument = parseDocument(document);
      const diagnostics = getDiagnostics(document, parsedDocument);

      expect(diagnostics.length).toBeGreaterThan(0);
      expect(diagnostics.some(d => d.message.includes('THEN'))).toBe(true);
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
      expect(diagnostics.some(d => d.message.includes('argument'))).toBe(true);
    });
    
    it('validates fields against an authoritative workbook context', () => {
      const document = createTestDocument('SUM([Sales]) + [NonExistentField]');
      const parsedDocument = parseDocument(document);
      const fieldParser = new FieldParser(null);
      fieldParser.setRuntimeFields([{
        name: 'Sales',
        type: 'Number',
        description: 'Orders field',
      }]);
      const diagnostics = getDiagnostics(document, parsedDocument, fieldParser);

      const unknownFields = diagnostics.filter(d => d.code === 'UNKNOWN_FIELD');
      expect(unknownFields).toHaveLength(1);
      expect(unknownFields[0].message).toContain('[NonExistentField]');
      expect(unknownFields[0].message).not.toContain('[Sales]');
    });

    it('does not treat a datasource qualifier as a missing field', () => {
      const document = createTestDocument('    [Orders].[Sales] + [Missing]');
      const parsedDocument = parseDocument(document);
      const fieldParser = new FieldParser(null);
      fieldParser.setRuntimeFields([{
        name: 'Sales',
        type: 'Number',
        description: 'Orders field',
        datasource: 'Orders',
      }]);

      const unknownFields = getDiagnostics(document, parsedDocument, fieldParser)
        .filter(d => d.code === 'UNKNOWN_FIELD');
      expect(unknownFields).toHaveLength(1);
      expect(unknownFields[0].message).toContain('[Missing]');
      expect(unknownFields[0].message).not.toContain('[Orders]');
    });

    it('keeps datasource qualifier ranges correct inside conditional segments', () => {
      const document = createTestDocument('IF   [Orders].[Sales] > 0 THEN [Sales] ELSE 0 END');
      const parsedDocument = parseDocument(document);
      const fieldParser = new FieldParser(null);
      fieldParser.setRuntimeFields([{
        name: 'Sales',
        type: 'Number',
        description: 'Orders field',
        datasource: 'Orders',
      }]);

      const unknownFields = getDiagnostics(document, parsedDocument, fieldParser)
        .filter(d => d.code === 'UNKNOWN_FIELD');
      expect(unknownFields).toHaveLength(0);
    });

    it('rejects a globally known field when it is not in the qualified datasource', () => {
      const document = createTestDocument('[Orders].[Status] + [Returns].[Status]');
      const parsedDocument = parseDocument(document);
      const fieldParser = new FieldParser(null);
      fieldParser.setRuntimeFields(
        [{ name: 'Status', type: 'String', description: '', datasource: 'Returns' }],
        true,
        [
          { name: 'Amount', type: 'Number', description: '', datasource: 'Orders' },
          { name: 'Status', type: 'String', description: '', datasource: 'Returns' },
        ]
      );

      const diagnostics = getDiagnostics(document, parsedDocument, fieldParser);
      const unknownFields = diagnostics.filter(d => d.code === 'UNKNOWN_FIELD');

      expect(unknownFields).toHaveLength(1);
      expect(unknownFields[0].message).toContain('[Status]');
      expect(unknownFields[0].message).toContain('[Orders]');
      expect(diagnostics.filter(d => d.code === 'UNKNOWN_DATASOURCE')).toHaveLength(0);
    });

    it('reports an unknown datasource once without misclassifying it as a field', () => {
      const document = createTestDocument('[Missing Source].[Status]');
      const parsedDocument = parseDocument(document);
      const fieldParser = new FieldParser(null);
      fieldParser.setRuntimeFields(
        [{ name: 'Status', type: 'String', description: '', datasource: 'Returns' }]
      );

      const diagnostics = getDiagnostics(document, parsedDocument, fieldParser);
      expect(diagnostics.filter(d => d.code === 'UNKNOWN_DATASOURCE')).toHaveLength(1);
      expect(diagnostics.filter(d => d.code === 'UNKNOWN_FIELD')).toHaveLength(0);
    });

    it('does not validate bracket-shaped text inside string literals as fields', () => {
      const document = createTestDocument(
        '"Label [Not a field]" + IF [Sales] = "[Unknown]" THEN 1 ELSE 0 END'
      );
      const parsedDocument = parseDocument(document);
      const fieldParser = new FieldParser(null);
      fieldParser.setRuntimeFields([{ name: 'Sales', type: 'Number', description: '' }]);

      const diagnostics = getDiagnostics(document, parsedDocument, fieldParser);
      expect(diagnostics.filter(d => d.code === 'UNKNOWN_FIELD')).toHaveLength(0);
    });

    it('preserves a leading hash that is part of the actual field caption', () => {
      const document = createTestDocument('SUM([#Complaint]) + [#Ghost]');
      const parsedDocument = parseDocument(document);
      const fieldParser = new FieldParser(null);
      fieldParser.setRuntimeFields([{
        name: '#Complaint',
        type: 'Number',
        description: 'Complaint count',
      }]);

      const unknownFields = getDiagnostics(document, parsedDocument, fieldParser)
        .filter(d => d.code === 'UNKNOWN_FIELD');
      expect(unknownFields).toHaveLength(1);
      expect(unknownFields[0].message).toContain('[#Ghost]');
      expect(unknownFields[0].message).not.toContain('[#Complaint]');
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
