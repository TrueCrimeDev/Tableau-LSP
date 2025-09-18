// src/tests/unit/snippetCompletion.test.ts

import { TextDocument } from 'vscode-languageserver-textdocument';
import { CompletionItemKind, InsertTextFormat, TextDocumentPositionParams } from 'vscode-languageserver';
import { provideCompletion } from '../../completionProvider';
import { parseDocument } from '../../documentModel';
import { FieldParser } from '../../fieldParser';

describe('Snippet Completion', () => {
  describe('Basic Snippet Completion', () => {
    it('should provide IF statement snippet completion', () => {
      const document = createTestDocument('i');
      const parsedDocument = parseDocument(document);
      const params: TextDocumentPositionParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 1 }
      };

      const completions = provideCompletion(params, document, parsedDocument, null);
      
      // Should include IF snippet
      const ifSnippet = completions.items.find(item => 
        item.label === 'if' && item.kind === CompletionItemKind.Snippet
      );
      
      expect(ifSnippet).toBeDefined();
      expect(ifSnippet?.insertTextFormat).toBe(InsertTextFormat.Snippet);
      expect(ifSnippet?.insertText).toContain('IF ${1:condition} THEN ${2:value}');
      expect(ifSnippet?.detail).toContain('Snippet');
    });

    it('should provide CASE statement snippet completion', () => {
      const document = createTestDocument('case');
      const parsedDocument = parseDocument(document);
      const params: TextDocumentPositionParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 4 }
      };

      const completions = provideCompletion(params, document, parsedDocument, null);
      
      // Should include CASE snippet
      const caseSnippet = completions.items.find(item => 
        item.label === 'case' && item.kind === CompletionItemKind.Snippet
      );
      
      expect(caseSnippet).toBeDefined();
      expect(caseSnippet?.insertText).toContain('CASE ${1:field}');
      expect(caseSnippet?.insertText).toContain('WHEN');
      expect(caseSnippet?.insertText).toContain('END');
    });

    it('should provide LOD expression snippet completion', () => {
      const document = createTestDocument('fixed');
      const parsedDocument = parseDocument(document);
      const params: TextDocumentPositionParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 5 }
      };

      const completions = provideCompletion(params, document, parsedDocument, null);
      
      // Should include FIXED LOD snippet
      const fixedSnippet = completions.items.find(item => 
        item.label === 'fixed' && item.kind === CompletionItemKind.Snippet
      );
      
      expect(fixedSnippet).toBeDefined();
      expect(fixedSnippet?.insertText).toContain('{ FIXED ${1:[Dimension]} : ${2:AGG([Measure])} }');
    });

    it('should provide function snippet completions', () => {
      const document = createTestDocument('sum');
      const parsedDocument = parseDocument(document);
      const params: TextDocumentPositionParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 3 }
      };

      const completions = provideCompletion(params, document, parsedDocument, null);
      
      // Should include SUM snippet
      const sumSnippet = completions.items.find(item => 
        item.label === 'sum' && item.kind === CompletionItemKind.Snippet
      );
      
      expect(sumSnippet).toBeDefined();
      expect(sumSnippet?.insertText).toBe('SUM(${1:[Field]})');
    });
  });

  describe('Slash Command Snippets', () => {
    it('should provide slash command snippets when typing slash', () => {
      const document = createTestDocument('/if');
      const parsedDocument = parseDocument(document);
      const params: TextDocumentPositionParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 3 }
      };

      const completions = provideCompletion(params, document, parsedDocument, null);
      
      // Should include slash IF snippet
      const slashIfSnippet = completions.items.find(item => 
        item.label === '/if' && item.kind === CompletionItemKind.Snippet
      );
      
      expect(slashIfSnippet).toBeDefined();
      expect(slashIfSnippet?.insertText).toContain('IF ${1:condition} THEN ${2:value}');
    });

    it('should provide LOD slash command snippet', () => {
      const document = createTestDocument('/lod');
      const parsedDocument = parseDocument(document);
      const params: TextDocumentPositionParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 4 }
      };

      const completions = provideCompletion(params, document, parsedDocument, null);
      
      // Should include slash LOD snippet
      const slashLodSnippet = completions.items.find(item => 
        item.label === '/lod' && item.kind === CompletionItemKind.Snippet
      );
      
      expect(slashLodSnippet).toBeDefined();
      expect(slashLodSnippet?.insertText).toContain('{ ${1|FIXED,INCLUDE,EXCLUDE|} ${2:[Dimension]} : ${3:AGG([Measure])} }');
    });

    it('should not show regular snippets when typing slash commands', () => {
      const document = createTestDocument('/case');
      const parsedDocument = parseDocument(document);
      const params: TextDocumentPositionParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 5 }
      };

      const completions = provideCompletion(params, document, parsedDocument, null);
      
      // Should not include regular case snippet when typing slash command
      const regularCaseSnippet = completions.items.find(item => 
        item.label === 'case' && item.kind === CompletionItemKind.Snippet
      );
      
      expect(regularCaseSnippet).toBeUndefined();
      
      // Should include slash case snippet
      const slashCaseSnippet = completions.items.find(item => 
        item.label === '/case' && item.kind === CompletionItemKind.Snippet
      );
      
      expect(slashCaseSnippet).toBeDefined();
    });
  });

  describe('Complex Snippet Patterns', () => {
    it('should provide table calculation snippets', () => {
      const document = createTestDocument('running');
      const parsedDocument = parseDocument(document);
      const params: TextDocumentPositionParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 7 }
      };

      const completions = provideCompletion(params, document, parsedDocument, null);
      
      // Should include running sum snippet
      const runningSnippet = completions.items.find(item => 
        item.label === 'runningsum' && item.kind === CompletionItemKind.Snippet
      );
      
      expect(runningSnippet).toBeDefined();
      expect(runningSnippet?.insertText).toBe('RUNNING_SUM(${1:SUM([Measure])})');
    });

    it('should provide date function snippets', () => {
      const document = createTestDocument('datepart');
      const parsedDocument = parseDocument(document);
      const params: TextDocumentPositionParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 8 }
      };

      const completions = provideCompletion(params, document, parsedDocument, null);
      
      // Should include datepart snippet
      const datepartSnippet = completions.items.find(item => 
        item.label === 'datepart' && item.kind === CompletionItemKind.Snippet
      );
      
      expect(datepartSnippet).toBeDefined();
      expect(datepartSnippet?.insertText).toContain('DATEPART(');
      expect(datepartSnippet?.insertText).toContain('${1|year,quarter,month,week,day,weekday,hour,minute,second|}');
    });

    it('should provide business logic snippets', () => {
      const document = createTestDocument('customerseg');
      const parsedDocument = parseDocument(document);
      const params: TextDocumentPositionParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 10 }
      };

      const completions = provideCompletion(params, document, parsedDocument, null);
      
      // Should include customer segmentation snippet
      const customerSegSnippet = completions.items.find(item => 
        item.label === 'customerseg' && item.kind === CompletionItemKind.Snippet
      );
      
      expect(customerSegSnippet).toBeDefined();
      expect(customerSegSnippet?.insertText).toContain('Premium');
      expect(customerSegSnippet?.insertText).toContain('Standard');
      expect(customerSegSnippet?.insertText).toContain('Basic');
    });
  });

  describe('Snippet Documentation', () => {
    it('should provide rich documentation for snippets', () => {
      const document = createTestDocument('if');
      const parsedDocument = parseDocument(document);
      const params: TextDocumentPositionParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 2 }
      };

      const completions = provideCompletion(params, document, parsedDocument, null);
      
      const ifSnippet = completions.items.find(item => 
        item.label === 'if' && item.kind === CompletionItemKind.Snippet
      );
      
      expect(ifSnippet?.documentation).toBeDefined();
      expect(ifSnippet?.documentation?.value).toContain('**if**');
      expect(ifSnippet?.documentation?.value).toContain('Preview:');
      expect(ifSnippet?.documentation?.value).toContain('```twbl');
    });

    it('should clean up snippet variables in documentation preview', () => {
      const document = createTestDocument('datepart');
      const parsedDocument = parseDocument(document);
      const params: TextDocumentPositionParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 8 }
      };

      const completions = provideCompletion(params, document, parsedDocument, null);
      
      const datepartSnippet = completions.items.find(item => 
        item.label === 'datepart' && item.kind === CompletionItemKind.Snippet
      );
      
      // Documentation should have cleaned up variables
      expect(datepartSnippet?.documentation?.value).not.toContain('${');
      expect(datepartSnippet?.documentation?.value).toContain('year,quarter,month');
    });
  });

  describe('Snippet Filtering and Prioritization', () => {
    it('should prioritize snippets over other completion types', () => {
      const document = createTestDocument('if');
      const parsedDocument = parseDocument(document);
      const params: TextDocumentPositionParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 2 }
      };

      const completions = provideCompletion(params, document, parsedDocument, null);
      
      const ifSnippet = completions.items.find(item => 
        item.label === 'if' && item.kind === CompletionItemKind.Snippet
      );
      
      // Snippets should have highest priority (sortText starting with '0_')
      expect(ifSnippet?.sortText).toMatch(/^0_/);
    });

    it('should filter snippets based on prefix matching', () => {
      const document = createTestDocument('sum');
      const parsedDocument = parseDocument(document);
      const params: TextDocumentPositionParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 3 }
      };

      const completions = provideCompletion(params, document, parsedDocument, null);
      
      // Should include sum-related snippets
      const sumSnippets = completions.items.filter(item => 
        item.kind === CompletionItemKind.Snippet && 
        item.label.includes('sum')
      );
      
      expect(sumSnippets.length).toBeGreaterThan(0);
      
      // Should not include unrelated snippets like 'case'
      const caseSnippet = completions.items.find(item => 
        item.label === 'case' && item.kind === CompletionItemKind.Snippet
      );
      
      expect(caseSnippet).toBeUndefined();
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
  return TextDocument.create(uri, 'tableau', version, content);
}
</text>