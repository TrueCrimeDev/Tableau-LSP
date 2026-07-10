# Tableau Language Server Protocol (LSP) for VS Code

A VS Code extension that provides language server features for Tableau calculation expressions.

## Features

- **Syntax Highlighting**: Highlights Tableau calculation syntax including functions, keywords, operators, and field references.
- **Hover Information**: Shows detailed, context-aware information when hovering over Tableau functions, fields, and keywords.
  - Includes calculation header context (auto-detected from `// NAME – description` lines) and unified undefined-field messages.
- **Code Completion**: Suggests functions, fields, and keywords as you type.
- **Signature Help**: Displays function signatures and parameter information when typing function calls.
- **Document Symbols**: Lists all functions and expressions in the current document.
- **Validation**: Validates Tableau expressions for syntax errors and provides diagnostics.
- **Calculation Extraction**: Extract and analyze calculations, datasources, and fields from Tableau workbooks (.twb/.twbx files) with advanced processing including XML cleaning, name resolution, normalization, and deduplication.

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

### Working with Calculations

1. Open a `.twbl` file in VS Code.
2. Write Tableau calculation expressions.
3. Hover over functions, fields, or keywords to see detailed information.
4. Use code completion to get suggestions as you type.
5. View validation errors and warnings in the Problems panel.

### Extracting Calculations from Workbooks

1. Open a `.twb` or `.twbx` file in VS Code.
2. Open the Command Palette (`Cmd+Shift+P` on Mac, `Ctrl+Shift+P` on Windows/Linux).
3. Type "Extract Calculations" and select "Tableau: Extract Calculations".
4. The extracted data (datasources, fields, and calculations) will be saved to `Extracted_Calculations.twbl` in your workspace root and opened automatically.

The output file includes three sections:
- **Datasources**: Lists all datasources in the workbook
- **Fields**: Lists all fields with their datatype and role
- **Calculations**: Shows normalized calculation formulas with uppercased keywords

For detailed information about the extraction feature, see the [Extraction Guide](./docs/extraction-guide.md).

### Markdown fences with Tableau highlighting

Use a tableau code block to get syntax highlighting in Markdown:

```tableau
// !My Calc – Description
IF [Sales] > 1000 THEN "High" ELSE "Low" END
```

### Connecting to local Tableau Desktop

The extension discovers installed Tableau Desktop versions, standard local or OneDrive-backed `My Tableau Repository` folders, and recent Tableau artifacts. Use the Command Palette for:

- **Tableau: Connect Local Workbook to LSP and Chat** — attaches a `.twb` or `.twbx` outside the current workspace to the same datasource/field model used by IntelliSense, diagnostics, navigation, and `@tableau` chat.
- **Tableau: Open Workbook in Local Tableau Desktop** — launches the active or selected workbook with the newest discovered Desktop installation.
- **Tableau: Show Local Connector Status** — reports installed versions, running state, repositories, workbooks, datasources, `.taco` connector packages, Hyper extracts, and logs.
- **Tableau: Open Local Tableau Repository** — reveals the detected repository in the operating system.

The connector uses Tableau's documented local file surfaces (`.twb`, `.twbx`, `.tds`, `.tdsx`, `.hyper`, and the repository layout). It does not depend on an unsupported private automation socket in Tableau Desktop. Repository and executable paths can be overridden in settings.

### Adding calculations to a workbook

Use **Tableau: Add Calculation to Workbook** or the Calculated Fields form in the sidebar to write a calculation into a datasource in a plain `.twb` workbook. A `.twbl` editor selection can supply the formula to the command, but `.twbl` remains the calculation-authoring/definitions format; Tableau Desktop reads the generated native `<column><calculation ... /></column>` entry from the `.twb` XML.

Every workbook mutation is transactional: the extension validates the source XML, creates a timestamped copy in `.tableau-lsp-backups`, writes through an open editor when needed, rereads and validates the exact persisted result, and restores the original if writing or verification fails. Duplicate calculated-field names require explicit replacement, while collisions with physical fields are rejected. Packaged `.twbx` mutation is intentionally not supported yet.

The formatting sidebar and standalone formatting panel use the same transaction layer for border edits, bulk changes, theme imports, and formatting removal. Enable **Open in Tableau after a verified write** to launch the saved workbook after verification. This opens the edited file with the configured or newest discovered Tableau Desktop installation; it does not terminate an already-running Tableau process.

### Formatting calculations

**Tableau: Format Tableau Expression** now formats the current selection when one exists, otherwise the complete `.twbl` document. **Tableau: Select Calculation Formatting Profile** provides three styles:

- `readable` — conventional IF/CASE blocks and balanced wrapping.
- `compact` — fewer line breaks for short calculations.
- `expanded` — one function argument per line and earlier condition wrapping.

Keyword case, maximum line length, logical operator position, function argument wrapping, indentation, and final-newline behavior can be configured independently.

## Requirements

- Visual Studio Code 1.60.0 or higher

## Extension Settings

This extension contributes the following settings:

- `tableau-language-support.enableFormatting`: Enable/disable formatting for Tableau expressions.
- `tableau-language-support.enableSignatureHelp`: Enable/disable signature help for Tableau functions.
- `tableau-language-support.formatting.*`: Select a profile and customize wrapping, casing, and line layout.
- `tableau-language-support.local.*`: Override local repository discovery, Tableau Desktop executable selection, and artifact limits.

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

## Debug & Reload Workflow

The extension ships with a Toolbox-style compile/reload loop. See `docs/AUTO_RELOAD_DEBUGGER.md` for the full breakdown, but the highlights are:

- Use the `Tableau LSP: Compile and Reload` command to run the `npm: compile` task and restart/launch the `Run Extension (VS Code)` debugger (which opens the `Tableau-LSP.code-workspace` in the Extension Host window).
- `Tasks: Run Task` exposes both `npm: compile` and a `Compile and Reload Debugger` helper, if you prefer sticking with VS Code tasks.
- `npm run watch` keeps builds flowing automatically; pair it with `Ctrl+Shift+F5` or the command above for ultra-fast iteration.
- CLI helpers `auto-reload.sh` and `auto-reload.cmd` give you a terminal-friendly entry point that mirrors the VS Code task.

## Install from a GitHub Release

Grab the latest `.vsix` from [Releases](https://github.com/TrueCrimeDev/Tableau-LSP/releases), save it to your Downloads folder, then install it from the command line.

**CMD:**

```batch
code --install-extension "%USERPROFILE%\Downloads\tableau-language-support-1.7.2.vsix" --force
```

**PowerShell:**

```powershell
code --install-extension "$env:USERPROFILE\Downloads\tableau-language-support-1.7.2.vsix" --force
```

Then reload VS Code. If an older version is already installed, add `--force`.
