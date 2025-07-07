// Tableau LSP Test Runner
// This script runs the hover handler and document handling tests using the real extension logic

const path = require('path');
const fs = require('fs');

// Import real extension logic
const { TableauProvider } = require('./src/tableauProvider');
const { TableauHoverProvider } = require('./src/tableauHoverProvider');
const { TableauDocumentManager } = require('./src/tableauDocumentModel');

// Create a mock VS Code API and make it available globally
global.vscode = {
  Position: class {
    constructor(line, character) {
      this.line = line;
      this.character = character;
    }
    isEqual(other) {
      return this.line === other.line && this.character === other.character;
    }
    translate(lineDelta, charDelta) {
      return new global.vscode.Position(this.line + (lineDelta || 0), this.character + (charDelta || 0));
    }
  },
  Range: class {
    constructor(startLine, startCharacter, endLine, endCharacter) {
      this.start = new global.vscode.Position(startLine, startCharacter);
      this.end = new global.vscode.Position(endLine, endCharacter);
    }
    contains(position) {
      if (position.line < this.start.line || position.line > this.end.line) return false;
      if (position.line === this.start.line && position.character < this.start.character) return false;
      if (position.line === this.end.line && position.character > this.end.character) return false;
      return true;
    }
  },
  Uri: {
    file: (filePath) => ({ fsPath: path.resolve(filePath), scheme: 'file', toString: () => `file://${path.resolve(filePath)}` }),
    parse: (uri) => ({ fsPath: uri.replace('file://', ''), scheme: 'file' })
  },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: process.cwd() } }],
    openTextDocument: async (filePath) => {
      const absPath = typeof filePath === 'string' ? filePath : filePath.fsPath;
      const content = fs.readFileSync(absPath, 'utf8');
      const lines = content.split('\n');
      return {
        uri: global.vscode.Uri.file(absPath),
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
      if (command === 'vscode.executeHoverProvider') {
        const [uri, position] = args;
        const document = await global.vscode.workspace.openTextDocument(uri.fsPath);
        const tableauProvider = new TableauProvider();
        const hoverProvider = new TableauHoverProvider(tableauProvider);
        const documentManager = TableauDocumentManager.getInstance();
        // Ensure document model is up to date
        documentManager.getDocumentModel(document);
        const hover = await hoverProvider.provideHover(document, position, {});
        if (!hover) return [];
        return [{
          contents: hover.contents || hover._contents || [{ value: 'No hover content' }],
          range: hover.range
        }];
      }
      if (command === 'vscode.executeDocumentSymbolProvider') {
        const [uri] = args;
        const document = await global.vscode.workspace.openTextDocument(uri.fsPath);
        const documentManager = TableauDocumentManager.getInstance();
        const model = documentManager.getDocumentModel(document);
        // Return symbols in VSCode-like format
        const symbols = [];
        for (const context of model.symbols.values()) {
          symbols.push({
            name: context.name,
            kind: context.type,
            range: context.range
          });
        }
        return symbols;
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
    console.log('Starting Tableau LSP tests with real extension logic...');
    await testHover.runTests();
    console.log('All tests completed successfully');
  } catch (error) {
    console.error('Test execution failed:', error);
    process.exit(1);
  }
}

main();