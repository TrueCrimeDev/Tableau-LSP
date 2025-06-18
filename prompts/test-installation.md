# Test Installation Guide

This guide helps you test the Tableau Language Support extension before publishing to the marketplace.

## Local Installation Test

### Method 1: Install from VSIX file

1. **Open VS Code**
2. **Open Command Palette** (`Ctrl+Shift+P` or `Cmd+Shift+P`)
3. **Type**: "Extensions: Install from VSIX..."
4. **Select the file**: `tableau-language-support-1.0.0.vsix`
5. **Restart VS Code** when prompted

### Method 2: Command Line Installation

```bash
# Install the extension from command line
code --install-extension tableau-language-support-1.0.0.vsix

# List installed extensions to verify
code --list-extensions | grep tableau
```

## Test the Extension

### 1. Create a Test File

Create a new file with `.twbl` extension:

```tableau
// Test Tableau calculation file
// This file tests various Tableau language features

// Simple IF statement
IF [Sales] > 1000 THEN "High" ELSE "Low" END

// Aggregate functions
SUM([Sales])
AVG([Profit])
COUNT([Orders])

// Date functions
DATEPART('year', [Order Date])
TODAY()

// String functions
LEN([Customer Name])
CONTAINS([Product Name], "Office")

// LOD expressions
{FIXED [Region] : SUM([Sales])}
{INCLUDE [Category] : AVG([Profit])}

// CASE statement
CASE [Region]
    WHEN "East" THEN "Eastern Region"
    WHEN "West" THEN "Western Region"
    ELSE "Other Region"
END

// Complex expression
IF [Sales] > 1000 AND [Profit] > 100 THEN
    "High Value"
ELSEIF [Sales] > 500 THEN
    "Medium Value"
ELSE
    "Low Value"
END
```

### 2. Test Features

#### ✅ Syntax Highlighting
- Verify keywords are highlighted (IF, THEN, ELSE, SUM, etc.)
- Check field references `[Field Name]` are highlighted
- Confirm LOD expressions `{FIXED}` are highlighted
- Test comment highlighting `//` and `/* */`

#### ✅ Auto-completion
- Type `SU` and verify `SUM` appears in suggestions
- Type `DATE` and check date functions appear
- Test function parameter hints

#### ✅ Hover Documentation
- Hover over `SUM` to see documentation
- Hover over `DATEPART` to see parameter info
- Test other function tooltips

#### ✅ Syntax Validation
- Add syntax errors (missing END, unmatched brackets)
- Verify error squiggles appear
- Check error messages in Problems panel

#### ✅ Code Lens
- Look for "Format" and "Explain" actions above expressions
- Test clicking on code lens actions

#### ✅ Formatting
- Right-click and select "Format Document"
- Use `Shift+Alt+F` keyboard shortcut
- Verify proper indentation and spacing

#### ✅ Expression Validation
- Open Command Palette (`Ctrl+Shift+P`)
- Look for Tableau-related commands
- Test "Tableau: Hello Tableau" command

### 3. Test Configuration

Open VS Code Settings and search for "tableau":

```json
{
  "tableau.enableHover": true,
  "tableau.enableCompletion": true,
  "tableau.enableDiagnostics": true,
  "tableau.enableSnippets": true,
  "tableau.semanticTokens": "full",
  "tableau.enableFormatting": false
}
```

Test toggling these settings and verify behavior changes.

### 4. Test Status Bar

- Open a `.twbl` file
- Check status bar shows "Tableau (X symbols)"
- Verify language status indicator

## Uninstall Test

### Method 1: VS Code UI
1. Go to Extensions view (`Ctrl+Shift+X`)
2. Find "Tableau Language Support"
3. Click gear icon → "Uninstall"

### Method 2: Command Line
```bash
code --uninstall-extension YOUR_PUBLISHER_ID.tableau-language-support
```

## Performance Test

1. **Open large Tableau files** (if available)
2. **Test responsiveness** of auto-completion
3. **Check memory usage** in Task Manager
4. **Verify no console errors** (Help → Toggle Developer Tools)

## Compatibility Test

Test on different platforms:
- ✅ Windows
- ✅ macOS  
- ✅ Linux

Test with different VS Code versions:
- ✅ Stable
- ✅ Insiders

## Troubleshooting

### Extension Not Loading
- Check VS Code version compatibility
- Look for errors in Developer Console
- Verify extension is enabled

### Features Not Working
- Check extension settings
- Restart VS Code
- Reinstall extension

### Performance Issues
- Check file size limits
- Monitor CPU/memory usage
- Disable other extensions temporarily

## Report Issues

If you find any issues during testing:

1. **Check existing issues** on GitHub
2. **Create detailed bug reports** with:
   - VS Code version
   - Operating system
   - Steps to reproduce
   - Expected vs actual behavior
   - Screenshots if applicable

## Success Criteria

The extension is ready for marketplace publication when:

- ✅ All syntax highlighting works correctly
- ✅ Auto-completion provides relevant suggestions
- ✅ Hover documentation displays properly
- ✅ Syntax validation catches errors
- ✅ Formatting works as expected
- ✅ No console errors or warnings
- ✅ Good performance on typical files
- ✅ Settings work correctly
- ✅ Extension loads and unloads cleanly
