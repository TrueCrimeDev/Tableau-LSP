# Native VS Code UI Migration Plan

This document outlines the plan to migrate the Tableau Tools sidebar to use Microsoft's official Webview UI Toolkit for native VS Code theming.

## Reference Implementation

The AHK Converter extension (`ahk-converter/src/sidebarWebview.ts`) demonstrates the correct approach:

```typescript
// Key elements:
// 1. Import the toolkit
<script type="module" src="@vscode/webview-ui-toolkit/dist/toolkit.js"></script>

// 2. Use CSS variables
body {
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size);
  padding: 16px;
}

// 3. Use web components
<vscode-button onclick="...">Click Me</vscode-button>
<vscode-text-field placeholder="Enter text"></vscode-text-field>
<vscode-dropdown>
  <vscode-option>Option 1</vscode-option>
</vscode-dropdown>
```

## Current vs Target Implementation

### Current Approach
- ❌ Custom CSS with hardcoded colors
- ❌ Custom HTML `<button>`, `<input>`, `<select>` elements
- ❌ Manual theme handling
- ❌ ~600 lines of custom CSS

### Target Approach
- ✅ VS Code CSS variables (`--vscode-*`)
- ✅ Web components (`<vscode-button>`, `<vscode-text-field>`, etc.)
- ✅ Automatic theme support
- ✅ ~50 lines of layout-only CSS

## Webview UI Toolkit Components

### Available Components

1. **vscode-button**
   ```html
   <vscode-button>Primary Action</vscode-button>
   <vscode-button appearance="secondary">Secondary</vscode-button>
   <vscode-button appearance="icon"><span class="codicon codicon-add"></span></vscode-button>
   ```

2. **vscode-text-field**
   ```html
   <vscode-text-field placeholder="Palette name"></vscode-text-field>
   <vscode-text-field type="text" value="#1F6E8C"></vscode-text-field>
   ```

3. **vscode-dropdown**
   ```html
   <vscode-dropdown>
     <vscode-option>Categorical (regular)</vscode-option>
     <vscode-option>Sequential (ordered-sequential)</vscode-option>
   </vscode-dropdown>
   ```

4. **vscode-badge**
   ```html
   <vscode-badge>5</vscode-badge>
   ```

5. **vscode-divider**
   ```html
   <vscode-divider></vscode-divider>
   ```

6. **vscode-panels**
   ```html
   <vscode-panels>
     <vscode-panel-tab id="tab-1">Tab 1</vscode-panel-tab>
     <vscode-panel-view id="view-1">Content 1</vscode-panel-view>
   </vscode-panels>
   ```

### Color Picker Exception
The toolkit doesn't include a color picker, so we'll use native HTML5:
```html
<input type="color" id="color-picker">
```
Style with VS Code variables for border/background.

## Migration Steps

### Step 1: Update HTML Structure

**Before:**
```html
<button class="btn">Save Palette</button>
<button class="btn secondary">New Palette</button>
<button class="btn danger">Delete</button>
```

**After:**
```html
<vscode-button>Save Palette</vscode-button>
<vscode-button appearance="secondary">New Palette</vscode-button>
<vscode-button appearance="secondary" class="danger-button">Delete</vscode-button>
```

### Step 2: Update Input Fields

**Before:**
```html
<input id="palette-name" type="text" placeholder="My Palette">
<input id="new-color-hex" type="text" value="#F4B860">
```

**After:**
```html
<vscode-text-field id="palette-name" placeholder="My Palette"></vscode-text-field>
<vscode-text-field id="new-color-hex" value="#F4B860"></vscode-text-field>
```

### Step 3: Update Dropdowns

**Before:**
```html
<select id="palette-type">
  <option value="regular">Categorical (regular)</option>
  <option value="ordered-sequential">Sequential</option>
</select>
```

**After:**
```html
<vscode-dropdown id="palette-type">
  <vscode-option value="regular">Categorical (regular)</vscode-option>
  <vscode-option value="ordered-sequential">Sequential</vscode-option>
</vscode-dropdown>
```

### Step 4: Simplify CSS

**Before (custom colors):**
```css
.btn {
  background: #0e639c;
  color: #fff;
  border: 1px solid #0e639c;
  /* 20+ more lines */
}
```

**After (VS Code variables):**
```css
.danger-button {
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-errorForeground);
}
.danger-button:hover {
  background: var(--vscode-button-secondaryHoverBackground);
}
```

### Step 5: Use Layout-Only CSS

```css
body {
  padding: 0;
  margin: 0;
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size);
  color: var(--vscode-foreground);
}

.section {
  padding: 16px;
  margin-bottom: 12px;
}

.button-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field {
  margin-bottom: 12px;
}

.field label {
  display: block;
  margin-bottom: 4px;
  font-weight: 600;
}
```

## JavaScript Changes

### Event Listeners

**Before:**
```javascript
document.getElementById('save-palette').addEventListener('click', () => {
  // handler
});
```

**After (web components):**
```javascript
document.getElementById('save-palette').addEventListener('click', () => {
  // Same handler - no changes needed
});
```

### Getting/Setting Values

**Before:**
```javascript
const name = paletteNameInput.value;
paletteNameInput.value = 'New Name';
```

**After (web components):**
```javascript
const name = paletteNameInput.value; // Same!
paletteNameInput.value = 'New Name';  // Same!
```

## Benefits

### Automatic Theme Support
- **Light Theme**: Components automatically use light colors
- **Dark Theme**: Components automatically use dark colors
- **Custom Themes**: User's theme colors are respected
- **High Contrast**: Accessibility themes work automatically

### Reduced Code
- **Before**: ~600 lines of CSS + custom theme logic
- **After**: ~50 lines of layout CSS
- **Maintenance**: Much easier to maintain

### Consistency
- Matches all other VS Code webviews
- Familiar UX for users
- Follows VS Code design guidelines

### Accessibility
- Built-in keyboard navigation
- Screen reader support
- High contrast mode support
- Focus indicators

## Implementation Priority

### Phase 1: Core Components (High Priority)
- Replace buttons with `<vscode-button>`
- Replace inputs with `<vscode-text-field>`
- Replace selects with `<vscode-dropdown>`
- Add toolkit script import
- Replace custom CSS with VS Code variables

### Phase 2: Enhanced Components (Medium Priority)
- Use `<vscode-panels>` for sections (Palette Editor, Generators, Themes)
- Use `<vscode-badge>` for counts (e.g., "5 colors")
- Use `<vscode-divider>` between sections
- Add proper focus styles

### Phase 3: Polish (Low Priority)
- Add loading states with `<vscode-progress-ring>`
- Improve keyboard navigation
- Add toolbar actions (as documented in SIDEBAR_UX_IMPROVEMENTS.md)

## Example: Simple Palette Editor

```html
<!DOCTYPE html>
<html>
<head>
  <script type="module" src="@vscode/webview-ui-toolkit/dist/toolkit.js"></script>
  <style>
    body {
      padding: 16px;
      font-family: var(--vscode-font-family);
    }
    .field {
      margin-bottom: 12px;
    }
    .field label {
      display: block;
      margin-bottom: 4px;
    }
    .button-group {
      display: flex;
      gap: 8px;
    }
  </style>
</head>
<body>
  <div class="field">
    <label for="name">Palette Name</label>
    <vscode-text-field id="name" placeholder="My Palette"></vscode-text-field>
  </div>

  <div class="field">
    <label for="type">Type</label>
    <vscode-dropdown id="type">
      <vscode-option value="regular">Categorical</vscode-option>
      <vscode-option value="ordered-sequential">Sequential</vscode-option>
    </vscode-dropdown>
  </div>

  <div class="field">
    <label for="color">Add Color</label>
    <input type="color" id="color" value="#F4B860">
  </div>

  <div class="button-group">
    <vscode-button id="save">Save Palette</vscode-button>
    <vscode-button appearance="secondary" id="new">New Palette</vscode-button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    document.getElementById('save').addEventListener('click', () => {
      vscode.postMessage({ command: 'save' });
    });
  </script>
</body>
</html>
```

## Testing Checklist

After migration:
- [ ] Test in Light Theme
- [ ] Test in Dark Theme
- [ ] Test in High Contrast Theme
- [ ] Test keyboard navigation (Tab, Enter, Space)
- [ ] Test screen reader compatibility
- [ ] Verify all buttons work
- [ ] Verify inputs accept/display values correctly
- [ ] Verify dropdowns show/select options
- [ ] Verify color picker works
- [ ] Test save/load palette functionality

## Resources

- [Webview UI Toolkit Docs](https://github.com/microsoft/vscode-webview-ui-toolkit)
- [Webview UI Toolkit Storybook](https://microsoft.github.io/vscode-webview-ui-toolkit/)
- [VS Code Webview API](https://code.visualstudio.com/api/extension-guides/webview)
- [VS Code CSS Variables](https://code.visualstudio.com/api/references/theme-color)
- [AHK Converter Reference Implementation](C:\Users\dev\Documents\Design\Coding\ahk-converter\src\sidebarWebview.ts)

## Next Steps

1. Create new branch: `feature/native-ui-toolkit`
2. Update `parsingGuideView.ts` to use toolkit
3. Test with both light and dark themes
4. Commit and test in extension
5. Deploy and gather feedback

## Notes

- The toolkit is marked deprecated, but it's still the official Microsoft solution
- No replacement has been announced
- All VS Code webviews still use it
- Safe to use until Microsoft provides alternative
