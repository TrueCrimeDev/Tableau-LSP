# Sidebar UX Improvements - VS Code Guidelines Compliance

This document outlines the improvements made to align the Tableau Tools sidebar with VS Code's official UX guidelines.

## VS Code UX Guidelines Reference
https://code.visualstudio.com/api/ux-guidelines/sidebars

## Current Status

### ✅ Compliant Areas

1. **View Container Organization**
   - Single view container (`tableauLsp`) - follows guideline of avoiding excessive containers
   - Clear, descriptive name: "Tableau Tools"
   - Properly registered as webview type in package.json

2. **View Structure**
   - Single webview view for palette management
   - Groups related functionality (palette editor, gradient generators, theme vault)
   - View limit: 1 view (well within 3-5 recommended max)

3. **Functionality Scope**
   - Provides substantial functionality (not just simple commands)
   - Doesn't duplicate existing VS Code features
   - Adds value specific to Tableau development

### ⚠️ Areas for Improvement

#### 1. Toolbar Actions
**Current**: Actions are embedded in webview HTML as buttons
**Guideline**: Use native VS Code toolbar with codicons

**Recommended Changes:**
```json
{
  "commands": [
    {
      "command": "tableau.palette.save",
      "title": "Save to Preferences.tps",
      "category": "Tableau",
      "icon": "$(save)"
    },
    {
      "command": "tableau.palette.reload",
      "title": "Reload from Preferences.tps",
      "category": "Tableau",
      "icon": "$(refresh)"
    },
    {
      "command": "tableau.palette.new",
      "title": "New Palette",
      "category": "Tableau",
      "icon": "$(add)"
    },
    {
      "command": "tableau.palette.copyToRepository",
      "title": "Copy to Tableau Repository",
      "category": "Tableau",
      "icon": "$(export)"
    }
  ],
  "menus": {
    "view/title": [
      {
        "command": "tableau.palette.save",
        "when": "view == tableauLanguageSupport.parsingGuide",
        "group": "navigation@1"
      },
      {
        "command": "tableau.palette.reload",
        "when": "view == tableauLanguageSupport.parsingGuide",
        "group": "navigation@2"
      },
      {
        "command": "tableau.palette.new",
        "when": "view == tableauLanguageSupport.parsingGuide",
        "group": "navigation@3"
      },
      {
        "command": "tableau.palette.copyToRepository",
        "when": "view == tableauLanguageSupport.parsingGuide",
        "group": "1_actions@1"
      }
    ]
  }
}
```

#### 2. Visual Design System

**Current**: Custom CSS with hardcoded colors
**Guideline**: Use VS Code CSS variables for theme integration

**Recommended CSS Variables:**
```css
/* Colors */
--vscode-editor-background
--vscode-editor-foreground
--vscode-sideBar-background
--vscode-sideBar-foreground
--vscode-sideBarTitle-foreground
--vscode-sideBarSectionHeader-background
--vscode-sideBarSectionHeader-foreground

/* Buttons */
--vscode-button-background
--vscode-button-foreground
--vscode-button-hoverBackground
--vscode-button-secondaryBackground
--vscode-button-secondaryForeground
--vscode-button-secondaryHoverBackground

/* Inputs */
--vscode-input-background
--vscode-input-foreground
--vscode-input-border
--vscode-inputOption-activeBorder
--vscode-inputValidation-errorBackground
--vscode-inputValidation-errorBorder

/* Lists */
--vscode-list-activeSelectionBackground
--vscode-list-activeSelectionForeground
--vscode-list-hoverBackground
--vscode-list-inactiveSelectionBackground

/* Badges */
--vscode-badge-background
--vscode-badge-foreground

/* Notifications */
--vscode-notificationsInfoIcon-foreground
--vscode-notificationsWarningIcon-foreground
--vscode-notificationsErrorIcon-foreground
```

#### 3. Icon Usage

**Current**: Text-based buttons
**Guideline**: Use Codicons from VS Code's icon library

**Recommended Icons:**
- `$(paintcan)` - Color palette actions
- `$(add)` / `$(plus)` - Create new palette
- `$(save)` - Save operations  - `$(refresh)` / `$(sync)` - Reload operations
- `$(export)` - Export/copy operations
- `$(trash)` - Delete operations
- `$(gear)` - Settings
- `$(eye)` - Preview toggle

#### 4. Spacing and Layout

**Current**: Custom spacing
**Guideline**: Follow VS Code's spacing system

**Recommended Spacing:**
- View padding: `16px`
- Section spacing: `12px` between sections
- Item spacing: `4px` between items
- Button height: `28px` (matches VS Code buttons)
- Input height: `26px` (matches VS Code inputs)

## Implementation Priority

### High Priority
1. ✅ Add toolbar actions (Save, Reload, New, Export)
2. Update CSS to use `--vscode-*` variables
3. Replace text buttons with codicon buttons

### Medium Priority
1. Improve spacing to match VS Code standards
2. Add proper focus styles using VS Code variables
3. Improve keyboard navigation

### Low Priority
1. Add welcome view for first-time users
2. Consider tree view for palette library (if list grows large)
3. Add context menus for palette items

## Design Patterns to Follow

### Toolbar Best Practices
- Limit to 3-4 primary actions in navigation group
- Additional actions in overflow menu
- Use descriptive command names
- Prioritize existing product icons

### Webview Best Practices
- Match VS Code's visual design
- Use semantic HTML
- Support keyboard navigation
- Respect user's theme choice
- Minimize custom styling

### View Container Best Practices
- Single container per extension (achieved)
- Clear, descriptive view names (achieved)
- Group related content (achieved)
- Avoid excessive views (achieved: 1 view)

## Resources

- [VS Code UX Guidelines](https://code.visualstudio.com/api/ux-guidelines/overview)
- [Sidebar Guidelines](https://code.visualstudio.com/api/ux-guidelines/sidebars)
- [Codicons Reference](https://code.visualstudio.com/api/references/icons-in-labels)
- [View Container Guide](https://code.visualstudio.com/api/extension-guides/tree-view)
- [Webview UI Toolkit](https://github.com/microsoft/vscode-webview-ui-toolkit)

## Next Steps

1. Add toolbar commands to package.json
2. Register command handlers in commands/index.ts
3. Update webview CSS to use VS Code variables
4. Test with both light and dark themes
5. Verify keyboard navigation
6. Test with screen readers (accessibility)

## Accessibility Considerations

- All interactive elements should have proper ARIA labels
- Color should not be the only way to convey information
- Keyboard navigation should work for all features
- Focus indicators should be visible
- Use semantic HTML elements
