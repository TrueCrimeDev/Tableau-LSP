// src/tests/unit/documentModel.test.ts

import { TextDocument } from 'vscode-languageserver-textdocument';
import { parseDocument } from '../../documentModel';
import { SymbolType } from '../../common';

describe('Document Model', () => {
  describe('parseDocument', () => {
    it('should parse simple expressions', () => {
      const document = createTestDocument('SUM([Sales])');
      const result = parseDocument(document);
      
      expect(result.symbols.length).toBeGreaterThan(0);
      expect(result.symbols.some(s => s.name === 'SUM')).toBe(true);
      expect(result.symbols.some(s => s.name === 'Sales')).toBe(true);
    });
    
    it('should parse IF statements', () => {
      const document = createTestDocument('IF [Sales] > 100 THEN "High" ELSE "Low" END');
      const result = parseDocument(document);
      
      expect(result.symbols.some(s => s.name === 'IF')).toBe(true);
      expect(result.symbols.some(s => s.name === 'THEN')).toBe(true);
      expect(result.symbols.some(s => s.name === 'ELSE')).toBe(true);
      expect(result.symbols.some(s => s.name === 'END')).toBe(true);
    });
    
    it('should parse CASE statements', () => {
      const document = createTestDocument(`
        CASE [Region]
        WHEN "North" THEN "Northern"
        WHEN "South" THEN "Southern"
        ELSE "Other"
        END
      `);
      const result = parseDocument(document);
      
      expect(result.symbols.some(s => s.name === 'CASE')).toBe(true);
      expect(result.symbols.filter(s => s.name === 'WHEN').length).toBe(2);
      expect(result.symbols.some(s => s.name === 'ELSE')).toBe(true);
      expect(result.symbols.some(s => s.name === 'END')).toBe(true);
    });
    
    it('should parse LOD expressions', () => {
      const document = createTestDocument('{FIXED [Customer] : SUM([Sales])}');
      const result = parseDocument(document);
      
      expect(result.symbols.some(s => s.name === 'FIXED')).toBe(true);
      expect(result.symbols.some(s => s.name === 'SUM')).toBe(true);
      expect(result.symbols.some(s => s.name === 'Customer')).toBe(true);
      expect(result.symbols.some(s => s.name === 'Sales')).toBe(true);
    });
    
    it('should parse multi-line expressions', () => {
      const document = createTestDocument(`
        IF [Sales] > 1000 
        THEN "High" 
        ELSE "Low" 
        END
      `);
      const result = parseDocument(document);
      
      expect(result.symbols.some(s => s.name === 'IF')).toBe(true);
      expect(result.symbols.some(s => s.name === 'THEN')).toBe(true);
      expect(result.symbols.some(s => s.name === 'ELSE')).toBe(true);
      expect(result.symbols.some(s => s.name === 'END')).toBe(true);
    });
    
    it('should handle comments', () => {
      const document = createTestDocument(`
        // This is a comment
        SUM([Sales]) // Inline comment
        /* Block comment */
      `);
      const result = parseDocument(document);
      
      expect(result.symbols.some(s => s.name === 'SUM')).toBe(true);
      expect(result.symbols.some(s => s.type === SymbolType.Comment)).toBe(true);
    });
    
    it('should handle nested expressions', () => {
      const document = createTestDocument(`
        IF SUM([Sales]) > AVG([Sales]) THEN
          MAX([Profit])
        ELSE
          MIN([Profit])
        END
      `);
      const result = parseDocument(document);
      
      expect(result.symbols.some(s => s.name === 'SUM')).toBe(true);
      expect(result.symbols.some(s => s.name === 'AVG')).toBe(true);
      expect(result.symbols.some(s => s.name === 'MAX')).toBe(true);
      expect(result.symbols.some(s => s.name === 'MIN')).toBe(true);
    });
    
    it('should handle string literals with special characters', () => {
      const document = createTestDocument('IF [Category] = "Men\'s Clothing" THEN "Special" ELSE "Normal" END');
      const result = parseDocument(document);
      
      expect(result.symbols.some(s => s.text?.includes("Men's"))).toBe(true);
    });
  });
});

/**
 * Helper function to create test documents
 */
function createTestDocument(content: string, version: number = 1, uri: string = 'test://test.twbl'): TextDocument {
  return TextDocument.create(uri, 'tableau', version, content);
}