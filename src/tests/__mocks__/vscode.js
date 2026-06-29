// Minimal vscode stub for Jest — only what the tested modules reference at import time.
const Uri = {
    file: (p) => ({ fsPath: p, toString: () => `file://${p}` }),
    joinPath: (base, ...parts) => ({ fsPath: [base.fsPath, ...parts].join('/') }),
};
module.exports = {
    Uri,
    workspace: { workspaceFolders: [] },
    window: {},
    commands: {},
    ExtensionContext: class {},
};
