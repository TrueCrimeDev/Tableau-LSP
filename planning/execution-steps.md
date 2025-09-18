# 🚀 EXECUTION STEPS - v1.5.1 Hotfix

## 🎯 **IMMEDIATE EXECUTION PLAN**

### **Phase 1: Code Fix (15 minutes)**

#### **Step 1.1: Identify the Issue**
```bash
# Check current import in documentModel.ts
grep -n "ErrorRecovery" src/documentModel.ts

# Check actual export in errorRecovery.ts  
grep -n "export.*Recovery" src/errorRecovery.ts
```

#### **Step 1.2: Fix the Import**
```typescript
// BEFORE (BROKEN)
import { ErrorRecovery } from './errorRecovery';

// AFTER (FIXED)
import { AdvancedErrorRecovery } from './errorRecovery';
```

#### **Step 1.3: Update Usage**
```typescript
// BEFORE (BROKEN)
const errorRecovery = new ErrorRecovery();

// AFTER (FIXED)  
const errorRecovery = new AdvancedErrorRecovery();
```

#### **Step 1.4: Verify All References**
```bash
# Search for any other ErrorRecovery references
grep -r "ErrorRecovery" src/ --exclude-dir=node_modules
```

---

### **Phase 2: Build & Test (10 minutes)**

#### **Step 2.1: Clean Build**
```bash
# Clean previous build
rm -rf out/
npm run clean

# Fresh build
npm run build
```

#### **Step 2.2: Verify Build Success**
```bash
# Check for build errors
echo $?  # Should be 0

# Verify output files exist
ls -la out/
```

#### **Step 2.3: Local Testing**
```bash
# Test extension locally
code --install-extension tableau-language-support-1.5.1.vsix --force

# Open test file
code test.twbl
```

#### **Step 2.4: Verify Functionality**
- [ ] Extension activates without errors
- [ ] Hover works on functions
- [ ] Diagnostics show for syntax errors
- [ ] Auto-completion appears
- [ ] No console errors

---

### **Phase 3: Package & Deploy (5 minutes)**

#### **Step 3.1: Update Version**
```json
// package.json
{
  "version": "1.5.1",
  "publisher": "TrueCrimeAudit"
}
```

#### **Step 3.2: Create VSIX**
```bash
# Package extension
vsce package

# Verify package created
ls -la *.vsix
```

#### **Step 3.3: Final Verification**
```bash
# Install and test VSIX
code --install-extension tableau-language-support-1.5.1.vsix --force

# Quick functionality test
# (Open .twbl file, test hover, check for errors)
```

#### **Step 3.4: Deploy to Marketplace**
```bash
# Upload to VS Code Marketplace
# (Manual upload via web interface)
```

---

## 🧪 **TESTING PROTOCOL**

### **Pre-Deployment Tests**

#### **Test 1: Extension Activation**
```typescript
// Expected: No errors in console
// Action: Install extension and activate
// Success: Extension loads without errors
```

#### **Test 2: Document Parsing**
```typescript
// Expected: Document parses successfully
// Action: Open .twbl file with Tableau code
// Success: No "ErrorRecovery is not defined" errors
```

#### **Test 3: Hover Functionality**
```typescript
// Expected: Hover shows function information
// Action: Hover over SUM([Sales])
// Success: Tooltip appears with function details
```

#### **Test 4: Diagnostics**
```typescript
// Expected: Syntax errors are detected
// Action: Type invalid syntax like "IF [Sales"
// Success: Red underline appears with error message
```

#### **Test 5: Auto-completion**
```typescript
// Expected: Suggestions appear while typing
// Action: Type "SU" and wait
// Success: SUM function appears in suggestions
```

### **Post-Deployment Monitoring**

#### **Monitor 1: Error Logs**
```bash
# Check VS Code developer console
# Expected: No "ErrorRecovery is not defined" errors
```

#### **Monitor 2: User Feedback**
```bash
# Check marketplace reviews/comments
# Expected: Positive feedback about fix
```

#### **Monitor 3: Download/Install Metrics**
```bash
# Monitor marketplace statistics
# Expected: Successful installations
```

---

## 📋 **EXECUTION CHECKLIST**

### **Pre-Execution**
- [ ] Backup current codebase
- [ ] Identify exact files to modify
- [ ] Prepare testing environment
- [ ] Have rollback plan ready

### **Code Changes**
- [ ] Fix import in `documentModel.ts`
- [ ] Update variable references
- [ ] Search for other ErrorRecovery usage
- [ ] Verify no other import issues

### **Build Process**
- [ ] Clean build environment
- [ ] Run full compilation
- [ ] Check for build errors
- [ ] Verify output files

### **Local Testing**
- [ ] Install extension locally
- [ ] Test basic functionality
- [ ] Check console for errors
- [ ] Verify all features work

### **Packaging**
- [ ] Update version number
- [ ] Create VSIX package
- [ ] Test VSIX installation
- [ ] Verify package integrity

### **Deployment**
- [ ] Upload to marketplace
- [ ] Verify deployment success
- [ ] Monitor initial feedback
- [ ] Confirm fix effectiveness

### **Post-Deployment**
- [ ] Monitor error logs
- [ ] Track user feedback
- [ ] Verify metrics improvement
- [ ] Document lessons learned

---

## ⚡ **QUICK REFERENCE COMMANDS**

### **Fix Commands**
```bash
# 1. Fix the import
sed -i 's/ErrorRecovery/AdvancedErrorRecovery/g' src/documentModel.ts

# 2. Build
npm run build

# 3. Test locally
code --install-extension tableau-language-support-1.5.1.vsix --force

# 4. Package
vsce package
```

### **Verification Commands**
```bash
# Check for undefined references
grep -r "ErrorRecovery" src/

# Verify build success
ls -la out/extension.js out/server.js

# Check package
unzip -l tableau-language-support-1.5.1.vsix
```

---

## 🚨 **EMERGENCY PROCEDURES**

### **If Fix Doesn't Work**
1. **Rollback**: Revert to previous working version
2. **Investigate**: Check for additional undefined references
3. **Alternative**: Try different fix approach
4. **Escalate**: Get additional development help

### **If Build Fails**
1. **Clean**: Remove all build artifacts
2. **Dependencies**: Reinstall node_modules
3. **Environment**: Check Node.js/npm versions
4. **Syntax**: Verify TypeScript syntax

### **If Tests Fail**
1. **Isolate**: Test individual features
2. **Debug**: Check console errors
3. **Compare**: Test against working version
4. **Document**: Record specific failures

---

## 📊 **SUCCESS METRICS**

### **Immediate Success (30 minutes)**
- [ ] Zero build errors
- [ ] Local testing passes
- [ ] VSIX packages successfully
- [ ] No undefined reference errors

### **Deployment Success (2 hours)**
- [ ] Marketplace upload successful
- [ ] Users can install v1.5.1
- [ ] Error reports stop coming in
- [ ] Positive user feedback

### **Long-term Success (24 hours)**
- [ ] Stable error-free operation
- [ ] User confidence restored
- [ ] No regression issues
- [ ] Process improvements implemented

---

**EXECUTION STATUS**: 🚨 **READY TO EXECUTE**
**ESTIMATED TIME**: **30 minutes total**
**CONFIDENCE LEVEL**: **95% success probability**
**RISK LEVEL**: **LOW** (simple fix, well-understood issue)