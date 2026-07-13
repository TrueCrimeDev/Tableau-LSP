// src/tests/unit/documentModel.test.ts

import { TextDocument } from 'vscode-languageserver-textdocument';
import { parseDocument } from '../../documentModel.js';
import { SymbolType, Symbol } from '../../common.js';

// parseDocument returns the symbol TREE (root.children); flatten it so assertions
// can find symbols at any nesting depth (IF conditions, THEN/ELSE values, etc.).
function all(symbols: Symbol[]): Symbol[] {
  const out: Symbol[] = [];
  const walk = (list: Symbol[]): void => {
    for (const s of list) { out.push(s); if (s.children) { walk(s.children); } }
  };
  walk(symbols);
  return out;
}

describe('Document Model', () => {
  describe('parseDocument', () => {
    it('should parse simple expressions', () => {
      const document = createTestDocument('SUM([Sales])');
      const result = parseDocument(document);
      
      expect(result.symbols.length).toBeGreaterThan(0);
      expect(all(result.symbols).some(s => s.name === 'SUM')).toBe(true);
      expect(all(result.symbols).some(s => s.name === 'Sales')).toBe(true);
    });
    
    it('should parse IF statements', () => {
      const document = createTestDocument('IF [Sales] > 100 THEN "High" ELSE "Low" END');
      const result = parseDocument(document);
      
      expect(all(result.symbols).some(s => s.name === 'IF')).toBe(true);
      expect(all(result.symbols).some(s => s.name === 'THEN')).toBe(true);
      expect(all(result.symbols).some(s => s.name === 'ELSE')).toBe(true);
      expect(all(result.symbols).some(s => s.name === 'END')).toBe(true);
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
      
      expect(all(result.symbols).some(s => s.name === 'CASE')).toBe(true);
      expect(all(result.symbols).filter(s => s.name === 'WHEN').length).toBe(2);
      expect(all(result.symbols).some(s => s.name === 'ELSE')).toBe(true);
      expect(all(result.symbols).some(s => s.name === 'END')).toBe(true);
    });
    
    it('should parse LOD expressions', () => {
      const document = createTestDocument('{FIXED [Customer] : SUM([Sales])}');
      const result = parseDocument(document);
      
      expect(all(result.symbols).some(s => s.name === 'FIXED')).toBe(true);
      expect(all(result.symbols).some(s => s.name === 'SUM')).toBe(true);
      expect(all(result.symbols).some(s => s.name === 'Customer')).toBe(true);
      expect(all(result.symbols).some(s => s.name === 'Sales')).toBe(true);
    });
    
    it('should parse multi-line expressions', () => {
      const document = createTestDocument(`
        IF [Sales] > 1000 
        THEN "High" 
        ELSE "Low" 
        END
      `);
      const result = parseDocument(document);
      
      expect(all(result.symbols).some(s => s.name === 'IF')).toBe(true);
      expect(all(result.symbols).some(s => s.name === 'THEN')).toBe(true);
      expect(all(result.symbols).some(s => s.name === 'ELSE')).toBe(true);
      expect(all(result.symbols).some(s => s.name === 'END')).toBe(true);
    });
    
    it('should handle comments', () => {
      const document = createTestDocument(`
        // This is a comment
        SUM([Sales]) // Inline comment
        /* Block comment */
      `);
      const result = parseDocument(document);
      
      expect(all(result.symbols).some(s => s.name === 'SUM')).toBe(true);
      expect(all(result.symbols).some(s => s.type === SymbolType.Comment)).toBe(true);
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
      
      expect(all(result.symbols).some(s => s.name === 'SUM')).toBe(true);
      expect(all(result.symbols).some(s => s.name === 'AVG')).toBe(true);
      expect(all(result.symbols).some(s => s.name === 'MAX')).toBe(true);
      expect(all(result.symbols).some(s => s.name === 'MIN')).toBe(true);
    });
    
    it('should handle string literals with special characters', () => {
      const document = createTestDocument('IF [Category] = "Men\'s Clothing" THEN "Special" ELSE "Normal" END');
      const result = parseDocument(document);
      
      expect(all(result.symbols).some(s => s.text?.includes("Men's"))).toBe(true);
    });

    it('does not mistake apostrophes in bracketed field names for strings', () => {
      const document = createTestDocument("[Customer's Name] = 'x'");
      const symbols = all(parseDocument(document).symbols);

      expect(symbols.some(s => s.type === SymbolType.FieldReference &&
        s.name === "Customer's Name")).toBe(true);
      expect(symbols.some(s => s.type === SymbolType.Expression && s.text === "'x'")).toBe(true);
    });

    it('keeps function arguments intact when field names contain apostrophes', () => {
      const document = createTestDocument("CONCAT([O'Brien's Flag], [Name])");
      const symbols = all(parseDocument(document).symbols);
      const concat = symbols.find(s => s.name === 'CONCAT');

      expect(symbols.some(s => s.name === "O'Brien's Flag")).toBe(true);
      expect(concat?.arguments).toHaveLength(2);
    });
  });
});

/**
 * Helper function to create test documents
 */
function createTestDocument(content: string, version: number = 1, uri: string = 'test://test.twbl'): TextDocument {
  return TextDocument.create(uri, 'tableau', version, content);
}
