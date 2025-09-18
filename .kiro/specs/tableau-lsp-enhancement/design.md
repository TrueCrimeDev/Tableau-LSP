# Design Document

## Overview

This design document outlines the architecture and implementation approach for enhancing the existing Tableau Language Server Protocol (LSP) VS Code extension. The enhancement transforms the current prototype into a production-ready, enterprise-grade language server that provides comprehensive support for Tableau calculation expressions (.twbl files).

The design builds upon the existing LSP architecture while addressing performance, reliability, and feature completeness requirements. The enhanced system will maintain backward compatibility while introducing significant improvements in error handling, validation, completion intelligence, and user experience.

## Architecture

### High-Level Architecture

The enhanced Tableau LSP follows a client-server architecture pattern with the following key components:

```
┌─────────────────────────────────────────────────────────────┐
│                    VS Code Extension                        │
├─────────────────────────────────────────────────────────────┤
│  Client (src/extension.ts)                                  │
│  - Extension activation/deactivation                        │
│  - Command registration                                     │
│  - Slash command provider                                   │
│  - Language client configuration                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ LSP Protocol
                              │
┌─────────────────────────────────────────────────────────────┐
│                Language Server (src/server.ts)             │
├─────────────────────────────────────────────────────────────┤
│  Core LSP Features:                                         │
│  - Document lifecycle management                            │
│  - Request routing and response handling                    │
│  - Configuration management                                 │
│  - Error handling and logging                               │
└─────────────────────────────────────────────────────────────┘
                              │
                              │
┌─────────────────────────────────────────────────────────────┐
│                    Feature Providers                        │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐│
│  │ Document Model  │  │ Diagnostics     │  │ Hover Provider  ││
│  │ (Enhanced)      │  │ (Enhanced)      │  │ (Enhanced)      ││
│  └─────────────────┘  └─────────────────┘  └─────────────────┘│
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐│
│  │ Completion      │  │ Signature Help  │  │ Formatting      ││
│  │ (Enhanced)      │  │ (Enhanced)      │  │ (Enhanced)      ││
│  └─────────────────┘  └─────────────────┘  └─────────────────┘│
│  ┌─────────────────┐  ┌─────────────────┐                    │
│  │ Semantic Tokens │  │ Symbol Provider │                    │
│  │ (Enhanced)      │  │ (Enhanced)      │                    │
│  └─────────────────┘  └─────────────────┘                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              │
┌─────────────────────────────────────────────────────────────┐
│                    Data Sources                             │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐│
│  │ functions.json  │  │ twbl.tmLanguage │  │ twbl.d.twbl     ││
│  │ (Function Defs) │  │ (Grammar)       │  │ (Type Defs)     ││
│  └─────────────────┘  └─────────────────┘  └─────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### Core Design Principles

1. **Single Source of Truth**: All Tableau function definitions, signatures, and documentation are centralized in `syntaxes/functions.json`
2. **Incremental Processing**: Document parsing and validation occur incrementally to maintain responsiveness
3. **Graceful Degradation**: System continues functioning even when encountering errors or unknown constructs
4. **Performance First**: Caching, debouncing, and lazy loading optimize response times
5. **Extensibility**: Modular provider architecture allows easy addition of new features

### Error Recovery and Parsing Improvements

The enhanced document model implements robust error recovery mechanisms to address false positive diagnostics and improve parsing accuracy:

#### Multi-line Expression Handling
- **Context Preservation**: Maintain expression context across line boundaries using a stateful parser
- **Bracket Tracking**: Implement proper bracket matching for nested expressions and function calls
- **Line Continuation**: Recognize when expressions continue across multiple lines and defer validation until complete

#### Operator vs Function Classification
- **Token Classification**: Enhance lexer to properly classify AND, OR, NOT as logical operators rather than function identifiers
- **Context-Aware Parsing**: Use expression context to determine whether identifiers are functions, operators, or field references
- **Precedence Handling**: Implement proper operator precedence for complex logical expressions

#### Expression Boundary Detection
- **Block Structure**: Improve IF/CASE block parsing to correctly identify THEN/ELSE branches with content
- **Nested Expression**: Handle deeply nested IIF and conditional expressions with proper argument counting
- **String Literal Parsing**: Enhance string parsing to avoid misinterpreting content as function calls

#### Graceful Error Recovery
- **Partial Validation**: Provide meaningful diagnostics for incomplete expressions during editing
- **Error Isolation**: Prevent parsing errors in one section from affecting validation of other sections
- **Progressive Enhancement**: Continue parsing after encountering errors to provide maximum useful feedback

## Components and Interfaces

### Enhanced Document Model

**Location**: `src/documentModel.ts`

The document model serves as the foundation for all language server features, providing structured representation of Tableau calculation documents.

**Key Enhancements**:
- **Multi-line Expression Support**: Properly handles complex expressions spanning multiple lines with robust line continuation detection
- **Hierarchical Symbol Tree**: Builds nested symbol structures for IF/CASE blocks and LOD expressions with proper parent-child relationships
- **Context-Aware Parsing**: Understands expression context for better validation and completion, including operator vs function distinction
- **Incremental Updates**: Supports partial document updates for performance
- **Error Recovery**: Continues parsing after encountering errors, providing partial results for valid portions
- **Operator Recognition**: Correctly identifies logical operators (AND, OR, NOT) vs function calls
- **String Literal Handling**: Properly parses string literals with special characters and embedded quotes

**Interface**:
```typescript
interface ParsedDocument {
    document: TextDocument;
    symbols: Symbol[];
    diagnostics: Diagnostic[];
    expressionBlocks: ExpressionBlock[];
    fieldReferences: FieldReference[];
    parseErrors: ParseError[];
    isPartiallyValid: boolean;
}

interface Symbol {
    name: string;
    type: SymbolType;
    range: Range;
    children?: Symbol[];
    arguments?: ArgumentInfo[];
    context?: ExpressionContext;
    isComplete: boolean;
    continuationLines?: number[];
}

interface ArgumentInfo {
    text: string;
    range: Range;
    isComplete: boolean;
    type?: string;
}

interface ParseError {
    range: Range;
    message: string;
    severity: 'error' | 'warning';
    recoveryAction?: string;
}
```

### Enhanced Diagnostics Provider

**Location**: `src/diagnosticsProvider.ts`

Provides comprehensive validation with categorized error reporting and performance optimization, with specific focus on eliminating false positive errors.

**Key Features**:
- **Expression-Specific Validation**: Different rules for IF, CASE, LOD, and function expressions with multi-line awareness
- **Severity Classification**: Errors, warnings, and informational messages with intelligent filtering
- **Performance Issue Detection**: Identifies potential performance problems without false alarms
- **Contextual Error Messages**: Specific, actionable error descriptions with recovery suggestions
- **False Positive Prevention**: Advanced logic to avoid common parsing misinterpretations
- **Multi-line Expression Validation**: Correctly validates expressions that span multiple lines
- **Operator vs Function Distinction**: Properly differentiates between logical operators and function calls

**Validation Categories**:
1. **Syntax Validation**: Bracket matching, keyword structure, operator usage with multi-line support
2. **Semantic Validation**: Function signatures, field references, type compatibility with context awareness
3. **Performance Validation**: Nested aggregation warnings, complex expression alerts with intelligent thresholds
4. **Style Validation**: Formatting suggestions, naming conventions with configurable rules

**False Positive Prevention Strategies**:
- **Multi-line Expression Tracking**: Maintains expression state across line boundaries
- **Operator Recognition**: Distinguishes AND/OR/NOT operators from function calls
- **String Literal Parsing**: Correctly handles quoted strings with special characters
- **Incomplete Expression Handling**: Avoids errors for expressions being actively typed
- **Context-Aware Validation**: Applies different rules based on expression context

### Enhanced Hover Provider

**Location**: `src/hoverProvider.ts`

Delivers rich, context-aware information with improved performance and comprehensive coverage.

**Key Enhancements**:
- **Function Documentation**: Complete signatures, parameter descriptions, examples from `functions.json`
- **Field Information**: Type information, descriptions, usage context
- **Keyword Context**: Context-specific help for IF, CASE, LOD keywords
- **Performance Optimization**: Caching and efficient symbol lookup

**Hover Content Structure**:
```typescript
interface HoverContent {
    title: string;
    signature?: string;
    description: string;
    parameters?: ParameterInfo[];
    examples?: string[];
    relatedFunctions?: string[];
}
```

### Enhanced Completion Provider

**Location**: `src/completionProvider.ts`

Provides intelligent, context-aware code completion with fuzzy matching and relevance ranking.

**Key Features**:
- **Context-Aware Suggestions**: Different completions based on expression context
- **Fuzzy Matching**: Intelligent matching for partial function and field names
- **Relevance Ranking**: Prioritizes suggestions based on context and usage patterns
- **Snippet Integration**: Template-based completions for common patterns

**Completion Categories**:
1. **Function Completions**: All Tableau functions with parameter hints
2. **Field Completions**: Available fields with bracket completion
3. **Keyword Completions**: Context-appropriate keywords (THEN, ELSE, END)
4. **Snippet Completions**: Common calculation patterns and templates

### Enhanced Signature Help Provider

**Location**: `src/signatureProvider.ts`

Provides real-time parameter assistance with improved accuracy and performance.

**Key Enhancements**:
- **Multi-Signature Support**: Functions with multiple valid signatures
- **Parameter Highlighting**: Active parameter indication with descriptions
- **Nested Function Support**: Signature help within nested function calls
- **Performance Optimization**: Efficient parsing and caching

### Enhanced Formatting Provider

**Location**: `src/format.ts`

Implements consistent, configurable code formatting with preservation of user intent.

**Formatting Rules**:
1. **Indentation**: Consistent indentation for nested blocks (IF, CASE, LOD)
2. **Keyword Casing**: Uppercase for keywords, proper casing for functions
3. **Spacing**: Consistent spacing around operators and commas
4. **Line Breaks**: Logical line breaks for readability
5. **Bracket Alignment**: Proper alignment of field reference brackets

### Performance Optimization Layer

**Location**: `src/common.ts`

Centralized performance optimization with caching, debouncing, and resource management.

**Key Components**:
- **Document Cache**: Parsed document caching with LRU eviction
- **Symbol Cache**: Function and field symbol caching
- **Request Debouncing**: Prevents excessive processing during rapid typing
- **Memory Management**: Automatic cleanup and resource monitoring

## Data Models

### Core Data Structures

**Symbol Hierarchy**:
```typescript
enum SymbolType {
    CalculationName = 'calculation',
    FunctionCall = 'function',
    FieldReference = 'field',
    Keyword = 'keyword',
    Operator = 'operator',
    Literal = 'literal',
    Comment = 'comment',
    Block = 'block'
}

interface ExpressionBlock {
    type: 'IF' | 'CASE' | 'LOD';
    range: Range;
    conditions: Condition[];
    branches: Branch[];
    isComplete: boolean;
}
```

**Function Definition Model**:
```typescript
interface FunctionDefinition {
    name: string;
    category: string;
    signature: string;
    parameters: Parameter[];
    returnType: string;
    description: string;
    examples: string[];
    relatedFunctions: string[];
}

interface Parameter {
    name: string;
    type: string;
    required: boolean;
    description: string;
}
```

### Configuration Model

**Settings Structure**:
```typescript
interface TableauLSPSettings {
    enableHover: boolean;
    enableCompletion: boolean;
    enableSignatureHelp: boolean;
    enableDiagnostics: boolean;
    enableFormatting: boolean;
    semanticTokens: 'none' | 'partial' | 'full';
    performance: {
        maxCacheSize: number;
        debounceDelay: number;
        maxDocumentSize: number;
    };
}
```

## Error Handling

### Error Classification

1. **System Errors**: Server crashes, initialization failures, resource exhaustion
2. **Document Errors**: Parsing failures, invalid syntax, malformed expressions
3. **Feature Errors**: Provider failures, incomplete responses, timeout errors
4. **Configuration Errors**: Invalid settings, missing dependencies, permission issues

### Error Handling Strategy

**Graceful Degradation**:
- Continue operation when non-critical features fail
- Provide fallback responses for incomplete data
- Log errors for debugging while maintaining user experience

**Error Recovery**:
- Automatic retry for transient failures
- Cache invalidation for corrupted data
- Progressive feature disabling for persistent issues

**Error Reporting**:
```typescript
interface ErrorReport {
    severity: 'error' | 'warning' | 'info';
    code: string;
    message: string;
    source: string;
    range?: Range;
    relatedInformation?: DiagnosticRelatedInformation[];
}
```

## Testing Strategy

### Test Categories

1. **Unit Tests**: Individual provider and utility function testing
2. **Integration Tests**: End-to-end LSP feature testing
3. **Performance Tests**: Response time and memory usage validation
4. **Regression Tests**: Existing functionality preservation
5. **Edge Case Tests**: Error handling and boundary condition testing

### Test Framework Architecture

**Test Structure**:
```
tests/
├── unit/
│   ├── documentModel.test.ts
│   ├── diagnostics.test.ts
│   ├── hover.test.ts
│   ├── completion.test.ts
│   └── formatting.test.ts
├── integration/
│   ├── lsp-features.test.ts
│   └── real-world-scenarios.test.ts
├── performance/
│   ├── response-time.test.ts
│   └── memory-usage.test.ts
└── fixtures/
    ├── sample-calculations.twbl
    └── edge-cases.twbl
```

### Performance Benchmarks

**Target Metrics**:
- Hover response: < 50ms for documents under 10KB
- Completion response: < 100ms with full suggestion list
- Diagnostic update: < 200ms for documents under 50KB
- Memory usage: < 50MB per document, < 100MB total
- Startup time: < 2 seconds for extension activation

### Test Data Management

**Test Fixtures**:
- Real-world Tableau calculation examples
- Edge case scenarios (malformed syntax, complex nesting)
- Performance test documents (large files, complex expressions)
- Configuration test scenarios (various settings combinations)

## Implementation Phases

### Phase 1: Core Infrastructure Enhancement
- Enhanced document model with incremental parsing
- Improved error handling and logging
- Performance optimization layer implementation
- Basic test framework setup

### Phase 2: Feature Provider Enhancement
- Enhanced diagnostics with comprehensive validation
- Improved hover with rich content and caching
- Intelligent completion with context awareness
- Advanced signature help with nested support

### Phase 3: Advanced Features
- Enhanced formatting with configurable rules
- Semantic tokens with full Tableau syntax support
- Symbol navigation and definition providers
- Code actions and quick fixes

### Phase 4: Production Readiness
- Comprehensive test suite completion
- Performance optimization and monitoring
- Documentation and user guides
- Deployment and distribution preparation

This design provides a solid foundation for transforming the current Tableau LSP prototype into a production-ready, enterprise-grade language server that meets all specified requirements while maintaining extensibility for future enhancements.