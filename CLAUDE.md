# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## CRITICAL PROJECT MISSION

**TRANSFORM ZIG LSP → TABLEAU LSP EXTENSION**

This repository uses the proven Zig LSP VS Code extension as the foundation to create a comprehensive Language Server Protocol implementation for Tableau calculation language ("TabLang"). The target is `.twbl` files containing Tableau-like formulas and calculations.

**SUCCESS PATTERN**: This approach has been validated through successful implementations that achieved professional LSP capabilities comparable to TypeScript/Python servers.

## PROVEN ARCHITECTURE TO LEVERAGE

### **Foundation Structure** (Adapt from Zig LSP)
```
Current Zig LSP Structure → Target Tableau LSP Structure:

src/extension.ts           → Client setup for 'twbl' language
src/zls.ts                → TabLang LSP server integration  
src/zigProvider.ts        → TableauProvider for calculation engine
src/zigDiagnosticsProvider → Tableau syntax validation
syntaxes/zig.tmLanguage   → syntaxes/twbl.tmLanguage.json
language-configuration.json → Tableau bracket/indentation rules
```

### **Critical Assets Already Present**
- **`Test.twbl`** - Comprehensive test cases for validation
- **`syntaxes/twbl.d.twbl`** - 500+ lines of function definitions (AUTHORITATIVE SOURCE)
- **Language configuration** - Bracket matching and indentation rules
- **LSP Foundation** - Robust client-server architecture from Zig extension

## DEVELOPMENT COMMANDS

### **Build System** (Proven Setup)
- `npm run build` - Compile TypeScript with sourcemaps for development
- `npm run watch` - Watch mode compilation for active development  
- `npm run typecheck` - TypeScript type checking (CRITICAL before commits)
- `npm run lint` - ESLint validation (CRITICAL before commits)
- `npm run format` - Prettier code formatting
- `npm run vscode:prepublish` - Production build (minified)

### **Development Workflow** (Battle-Tested)
1. **Start Watch Mode**: `npm run watch` (Ctrl+Shift+B in VS Code)
2. **Launch Extension Host**: F5 to test changes
3. **Open Test Files**: Use `Test.twbl` for validation
4. **Validate Quality**: `npm run typecheck && npm run lint` before commits

### **Debugging Strategy** (Essential)
```bash
# Phase-by-Phase Testing (PROVEN METHODOLOGY)
# 1. Foundation Test: Does extension activate for .twbl files?
# 2. Language Detection: Do .twbl files show "twbl" in status bar?
# 3. Basic Features: Hover, completion, diagnostics working?
# 4. Advanced Features: Go-to-definition, find references, symbols?
```

## TABLEAU LSP ARCHITECTURE PATTERNS

### **1. Semantic Token System** (CRITICAL FOUNDATION)
**Pattern**: Adapt Zig's semantic highlighting for Tableau function categories

```typescript
// PROVEN TOKEN LEGEND (Must match implementation exactly)
const TABLEAU_TOKEN_TYPES = [
  'keyword',    // IF, THEN, ELSE, CASE, WHEN, END
  'function',   // SUM, AVG, DATEPART, LEN, CONTAINS
  'variable',   // [Field Name], calculated fields  
  'constant',   // Numbers, TRUE, FALSE, NULL
  'operator',   // +, -, *, /, =, >, <, AND, OR
  'string',     // 'text', "text"  
  'comment'     // //, /* */
];
```

**Function Categories** (Map from `twbl.d.twbl`):
- **Aggregate**: `SUM`, `AVG`, `COUNT`, `MIN`, `MAX`
- **Date**: `DATEADD`, `DATEDIFF`, `TODAY`, `NOW`, `DATEPART`
- **String**: `LEFT`, `RIGHT`, `MID`, `CONTAINS`, `LEN`
- **Logical**: `IF`, `CASE`, `ISNULL`, `IFNULL`, `AND`, `OR`
- **Math**: `ABS`, `ROUND`, `CEILING`, `FLOOR`

### **2. Triple-Layer Exclusion Logic** (ESSENTIAL FOR CORRECTNESS)
**Problem**: Users get hover tooltips inside comments/strings - breaks UX
**Solution**: Proven 3-layer protection system

```typescript
// Layer 1: Document-level range detection
private findExcludedRanges(document: TextDocument): Range[]

// Layer 2: Tokenizer-level consumption  
private consumeString(quote: string): void
private consumeComment(): void

// Layer 3: Provider-level filtering
if (tokenType === 'string' || tokenType === 'comment') {
  return null; // Skip hover/completion
}
```

### **3. Symbol Table Architecture** (Performance Critical)
**Source**: `syntaxes/twbl.d.twbl` contains all function definitions
**Pattern**: Load once at startup, cache for performance

```typescript
// Load function signatures from twbl.d.twbl
class TableauSymbolTable {
  private symbols: Map<string, SymbolInfo> = new Map();
  
  async loadFromFile(filePath: string): Promise<void> {
    // Parse JSDoc-style comments for hover documentation
    // Cache function signatures, parameters, return types
  }
}
```

### **4. LSP Feature Implementation** (Complete Protocol)
**Goal**: Professional LSP comparable to TypeScript/Python servers

**Core Features** (Phase 1):
- Text Document Sync (incremental mode)
- Hover Provider (with exclusion logic) 
- Completion Provider (functions + snippets)
- Diagnostic Validation (syntax checking)
- Semantic Tokens (7-type legend)

**Advanced Features** (Phase 2):
- Go to Definition (Ctrl+Click → `twbl.d.twbl`)
- Find All References (document-wide symbol search)
- Document Symbols (Ctrl+Shift+O outline view)
- Workspace Symbols (Ctrl+T global search)
- Signature Help (parameter hints)
- Code Actions (quick fixes, refactoring)

## TABLEAU LANGUAGE PATTERNS

### **Syntax to Handle** (From Test.twbl)
```tableau
// Field References
[Sales Amount], [Customer Name]

// Calculated Fields  
SUM([Sales Amount]) / COUNT([Order ID])

// LOD Expressions
{FIXED [Customer ID] : SUM([Sales Amount])}
{INCLUDE [Product Category] : AVG([Profit])}
{EXCLUDE [Order Date] : COUNT([Order ID])}

// Conditional Logic
IF [Profit] > 0 THEN "Profitable" 
ELSEIF [Profit] = 0 THEN "Break Even"
ELSE "Loss" END

// CASE Statements
CASE [Select Column 1 Heading]
    WHEN 'Customer Name' THEN [Customer Name]
    WHEN 'Customer Segment' THEN [Customer Segment]
    ELSE ''
END
```

### **Comment/String Exclusion Tests** (CRITICAL)
```tableau
// Test cases in Test.twbl
IF DATEPART('weekday',[Last Review]) IN (1, 7) THEN 'Weekend day OR Working day'
ELSE 'Working day AND Weekend day' // AND OR keywords in comment  
/* Block comment with CASE IS NOT keywords */
```

**VALIDATION**: NO hover tooltips should appear inside comments or strings.

## DEVELOPMENT PHASES (PROVEN METHODOLOGY)

### **Phase 1: Foundation & Core Fixes** ✅ PROVEN SUCCESSFUL
**Priority**: Get basic LSP working with robust fundamentals

1. **Audit Current State**
   - Extension activation for `.twbl` files
   - Language detection (`twbl` in status bar)
   - Build process working without errors

2. **Implement Core Features**
   - Text document sync (incremental mode)
   - Basic hover provider (with exclusion logic)
   - Semantic token provider (7-type legend)
   - Diagnostic validation

3. **Success Criteria**
   - Extension loads without errors
   - `.twbl` files trigger language mode switch
   - NO hover tooltips inside comments/strings
   - Basic syntax highlighting working

### **Phase 2: Core Protocol Compliance** ✅ PROVEN SUCCESSFUL
**Priority**: Implement all major LSP features

1. **Definition & References**
   - Go to Definition (Ctrl+Click navigation)
   - Find All References (document-wide search)

2. **Symbol Navigation** 
   - Document Symbols (Ctrl+Shift+O outline)
   - Workspace Symbols (Ctrl+T global search)

3. **Interactive Features**
   - Signature Help (parameter hints)
   - Code Actions (quick fixes)
   - Completion Provider (enhanced)

4. **Success Criteria**
   - Professional LSP comparable to TypeScript servers
   - All major VS Code LSP features working
   - Fast performance (<100ms response times)

### **Phase 3: Advanced Features** 🎯 FUTURE TARGET
**Priority**: Enhanced Tableau-specific intelligence

1. **Context-Aware Features**
   - Field reference completions
   - LOD expression validation
   - Function parameter type checking

2. **Advanced Diagnostics**
   - Aggregation level consistency
   - Type checking for calculations
   - Bracket matching validation

## CRITICAL SUCCESS PATTERNS

### **1. Server Capabilities Must Match Implementation** (LESSON LEARNED)
```typescript
// WRONG: Declares 1 type but uses 7
capabilities: {
  semanticTokensProvider: {
    legend: { tokenTypes: ['keyword'] }  // MISMATCH!
  }
}

// CORRECT: Exact match
capabilities: {
  semanticTokensProvider: {
    legend: { 
      tokenTypes: ['keyword', 'function', 'variable', 'constant', 'operator', 'string', 'comment']
    }
  }
}
```

### **2. Document Selector Configuration** (ESSENTIAL)
```typescript
// package.json
"contributes": {
  "languages": [{"id": "twbl", "extensions": [".twbl"]}]
}

// Client setup  
const documentSelector: DocumentSelector = [
  { scheme: 'file', language: 'twbl' }  // MUST match package.json
];
```

### **3. Incremental Document Sync** (PERFORMANCE)
```typescript
capabilities: {
  textDocumentSync: TextDocumentSyncKind.Incremental  // Not Full
}
```

## TESTING STRATEGY (SYSTEMATIC VALIDATION)

### **Manual Testing Framework** (Use Test.twbl)
**Foundation Tests** (Phase 1):
- [ ] F5 launches Extension Development Host without errors
- [ ] `.twbl` files switch to "twbl" language mode automatically
- [ ] NO hover tooltips inside comments: `// AND OR keywords`
- [ ] NO hover tooltips inside strings: `'Weekend day OR Working day'`
- [ ] Semantic highlighting works (green for comments/strings)

**Advanced Tests** (Phase 2):
- [ ] Ctrl+Click on `SUM` → navigates to `twbl.d.twbl`
- [ ] Right-click → "Find All References" highlights usages
- [ ] Ctrl+Shift+O shows document outline
- [ ] Ctrl+T → type "SUM" shows function results  
- [ ] Type `DATEPART(` → parameter hints appear

### **Performance Benchmarks** (Proven Targets)
- **Cold startup**: <3 seconds (symbol table loading)
- **Hover response**: <50ms (cached lookups)
- **Definition lookup**: <100ms (first load)
- **Memory overhead**: <10MB additional RAM

## ARCHITECTURAL INSIGHTS (ZIG LSP LESSONS)

### **Client-Server Separation** (Follow Zig Pattern)
- **Client** (`src/extension.ts`): VS Code integration, document selector
- **Server** (`src/zls.ts` → adapt): LSP message handling, feature implementation
- **Utilities** (`src/zigUtil.ts` → adapt): Shared helper functions
- **Providers** (adapt pattern): Modular feature implementations

### **Configuration Management** (Proven Pattern)
```typescript
// Follow Zig's configuration handling
const configuration = vscode.workspace.getConfiguration("tablang");
const enableHover = configuration.get<boolean>("enableHover", true);
```

### **Error Handling** (Robust Patterns)
```typescript
// Always use try-catch with graceful degradation
connection.onHover(async (params): Promise<Hover | null> => {
  try {
    return await processHover(params);
  } catch (error) {
    console.error('Hover error:', error);
    return null; // Graceful failure
  }
});
```

## CRITICAL FILES TO LEVERAGE

### **Existing Assets** (Already Present)
- **`Test.twbl`** - Comprehensive test cases for all features
- **`syntaxes/twbl.d.twbl`** - Function definitions (AUTHORITATIVE SOURCE)
- **`language-configuration.json`** - Bracket matching rules
- **Zig LSP Architecture** - Proven client-server patterns

### **Files to Transform** (Systematic Adaptation)
```
src/zls.ts           → TableauLSP server integration
src/zigProvider.ts   → TableauProvider calculation engine  
src/zigDiagnostics*  → Tableau syntax validation
src/zigUtil.ts       → TableauUtil helper functions
package.json         → Update for 'twbl' language support
```

## SUCCESS METRICS (VALIDATION CRITERIA)

### **Professional LSP Achievement** ✅
- **Core Protocol**: All major LSP features implemented
- **Performance**: Sub-second response times, minimal memory overhead  
- **User Experience**: No false hover tooltips, accurate highlighting
- **Tableau Intelligence**: Function categorization, LOD support, field references
- **IDE Integration**: Native VS Code patterns (breadcrumbs, outline, quick fixes)

### **Development Quality** ✅
- **Code Quality**: Passes typecheck and lint validation
- **Architecture**: Clean client-server separation
- **Testing**: Systematic validation with Test.twbl
- **Documentation**: Clear development guidelines for future maintainers

---

## IMPLEMENTATION PRIORITY (START HERE)

1. **Study Zig LSP Patterns** - Understand proven architecture
2. **Adapt Language Configuration** - Update package.json for 'twbl'
3. **Implement Foundation** - Basic activation and document sync
4. **Add Core Features** - Hover, completion, diagnostics with exclusion logic
5. **Build Advanced Features** - Definition, references, symbols
6. **Optimize Performance** - Symbol caching and incremental parsing

**REMEMBER**: This is not greenfield development. You have a proven blueprint for success. Follow the Zig LSP foundation and adapt using these validated Tableau-specific patterns.