"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode_1 = require("vscode");
const node_1 = require("vscode-languageclient/node");
const path_1 = require("path");
const net_1 = require("net");
const fs_1 = require("fs");
const promises_1 = require("fs/promises");
const child_process_1 = require("child_process");
const common_1 = require("./common");
const ahkconfig = vscode_1.workspace.getConfiguration('AutoHotkey2');
const ahkprocesses = new Map();
const id_has_register = [], isWindows = process.platform === 'win32';
const textdecoders = [new TextDecoder('utf8', { fatal: true }), new TextDecoder('utf-16le', { fatal: true })];
const loadedCollection = {
    'ahk2.browse': 'Browse your file system to find AutoHotkey2 interpreter',
    'ahk2.compiledfailed': 'Compiled failed!',
    'ahk2.compiledsuccessfully': 'Compiled successfully!',
    'ahk2.current': 'Current: {0}',
    'ahk2.debugextnotexist': 'The debug extension was not found, please install the debug extension first!',
    'ahk2.diagnose.all': 'Diagnostic All',
    'ahk2.enterahkpath': 'Enter path to AutoHotkey2 interpreter',
    'ahk2.entercmd': 'Enter the command line parameters that need to be passed',
    'ahk2.enterorfind': 'Enter path or find an existing interpreter',
    'ahk2.enterversion': 'Enter version',
    'ahk2.filenotexist': '\'{0}\' does not exist',
    'ahk2.find': 'Find...',
    'ahk2.savebeforecompilation': 'Please save the script before compilation',
    'ahk2.select': 'Select',
    'ahk2.set.interpreter': 'Select AutoHotkey2 Interpreter',
    'ahk2.unknownversion': 'Unknown version',
};
let ahkpath_cur = ahkconfig.InterpreterPath;
let client, outputchannel, ahkStatusBarItem;
let extlist = [], debugexts = {};
async function activate(context) {
    /** Absolute path to `server.js` */
    const module = context.asAbsolutePath(`server/${process.env.DEBUG ? 'out' : 'dist'}/server.js`);
    // If the extension is launched in debug mode then the debug server options are used
    // Otherwise the run options are used
    const serverOptions = {
        run: { module, transport: node_1.TransportKind.ipc },
        debug: {
            module,
            transport: node_1.TransportKind.ipc,
            options: { execArgv: ['--nolazy', '--inspect=6009'] }
        }
    };
    // Options to control the language client
    const fsw = vscode_1.workspace.createFileSystemWatcher('**/*.{ahk}');
    const clientOptions = {
        documentSelector: [{ language: 'ahk2' }],
        markdown: { isTrusted: true, supportHtml: true },
        outputChannel: outputchannel = vscode_1.window.createOutputChannel('AutoHotkey2', 'log'),
        outputChannelName: 'AutoHotkey2',
        synchronize: { fileEvents: fsw },
        initializationOptions: {
            GlobalStorage: context.globalStorageUri.fsPath,
            ...ahkconfig
        },
    };
    initLocalize(context.asAbsolutePath('package.nls'));
    client = new node_1.LanguageClient('AutoHotkey2', 'AutoHotkey2', serverOptions, clientOptions);
    client.onNotification('updateStatusBar', (params) => {
        if (!params)
            return setInterpreter();
        if ((ahkpath_cur = params.path).toLowerCase().endsWith('.exe')) {
            const uri = vscode_1.window.activeTextEditor?.document.uri;
            const ws = uri ? vscode_1.workspace.getWorkspaceFolder(uri)?.uri.fsPath : undefined;
            ahkStatusBarItem.tooltip = resolvePath(ahkpath_cur, ws, false);
            ahkStatusBarItem.text = params.version || localize('ahk2.unknownversion');
        }
        else {
            ahkStatusBarItem.text = localize('ahk2.set.interpreter');
            ahkStatusBarItem.tooltip = undefined, ahkpath_cur = '';
        }
    });
    await client.start();
    updateExtensionsInfo();
    textdecoders.push(new TextDecoder(vscode_1.env.language.startsWith('zh-') ? 'gbk' : 'windows-1252'));
    vscode_1.commands.executeCommand('setContext', 'ahk2:isRunning', false);
    ahkStatusBarItem = vscode_1.window.createStatusBarItem(vscode_1.StatusBarAlignment.Left, 75);
    ahkStatusBarItem.command = 'ahk2.set.interpreter';
    ahkStatusBarItem.text = localize('ahk2.set.interpreter');
    for (const it of [
        { text: '$(folder)syntaxes', command: { title: localize('ahk2.select'), command: 'ahk2.select.syntaxes' } },
    ])
        context.subscriptions.push(Object.assign(vscode_1.languages.createLanguageStatusItem(it.command.command, { language: 'ahk2' }), it));
    const cmds = {
        'debug.attach': () => beginDebug('a'),
        'debug.configs': () => beginDebug('c'),
        'debug.file': () => beginDebug('f'),
        'debug.params': () => beginDebug('p'),
        'select.syntaxes': selectSyntaxes,
        'set.interpreter': setInterpreter,
        'stop': stopRunningScript,
    };
    const editor_cmds = {
        'compile': compileScript,
        'help': quickHelp,
        'run': editor => runScript(editor),
        'run.selection': editor => runScript(editor, true),
    };
    context.subscriptions.push(ahkStatusBarItem, outputchannel, fsw, ...(0, common_1.registerCommonFeatures)(client, loadedCollection), ...Object.entries(cmds).map(([cmd, cb]) => vscode_1.commands.registerCommand(`ahk2.${cmd}`, cb)), ...Object.entries(editor_cmds).map(([cmd, cb]) => vscode_1.commands.registerTextEditorCommand(`ahk2.${cmd}`, cb)), vscode_1.extensions.onDidChange(updateExtensionsInfo), vscode_1.window.onDidChangeActiveTextEditor(e => e?.document.languageId === 'ahk2'
        ? ahkStatusBarItem.show() : ahkStatusBarItem.hide()), vscode_1.workspace.registerTextDocumentContentProvider('ahkres', {
        provideTextDocumentContent(uri, token) {
            if (token.isCancellationRequested)
                return;
            return client.sendRequest('getContent', uri.toString()).then(content => {
                setTimeout(() => {
                    const it = vscode_1.workspace.textDocuments.find(it => it.uri.scheme === 'ahkres' && it.uri.path === uri.path);
                    it && it.languageId !== 'ahk2' && vscode_1.languages.setTextDocumentLanguage(it, 'ahk2');
                }, 100);
                return content;
            });
        }
    }));
    if (vscode_1.window.activeTextEditor?.document.languageId === 'ahk2')
        ahkStatusBarItem.show();
    return client;
    function updateExtensionsInfo() {
        debugexts = {};
        for (const ext of vscode_1.extensions.all) {
            let type;
            if (ext.extensionKind === 1 && /ahk|autohotkey/i.test(ext.id) &&
                (type = ext.packageJSON?.contributes?.debuggers?.[0]?.type))
                debugexts[type] = ext.id;
        }
        extlist = Object.values(debugexts);
        for (const id in debugexts) {
            if (id_has_register.includes(id))
                continue;
            id_has_register.push(id);
            context.subscriptions.push(vscode_1.debug.registerDebugConfigurationProvider(id, {
                async resolveDebugConfiguration(folder, config) {
                    if (config.__ahk2debug || vscode_1.window.activeTextEditor?.document.languageId !== 'ahk') {
                        let runtime;
                        if (!config.__ahk2debug) {
                            config.request ||= 'launch';
                            const match_config = getDebugConfigs()?.filter(it => Object.entries(it).every(([k, v]) => equal(v, config[k])))?.sort((a, b) => Object.keys(a).length - Object.keys(b).length).pop();
                            const def = { ...getConfig('DebugConfiguration') };
                            delete def.request, delete def.type;
                            Object.assign(config, def, match_config);
                            if (match_config?.type === 'autohotkey')
                                runtime = match_config.runtime_v2;
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            function equal(a, b) {
                                if (a === b)
                                    return true;
                                if (a.__proto__ !== b.__proto__ || typeof a !== 'object')
                                    return false;
                                if (a instanceof Array)
                                    return a.every((v, i) => equal(v, b[i]));
                                const kv = Object.entries(a);
                                return kv.length === Object.keys(b).length && kv.every(([k, v]) => equal(v, b[k]));
                            }
                        }
                        else if (config.runtime === 'autohotkey')
                            runtime = config.runtime_v2;
                        if (!(config.runtime ||= runtime)) {
                            config.runtime = resolvePath(ahkpath_cur, folder?.uri.fsPath);
                            if (ahkStatusBarItem.text.endsWith('[UIAccess]'))
                                config.useUIAVersion = true;
                        }
                        if (config.request === 'launch')
                            config.program ||= '${file}';
                        if (config.type === 'ahkdbg')
                            config.AhkExecutable ||= config.runtime;
                    }
                    return config;
                }
            }));
        }
    }
}
exports.activate = activate;
function deactivate() {
    return client?.stop();
}
exports.deactivate = deactivate;
function output_append(buf) {
    outputchannel.append(decode(buf));
    function decode(buf) {
        for (const td of textdecoders) {
            try {
                return td.decode(buf);
            }
            catch { }
        }
        return buf.toString();
    }
}
async function runScript(textEditor, selection = false) {
    const executePath = resolvePath(ahkpath_cur, vscode_1.workspace.getWorkspaceFolder(textEditor.document.uri)?.uri.fsPath);
    if (!executePath) {
        const s = ahkpath_cur || 'AutoHotkey.exe';
        vscode_1.window.showErrorMessage(localize('ahk2.filenotexist', s), localize('ahk2.set.interpreter'))
            .then(r => r ? setInterpreter() : undefined);
        return;
    }
    let selecttext = '', path = '*', command = `"${executePath}" /ErrorStdOut=utf-8 `;
    if (getConfig('AutomaticallyOpenOutputView'))
        outputchannel.show(true);
    if (!ahkprocesses.size)
        outputchannel.clear();
    if (selection)
        selecttext = textEditor.selections.map(textEditor.document.getText).join('\n');
    else if (textEditor.document.isUntitled || textEditor.document.uri.scheme !== 'file')
        selecttext = textEditor.document.getText();
    executePath.replace(/^(.+[\\/])AutoHotkeyUX\.exe$/i, (...m) => {
        const lc = m[1] + 'launcher.ahk';
        if (existsSync(lc))
            command = `"${executePath}" "${lc}" `;
        return '';
    });
    const opt = {
        cwd: (0, path_1.resolve)(textEditor.document.fileName, '..'),
        shell: true
    };
    const uiAccess = ahkStatusBarItem.text.endsWith('[UIAccess]');
    if (uiAccess) {
        const pipe = randomPipeName('ahk-ipc');
        const redirect = `(()=>(std:=FileOpen('${pipe}','w'),DllCall('SetStdHandle','uint',-11,'ptr',std.Handle),DllCall('SetStdHandle','uint',-12,'ptr',std.Handle),OnExit((*)=>!std)))()`;
        createPipeReadStream(pipe).then(out => out.on('data', output_append));
        command += `/include ${createTempFile(redirect, 'ahk-stdout-redirect')} `;
        if (selecttext)
            path = createTempFile(selecttext);
    }
    else
        opt.env = Object.fromEntries(Object.entries(process.env)
            .filter(it => !/^(CHROME|ELECTRON_RUN|FPS_BROWSER|VSCODE)_/.test(it[0])));
    if (selecttext)
        command += path;
    else {
        if (textEditor.document.isUntitled)
            return;
        await vscode_1.commands.executeCommand('workbench.action.files.save');
        path = textEditor.document.fileName;
        command += `"${path}"`;
    }
    const startTime = Date.now();
    const cp = (0, child_process_1.spawn)(command, opt);
    const spid = cp.pid ? `[pid: ${cp.pid}] ` : '';
    outputchannel.appendLine(`[info] ${spid + command}`);
    cp.on('error', err => {
        outputchannel.appendLine(`[error] ${spid + err.message}`);
        ahkprocesses.delete(cp.pid);
    });
    if (!cp.pid)
        return;
    if (path === '*')
        cp.stdin?.write(selecttext), cp.stdin?.end();
    ahkprocesses.set(cp.pid, cp);
    cp.path = path;
    vscode_1.commands.executeCommand('setContext', 'ahk2:isRunning', true);
    if (!uiAccess)
        cp.stderr?.on('data', output_append), cp.stdout?.on('data', output_append);
    cp.on('exit', (code) => {
        outputchannel.appendLine(`[info] ${spid}exited with code=${code} in ${(Date.now() - startTime) / 1000} seconds`);
        ahkprocesses.delete(cp.pid);
        if (!ahkprocesses.size)
            vscode_1.commands.executeCommand('setContext', 'ahk2:isRunning', false);
    });
}
async function stopRunningScript() {
    if (!ahkprocesses.size)
        return;
    if (ahkprocesses.size === 1)
        ahkprocesses.forEach(t => kill(t.pid));
    else {
        const pick = vscode_1.window.createQuickPick(), items = [];
        pick.title = 'Running Scripts';
        ahkprocesses.forEach(t => items.push({ label: `pid: ${t.pid}`, detail: t.path }));
        pick.items = items, pick.canSelectMany = true;
        pick.onDidAccept(() => {
            pick.selectedItems.forEach(item => kill(parseInt(item.label.slice(5))));
            pick.dispose();
        });
        pick.show();
    }
    function kill(pid) {
        (0, child_process_1.execSync)(`taskkill /pid ${pid} /T /F`);
        ahkprocesses.delete(pid);
    }
}
function getFileMtime(path) {
    try {
        return (0, fs_1.lstatSync)(path).mtimeMs;
    }
    catch { }
}
async function compileScript(editor) {
    let cmd = '', cmdop = vscode_1.workspace.getConfiguration('AutoHotkey2').CompilerCMD;
    const { document } = editor;
    const ws = vscode_1.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath ?? '';
    const compilePath = findFile(['Compiler\\Ahk2Exe.exe', '..\\Compiler\\Ahk2Exe.exe'], ws);
    const executePath = resolvePath(ahkpath_cur, ws);
    if (!compilePath) {
        vscode_1.window.showErrorMessage(localize('ahk2.filenotexist', 'Ahk2Exe.exe'));
        return;
    }
    if (!executePath) {
        const s = ahkpath_cur || 'AutoHotkey.exe';
        vscode_1.window.showErrorMessage(localize('ahk2.filenotexist', s));
        return;
    }
    if (document.isUntitled || document.uri.scheme !== 'file') {
        vscode_1.window.showErrorMessage(localize('ahk2.savebeforecompilation'));
        return;
    }
    await vscode_1.commands.executeCommand('workbench.action.files.save');
    const currentPath = document.uri.fsPath;
    const exePath = currentPath.replace(/\.\w+$/, '.exe');
    const prev_mtime = getFileMtime(exePath);
    cmdop = cmdop.replace(/(['"]?)\$\{execPath\}\1/gi, `"${executePath}"`);
    if (cmdop.match(/\bahk2exe\w*\.exe/i)) {
        cmd = cmdop + ' /in ' + currentPath;
        if (!cmd.toLowerCase().includes(' /out '))
            cmd += '/out "' + exePath + '"';
    }
    else {
        cmd = `"${compilePath}" ${cmdop} /in "${currentPath}" `;
        if (!cmdop.toLowerCase().includes(' /out '))
            cmd += '/out "' + exePath + '"';
    }
    const cp = (0, child_process_1.spawn)(cmd, { cwd: (0, path_1.resolve)(currentPath, '..'), shell: true });
    if (cp.pid) {
        if ((cmd.toLowerCase() + ' ').includes(' /gui '))
            return;
        if (getConfig('AutomaticallyOpenOutputView'))
            outputchannel.show(true);
        outputchannel.clear();
        cp.on('exit', () => {
            if (prev_mtime !== (getFileMtime(exePath) ?? prev_mtime))
                vscode_1.window.showInformationMessage(localize('ahk2.compiledsuccessfully'));
            else
                vscode_1.window.showErrorMessage(localize('ahk2.compiledfailed'));
        });
        cp.stderr?.on('data', output_append);
        cp.stdout?.on('data', output_append);
    }
    else
        vscode_1.window.showErrorMessage(localize('ahk2.compiledfailed'));
}
async function quickHelp(editor) {
    const { document, selection: { active } } = editor;
    const range = document.getWordRangeAtPosition(active), line = active.line;
    const fsPath = vscode_1.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath;
    const helpPath = findFile(['AutoHotkey.chm', '../v2/AutoHotkey.chm'], fsPath ?? '');
    let word = '';
    if (range && (word = document.getText(range)).match(/^[a-z_]+$/i)) {
        if (range.start.character > 0 && document.getText(new vscode_1.Range(line, range.start.character - 1, line, range.start.character)) === '#')
            word = '#' + word;
    }
    if (!helpPath) {
        vscode_1.window.showErrorMessage(localize('ahk2.filenotexist', 'AutoHotkey.chm'));
        return;
    }
    const executePath = resolvePath(ahkpath_cur, fsPath);
    if (!executePath) {
        vscode_1.window.showErrorMessage(localize('ahk2.filenotexist', (ahkpath_cur || 'AutoHotkey.exe')));
        return;
    }
    const script = `
#NoTrayIcon
#DllLoad oleacc.dll
chm_hwnd := 0, chm_path := '${helpPath}', DetectHiddenWindows(true), !(WinGetExStyle(top := WinExist('A')) & 8) && (top := 0)
for hwnd in WinGetList('AutoHotkey ahk_class HH Parent')
	for item in ComObjGet('winmgmts:').ExecQuery('SELECT CommandLine FROM Win32_Process WHERE ProcessID=' WinGetPID(hwnd))
		if InStr(item.CommandLine, chm_path) {
			chm_hwnd := WinExist(hwnd)
			break 2
		}
if top && top != chm_hwnd
	WinSetAlwaysOnTop(0, top)
if !chm_hwnd
	Run(chm_path, , , &pid), chm_hwnd := WinWait('AutoHotkey ahk_class HH Parent ahk_pid' pid)
WinShow(), WinActivate(), WinWaitActive(), ctl := 0, endt := A_TickCount + 3000
while (!ctl && A_TickCount < endt)
	try ctl := ControlGetHwnd('Internet Explorer_Server1')
NumPut('int64', 0x11CF3C3D618736E0, 'int64', 0x719B3800AA000C81, IID_IAccessible := Buffer(16))
if ${!!word} && !DllCall('oleacc\\AccessibleObjectFromWindow', 'ptr', ctl, 'uint', 0, 'ptr', IID_IAccessible, 'ptr*', IAccessible := ComValue(13, 0)) {
	IServiceProvider := ComObjQuery(IAccessible, IID_IServiceProvider := '{6D5140C1-7436-11CE-8034-00AA006009FA}')
	NumPut('int64', 0x11D026CB332C4427, 'int64', 0x1901D94FC00083B4, IID_IHTMLWindow2 := Buffer(16))
	ComCall(3, IServiceProvider, 'ptr', IID_IHTMLWindow2, 'ptr', IID_IHTMLWindow2, 'ptr*', IHTMLWindow2 := ComValue(9, 0))
	IHTMLWindow2.execScript('
	(
		document.querySelector('#head > div > div.h-tabs > ul > li:nth-child(3) > button').click()
		searchinput = document.querySelector('#left > div.search > div.input > input[type=search]')
		keyevent = document.createEvent('KeyboardEvent')
		keyevent.initKeyboardEvent('keyup', false, true, document.defaultView, 13, null, false, false, false, false)
		searchinput.value = '${word}'
		searchinput.dispatchEvent(keyevent)
		Object.defineProperties(keyevent, { type: { get: function() { return 'keydown' } }, which: { get: function() { return 13 } } })
		searchinput.dispatchEvent(keyevent)
	)')
}`;
    const isUIAccess = ahkStatusBarItem.text.endsWith('[UIAccess]');
    const cmd = `"${executePath}" /ErrorStdOut=utf-8 ${isUIAccess ? createTempFile(script) : '*'}`;
    const cp = (0, child_process_1.spawn)(cmd, { shell: true });
    if (!isUIAccess)
        cp.stdin.write(script), cp.stdin.end();
}
function getConfig(section) {
    return vscode_1.workspace.getConfiguration('AutoHotkey2').get(section);
}
function getDebugConfigs() {
    const allconfigs = vscode_1.workspace.getConfiguration('launch').inspect('configurations');
    return allconfigs && [
        ...allconfigs.workspaceFolderValue ?? [],
        ...allconfigs.workspaceValue ?? [],
        ...allconfigs.globalValue ?? []
    ].filter(it => it.type in debugexts);
}
async function beginDebug(type) {
    let extname;
    const editor = vscode_1.window.activeTextEditor;
    let config = { ...getConfig('DebugConfiguration'), request: 'launch', __ahk2debug: true };
    if (!extlist.length) {
        vscode_1.window.showErrorMessage(localize('ahk2.debugextnotexist'));
        extname = await vscode_1.window.showQuickPick(['zero-plusplus.vscode-autohotkey-debug', 'helsmy.autohotkey-debug', 'mark-wiemer.vscode-autohotkey-plus-plus', 'cweijan.vscode-autohotkey-plus']);
        if (extname)
            vscode_1.commands.executeCommand('workbench.extensions.installExtension', extname);
        return;
    }
    if ('ap'.includes(type)) {
        if (!extlist.includes(extname = 'zero-plusplus.vscode-autohotkey-debug')) {
            vscode_1.window.showErrorMessage('zero-plusplus.vscode-autohotkey-debug was not found!');
            return;
        }
        config.type = Object.entries(debugexts).find(([, v]) => v === extname)[0];
        if (type === 'p') {
            let input = await vscode_1.window.showInputBox({ prompt: localize('ahk2.entercmd') });
            if (input === undefined)
                return;
            if ((input = input.trim())) {
                const args = [];
                input.replace(/('|")(.*?(?<!\\))\1(?=(\s|$))|(\S+)/g, (...m) => {
                    args.push(m[4] || m[2]);
                    return '';
                });
                config.args = args;
            }
        }
        else
            config.request = 'attach';
    }
    else if (type === 'c') {
        const configs = getDebugConfigs();
        if (configs?.length) {
            const pick = vscode_1.window.createQuickPick();
            pick.items = configs.map(it => ({ label: it.name, data: it }));
            pick.show();
            const it = await new Promise(resolve => {
                pick.onDidAccept(() => resolve(pick.selectedItems[0]?.data));
                pick.onDidHide(() => resolve(undefined));
            });
            pick.dispose();
            if (!it)
                return;
            config = it;
        }
    }
    else
        config.program = '${file}';
    config.type ||= Object.keys(debugexts).sort().pop();
    config.name ||= `AutoHotkey ${config.request === 'attach' ? 'Attach' : 'Debug'}`;
    vscode_1.debug.startDebugging(editor && vscode_1.workspace.getWorkspaceFolder(editor.document.uri), config);
}
async function setInterpreter() {
    // eslint-disable-next-line prefer-const
    let index = -1, { path: ahkpath, from } = getInterpreterPath();
    const list = [], _ = (ahkpath = resolvePath(ahkpath_cur || ahkpath, undefined, false)).toLowerCase();
    const pick = vscode_1.window.createQuickPick();
    const root = 'C:\\Program Files\\AutoHotkey\\';
    let it, active, sel = { label: '' };
    list.push({ alwaysShow: true, label: localize('ahk2.enterahkpath') + '...', detail: localize('ahk2.enterorfind') });
    it = { label: localize('ahk2.find'), detail: localize('ahk2.browse') };
    if (ahkpath)
        await addpath((0, path_1.resolve)(ahkpath, '..'), _.includes('autohotkey') ? 20 : 5);
    if (!_.includes(root.toLowerCase()))
        await addpath(root, 20);
    index = list.map(it => it.detail?.toLowerCase()).indexOf((ahkpath_cur || ahkpath).toLowerCase());
    if (index !== -1)
        active = list[index];
    pick.matchOnDetail = true, pick.items = list;
    pick.title = localize('ahk2.set.interpreter');
    if (active)
        pick.activeItems = [active];
    pick.placeholder = localize('ahk2.current', ahkpath_cur);
    pick.show();
    pick.onDidAccept(async () => {
        if (pick.selectedItems[0] === list[0]) {
            pick.title = undefined, pick.activeItems = [], pick.value = '', pick.items = [it];
            pick.placeholder = localize('ahk2.enterahkpath');
            return;
        }
        else if (pick.selectedItems[0] === it) {
            pick.ignoreFocusOut = true;
            const path = await vscode_1.window.showOpenDialog({
                defaultUri: ahkpath ? vscode_1.Uri.file(ahkpath) : undefined,
                filters: { Executables: ['exe'] },
                openLabel: localize('ahk2.select')
            });
            if (path)
                sel.detail = path[0].fsPath;
        }
        else {
            if ((it = pick.selectedItems[0])) {
                if ((!active || it !== active) && it.detail)
                    sel = it;
            }
            else if (pick.value.match(/\.exe/i) && existsSync(pick.value))
                sel.detail = pick.value;
        }
        pick.dispose();
        if (!sel.detail)
            return;
        ahkconfig.update('InterpreterPath', sel.detail, from);
        client.sendNotification('resetInterpreter', sel.detail);
    });
    pick.onDidHide(() => pick.dispose());
    async function addpath(dirpath, max) {
        const paths = [];
        try {
            const dirs = [await (0, promises_1.opendir)(dirpath)];
            for (const dir of dirs) {
                dirpath = dir.path;
                for await (const ent of dir) {
                    const path = (0, path_1.resolve)(dirpath, ent.name);
                    if (ent.isDirectory()) {
                        if (dir === dirs[0])
                            try {
                                dirs.push(await (0, promises_1.opendir)(path));
                            }
                            catch { }
                    }
                    else if (path.toLowerCase().endsWith('.exe') &&
                        (/(ahk|autohotkey)/i.test(path) || paths.length < max))
                        paths.push(path);
                }
            }
        }
        catch { }
        if (!paths.length)
            return;
        (await getAhkVersion(paths)).forEach((label, i) => /\bautohotkey.*?2\./i.test(label) && list.push({ label, detail: paths[i] }));
    }
}
async function selectSyntaxes() {
    const path = (await vscode_1.window.showOpenDialog({ canSelectFiles: false, canSelectFolders: true }))?.[0].fsPath;
    const t = ahkconfig.inspect('Syntaxes') ?? { key: '' };
    let f = vscode_1.ConfigurationTarget.WorkspaceFolder;
    const v = (t.workspaceFolderValue ??
        (f = vscode_1.ConfigurationTarget.Workspace, t.workspaceValue) ??
        (f = vscode_1.ConfigurationTarget.Global, t.globalValue) ?? '');
    if (path === undefined || v.toLowerCase() === path.toLowerCase())
        return;
    ahkconfig.update('Syntaxes', path || undefined, f);
}
function getAhkVersion(paths) {
    return client.sendRequest('getAhkVersion', paths.map(p => resolvePath(p, undefined, true) || p));
}
function getInterpreterPath() {
    const t = ahkconfig.inspect('InterpreterPath') ?? { key: '' };
    let from = vscode_1.ConfigurationTarget.WorkspaceFolder;
    const path = t.workspaceFolderValue ??
        (from = vscode_1.ConfigurationTarget.Workspace, t.workspaceValue) ??
        (from = vscode_1.ConfigurationTarget.Global, t.globalValue ?? t.defaultValue ?? '');
    return { from, path };
}
function findFile(files, workspace) {
    let s;
    const paths = [];
    const t = ahkconfig.inspect('InterpreterPath');
    if (add(ahkpath_cur), t) {
        add(t.workspaceFolderValue);
        add(t.workspaceValue);
        add(t.globalValue);
        add(t.defaultValue);
    }
    for (const path of paths)
        for (const file of files)
            if (existsSync(s = (0, path_1.resolve)(path, '..', file)))
                return s;
    return '';
    function add(path) {
        path = resolvePath(path, workspace);
        if (!path)
            return;
        path = path.toLowerCase();
        if (!paths.includes(path))
            paths.push(path);
    }
}
/**
 * Resolves a given path to an absolute path.
 * Returns empty string if the file does not exist or has no access rights.
 */
function resolvePath(path, workspace, resolveSymbolicLink = true) {
    if (!path)
        return '';
    const paths = [];
    path = path.replace(/%(\w+)%/g, (s0, s1) => process.env[s1] ?? s0);
    if (!path.includes(':'))
        paths.push((0, path_1.resolve)(workspace ?? '', path));
    if (!/[\\/]/.test(path) && isWindows)
        try {
            paths.push((0, child_process_1.execSync)(`chcp 65001 > nul && where ${path}`, { encoding: 'utf-8' }).trim());
        }
        catch { }
    paths.push(path);
    for (let path of paths) {
        if (!path)
            continue;
        try {
            if ((0, fs_1.lstatSync)(path).isSymbolicLink() && resolveSymbolicLink)
                path = (0, path_1.resolve)(path, '..', (0, fs_1.readlinkSync)(path));
            return path;
        }
        catch { }
    }
    return '';
}
/**
 * Returns whether the given path exists.
 * Only returns false if lstatSync give an ENOENT error.
 */
function existsSync(path) {
    try {
        (0, fs_1.lstatSync)(path);
    }
    catch (err) {
        if (err?.code === 'ENOENT')
            return false;
    }
    return true;
}
async function initLocalize(nls) {
    let s = `${nls}.${vscode_1.env.language}.json`;
    if (!existsSync(s))
        if (!vscode_1.env.language.startsWith('zh-') || !existsSync(s = `${nls}.zh-cn.json`))
            s = `${nls}.json`;
    try {
        const obj = JSON.parse(await (0, promises_1.readFile)(s, { encoding: 'utf8' }));
        for (const key of Object.keys(loadedCollection))
            if ((s = obj[key]))
                loadedCollection[key] = s;
    }
    catch { }
}
function localize(key, ...args) {
    const val = loadedCollection[key];
    if (args.length)
        return format(val, ...args);
    return val;
}
function format(message, ...args) {
    return message.replace(/\{(\d+)\}/g, (...m) => {
        const i = parseInt(m[1]);
        if (i < args.length)
            return args[i];
        return ' ';
    });
}
function randomPipeName(prefix) {
    return `\\\\.\\pipe\\${prefix}-${Buffer.from(Uint16Array.from([process.pid, Date.now()]).buffer).toString('hex')}`;
    ;
}
function createTempFile(str, prefix = 'ahk-script') {
    const path = randomPipeName(prefix);
    const server = (0, net_1.createServer)((socket) => {
        if (socket.write(str))
            server.close();
        else
            socket.on('error', () => { });
        socket.destroySoon();
    }).listen(path);
    setTimeout(() => server.close(), 2000);
    return path;
}
function createPipeReadStream(path) {
    return new Promise((resolve) => {
        const server = (0, net_1.createServer)((socket) => {
            server.close();
            socket.setEncoding('utf-8');
            socket.on('error', () => socket.destroy());
            resolve(socket);
        }).listen(path);
        setTimeout(() => server.close(), 2000);
    });
}
//# sourceMappingURL=extension.js.map