# Changelog

## 1.0.0 - Initial Tableau LSP Release
- Complete transformation from Zig LSP to Tableau Language Server
- Added support for `.twbl` (Tableau calculation) files
- Implemented comprehensive Tableau syntax highlighting
- Added 832+ Tableau function definitions with documentation
- Created Tableau-specific diagnostics and validation
- Implemented smart formatting for Tableau expressions
- Added code lens for expression formatting and LOD explanations
- Built expression validation test runner
- Added auto-completion for Tableau functions and keywords
- Implemented field reference support `[Field Name]`
- Added LOD expression support `{FIXED/INCLUDE/EXCLUDE}`
- Created status bar integration showing symbol count
- Added comprehensive configuration options

### Features
- **Language Server Protocol** - Full LSP implementation for Tableau
- **Syntax Highlighting** - Complete Tableau calculation language support
- **Auto-completion** - Intelligent function and keyword completion
- **Diagnostics** - Real-time syntax validation and error checking
- **Code Lens** - Inline actions for formatting and explanations
- **Expression Validation** - Test runner for Tableau expressions
- **Smart Formatting** - Tableau-specific code formatting
- **Function Documentation** - Hover tooltips with detailed descriptions

### Supported Tableau Features
- Control flow: `IF/THEN/ELSE/END`, `CASE/WHEN/END`
- Aggregate functions: `SUM`, `AVG`, `COUNT`, `MIN`, `MAX`
- Date functions: `DATEPART`, `DATEADD`, `TODAY`, `NOW`
- String functions: `LEN`, `LEFT`, `RIGHT`, `CONTAINS`
- Math functions: `ABS`, `ROUND`, `CEILING`, `FLOOR`
- Logical functions: `ISNULL`, `IFNULL`, `IIF`
- Field references: `[Sales Amount]`, `[Customer Name]`
- LOD expressions: `{FIXED [Region] : SUM([Sales])}`
- Comments: `//` line comments and `/* */` block comments