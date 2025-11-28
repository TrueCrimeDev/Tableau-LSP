# Project Context: Tableau Language Support (LSP)

## Project Overview

- **Version**: ContextKit 0.0.0
- **Setup Date**: 2025-09-18
- **Components**: 1 primary TypeScript/Node.js VS Code extension
- **Workspace**: None (standalone project)
- **Primary Tech Stack**: TypeScript, Node.js, VS Code Extension API

## Component Architecture

**Project Structure**:

```
📁 Tableau-LSP
└── 🔧 VS Code Extension (Language Server) - Complete language support for Tableau calculation language - TypeScript/Node.js - ./
    ├── 📂 src/ - TypeScript source files
    ├── 📂 syntaxes/ - TextMate grammar definitions
    ├── 📂 snippets/ - Code snippet definitions
    ├── 📂 docs/ - User and developer documentation
    └── 📂 server/ - Language server protocol implementation
```

**Component Summary**:
- **1 TypeScript/Node.js component** - VS Code extension with LSP implementation
- **Dependencies**: 95+ npm packages for VS Code extension, language server, and testing
- **Primary Features**: Syntax highlighting, IntelliSense, validation, formatting, snippets

---

## Component Details

### VS Code Extension - Language Server

**Location**: `./`
**Purpose**: Provides complete language support for Tableau calculation expressions in VS Code
**Tech Stack**: TypeScript, Node.js 20+, VS Code Extension API, Language Server Protocol

**File Structure**:
```
./
├── src/                    # TypeScript source files
│   ├── extension.ts        # Main extension entry point
│   ├── server.ts           # Language server entry point
│   ├── hoverProvider.ts    # Hover information provider
│   ├── completionProvider.ts # Code completion provider
│   ├── diagnosticsProvider.ts # Validation and diagnostics
│   ├── documentModel.ts    # Document parsing and management
│   └── tests/              # Test suites
├── syntaxes/               # TextMate grammar definitions
│   └── twbl.tmLanguage.json
├── snippets/               # Code snippet templates
│   └── advanced-patterns.json
├── docs/                   # Documentation
│   ├── user-guide.md
│   └── developer-guide.md
├── package.json            # NPM configuration
├── tsconfig.json           # TypeScript configuration
└── language-configuration.json # VS Code language config
```

**Dependencies** (from package.json):
- **VS Code API**: vscode ^1.90.0 (required engine)
- **Language Server**: vscode-languageclient, vscode-languageserver
- **XML Parsing**: fast-xml-parser (for Tableau workbook parsing)
- **Archive Handling**: unzipper (for .twbx file support)
- **Testing**: jest, @vscode/test-electron, vitest
- **Build Tools**: esbuild, typescript, prettier, eslint
- **Development**: 95+ total dependencies for complete extension functionality

**Development Commands**:
```bash
# Build (validated during setup)
npm run build

# Test (unit tests - may timeout on full suite)
npm run test:unit

# Type checking
npm run typecheck

# Linting
npm run lint

# Format code
npm run format

# Build for production
npm run vscode:prepublish

# Watch mode for development
npm run watch

# All tests (comprehensive suite)
npm run test:all

# Performance tests
npm run test:performance

# Integration tests
npm run test:integration
```

**Code Style** (detected):
- **Indentation**: 4 spaces (no tabs detected in source files)
- **Module System**: ES6 imports with TypeScript
- **Formatting**: Prettier available (npm run format)
- **Linting**: ESLint configured
- **TypeScript**: Strict mode enabled with ES2021 target

---

## Development Environment

**Requirements** (from analysis):
- Node.js 20+ (target: node20 in build config)
- VS Code 1.90.0+ (minimum required version)
- TypeScript compiler (for development)
- npm or yarn package manager

**Build Tools** (detected):
- **esbuild**: Primary bundler for fast builds
- **TypeScript**: tsc for type checking and compilation
- **Jest**: Unit testing framework
- **Vitest**: Additional test runner
- **Prettier**: Code formatting
- **ESLint**: Code linting

**Extension Configuration**:
- **Language ID**: twbl (Tableau calculation language)
- **File Extensions**: .twbl
- **Syntax Scope**: source.twbl
- **Semantic Tokens**: Keywords, functions, variables, constants, operators, strings

## Constitutional Principles

**Core Principles**:
- ✅ Accessibility-first design (UI supports all assistive technologies)
- ✅ Privacy by design (minimal data collection, explicit consent)
- ✅ Localizability from day one (externalized strings, cultural adaptation)
- ✅ Code maintainability (readable, testable, documented code)
- ✅ Platform-appropriate UX (native conventions, platform guidelines)

**Workspace Inheritance**: [Workspace principle adjustments or "None - using global defaults"]

## ContextKit Workflow

**Systematic Feature Development**:
- `/ctxk:plan:1-spec` - Create business requirements specification (prompts interactively)
- `/ctxk:plan:2-research-tech` - Define technical research, architecture and implementation approach
- `/ctxk:plan:3-steps` - Break down into executable implementation tasks

**Development Execution**:
- `/ctxk:impl:start-working` - Continue development within feature branch (requires completed planning phases)
- `/ctxk:impl:commit-changes` - Auto-format code and commit with intelligent messages

**Quality Assurance**: Automated agents validate code quality during development
**Project Management**: All validated build/test commands documented above for immediate use

## Development Automation

**Quality Agents Available**:
- `build-project` - Execute builds with constitutional compliance validation
- `check-accessibility` - VoiceOver, contrast, keyboard navigation validation
- `check-localization` - String Catalog and cultural adaptation validation
- `check-error-handling` - ErrorKit patterns and typed throws validation
- `check-modern-code` - API modernization (Date.now, Duration, async/await)
- `check-code-debt` - Technical debt cleanup and AI artifact removal

## Configuration Hierarchy

**Inheritance**: [Workspace Context] → **This Project**

**This Project Inherits From**:
- **Workspace**: [Workspace name and standards or "None (standalone project)"]
- **Project**: Component-specific configurations documented above

**Override Precedence**: Project component settings override workspace settings

---
*Generated by ContextKit with comprehensive component analysis. Manual edits preserved during updates.*