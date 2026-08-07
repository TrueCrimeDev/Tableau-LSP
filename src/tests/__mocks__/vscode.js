// Minimal vscode stub for Jest — only what the tested modules reference at import time.
// Top-level members must live here rather than being assigned onto the imported
// namespace inside a test: `__importStar` hands each importing module its own
// copy, so a property added to one copy is invisible to the module under test.
// (Nested objects like `workspace` are shared by reference, so those can still
// be stubbed per-test.)
const Uri = {
    file: (p) => ({ fsPath: p, toString: () => `file://${p}` }),
    joinPath: (base, ...parts) => ({ fsPath: [base.fsPath, ...parts].join('/') }),
};
class RelativePattern {
    constructor(base, pattern) {
        this.base = base;
        this.baseUri = base && base.uri ? base.uri : base;
        this.pattern = pattern;
    }
}
module.exports = {
    Uri,
    RelativePattern,
    workspace: { workspaceFolders: [], getConfiguration: () => ({ get: () => undefined }) },
    window: {},
    commands: {},
    ExtensionContext: class {},
};
