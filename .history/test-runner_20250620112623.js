// Tableau LSP Test Runner
// This script runs the hover handler and document handling tests using a mock VS Code API

// Create a mock VS Code API and make it available globally
global.vscode = {
  Position: class {
    constructor(line, character) {
      this.line = line;
      this.character = character;
    }
  },
  Range: class {
    constructor(startLine, startCharacter, endLine, endCharacter) {
      this.start = new global.vscode.Position(startLine, startCharacter);
      this.end = new global.vscode.Position(endLine, endCharacter);
    }
  },
  Uri: {
    file: (path) => ({ fsPath: path, scheme: 'file' }),
    parse: (uri) => ({ fsPath: uri.replace('file://', ''), scheme: 'file' })
  },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: process.cwd() } }],
    openTextDocument: async (path) => {
      const fs = require('fs');
      const content = fs.readFileSync(path.fsPath || path, 'utf8');
      const lines = content.split('\n');
      return {
        uri: typeof path === 'string' ? global.vscode.Uri.file(path) : path,
        lineCount: lines.length,
        getText: () => content,
        lineAt: (line) => ({ text: lines[line] }),
        save: async () => true
      };
    },
    applyEdit: async (edit) => true
  },
  window: {
    showInformationMessage: (message) => console.log(`INFO: ${message}`),
    showErrorMessage: (message) => console.error(`ERROR: ${message}`),
    showTextDocument: async (doc) => doc
  },
  commands: {
    executeCommand: async (command, ...args) => {
      console.log(`Executing command: ${command}`);
      
      // Mock hover provider results
      if (command === 'vscode.executeHoverProvider') {
        const [uri, position] = args;
        return [{
          contents: [{ value: `Function: SUM\nCategory: Aggregation\nReturns: Numeric\nDescription: Calculates the sum of values.` }],
          range: new global.vscode.Range(position.line, position.character, position.line, position.character + 3)
        }];
      }
      
      // Mock document symbol provider results
      if (command === 'vscode.executeDocumentSymbolProvider') {
        return [
          { name: 'SUM', kind: 'function', range: new global.vscode.Range(7, 0, 7, 10) },
          { name: 'AVG', kind: 'function', range: new global.vscode.Range(8, 0, 8, 10) },
          { name: 'COUNT', kind: 'function', range: new global.vscode.Range(9, 0, 9, 10) },
          { name: 'CASE', kind: 'keyword', range: new global.vscode.Range(25, 0, 29, 3) }
        ];
      }
      
      return [];
    },
    registerCommand: (command, callback) => {
      console.log(`Registered command: ${command}`);
      return { dispose: () => {} };
    }
  },
  languages: {
    getDiagnostics: (uri) => []
  },
  WorkspaceEdit: class {
    constructor() {
      this.edits = [];
    }
    
    insert(uri, position, text) {
      this.edits.push({ type: 'insert', uri, position, text });
    }
    
    delete(uri, range) {
      this.edits.push({ type: 'delete', uri, range });
    }
    
    createFile(uri, options) {
      this.edits.push({ type: 'createFile', uri, options });
    }
    
    deleteFile(uri, options) {
      this.edits.push({ type: 'deleteFile', uri, options });
    }
  },
  ExtensionContext: class {
    constructor() {
      this.subscriptions = [];
    }
  }
};

// Load the test module with the mocked vscode
const testHover = require('./test-hover');

// Run the tests
async function main() {
  try {
    console.log('Starting Tableau LSP tests with mock VS Code API...');
    
    // Run the tests
    await testHover.runTests();
    
    console.log('All tests completed successfully');
  } catch (error) {
    console.error('Test execution failed:', error);
    process.exit(1);
  }
}

main();