# Tableau Language Server Protocol (LSP) for VS Code

A VS Code extension that provides language server features for Tableau calculation expressions.

## Features

- **Syntax Highlighting**: Highlights Tableau calculation syntax including functions, keywords, operators, and field references.
- **Hover Information**: Shows detailed, context-aware information when hovering over Tableau functions, fields, and keywords.
- **Code Completion**: Suggests functions, fields, and keywords as you type.
- **Signature Help**: Displays function signatures and parameter information when typing function calls.
- **Document Symbols**: Lists all functions and expressions in the current document.
- **Validation**: Validates Tableau expressions for syntax errors and provides diagnostics.

## Enhanced Features

### Enhanced Document Model

The document model has been significantly improved to:

- **Parse Multi-line Expressions**: Properly handles complex expressions that span multiple lines.
- **Support Different Expression Types**: Recognizes and processes IF, CASE, LOD, function calls, and field references.
- **Extract Symbol Context**: Understands the context in which symbols are used for better hover information and validation.
- **Manage Document Lifecycle**: Efficiently caches and updates document models as needed.

### Context-Aware Hover Information

The hover provider now offers rich, context-aware information:

- **Function Hover**: Shows function signature, parameter details, return type, description, and examples.
- **Field Hover**: Shows field type and description.
- **Keyword Hover**: Shows usage context and description based on the expression type (IF, CASE, LOD).
- **Operator Hover**: Shows operator type and description.
- **Performance Optimized**: Implements caching for faster hover responses.

### Improved Validation

The validation system has been enhanced to:

- **Validate Multi-line Expressions**: Checks syntax across complex multi-line expressions.
- **Apply Expression-Specific Rules**: Uses different validation rules based on expression type.
- **Check Parameter Counts**: Validates function calls with the correct number of parameters.
- **Provide Detailed Diagnostics**: Gives specific error messages for different types of issues.

### Testing Framework

A comprehensive testing framework has been added:

- **Hover Testing**: Tests hover functionality for different symbol types.
- **Document Model Testing**: Tests parsing and symbol extraction.
- **Validation Testing**: Tests validation rules for different expression types.
- **Performance Testing**: Measures and compares performance metrics.

## Usage

1. Open a `.twbl` file in VS Code.
2. Write Tableau calculation expressions.
3. Hover over functions, fields, or keywords to see detailed information.
4. Use code completion to get suggestions as you type.
5. View validation errors and warnings in the Problems panel.

## Requirements

- Visual Studio Code 1.60.0 or higher

## Extension Settings

This extension contributes the following settings:

* `tableau.enableFormatting`: Enable/disable formatting for Tableau expressions.
* `tableau.enableSignatureHelp`: Enable/disable signature help for Tableau functions.

## Known Issues

- Complex nested expressions may not be fully validated.
- Some advanced Tableau features may not be fully supported.

## Release Notes

### 2.0.0

- Added enhanced document model with multi-line expression support
- Implemented context-aware hover information with rich formatting
- Improved validation with expression-specific rules
- Added comprehensive testing framework
- Optimized performance with caching mechanisms

### 1.0.0

- Initial release with basic language server features