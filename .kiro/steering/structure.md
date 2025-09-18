---
inclusion: always
---

# Project Structure

## Directory Organization

- **client/**: Client-side code for the VS Code extension
  - `extension.ts`: Entry point for the VS Code extension
  - `common.js`: Common utilities shared between client and server

- **server/**: Server-side code for the language server
  - `src/`: Source code for the server implementation

- **src/**: Core implementation of the language features
  - `extension.ts`: Main extension entry point
  - `server.ts`: Language server implementation
  - `common.ts`: Shared utilities and types
  - `documentModel.ts`: Document parsing and model management
  - `lexer.ts`: Lexical analysis for Tableau expressions
  - `incrementalParser.ts`: Incremental parsing for better performance
  - `hoverProvider.ts`: Hover information provider
  - `completionProvider.ts`: Code completion provider
  - `signatureProvider.ts`: Signature help provider
  - `diagnosticsProvider.ts`: Validation and diagnostics
  - `semanticTokensProvider.ts`: Semantic highlighting
  - `slashCommandProvider.ts`: Slash command completion
  - `fieldParser.ts`: Field reference parsing
  - `format.ts`: Code formatting
  - `errorRecovery.ts`: Error recovery for parsing
  - `conditionalExpressionValidator.ts`: Validation for conditional expressions
  - `jsdocParser.ts`: JSDoc-style comment parsing
  - `commands/`: Command implementations

- **syntaxes/**: TextMate grammar and language definitions
  - `twbl.tmLanguage.json`: TextMate grammar for syntax highlighting
  - `functions.json`: Function definitions
  - `twbl.d.twbl`: Type definitions for Tableau language
  - `fields.d.twbl`: Field definitions

- **snippets/**: Code snippets for the language
  - `twbl.json`: General snippets
  - `slash-commands.json`: Slash command snippets

- **docs/**: Documentation
  - `user-guide.md`: User documentation
  - `developer-guide.md`: Developer documentation

- **images/**: Icons and images for the extension

## Key Files

- **package.json**: Extension manifest and npm configuration
- **tsconfig.json**: TypeScript configuration
- **language-configuration.json**: Language configuration for VS Code
- **test-*.twbl**: Test files for the Tableau language
- **test-runner.js**: Custom test runner for integration tests

## Code Organization Patterns

1. **Provider Pattern**: Each language feature is implemented as a provider class
2. **Document Model**: Central document model for parsing and analyzing expressions
3. **Client-Server Architecture**: Separation between client and server components
4. **Incremental Processing**: Incremental parsing and analysis for better performance
5. **Caching**: Extensive use of caching for performance optimization

## Extension Points

- **Language Features**: Hover, completion, signature help, diagnostics, etc.
- **Commands**: Custom commands registered with VS Code
- **Configuration**: Extension settings in package.json
- **Snippets**: Code snippets for common patterns