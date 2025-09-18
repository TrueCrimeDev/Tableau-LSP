// src/tests/errorRecovery.test.ts

import { TextDocument } from 'vscode-languageserver-textdocument';
import { DiagnosticSeverity } from 'vscode-languageserver';
import { ErrorRecovery } from '../errorRecovery';
import { SymbolType } from '../common';

describe('ErrorRecovery', () => {
    
    describe('parseWithErrorRecovery', () => {
        
        it('should handle graceful fallback for unknown functions', () => {
            const document = createTestDocument('UNKNOWN_FUNCTION([Sales])');
            
            const result = ErrorRecovery.parseWithErrorRecovery(document);
            
            expect(result.symbols.length).toBeGreaterThan(0);
            expect(result.recoveryInfo.totalErrors).toBeGreaterThanOrEqual(0);
            expect(result.symbols.some(s => s.name === 'UNKNOWN_FUNCTION')).toBe(true);
        });
        
        it('should handle multi-line expression parsing without false positives', () => {
            const document = createTestDocument(`
IF [Sales] > 1000 
THEN "High"
ELSE "Low"
END
            `.trim());
            
            const result = ErrorRecovery.parseWithErrorRecovery(document);
            
            expect(result.symbols.length).toBeGreaterThan(0);
            expect(result.diagnostics.filter(d => d.message.includes('incomplete')).length).toBe(0);
            expect(result.symbols.some(s => s.name === 'IF')).toBe(true);
            expect(result.symbols.some(s => s.name === 'THEN')).toBe(true);
            expect(result.symbols.some(s => s.name === 'ELSE')).toBe(true);
            expect(result.symbols.some(s => s.name === 'END')).toBe(true);
        });
        
        it('should properly recognize logical operators vs function calls', () => {
            const document = createTestDocument('[Sales] > 100 AND [Profit] > 0 OR NOT [Discount] > 0.1');
            
            const result = ErrorRecovery.parseWithErrorRecovery(document);
            
            const andSymbol = result.symbols.find(s => s.name === 'AND');
            const orSymbol = result.symbols.find(s => s.name === 'OR');
            const notSymbol = result.symbols.find(s => s.name === 'NOT');
            
            expect(andSymbol?.type).toBe(SymbolType.Keyword);
            expect(orSymbol?.type).toBe(SymbolType.Keyword);
            expect(notSymbol?.type).toBe(SymbolType.Keyword);
            
            // Should not be treated as function calls
            expect(result.symbols.filter(s => s.type === SymbolType.FunctionCall && ['AND', 'OR', 'NOT'].includes(s.name)).length).toBe(0);
        });
        
        it('should handle string literals with special characters', () => {
            const document = createTestDocument(`IF [Category] = "Men's Clothing" THEN "Special" ELSE "Normal" END`);
            
            const result = ErrorRecovery.parseWithErrorRecovery(document);
            
            expect(result.symbols.length).toBeGreaterThan(0);
            expect(result.diagnostics.filter(d => d.severity === DiagnosticSeverity.Error).length).toBe(0);
            
            const stringSymbols = result.symbols.filter(s => s.text?.includes("Men's Clothing"));
            expect(stringSymbols.length).toBeGreaterThan(0);
        });
        
        it('should track expression continuation across line boundaries', () => {
            const document = createTestDocument(`
SUM([Sales]) +
AVG([Profit]) *
COUNT([Orders])
            `.trim());
            
            const result = ErrorRecovery.parseWithErrorRecovery(document);
            
            expect(result.symbols.length).toBeGreaterThan(0);
            expect(result.symbols.some(s => s.name === 'SUM')).toBe(true);
            expect(result.symbols.some(s => s.name === 'AVG')).toBe(true);
            expect(result.symbols.some(s => s.name === 'COUNT')).toBe(true);
        });
        
        it('should provide context-aware parsing for different expression types', () => {
            const document = createTestDocument(`
CASE [Region]
WHEN "North" THEN SUM([Sales])
WHEN "South" THEN AVG([Sales])
ELSE MAX([Sales])
END
            `.trim());
            
            const result = ErrorRecovery.parseWithErrorRecovery(document);
            
            expect(result.symbols.some(s => s.name === 'CASE')).toBe(true);
            expect(result.symbols.filter(s => s.name === 'WHEN').length).toBe(2);
            expect(result.symbols.some(s => s.name === 'ELSE')).toBe(true);
            expect(result.symbols.some(s => s.name === 'END')).toBe(true);
            expect(result.symbols.some(s => s.name === 'SUM')).toBe(true);
            expect(result.symbols.some(s => s.name === 'AVG')).toBe(true);
            expect(result.symbols.some(s => s.name === 'MAX')).toBe(true);
        });
        
        it('should handle different formatting styles gracefully', () => {
            const testCases = [
                'IF[Sales]>100THEN"High"ELSE"Low"END',  // No spaces
                'IF [Sales] > 100 THEN "High" ELSE "Low" END',  // Normal spacing
                'IF  [Sales]  >  100  THEN  "High"  ELSE  "Low"  END',  // Extra spaces
                `IF [Sales] > 100
                 THEN "High"
                 ELSE "Low"
                 END`  // Multi-line with indentation
            ];
            
            testCases.forEach((testCase, index) => {
                const document = createTestDocument(testCase);
                const result = ErrorRecovery.parseWithErrorRecovery(document);
                
                expect(result.symbols.length).toBeGreaterThan(0);
                expect(result.symbols.some(s => s.name === 'IF')).toBe(true);
                expect(result.symbols.some(s => s.name === 'THEN')).toBe(true);
                expect(result.symbols.some(s => s.name === 'ELSE')).toBe(true);
                expect(result.symbols.some(s => s.name === 'END')).toBe(true);
            });
        });
        
        it('should handle unclosed parentheses gracefully', () => {
            const document = createTestDocument('SUM([Sales] + AVG([Profit]');
            
            const result = ErrorRecovery.parseWithErrorRecovery(document);
            
            expect(result.symbols.length).toBeGreaterThan(0);
            expect(result.symbols.some(s => s.name === 'SUM')).toBe(true);
            expect(result.symbols.some(s => s.name === 'AVG')).toBe(true);
            
            // Should have a warning about unclosed parentheses
            const warnings = result.diagnostics.filter(d => d.severity === DiagnosticSeverity.Warning);
            expect(warnings.some(w => w.message.includes('Unclosed'))).toBe(true);
        });
        
        it('should handle empty field references', () => {
            const document = createTestDocument('SUM([]) + AVG([Sales])');
            
            const result = ErrorRecovery.parseWithErrorRecovery(document);
            
            expect(result.symbols.length).toBeGreaterThan(0);
            expect(result.symbols.some(s => s.name === 'SUM')).toBe(true);
            expect(result.symbols.some(s => s.name === 'AVG')).toBe(true);
            
            // Should have a warning about empty field reference
            const warnings = result.diagnostics.filter(d => d.severity === DiagnosticSeverity.Warning);
            expect(warnings.some(w => w.message.includes('Empty field reference'))).toBe(true);
        });
        
        it('should handle nested IIF functions correctly', () => {
            const document = createTestDocument(`
IIF([Sales] > 1000,
    IIF([Profit] > 100, "High Profit", "Low Profit"),
    "Low Sales")
            `.trim());
            
            const result = ErrorRecovery.parseWithErrorRecovery(document);
            
            expect(result.symbols.length).toBeGreaterThan(0);
            expect(result.symbols.filter(s => s.name === 'IIF').length).toBe(2);
            
            // Should not have parameter count errors for properly nested IIF
            const parameterErrors = result.diagnostics.filter(d => d.message.includes('parameter count'));
            expect(parameterErrors.length).toBe(0);
        });
        
        it('should provide helpful guidance for incomplete LOD expressions', () => {
            const document = createTestDocument('{FIXED [Customer] : SUM([Sales]');
            
            const result = ErrorRecovery.parseWithErrorRecovery(document);
            
            expect(result.symbols.length).toBeGreaterThan(0);
            expect(result.symbols.some(s => s.name === 'FIXED')).toBe(true);
            expect(result.symbols.some(s => s.name === 'SUM')).toBe(true);
            
            // Should have a warning about unclosed LOD expression
            const warnings = result.diagnostics.filter(d => d.severity === DiagnosticSeverity.Warning);
            expect(warnings.some(w => w.message.includes('Unclosed LOD expression'))).toBe(true);
        });
        
        it('should handle catastrophic parsing errors gracefully', () => {
            // Create a document with severely malformed syntax
            const document = createTestDocument('IF THEN ELSE WHEN CASE END END END');
            
            const result = ErrorRecovery.parseWithErrorRecovery(document);
            
            expect(result.symbols.length).toBeGreaterThan(0);
            expect(result.recoveryInfo.totalErrors).toBeGreaterThan(0);
            expect(result.recoveryInfo.recoveredErrors).toBeGreaterThan(0);
            
            // Should have created fallback symbols
            expect(result.symbols.some(s => s.name.includes('IF'))).toBe(true);
        });
        
        it('should maintain proper expression boundaries', () => {
            const document = createTestDocument(`
IF [Sales] > (
    SUM([Profit]) + 
    AVG([Discount])
) THEN "High" 
ELSE "Low" 
END
            `.trim());
            
            const result = ErrorRecovery.parseWithErrorRecovery(document);
            
            expect(result.symbols.length).toBeGreaterThan(0);
            expect(result.symbols.some(s => s.name === 'IF')).toBe(true);
            expect(result.symbols.some(s => s.name === 'SUM')).toBe(true);
            expect(result.symbols.some(s => s.name === 'AVG')).toBe(true);
            expect(result.symbols.some(s => s.name === 'THEN')).toBe(true);
            expect(result.symbols.some(s => s.name === 'ELSE')).toBe(true);
            expect(result.symbols.some(s => s.name === 'END')).toBe(true);
        });
        
        it('should handle comments properly', () => {
            const document = createTestDocument(`
// This is a comment
SUM([Sales]) // Inline comment
/* Block comment */
AVG([Profit])
            `.trim());
            
            const result = ErrorRecovery.parseWithErrorRecovery(document);
            
            expect(result.symbols.length).toBeGreaterThan(0);
            expect(result.symbols.some(s => s.name === 'SUM')).toBe(true);
            expect(result.symbols.some(s => s.name === 'AVG')).toBe(true);
            expect(result.symbols.some(s => s.type === SymbolType.Comment)).toBe(true);
        });
    });
    
    describe('recovery statistics', () => {
        
        it('should provide accurate recovery statistics', () => {
            const document = createTestDocument(`
SUM([Sales] + 
UNKNOWN_FUNC([Profit]) +
[] +
{FIXED [Customer] : AVG([Sales]
            `.trim());
            
            const result = ErrorRecovery.parseWithErrorRecovery(document);
            
            expect(result.recoveryInfo.totalErrors).toBeGreaterThan(0);
            expect(result.recoveryInfo.recoveredErrors).toBeGreaterThan(0);
            expect(result.recoveryInfo.recoveredErrors).toBeLessThanOrEqual(result.recoveryInfo.totalErrors);
        });
    });
});

/**
 * Helper function to create test documents
 */
function createTestDocument(content: string, version: number = 1, uri: string = 'test://test.twbl'): TextDocument {
    return TextDocument.create(uri, 'tableau', version, content);
}