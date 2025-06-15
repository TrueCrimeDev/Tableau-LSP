# Tableau Language Support

A comprehensive Visual Studio Code extension that provides complete language support for Tableau calculation language. Write, edit, and validate Tableau calculations with professional IDE features including syntax highlighting, IntelliSense, real-time validation, and smart formatting.

![Tableau Language Support](./images/example.png)

## ✨ Features

### 🎨 **Syntax Highlighting**
- Complete syntax highlighting for Tableau calculation language
- Support for all Tableau functions, operators, and keywords
- Proper highlighting for field references `[Field Name]`
- LOD expression highlighting `{FIXED/INCLUDE/EXCLUDE}`

### 🧠 **IntelliSense & Auto-completion**
- Intelligent auto-completion for 100+ Tableau functions
- Context-aware suggestions for keywords and operators
- Function parameter hints and documentation
- Snippet completions for common patterns

### 🔍 **Real-time Validation**
- Live syntax checking and error reporting
- Validation of IF/THEN/END and CASE/WHEN structures
- Bracket matching and balance checking
- Function name validation

### 📖 **Documentation & Help**
- Hover tooltips with function descriptions
- Inline documentation for all Tableau functions
- Code lens with formatting and explanation actions
- Quick help for complex expressions

### 🛠️ **Smart Formatting**
- Automatic code formatting for Tableau expressions
- Proper indentation for nested structures
- Keyword capitalization and spacing
- Customizable formatting options

### 🧪 **Expression Testing**
- Built-in test runner for validating expressions
- Expression validation with detailed error messages
- Support for complex multi-line calculations

## 🚀 Getting Started

1. **Install the extension** from the VS Code marketplace
2. **Create a new file** with `.twbl` extension
3. **Start writing** Tableau calculations with full language support!

```tableau
// Example Tableau calculation
IF [Sales] > 1000 THEN
    "High Value Customer"
ELSEIF [Sales] > 500 THEN
    "Medium Value Customer"
ELSE
    "Low Value Customer"
END
```

## 📋 Supported Language Features

### 🔧 **Control Flow**
- `IF/THEN/ELSE/ELSEIF/END` conditional statements
- `CASE/WHEN/ELSE/END` multi-way branching
- `AND/OR/NOT` logical operators

### 📊 **Function Categories**
- **Aggregate Functions**: `SUM`, `AVG`, `COUNT`, `MIN`, `MAX`, `MEDIAN`, `STDEV`
- **Date Functions**: `DATEPART`, `DATEADD`, `DATEDIFF`, `TODAY`, `NOW`, `YEAR`, `MONTH`
- **String Functions**: `LEN`, `LEFT`, `RIGHT`, `CONTAINS`, `TRIM`, `UPPER`, `LOWER`
- **Math Functions**: `ABS`, `ROUND`, `CEILING`, `FLOOR`, `SQRT`, `POWER`, `EXP`
- **Logical Functions**: `ISNULL`, `IFNULL`, `IIF`, `ZN`, `ISDATE`
- **Type Conversion**: `STR`, `INT`, `FLOAT`, `DATE`, `DATETIME`

### 🎯 **Tableau-Specific Syntax**
- **Field References**: `[Sales Amount]`, `[Customer Name]`, `[Order Date]`
- **LOD Expressions**: `{FIXED [Region] : SUM([Sales])}`, `{INCLUDE [Category] : AVG([Profit])}`
- **Parameters**: `[Parameter Name]`
- **Comments**: Single-line `//` and multi-line `/* */`

## ⚙️ Configuration

Customize the extension behavior through VS Code settings:

```json
{
  "tableau.enableHover": true,
  "tableau.enableCompletion": true,
  "tableau.enableDiagnostics": true,
  "tableau.enableSnippets": true,
  "tableau.semanticTokens": "full",
  "tableau.enableFormatting": false,
  "tableau.trace.server": "off"
}
```

### Available Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `tableau.enableHover` | Enable hover tooltips for functions | `true` |
| `tableau.enableCompletion` | Enable auto-completion | `true` |
| `tableau.enableDiagnostics` | Enable syntax validation | `true` |
| `tableau.enableSnippets` | Enable code snippets | `true` |
| `tableau.semanticTokens` | Semantic highlighting level | `"full"` |
| `tableau.enableFormatting` | Enable code formatting | `false` |

## 🎮 Commands

- **Tableau: Restart Language Server** - Restart the language server
- **Tableau: Hello Tableau** - Test command

## 📝 File Extensions

This extension activates for files with the `.twbl` extension (Tableau Language files).

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with the VS Code Extension API
- Uses the Language Server Protocol for robust language support
- Inspired by the Tableau community's need for better development tools
