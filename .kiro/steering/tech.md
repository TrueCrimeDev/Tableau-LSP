---
inclusion: always
---

# Technical Stack

## Core Technologies
- **TypeScript**: Primary development language
- **Node.js**: Runtime environment
- **VS Code Extension API**: For integrating with VS Code
- **Language Server Protocol (LSP)**: For providing language features

## Key Dependencies
- **vscode-languageclient**: Client-side LSP implementation
- **vscode-languageserver**: Server-side LSP implementation
- **vscode-languageserver-textdocument**: Text document handling for LSP
- **esbuild**: For bundling the extension

## Project Structure
The project follows a client-server architecture typical of LSP implementations:
- Client: VS Code extension that communicates with the language server
- Server: Language server that provides language features

## Build System
The project uses npm scripts for building, testing, and packaging:

### Common Commands

```bash
# Build the extension
npm run build

# Watch for changes and rebuild
npm run watch

# Run tests
npm run test

# Run specific test suites
npm run test:hover
npm run test:unit
npm run test:performance

# Type checking
npm run typecheck

# Formatting
npm run format

# Linting
npm run lint

# Clean build artifacts
npm run clean

# Package for publishing
npm run vscode:prepublish
```

## Testing Framework
- **Jest**: For unit testing
- **Custom test runner**: For integration and hover tests

## Code Style
- Uses Prettier for code formatting
- Uses ESLint for linting
- Follows strict TypeScript configuration with strict type checking enabled

## VS Code Integration
- Registers language features for `.twbl` files
- Provides custom TextMate grammar for syntax highlighting
- Implements LSP features like hover, completion, and diagnostics