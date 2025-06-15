# VS Code Extension Debugging Setup - Complete Guide for Claude Code

This prompt provides comprehensive instructions for setting up proper VS Code extension debugging, specifically for LSP (Language Server Protocol) extensions with TypeScript/esbuild build systems.

## 🎯 OBJECTIVE: Get Extension Development Host (F5) Working Perfectly

**Goal**: Enable seamless development workflow where pressing F5 launches the Extension Development Host, compiles the extension, and allows real-time testing of language features.

## 📁 REQUIRED PROJECT STRUCTURE

Your VS Code extension project needs this exact structure:

```
your-extension/
├── .vscode/
│   ├── launch.json          ← CRITICAL: Extension Host configuration
│   ├── tasks.json           ← CRITICAL: Build task automation
│   └── settings.json        ← Optional: Development settings
├── src/
│   ├── extension.ts         ← Main extension entry point
│   └── [other source files]
├── out/                     ← CRITICAL: Compiled JavaScript output
│   └── extension.js         ← Must exist for extension to activate
├── package.json             ← Extension manifest and build scripts
├── tsconfig.json            ← TypeScript configuration
└── [test files, syntaxes, etc.]
```

## 📝 STEP 1: Create .vscode/launch.json

**This is the most critical file** - it tells VS Code how to launch your extension for debugging.

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Launch Extension",
      "type": "extensionHost",
      "request": "launch",
      "args": [
        "--extensionDevelopmentPath=${workspaceFolder}"
      ],
      "outFiles": [
        "${workspaceFolder}/out/**/*.js"
      ],
      "preLaunchTask": "${workspaceFolder}:build"
    },
    {
      "name": "Launch Extension (No Build)",
      "type": "extensionHost", 
      "request": "launch",
      "args": [
        "--extensionDevelopmentPath=${workspaceFolder}"
      ],
      "outFiles": [
        "${workspaceFolder}/out/**/*.js"
      ]
    },
    {
      "name": "Extension Tests",
      "type": "extensionHost",
      "request": "launch",
      "args": [
        "--extensionDevelopmentPath=${workspaceFolder}",
        "--extensionTestsPath=${workspaceFolder}/out/test/suite/index"
      ],
      "outFiles": [
        "${workspaceFolder}/out/test/**/*.js"
      ],
      "preLaunchTask": "${workspaceFolder}:build"
    }
  ]
}
```

**Key Configuration Details:**
- `"Launch Extension"` - Builds then launches (use for development)
- `"Launch Extension (No Build)"` - Quick launch without building (use for rapid testing)
- `extensionDevelopmentPath` - Points to your extension root
- `outFiles` - Points to compiled JavaScript for breakpoint mapping
- `preLaunchTask` - Automatically runs build before launch

## 📝 STEP 2: Create .vscode/tasks.json

**Build automation** - defines how to compile your TypeScript extension.

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "type": "npm",
      "script": "build",
      "group": "build",
      "presentation": {
        "panel": "shared",
        "reveal": "silent",
        "clear": false
      },
      "label": "${workspaceFolder}:build",
      "detail": "Build extension with esbuild"
    },
    {
      "type": "npm", 
      "script": "watch",
      "group": {
        "kind": "build",
        "isDefault": true
      },
      "presentation": {
        "panel": "dedicated",
        "reveal": "never",
        "clear": false
      },
      "label": "${workspaceFolder}:watch",
      "detail": "Watch and build extension continuously",
      "isBackground": true,
      "problemMatcher": [
        {
          "base": "$tsc-watch",
          "fileLocation": "relative"
        }
      ]
    },
    {
      "type": "shell",
      "command": "npm",
      "args": ["run", "typecheck"],
      "group": "test",
      "presentation": {
        "panel": "shared",
        "reveal": "always",
        "clear": true
      },
      "label": "${workspaceFolder}:typecheck",
      "detail": "Run TypeScript type checking"
    }
  ]
}
```

**Key Task Details:**
- `build` - One-time compilation (linked to launch configuration)
- `watch` - Continuous compilation during development (Ctrl+Shift+B)
- `typecheck` - Validate TypeScript without compilation

## 📝 STEP 3: Verify package.json Build Scripts

**Essential npm scripts** for the build system to work:

```json
{
  "scripts": {
    "vscode:prepublish": "npm run build-base -- --minify",
    "build-base": "esbuild --bundle --external:vscode src/extension.ts --outdir=out --platform=node --target=node20 --format=cjs",
    "build": "npm run build-base -- --sourcemap",
    "watch": "npm run build-base -- --sourcemap --watch",
    "typecheck": "tsc --noEmit",
    "test": "npm run build && node ./out/test/runTest.js"
  },
  "main": "./out/extension",
  "engines": {
    "vscode": "^1.90.0"
  }
}
```

**Critical Elements:**
- `"main": "./out/extension"` - Points to compiled JavaScript entry point
- `build-base` - Core esbuild configuration
- `build` - Development build with sourcemaps
- `watch` - Continuous development mode
- `--external:vscode` - Don't bundle VS Code API (provided by host)

## 📝 STEP 4: Verify tsconfig.json

**TypeScript configuration** for proper compilation:

```json
{
  "compilerOptions": {
    "moduleResolution": "bundler",
    "target": "ES2021",
    "outDir": "out",
    "lib": ["ES2021"],
    "sourceMap": true,
    "rootDir": "src",
    "strict": true,
    "allowUnreachableCode": false,
    "noFallthroughCasesInSwitch": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noPropertyAccessFromIndexSignature": true
  },
  "exclude": ["node_modules", "out"]
}
```

## 🚀 STEP 5: Development Workflow

### **Method 1: Full Development Cycle**
1. **Start Watch Mode**: Press `Ctrl+Shift+B` → Select "watch" task
2. **Launch Extension**: Press `F5` → Select "Launch Extension" 
3. **Test Changes**: Edit source files, they auto-compile, then reload extension window
4. **Debug**: Set breakpoints in TypeScript, they map to running code

### **Method 2: Quick Testing**
1. **Manual Build**: Run `npm run build` in terminal
2. **Quick Launch**: Press `F5` → Select "Launch Extension (No Build)"
3. **Faster Iteration**: Skip build step for rapid testing

### **Method 3: Continuous Development**
1. **Terminal 1**: Run `npm run watch` (continuous compilation)
2. **Terminal 2**: Press `F5` when ready to test
3. **Reload**: Use `Ctrl+R` in Extension Development Host to reload changes

## 🔍 STEP 6: Verify Extension Activation

When you press F5, you should see:

1. **Extension Development Host Window Opens** - New VS Code window titled "[Extension Development Host]"
2. **Debug Console Shows Loading** - Extension loading messages
3. **Extension Activates** - Your extension appears in Extensions panel
4. **Language Features Work** - Open your target file type and test features

### **Debug Console Validation**
Press `Ctrl+Shift+Y` to open Debug Console and look for:

```
Loading extension at /path/to/your/extension...
Extension 'your-extension-name' ACTIVATED
```

### **Extension Panel Validation**
Press `Ctrl+Shift+X` → Search "your-extension" → Should show "Enabled" with local indicator

## ⚠️ COMMON ISSUES & SOLUTIONS

### **Issue 1: Extension Not Activating**
**Symptoms**: F5 opens Extension Development Host but extension doesn't load

**Debugging Steps**:
1. Check `out/extension.js` exists: `ls -la out/`
2. Verify package.json `main` field: `"main": "./out/extension"`
3. Check Debug Console for error messages
4. Verify extension manifest has proper activation events

**Solution**:
```bash
# Force rebuild
npm run build
# Check output
ls -la out/extension.js
# Should show recent timestamp
```

### **Issue 2: Build System Failures**
**Symptoms**: `npm run build` fails with Node.js errors

**Debugging Steps**:
1. Check Node.js version: `node --version` (should be 20+)
2. Verify esbuild installation: `npm list esbuild`
3. Check for conflicting global packages

**Solution**:
```bash
# Clean reinstall
rm -rf node_modules package-lock.json
npm install
npm run build
```

### **Issue 3: TypeScript Compilation Errors**
**Symptoms**: Build fails with TypeScript errors

**Debugging Steps**:
1. Run type checking: `npm run typecheck`
2. Check imports in extension.ts
3. Verify @types/vscode version matches engines.vscode

**Solution**:
```bash
# Check types
npm run typecheck
# Fix errors, then rebuild
npm run build
```

### **Issue 4: Breakpoints Not Working**
**Symptoms**: Breakpoints in TypeScript don't trigger

**Debugging Steps**:
1. Verify sourcemaps enabled: `build` script has `--sourcemap`
2. Check `outFiles` in launch.json points to correct path
3. Ensure breakpoints are in compiled code path

**Solution**:
```json
// In launch.json
"outFiles": ["${workspaceFolder}/out/**/*.js"]
```

### **Issue 5: Extension Host Crashes**
**Symptoms**: Extension Development Host closes unexpectedly

**Debugging Steps**:
1. Check Debug Console for uncaught exceptions
2. Review extension.ts activate() function
3. Look for synchronous operations that should be async

**Solution**:
```typescript
// Wrap activation in try-catch
export function activate(context: vscode.ExtensionContext) {
  try {
    // Your activation code
  } catch (error) {
    console.error('Extension activation failed:', error);
  }
}
```

## 🧪 STEP 7: Testing Your Extension

### **Basic Functionality Test**
1. Open Extension Development Host (F5)
2. Create new file with your target extension (e.g., `test.twbl`)
3. Verify language mode switches in status bar
4. Test basic language features (syntax highlighting, hover, etc.)

### **Advanced Testing**
1. Open Debug Console (`Ctrl+Shift+Y`)
2. Look for your extension's console.log messages
3. Test error handling by opening invalid files
4. Verify no uncaught exceptions in console

### **Performance Testing**  
1. Open large files (1000+ lines)
2. Test language features respond quickly (<100ms)
3. Monitor memory usage in Task Manager
4. Verify no memory leaks during extended use

## 🎯 SUCCESS CRITERIA

Your extension debugging setup is working correctly when:

✅ **F5 launches Extension Development Host without errors**
✅ **Extension appears in Extensions panel as "Enabled"**  
✅ **Language features work in target file types**
✅ **Breakpoints trigger correctly in TypeScript source**
✅ **Console shows no uncaught exceptions**
✅ **Watch mode auto-compiles and reloads work**
✅ **Performance is acceptable (<100ms for language features)**

## 🔄 DEVELOPMENT BEST PRACTICES

### **Daily Workflow**
1. Start with `npm run watch` in terminal
2. Use F5 for testing, Ctrl+R to reload changes
3. Run `npm run typecheck` before committing
4. Test thoroughly before publishing

### **Debugging Workflow**
1. Set breakpoints in TypeScript source
2. Use Debug Console for runtime inspection
3. Check Extension Development Host for user-facing issues
4. Use VS Code Developer Tools for advanced debugging

### **Quality Assurance**
1. Always run `npm run typecheck && npm run lint` before commits
2. Test with both small and large files
3. Verify language features work in various contexts
4. Check for memory leaks during extended use

---

## 🎉 FINAL CHECKLIST

Before proceeding with extension development, verify:

- [ ] `.vscode/launch.json` exists and contains proper configuration
- [ ] `.vscode/tasks.json` exists with build automation
- [ ] `package.json` has correct build scripts and main entry point
- [ ] `tsconfig.json` is properly configured for bundler moduleResolution
- [ ] `out/extension.js` is generated successfully by `npm run build`
- [ ] F5 launches Extension Development Host without errors
- [ ] Extension activates and appears in Extensions panel
- [ ] Debug Console shows extension loading messages
- [ ] Basic language features work in target file types
- [ ] Breakpoints trigger correctly in TypeScript source code

**Once all items are checked, you have a fully functional VS Code extension debugging environment!**

## 🚨 EMERGENCY WORKAROUND

If the build system completely fails, create a minimal JavaScript version:

**Create `out/extension.js` manually:**
```javascript
const vscode = require('vscode');

function activate(context) {
    console.log('Extension activated successfully!');
    
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBar.text = '$(check) Extension Ready';
    statusBar.show();
    
    context.subscriptions.push(statusBar);
}

function deactivate() {}

module.exports = { activate, deactivate };
```

This minimal version will activate and show a status bar item, proving the extension loading mechanism works while you debug the build system.