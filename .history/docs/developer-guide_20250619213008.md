# Tableau LSP Developer Documentation

This document provides technical details about the architecture, components, and extension points of the Tableau Language Server Protocol (LSP) implementation.

## Architecture Overview

The Tableau LSP is built on a modular architecture with several key components:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  VS Code API    │────▶│  Extension      │────▶│  Tableau LSP    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                                                        ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Hover Provider │◀────│ Document Model  │────▶│  Validation     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### Key Components

1. **Extension (extension.ts)**
   - Entry point for the VS Code extension
   - Registers language features and providers
   - Initializes the Tableau LSP

2. **Tableau LSP (tableauLsp.ts)**
   - Core language server implementation
   - Manages communication between VS Code and the language features
   - Provides symbol information and language features

3. **Document Model (tableauDocumentModel.ts)**
   - Parses and analyzes Tableau expressions
   - Extracts symbols and their context
   - Manages document lifecycle and caching

4. **Hover Provider (tableauHoverProvider.ts)**
   - Provides rich hover information for symbols
   - Formats information based on symbol type and context
   - Implements caching for better performance

5. **Validation Provider (tableauValidationProvider.ts)**
   - Validates Tableau expressions
   - Provides diagnostics for syntax errors
   - Implements expression-specific validation rules

6. **Testing Framework (test-hover.js, test-runner.js)**
   - Tests hover functionality and document handling
   - Measures performance metrics
   - Provides a command to run tests from VS Code

## Component Details

### Document Model

The `TableauDocumentModel` class is responsible for parsing and analyzing Tableau expressions. It provides the following key features:

- **Multi-line Expression Parsing**: Parses expressions that span multiple lines
- **Expression Type Detection**: Identifies different types of expressions (IF, CASE, LOD, function, field)
- **Symbol Extraction**: Extracts symbols and their context from expressions
- **Position-based Lookup**: Finds symbols and expressions at specific positions

```typescript
// Key interfaces and types
interface TableauExpression {
    startLine: number;
    endLine: number;
    text: string;
    type: TableauExpressionType;
    symbols: TableauSymbolContext[];
}

type TableauExpressionType = 'if' | 'case' | 'function' | 'field' | 'lod' | 'other';

interface TableauSymbolContext {
    name: string;
    type: 'function' | 'field' | 'keyword' | 'operator' | 'constant';
    expressionType: TableauExpressionType;
    range: vscode.Range;
}
```

The `TableauDocumentManager` class manages document models for multiple files, providing caching and lifecycle management:

- **Singleton Pattern**: Ensures a single instance is used throughout the extension
- **Document Caching**: Caches document models for better performance
- **Dirty Tracking**: Tracks when documents need to be re-parsed

### Hover Provider

The `TableauHoverProvider` class provides rich hover information for Tableau symbols:

- **Context-Aware Information**: Shows different information based on symbol type and context
- **Rich Markdown Formatting**: Uses markdown for better readability
- **Parameter Information**: Shows detailed parameter information for functions
- **Caching Mechanism**: Caches hover results for better performance

Key methods:

- `provideHover`: Main method called by VS Code to get hover information
- `createHoverForSymbol`: Creates hover information based on symbol type and context
- `addContextAwareInformation`: Adds context-specific information to hover
- `addParameterInformation`: Adds parameter details for functions
- `addExamples`: Adds examples for symbols

### Validation Provider

The `TableauValidationProvider` class validates Tableau expressions and provides diagnostics:

- **Expression-Specific Rules**: Applies different validation rules based on expression type
- **Bracket Matching**: Checks for mismatched brackets
- **Structure Validation**: Validates IF/THEN/END and CASE/WHEN/END structures
- **Function Parameter Validation**: Checks function calls for correct parameter counts

Key validation rules:

- **IF Statements**: Must have THEN and END, proper ELSEIF/ELSE structure
- **CASE Statements**: Must have WHEN and END, at least one WHEN clause
- **LOD Expressions**: Must have proper format with colon, FIXED/INCLUDE/EXCLUDE keyword
- **Function Calls**: Must use known functions with correct parameter counts

## Extension Points

### Adding New Symbol Types

To add support for new symbol types:

1. Update the `TableauSymbolContext` interface in `tableauDocumentModel.ts`
2. Add extraction logic in the `extractSymbols` method
3. Update the hover provider to handle the new symbol type

### Adding New Expression Types

To add support for new expression types:

1. Update the `TableauExpressionType` type in `tableauDocumentModel.ts`
2. Add detection logic in the `determineExpressionType` method
3. Add validation rules in the `validateExpression` method

### Adding New Validation Rules

To add new validation rules:

1. Update the `validateExpression` method in `tableauValidationProvider.ts`
2. Add specific validation logic for the rule
3. Add appropriate error messages

### Extending Hover Information

To extend hover information:

1. Update the `createHoverForSymbol` method in `tableauHoverProvider.ts`
2. Add new sections or formatting as needed
3. Consider adding helper methods for complex formatting

## Performance Considerations

The Tableau LSP includes several performance optimizations:

- **Document Caching**: Document models are cached and only re-parsed when needed
- **Hover Caching**: Hover results are cached to avoid redundant processing
- **Lazy Parsing**: Documents are only parsed when information is requested
- **Efficient Symbol Lookup**: Symbols are indexed for quick lookup by position

When extending the LSP, consider these performance best practices:

- Cache expensive operations
- Use lazy evaluation when possible
- Optimize for common use cases
- Use efficient data structures for lookups

## Testing

The testing framework provides comprehensive testing for the LSP:

- **Hover Testing**: Tests hover functionality for different symbol types
- **Document Model Testing**: Tests parsing and symbol extraction
- **Validation Testing**: Tests validation rules for different expression types
- **Performance Testing**: Measures and compares performance metrics

To run the tests:

1. Open a `.twbl` file in VS Code
2. Run the `tableau-lsp.runTests` command
3. Check the `test-results.log` file for results

To add new tests:

1. Update the test cases in `test-hover.js`
2. Add specific test logic for the new feature
3. Update the test runner if needed

## Troubleshooting

Common issues and solutions:

- **Hover not working**: Check if the document model is being parsed correctly
- **Validation not showing errors**: Check if the validation provider is registered
- **Performance issues**: Check for expensive operations in loops or event handlers
- **Symbol extraction issues**: Check the regular expressions in the document model

## Future Improvements

Potential areas for future improvement:

- **Semantic Analysis**: Add more sophisticated semantic analysis for expressions
- **Code Actions**: Provide quick fixes for common errors
- **Refactoring Support**: Add refactoring capabilities for expressions
- **Better Symbol Resolution**: Improve symbol resolution across files
- **Performance Optimizations**: Further optimize parsing and analysis