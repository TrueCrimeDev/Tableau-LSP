"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerCommonFeatures = void 0;
const vscode_1 = require("vscode");
function registerTextEditorCommands(client) {
    const cmds = {
        extractSymbols(editor) {
            this(editorUri(editor)).then(result => vscode_1.workspace.openTextDocument({
                language: 'json', content: JSON.stringify(result, undefined, 2)
            }).then(d => vscode_1.window.showTextDocument(d, 2)));
        },
        generateComment(editor) {
            this({
                uri: editorUri(editor),
                position: client.code2ProtocolConverter.asPosition(editor.selection.active)
            }).then(r => {
                r && editor.insertSnippet(new vscode_1.SnippetString(r.text), client.protocol2CodeConverter.asRange(r.range));
            });
        },
    };
    if (!process.env.BROWSER)
        cmds.diagnoseAll = cmds.setScriptDir = function (editor) { this(editorUri(editor)); };
    return Object.entries(cmds).map(([method, callback]) => vscode_1.commands.registerTextEditorCommand(`ahk2.${method.replace(/([A-Z])/, '.$1').toLowerCase()}`, callback, (arg) => client.sendRequest(method, arg)));
}
function registerCommonFeatures(client, localize) {
    const cmds = {
        switch(editor) {
            const { document } = editor;
            vscode_1.languages.setTextDocumentLanguage(document, document.languageId === 'ahk2' ? 'ahk' : 'ahk2');
        },
        async 'update.versioninfo'(editor) {
            const infos = await client.sendRequest('getVersionInfo', editorUri(editor));
            if (!infos?.length) {
                await editor.insertSnippet(new vscode_1.SnippetString([
                    "/************************************************************************",
                    " * @description ${1:}",
                    " * @author ${2:}",
                    " * @date ${3:$CURRENT_YEAR/$CURRENT_MONTH/$CURRENT_DATE}",
                    " * @version ${4:0.0.0}",
                    " ***********************************************************************/",
                    "", ""
                ].join('\n')), new vscode_1.Range(0, 0, 0, 0));
            }
            else {
                const d = new Date;
                let contents = [], value;
                for (const info of infos) {
                    if (info.single)
                        contents.push(info.content.replace(/(?<=^;\s*@ahk2exe-set\w+\s+)(\S+|(?=[\r\n]))/i, s => (value ||= s, '\0')));
                    else
                        contents.push(info.content.replace(/(?<=^\s*[;*]?\s*@date[:\s]\s*)(\S+|(?=[\r\n]))/im, date => [d.getFullYear(), d.getMonth() + 1, d.getDate()].map(n => n.toString().padStart(2, '0')).join(date.includes('.') ? '.' : '/')).replace(/(?<=^\s*[;*]?\s*@version[:\s]\s*)(\S+|(?=[\r\n]))/im, s => (value ||= s, '\0')));
                }
                if (value !== undefined) {
                    value = await vscode_1.window.showInputBox({
                        value, prompt: localize['ahk2.enterversion']
                    });
                    if (!value)
                        return;
                    contents = contents.map(s => s.replace('\0', value));
                }
                const ed = new vscode_1.WorkspaceEdit(), { uri } = editor.document;
                infos.forEach(it => it.content !== (value = contents.shift()) &&
                    ed.replace(uri, client.protocol2CodeConverter.asRange(it.range), value));
                ed.size && vscode_1.workspace.applyEdit(ed);
            }
        }
    };
    const disposables = Object.entries(cmds).map(([cmd, callback]) => vscode_1.commands.registerTextEditorCommand(`ahk2.${cmd}`, callback));
    disposables.push(...registerTextEditorCommands(client), vscode_1.workspace.onDidCloseTextDocument(e => client.sendNotification('closeTextDocument', e.isClosed ? { uri: '', id: '' } : { uri: e.uri.toString(), id: e.languageId })));
    client.onNotification('switchToV1', (uri) => {
        const it = vscode_1.workspace.textDocuments.find(it => it.uri.toString() === uri);
        it && vscode_1.languages.setTextDocumentLanguage(it, 'ahk')
            .then(null, e => vscode_1.window.showErrorMessage(e.message));
    });
    return disposables;
}
exports.registerCommonFeatures = registerCommonFeatures;
function editorUri(editor) {
    return editor.document.uri.toString();
}
//# sourceMappingURL=common.js.map