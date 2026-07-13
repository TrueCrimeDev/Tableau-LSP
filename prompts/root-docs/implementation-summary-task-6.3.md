# Multi-Line Expression Formatting Implementation Summary

## Overview

This implementation adds comprehensive multi-line expression formatting to the Tableau Language Server Protocol (LSP) extension, fulfilling task 6.3 from the enhancement plan. The enhancement preserves logical line breaks, implements readability improvements for complex expressions, and provides intelligent formatting that understands Tableau calculation structure and context.

## Key Features Implemented

1. **Logical Line Break Preservation**
   - Maintains meaningful line breaks in IF/THEN/ELSE structures
   - Preserves CASE/WHEN statement formatting
   - Respects user-intended line breaks in complex expressions
   - Intelligent detection of where line breaks improve readability

2. **Expression Structure Analysis**
   - Multi-dimensional expression context analysis (IF, CASE, function, LOD, arithmetic, logical)
   - Nesting depth calculation for intelligent indentation
   - Complex expression detection for formatting decisions
   - Expression boundary detection for proper formatting scope

3. **Intelligent Indentation System**
   - Context-aware indentation based on expression type
   - Proper nesting support for deeply nested expressions
   - Configurable indentation (spaces vs tabs, size)
   - Branch-specific indentation rules (THEN, ELSE, ELSEIF, WHEN)

4. **Readability Improvements**
   - Automatic line wrapping for long expressions
   - Operator spacing normalization
   - Keyword case normalization (uppercase)
   - Parameter alignment in complex function calls

5. **Comprehensive Configuration System**
   - Configurable formatting options (line length, indentation, spacing)
   - VS Code formatting options integration
   - Custom formatting profiles
   - Runtime configuration changes

6. **Advanced Formatting Features**
   - LOD expression formatting with proper structure
   - Function parameter alignment and wrapping
   - Logical operator line breaking
   - Complex nested expression handling

## Implementation Details

### Expression Analysis Engine

The implementation uses a sophisticated expression analysis system:

```typescript
interface ExpressionContext {
    type: 'if' | 'case' | 'function' | 'lod' | 'arithmetic' | 'logical' | 'unknown';
    depth: number;
    isMultiLine: boolean;
    hasComplexNesting: boolean;
    startToken: Token;
    endToken?: Token;
}
```

**Analysis Features:**
- **Token-based parsing**: Uses existing lexer for accurate tokenization
- **Expression type detection**: Identifies different Tableau expression patterns
- **Nesting depth tracking**: Calculates expression complexity for formatting decisions
- **Multi-line detection**: Identifies expressions that span multiple lines

### Multi-Line Formatter Class

The core formatting logic is implemented in the `MultiLineFormatter` class:

```typescript
class MultiLineFormatter {
    private config: MultiLineFormattingConfig;
    private indentLevel: number;
    private currentLine: string;
    private result: string[];
    
    // Intelligent token processing with context awareness
    private processToken(token: Token, index: number, tokens: Token[], expressions: ExpressionContext[]): void
}
```

**Formatter Features:**
- **Context-aware processing**: Different handling for different token types
- **Indentation management**: Automatic indent level tracking
- **Line break decisions**: Intelligent line breaking based on expression complexity
- **Spacing normalization**: Consistent spacing around operators and keywords

### Configuration System

```typescript
interface MultiLineFormattingConfig {
    preserveLogicalLineBreaks: boolean;
    maxLineLength: number;
    indentSize: number;
    useSpaces: boolean;
    alignParameters: boolean;
    breakAfterOperators: boolean;
    wrapLongExpressions: boolean;
}
```

**Configuration Benefits:**
- **VS Code integration**: Respects VS Code formatting settings
- **Customizable behavior**: Adjustable formatting rules
- **Team consistency**: Shareable formatting configurations
- **Performance tuning**: Configurable complexity thresholds

### Formatting Rules Implementation

**IF/THEN/ELSE Formatting:**
```tableau
IF [Sales] > 100
THEN "High Sales"
ELSEIF [Sales] > 50
THEN "Medium Sales"
ELSE "Low Sales"
END
```

**CASE/WHEN Formatting:**
```tableau
CASE [Category]
    WHEN 'Furniture' THEN 'F'
    WHEN 'Technology' THEN 'T'
    ELSE 'O'
END
```

**LOD Expression Formatting:**
```tableau
{
    FIXED [Region], [Category] :
    SUM([Sales]) / SUM([Quantity])
}
```

**Complex Nested Formatting:**
```tableau
IF [Sales] > 100 AND [Profit] > 50
THEN
    CASE [Category]
        WHEN 'Furniture' THEN [Sales] * 0.1
        WHEN 'Technology' THEN [Sales] * 0.15
        ELSE [Sales] * 0.05
    END
ELSE
    0
END
```

## Performance Optimizations

1. **Efficient Token Processing**: Single-pass formatting with minimal memory allocation
2. **Expression Caching**: Reuses expression analysis results
3. **Lazy Evaluation**: Only analyzes expressions when needed for formatting decisions
4. **Memory Management**: Controlled string building with efficient concatenation

## Testing Coverage

The comprehensive test suite validates:

### Formatting Accuracy Tests
- **IF/THEN/ELSE structures**: Proper indentation and line breaks
- **CASE/WHEN statements**: Correct branch formatting
- **LOD expressions**: Proper structure preservation
- **Function calls**: Parameter alignment and wrapping
- **Operator spacing**: Consistent spacing rules

### Configuration Tests
- **Indentation options**: Spaces vs tabs, different sizes
- **Line length handling**: Wrapping and breaking behavior
- **Custom configurations**: User-defined formatting rules

### Error Handling Tests
- **Malformed expressions**: Graceful handling of syntax errors
- **Empty documents**: Proper handling of edge cases
- **Whitespace-only documents**: Appropriate responses

### Complex Expression Tests
- **Deeply nested structures**: Multi-level indentation
- **Mixed expression types**: LOD with nested IF/CASE
- **Long expressions**: Automatic line wrapping
- **Business logic patterns**: Real-world calculation formatting

## Management API

```typescript
export const MultiLineFormattingAPI = {
    getDefaultConfig(): MultiLineFormattingConfig
    formatWithConfig(document: TextDocument, config: Partial<MultiLineFormattingConfig>): TextEdit[]
    analyzeExpressions(document: TextDocument): ExpressionContext[]
    needsMultiLineFormatting(document: TextDocument): boolean
    getFormattingStats(document: TextDocument): FormattingStats
}
```

**API Benefits:**
- **Flexible configuration**: Runtime formatting customization
- **Analysis tools**: Expression structure inspection
- **Statistics**: Formatting complexity metrics
- **Integration support**: Easy integration with other tools

## Before and After Examples

### Before Formatting:
```tableau
IF[Sales]>100AND[Profit]>50THEN CASE[Category]WHEN'Furniture'THEN[Sales]*0.1 WHEN'Technology'THEN[Sales]*0.15 ELSE[Sales]*0.05 END ELSEIF[Sales]>50THEN[Sales]*0.03 ELSE 0 END
```

### After Formatting:
```tableau
IF [Sales] > 100 AND [Profit] > 50
THEN
    CASE [Category]
        WHEN 'Furniture' THEN [Sales] * 0.1
        WHEN 'Technology' THEN [Sales] * 0.15
        ELSE [Sales] * 0.05
    END
ELSEIF [Sales] > 50
THEN [Sales] * 0.03
ELSE 0
END
```

## Integration Benefits

The multi-line formatting system integrates seamlessly with existing LSP features:

1. **Document Model Integration**: Uses existing token analysis
2. **Error Recovery**: Graceful handling of malformed expressions
3. **Performance Consistency**: Follows established performance patterns
4. **Configuration Harmony**: Respects VS Code formatting settings

## Future Enhancements

Potential improvements for future versions:

1. **Semantic Formatting**: Consider field types and function semantics
2. **Style Profiles**: Predefined formatting styles (compact, verbose, etc.)
3. **Real-time Formatting**: Format-as-you-type capabilities
4. **Team Synchronization**: Shared formatting configurations
5. **Advanced Alignment**: More sophisticated parameter alignment options

## Error Handling and Robustness

The implementation includes comprehensive error handling:

- **Graceful Degradation**: Continues formatting even with syntax errors
- **Original Content Preservation**: Never corrupts user content
- **Detailed Error Logging**: Helps diagnose formatting issues
- **Recovery Mechanisms**: Falls back to basic formatting when advanced features fail

## Configuration Examples

```typescript
// Compact formatting
const compactConfig = {
    preserveLogicalLineBreaks: false,
    maxLineLength: 80,
    indentSize: 2,
    wrapLongExpressions: false
};

// Verbose formatting
const verboseConfig = {
    preserveLogicalLineBreaks: true,
    maxLineLength: 120,
    indentSize: 4,
    alignParameters: true,
    breakAfterOperators: true,
    wrapLongExpressions: true
};

// Team standard formatting
const teamConfig = {
    indentSize: 4,
    useSpaces: true,
    maxLineLength: 100,
    preserveLogicalLineBreaks: true
};
```

This implementation transforms the formatting experience from basic token-based formatting to intelligent, context-aware multi-line formatting that significantly improves code readability and maintainability for complex Tableau calculations.
</text>