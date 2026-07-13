# Tableau LSP Keyboard Shortcuts

This document describes all available keyboard shortcuts for the Tableau Language Support extension.

## Quick Reference

| Shortcut | Command | Description |
|----------|---------|-------------|
| `Ctrl+Shift+S` (`Cmd+Shift+S` on Mac) | Insert Snippet | Opens the snippet picker for Tableau templates |
| `Ctrl+Shift+F` (`Cmd+Shift+F` on Mac) | Format Expression | Formats the current Tableau expression |
| `Ctrl+Shift+V` (`Cmd+Shift+V` on Mac) | Validate Expression | Validates the current expression and shows diagnostics |
| `Ctrl+Shift+I` (`Cmd+Shift+I` on Mac) | Insert IF Statement | Inserts an IF statement template |
| `Ctrl+Shift+C` (`Cmd+Shift+C` on Mac) | Insert CASE Statement | Inserts a CASE statement template |
| `Ctrl+Shift+L` (`Cmd+Shift+L` on Mac) | Insert LOD Expression | Shows LOD expression type picker and inserts template |
| `Ctrl+Shift+H` (`Cmd+Shift+H` on Mac) | Show Function Help | Shows help for function at cursor or function reference |
| `Ctrl+/` (`Cmd+/` on Mac) | Toggle Comments | Toggles line comments for current line or selection |
| `Ctrl+Shift+R` (`Cmd+Shift+R` on Mac) | Restart Language Server | Restarts the Tableau language server |
| `Ctrl+Shift+T` (`Cmd+Shift+T` on Mac) | Run Tests | Runs Tableau LSP tests |

## Detailed Command Descriptions

### Code Editing Shortcuts

#### Insert Snippet (`Ctrl+Shift+S`)
Opens the VS Code snippet picker showing all available Tableau calculation templates. This provides quick access to common calculation patterns and structures.

**Usage:**
1. Place cursor where you want to insert a snippet
2. Press `Ctrl+Shift+S`
3. Select from available snippets
4. Fill in the placeholder values

#### Format Expression (`Ctrl+Shift+F`)
Formats the current Tableau calculation according to the configured formatting rules. This ensures consistent indentation, spacing, and structure.

**Features:**
- Proper indentation for nested blocks (IF, CASE, LOD)
- Consistent spacing around operators
- Keyword capitalization
- Line break preservation for readability

#### Validate Expression (`Ctrl+Shift+V`)
Triggers immediate validation of the current Tableau expression and displays any errors or warnings in the Problems panel.

**What it checks:**
- Syntax errors (unclosed blocks, missing keywords)
- Function signature validation
- Field reference validation
- LOD expression rules
- Performance issues (excessive nesting)

### Code Generation Shortcuts

#### Insert IF Statement (`Ctrl+Shift+I`)
Inserts a properly formatted IF statement template with placeholders for easy completion.

**Template:**
```tableau
IF ${1:condition} THEN
    ${2:value_if_true}
ELSE
    ${3:value_if_false}
END
```

**Usage:**
1. Press `Ctrl+Shift+I`
2. Fill in the condition
3. Tab to next placeholder
4. Fill in the true value
5. Tab to next placeholder
6. Fill in the false value

#### Insert CASE Statement (`Ctrl+Shift+C`)
Inserts a properly formatted CASE statement template with placeholders.

**Template:**
```tableau
CASE ${1:field}
WHEN ${2:value1} THEN ${3:result1}
WHEN ${4:value2} THEN ${5:result2}
ELSE ${6:default_result}
END
```

#### Insert LOD Expression (`Ctrl+Shift+L`)
Shows a quick pick menu for different LOD expression types (FIXED, INCLUDE, EXCLUDE) and inserts the selected template.

**Available Types:**
- **FIXED**: `{FIXED ${1:dimension} : ${2:aggregate_expression}}`
- **INCLUDE**: `{INCLUDE ${1:dimension} : ${2:aggregate_expression}}`
- **EXCLUDE**: `{EXCLUDE ${1:dimension} : ${2:aggregate_expression}}`

### Utility Shortcuts

#### Show Function Help (`Ctrl+Shift+H`)
Shows detailed help for the function at the cursor position, or opens a function reference if no specific function is detected.

**Features:**
- Displays function signature and parameters
- Shows usage examples
- Provides parameter descriptions
- Falls back to function category browser
- Links to Tableau documentation

#### Toggle Comments (`Ctrl+/`)
Toggles line comments (`//`) for the current line or selected lines.

**Behavior:**
- If any line in selection is uncommented, comments all lines
- If all lines are commented, uncomments all lines
- Preserves indentation
- Works with single line or multi-line selections

### System Shortcuts

#### Restart Language Server (`Ctrl+Shift+R`)
Restarts the Tableau language server. Useful when the server becomes unresponsive or after configuration changes.

**When to use:**
- Language features stop working
- After changing extension settings
- When experiencing performance issues
- After updating field definitions

#### Run Tests (`Ctrl+Shift+T`)
Runs the Tableau LSP test suite. Useful for developers or when troubleshooting issues.

**Test Categories:**
- Unit tests for all components
- Integration tests for LSP features
- Performance tests for response times
- Edge case tests for error handling

## Customization

### Changing Keyboard Shortcuts

You can customize any keyboard shortcut through VS Code's keyboard shortcuts editor:

1. Open Command Palette (`Ctrl+Shift+P`)
2. Type "Preferences: Open Keyboard Shortcuts"
3. Search for "tableau-language-support"
4. Click the pencil icon next to any command
5. Press your desired key combination
6. Press Enter to save

### Disabling Shortcuts

To disable a keyboard shortcut:

1. Open Keyboard Shortcuts editor
2. Find the Tableau command
3. Right-click and select "Remove Keybinding"

### Adding Custom Shortcuts

You can add keyboard shortcuts for any Tableau LSP command:

1. Open Keyboard Shortcuts editor
2. Click the "+" icon to add a new shortcut
3. Enter the command ID (e.g., `tableau-language-support.formatExpression`)
4. Press your desired key combination
5. Set the "when" condition to `editorTextFocus && resourceExtname == .twbl`

## Context Sensitivity

All Tableau LSP keyboard shortcuts are context-sensitive and only work when:

- A `.twbl` file is open and active
- The editor has focus
- The cursor is in the text editor (not in menus or panels)

This prevents conflicts with other extensions and ensures shortcuts only trigger in appropriate contexts.

## Troubleshooting

### Shortcuts Not Working

1. **Check file extension**: Shortcuts only work in `.twbl` files
2. **Verify editor focus**: Click in the editor to ensure it has focus
3. **Check for conflicts**: Other extensions might override the same shortcuts
4. **Restart VS Code**: Sometimes required after changing shortcuts
5. **Check extension status**: Ensure Tableau LSP extension is active

### Conflicting Shortcuts

If a shortcut conflicts with another extension:

1. Open Keyboard Shortcuts editor
2. Search for the conflicting key combination
3. Disable or change one of the conflicting shortcuts
4. Restart VS Code if necessary

### Performance Issues

If shortcuts feel slow:

1. Try restarting the language server (`Ctrl+Shift+R`)
2. Check if large files are causing performance issues
3. Verify system resources are available
4. Consider disabling other extensions temporarily

## Best Practices

### Efficient Workflow

1. **Use snippets first**: `Ctrl+Shift+S` for common patterns
2. **Format regularly**: `Ctrl+Shift+F` to maintain clean code
3. **Validate frequently**: `Ctrl+Shift+V` to catch errors early
4. **Comment liberally**: `Ctrl+/` for documentation
5. **Get help quickly**: `Ctrl+Shift+H` when unsure about functions

### Learning Tips

1. **Start with basic shortcuts**: Master formatting and validation first
2. **Practice templates**: Use IF/CASE/LOD shortcuts to learn proper syntax
3. **Explore help**: Use function help to discover new functions
4. **Customize as needed**: Adjust shortcuts to match your workflow

### Team Collaboration

1. **Standardize shortcuts**: Ensure team uses same key bindings
2. **Share configurations**: Export/import keyboard shortcut settings
3. **Document customizations**: Keep track of any custom shortcuts
4. **Train new members**: Include shortcuts in onboarding process

## Integration with VS Code

Tableau LSP keyboard shortcuts integrate seamlessly with VS Code's built-in features:

- **IntelliSense**: Shortcuts work alongside auto-completion
- **Command Palette**: All commands available via `Ctrl+Shift+P`
- **Quick Fix**: Validation shortcuts complement quick fix suggestions
- **Multi-cursor**: Most shortcuts work with multiple cursors
- **Undo/Redo**: All shortcut actions are undoable

This ensures a consistent and familiar editing experience while providing Tableau-specific enhancements.