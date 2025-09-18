# Change Log

All notable changes to the "tableau-language-support" extension will be documented in this file.

## [1.5.1] - 2025-01-28

### 🚨 CRITICAL HOTFIX

This is an emergency hotfix for v1.5.0 which contained a critical error that caused complete extension failure.

#### Fixed
- **CRITICAL**: Fixed `ReferenceError: ErrorRecovery is not defined` that caused complete extension failure
- **Import/Export**: Corrected import statement in `incrementalParser.ts` to use `AdvancedErrorRecovery`
- **Method Calls**: Fixed document parsing to use proper error recovery instance methods
- **Runtime Errors**: Eliminated undefined reference errors that broke all LSP functionality

#### Restored Functionality
- ✅ Extension activation and initialization
- ✅ Document parsing and analysis
- ✅ Hover information with rich tooltips
- ✅ Real-time syntax error detection
- ✅ Auto-completion for functions and fields
- ✅ All keyboard shortcuts
- ✅ Code snippets and templates
- ✅ Code formatting and validation

#### Technical Changes
- Updated `src/incrementalParser.ts` import statement
- Modified `src/documentModel.ts` parseDocument function
- Replaced static method calls with proper instance-based approach
- Verified all imports resolve correctly at runtime

**URGENT**: If you have v1.5.0 installed, update to v1.5.1 immediately via VS Code Extensions panel.

## [1.5.0] - 2025-01-27

### Added
- **Comprehensive Keyboard Shortcuts**: 10 new keyboard shortcuts for common operations
  - `Ctrl+Shift+F`: Format Expression
  - `Ctrl+Shift+V`: Validate Expression  
  - `Ctrl+Shift+I`: Insert IF Statement
  - `Ctrl+Shift+C`: Insert CASE Statement
  - `Ctrl+Shift+L`: Insert LOD Expression (with picker)
  - `Ctrl+Shift+H`: Show Function Help
  - `Ctrl+/`: Toggle Comments
  - `Ctrl+Shift+R`: Restart Language Server
  - `Ctrl+Shift+T`: Run Tests
  - `Ctrl+Shift+S`: Insert Snippet

- **Advanced Analytics Snippets**: 25+ new advanced calculation patterns
  - Customer analytics (cohort analysis, retention, churn, CLV)
  - Statistical analysis (z-score, correlation, outlier detection)
  - Business intelligence (ABC analysis, market basket, conversion funnel)
  - Forecasting (moving averages, exponential smoothing)
  - Performance metrics (NPS, CSI, inventory turnover)

- **Enhanced Memory Management**: Improved per-document memory tracking
  - 50MB per document limit enforcement
  - Automatic cleanup of oversized inactive documents
  - Enhanced memory health monitoring

- **Comprehensive Test Coverage**: Complete testing framework
  - Performance tests with benchmarking
  - Edge case tests for malformed inputs
  - Boundary condition testing
  - Error recovery validation

- **Developer Experience Improvements**:
  - Context-sensitive commands (only work in .twbl files)
  - Smart snippet insertion with placeholder navigation
  - Function help with webview panel
  - Intelligent comment toggling

### Enhanced
- **Request Debouncing**: Improved performance with intelligent request prioritization
- **Error Recovery**: Better handling of malformed inputs and syntax errors
- **Documentation**: Comprehensive guides for keyboard shortcuts and snippets

### Fixed
- Memory leaks in document parsing
- Performance issues with large documents
- Error handling in edge cases

**NOTE**: v1.5.0 contained a critical bug that caused complete extension failure. Please update to v1.5.1 immediately.