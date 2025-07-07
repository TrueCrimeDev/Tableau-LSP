# Tableau LSP User Guide

This guide explains how to use the enhanced features of the Tableau Language Server Protocol (LSP) extension for VS Code.

## Getting Started

### Installation

1. Install the Tableau LSP extension from the VS Code marketplace
2. Open a `.twbl` file in VS Code
3. The extension will automatically activate

### Basic Usage

The Tableau LSP provides several features to help you write and understand Tableau expressions:

- **Syntax Highlighting**: Highlights functions, keywords, operators, and field references
- **Hover Information**: Shows details when hovering over symbols
- **Code Completion**: Suggests functions, fields, and keywords as you type
- **Validation**: Checks expressions for errors and shows diagnostics

## Enhanced Features

### Context-Aware Hover Information

The hover feature now provides rich, context-aware information for different types of symbols.

#### Function Hover

When you hover over a function name, you'll see:

- Function signature with parameter types
- Return type
- Description of what the function does
- Parameter details
- Examples of usage

![Function Hover Example](images/function-hover.png)

For example, hovering over `SUM` will show:

```
SUM: function

Category: Aggregation

Usage: SUM(expression) => number

Returns: The sum of all values in the expression

Parameters:
- expression: number — The expression to sum

Example:
SUM([Sales])
```

#### Field Hover

When you hover over a field reference (enclosed in square brackets), you'll see:

- Field name and type
- Description of the field
- Usage examples

![Field Hover Example](images/field-hover.png)

#### Keyword Hover

When you hover over a keyword (like IF, THEN, CASE), you'll see:

- Keyword description
- Context information (what type of expression it's used in)
- Usage examples

![Keyword Hover Example](images/keyword-hover.png)

### Multi-line Expression Support

The extension now properly handles expressions that span multiple lines, such as:

#### IF Statements

```
IF [Sales] > 1000 THEN
    "High"
ELSEIF [Sales] > 500 THEN
    "Medium"
ELSE
    "Low"
END
```

#### CASE Statements

```
CASE [Region]
    WHEN "East" THEN "Eastern Region"
    WHEN "West" THEN "Western Region"
    ELSE "Other Region"
END
```

#### Level of Detail (LOD) Expressions

```
{
    FIXED [Category]:
    SUM([Sales])
}
```

### Enhanced Validation

The extension provides improved validation for Tableau expressions:

#### Structure Validation

- Checks for proper IF/THEN/END structure
- Validates CASE/WHEN/END structure
- Ensures LOD expressions have the correct format

#### Bracket Matching

- Validates matching parentheses, brackets, and braces
- Highlights mismatched brackets

#### Function Parameter Validation

- Checks that functions are called with the correct number of parameters
- Validates required vs. optional parameters

![Validation Example](images/validation.png)

## Tips and Tricks

### Working with Multi-line Expressions

- Use proper indentation for better readability
- Each clause (THEN, ELSEIF, ELSE) should be on a new line
- END should be aligned with the starting keyword (IF or CASE)

### Using Hover Effectively

- Hover over function names to see parameter information
- Hover over parameters inside function calls to see parameter types
- Use hover on keywords to understand their context

### Improving Performance

- The extension caches hover information for better performance
- For large files, consider breaking expressions into smaller, reusable calculations

## Common Issues and Solutions

### Hover Not Working

If hover information isn't showing:

1. Check that the file has the `.twbl` extension
2. Ensure the extension is properly activated
3. Try reloading VS Code

### Validation Errors

If you're seeing unexpected validation errors:

1. Check for mismatched brackets or parentheses
2. Ensure IF statements have matching THEN and END
3. Verify that functions have the correct number of parameters

### Performance Issues

If the extension is slow:

1. Break large expressions into smaller ones
2. Close unused files
3. Restart VS Code to clear caches

## Expression Examples

### IF Statement Example

```
IF [Sales] > 1000 AND [Profit] > 500 THEN
    "High Value"
ELSEIF [Sales] > 1000 OR [Profit] > 500 THEN
    "Medium Value"
ELSE
    "Low Value"
END
```

### CASE Statement Example

```
CASE [Region]
    WHEN "North" THEN "Northern Territory"
    WHEN "South" THEN "Southern Territory"
    WHEN "East" THEN "Eastern Territory"
    WHEN "West" THEN "Western Territory"
    ELSE "Unknown Territory"
END
```

### LOD Expression Example

```
{
    FIXED [Category], [Region]:
    SUM([Sales]) / SUM([Quantity])
}
```

### Complex Function Example

```
DATEADD(
    'month',
    DATEDIFF(
        'month',
        DATETRUNC('month', [Order Date]),
        DATETRUNC('month', TODAY())
    ),
    DATETRUNC('month', [Order Date])
)
```

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Show hover information | Hover mouse over symbol |
| Trigger code completion | Ctrl+Space |
| Format document | Shift+Alt+F |
| Go to definition | F12 |
| Show problems panel | Ctrl+Shift+M |

## Settings

The extension provides several settings to customize its behavior:

- `tableau.enableFormatting`: Enable/disable formatting for Tableau expressions
- `tableau.enableSignatureHelp`: Enable/disable signature help for Tableau functions

To access these settings:

1. Open VS Code settings (File > Preferences > Settings)
2. Search for "tableau"
3. Adjust the settings as needed

## Getting Help

If you encounter issues or have questions:

- Check the [README](../README.md) for known issues
- Submit issues on the GitHub repository
- Contact the extension author