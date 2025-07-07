import { spawn } from 'child_process';
import { createServer } from 'net';
import { resolve } from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { createConnection, ProposedFeatures } from 'vscode-languageserver/node';
// import { sendAhkRequest } from './ahkProvider'; // File does not exist
import {
	clearLibSymbols, configCache,
	initCaches, inLibDirs, Lexer, lexers, libDirs, libSymbols, loadSyntax, localize, MessageType,
	parseProject, parseUserLib, resolvePath, setting, setVersion, URI, utils
} from './common';
import { documents, setConnection } from './connection';
// import { PEFile, RESOURCE_TYPE, searchAndOpenPEFile } from './PEFile'; // File does not exist

// Object.assign(utils, { // Commented out due to missing ahkProvider/PEFile dependencies
// 	getAhkVersion,
// 	getDllExport,
// 	getRCData,
// 	setInterpreter,
// });
// if (process.platform === 'win32') // Commented out due to missing ahkProvider dependency
// 	utils.sendAhkRequest = sendAhkRequest;
setConnection(createConnection(ProposedFeatures.all), resolve(__dirname, '../..'));

// function showPathError(msg: string) { // Commented out due to missing ahkProvider/PEFile dependencies
// 	clearRCData();
// 	utils.showMessage(MessageType.Error, msg, { title: localize('ahk2.select', 'Select Interpreter')() })
// 		.then(r => r && utils.updateStatusBar?.(''));
// }

async function initEnv(samefolder: boolean): Promise<boolean> {
	// if (!ahkPath_resolved) // Commented out due to missing ahkPath_resolved
	// 	return showPathError(setting.ahkpatherr()), false;
	// let vars; // Commented out due to missing ahkProvider/PEFile dependencies
	// const ver = ahkVersion; // Commented out due to missing ahkVersion
	// for (let i = 0; i < 3 && !vars; i++) // Commented out due to missing ahkProvider/PEFile dependencies
	// 	vars = await getScriptVars(); // Commented out due to missing ahkProvider/PEFile dependencies
	// if (!vars) // Commented out due to missing ahkProvider/PEFile dependencies
	// 	return showPathError(setting.getenverr()), false; // Commented out due to missing ahkProvider/PEFile dependencies
	// Object.assign(a_Vars, vars).ahkpath ??= ahkPath; // Commented out due to missing ahkPath
	// setVersion(a_Vars.ahkversion ??= '2.0.0'); // Commented out due to missing ahkVersion
	// if (a_Vars.ahkversion.startsWith('1.')) // Commented out due to missing ahkVersion
	// 	showPathError(setting.versionerr()); // Commented out due to missing ahkProvider/PEFile dependencies
	// if (!samefolder || !libDirs.length) { // Commented out due to missing libDirs
	// 	libDirs.length = 0; // Commented out due to missing libDirs
	// 	libDirs.push(a_Vars.mydocuments + '\\AutoHotkey\\Lib\\', // Commented out due to missing a_Vars
	// 		a_Vars.ahkpath.replace(/[^\\/]+$/, 'Lib\\')); // Commented out due to missing a_Vars
	// 	let lb; // Commented out due to missing libSymbols
	// 	for (lb of Object.values(libSymbols)) // Commented out due to missing libSymbols
	// 		lb.islib = inLibDirs(lb.fsPath); // Commented out due to missing inLibDirs
	// }
	// if (ahkVersion !== ver) { // Commented out due to missing ahkVersion
	// 	const h = !!a_Vars.threadid; // Commented out due to missing a_Vars
	// 	initCaches(); // Commented out due to missing initCaches
	// 	setIsAhkH(h); // Commented out due to missing setIsAhkH
	// 	loadSyntax(); // Commented out due to missing loadSyntax
	// 	if (h) loadSyntax('ahk2_h'), loadSyntax('winapi', 4); // Commented out due to missing loadSyntax
	// 	samefolder = false; // Commented out due to missing ahkProvider/PEFile dependencies
	// } else if (a_Vars.threadid) { // Commented out due to missing a_Vars
	// 	if (!isahk2_h) // Commented out due to missing isahk2_h
	// 		setIsAhkH(true), samefolder = false, loadSyntax('ahk2_h'), loadSyntax('winapi', 4); // Commented out due to missing setIsAhkH
	// } else { // Commented out due to missing ahkProvider/PEFile dependencies
	// 	if (isahk2_h) // Commented out due to missing isahk2_h
	// 		setIsTwblH(false), samefolder = false, initCaches(), loadSyntax(); // Commented out due to missing setIsTwblH
	// }
	// Object.assign(a_Vars, { index: '0', clipboard: '', threadid: '' }); // Commented out due to missing a_Vars
	// await updateRCData(); // Commented out due to missing ahkProvider/PEFile dependencies
	// if (samefolder) // Commented out due to missing ahkProvider/PEFile dependencies
	// 	return true; // Commented out due to missing ahkProvider/PEFile dependencies
	// for (const uri in lexers) { // Commented out due to missing lexers
	// 	const lex = lexers[uri]; // Commented out due to missing lexers
	// 	if (!lex.d) { // Commented out due to missing lex
	// 		lex.initLibDirs(); // Commented out due to missing lex
	// 		if (Object.keys(lex.include).length || lex.diagnostics.length) // Commented out due to missing lex
	// 			lex.update(); // Commented out due to missing lex
	// 	}
	// }
	// clearLibSymbols(); // Commented out due to missing clearLibSymbols
	// if (configCache.AutoLibInclude > 1) // Commented out due to missing configCache
	// 	parseUserLib(); // Commented out due to missing parseUserLib
	return true; // Placeholder return
}

// async function updateRCData() { // Commented out due to missing ahkProvider/PEFile dependencies
// 	let pe;
// 	try {
// 		clearRCData();
// 		pe = new PEFile(resolvePath(ahkPath, true));
// 		rcData = await pe.getResource(RESOURCE_TYPE.RCDATA);
// 	} catch { }
// 	finally { pe?.close(); }
// }

// function clearRCData() { // Commented out due to missing ahkProvider/PEFile dependencies
// 	loadedRCData.forEach(lex => lex.close(true));
// 	loadedRCData.length = 0;
// 	rcData = undefined;
// }

async function changeInterpreter(oldpath: string, newpath: string) {
	// const samefolder = !!oldpath && resolve(oldpath, '..').toLowerCase() === resolve(newpath, '..').toLowerCase(); // Commented out due to missing resolve
	// if (!(await initEnv(samefolder))) // Commented out due to missing initEnv
	// 	return false; // Commented out due to missing ahkProvider/PEFile dependencies
	// if (samefolder) // Commented out due to missing ahkProvider/PEFile dependencies
	// 	return true; // Commented out due to missing ahkProvider/PEFile dependencies
	// documents.keys().forEach(uri => { // Commented out due to missing documents
	// 	const lex = lexers[uri.toLowerCase()]; // Commented out due to missing lexers
	// 	if (!lex) return; // Commented out due to missing lex
	// 	lex.initLibDirs(lex.scriptdir); // Commented out due to missing lex
	// 	if (configCache.AutoLibInclude & 1) // Commented out due to missing configCache
	// 		parseProject(lex.uri); // Commented out due to missing parseProject
	// });
	return true; // Placeholder return
}

async function setInterpreter(path: string) {
	// const prev_path = ahkPath; // Commented out due to missing ahkPath
	// if (path) { // Commented out due to missing ahkProvider/PEFile dependencies
	// 	if (path.toLowerCase() === prev_path.toLowerCase()) // Commented out due to missing prev_path
	// 		return; // Commented out due to missing ahkProvider/PEFile dependencies
	// 	setAhkPath(path); // Commented out due to missing setAhkPath
	// 	utils.updateStatusBar?.(); // Commented out due to missing utils
	// 	await changeInterpreter(prev_path, path); // Commented out due to missing changeInterpreter
	// }
	// if (!ahkPath) // Commented out due to missing ahkPath
	// 	showPathError(setting.ahkpatherr()); // Commented out due to missing showPathError
}

// async function getAhkVersion(params: string[]) { // Commented out due to missing ahkProvider/PEFile dependencies
// 	return Promise.all(params.map(async path => {
// 		let pe: PEFile | undefined;
// 		try {
// 			pe = new PEFile(path);
// 			const props = (await pe.getResource(RESOURCE_TYPE.VERSION))[0].StringTable[0];
// 			if (props.ProductName?.toLowerCase().startsWith('autohotkey')) {
// 				const is_bit64 = await pe.is_bit64;
// 				const m = (await pe.getResource(RESOURCE_TYPE.MANIFEST))[0]?.replace(/<!--[\s\S]*?-->/g, '') ?? '';
// 				let version = `${props.ProductName} ${props.ProductVersion ?? 'unknown version'} ${is_bit64 ? '64' : '32'} bit`;
// 				if (m.includes('uiAccess="true"'))
// 					version += ' [UIAccess]';
// 				return version;
// 			}
// 		} catch (e) { }
// 		finally { pe?.close(), pe = undefined; }
// 		return '';
// 	}));
// }

// async function getDllExport(paths: string[] | Set<string>, onlyone = false) { // Commented out due to missing ahkProvider/PEFile dependencies
// 	const funcs: Record<string, true> = {};
// 	for (const path of paths) {
// 		const pe = await searchAndOpenPEFile(path, a_Vars.ptrsize === '8' ? true : a_Vars.ptrsize === '4' ? false : undefined);
// 		if (!pe) continue;
// 		try {
// 			(await pe.getExport())?.Functions.forEach((it) => funcs[it.Name] = true);
// 			if (onlyone) break;
// 		} finally { pe.close(); }
// 	}
// 	delete funcs[''];
// 	return Object.keys(funcs);
// }

let rcData: Record<string, Buffer> | undefined = undefined;
const loadedRCData: Lexer[] = [];
// function getRCData(name?: string) { // Commented out due to missing ahkProvider/PEFile dependencies
// 	if (!rcData)
// 		return;
// 	if (!name) return { uri: '', path: '', paths: Object.keys(rcData ?? {}) };
// 	const path = `${ahkPath}:${name}`;
// 	const uri = URI.from({ scheme: 'ahkres', path }).toString().toLowerCase();
// 	if (lexers[uri])
// 		return { uri, path };
// 	const data = rcData[name];
// 	if (!data)
// 		return;
// 	try {
// 		const lex = lexers[uri] = new Lexer(TextDocument.create(uri, 'ahk2', -10, new TextDecoder('utf8', { fatal: true }).decode(data)));
// 		lex.parseScript();
// 		loadedRCData.push(lex);
// 		return { uri, path };
// 	} catch { delete rcData[name]; }
// }

// function getScriptVars(): Promise<Record<string, string> | undefined> { // Commented out due to missing ahkProvider/PEFile dependencies
// 	const path = `\\\\.\\pipe\\ahk-script-${Buffer.from(Uint16Array.from(
// 		[process.pid, Date.now()]).buffer).toString('hex')}`;
// 	let has_written = false, output: string | undefined;
// 	const server = createServer().listen(path);
// 	const script = `
// #NoTrayIcon
// s := ""
// for _, k in ${JSON.stringify([...builtinVars, ...builtinVars_h])}
// 	try if SubStr(k, 1, 2) = "a_" && !IsObject(v := %k%)
// 		s .= SubStr(k, 3) "|" v "\`n"
// FileOpen(A_ScriptFullPath, "w", "utf-8").Write(s)`;
// 	return new Promise<void>(r => {
// 		server.on('connection', socket => {
// 			const destroy = () => socket.destroy();
// 			socket.on('error', destroy);
// 			if (has_written) {
// 				output = '';
// 				socket.setEncoding('utf8')
// 					.on('data', data => output! += data)
// 					.on('end', () => (r(), destroy()));
// 				return;
// 			}
// 			has_written = socket.write(script);
// 			socket.destroySoon();
// 		});
// 		const cp = spawn(`"${ahkPath}" /CP65001 /ErrorStdOut ${path}`, [], { cwd: resolve(ahkPath, '..'), shell: true });
// 		cp.on('exit', code => code !== 0 ? r() : output === undefined && setTimeout(r, 1000));
// 		cp.on('error', r);
// 		setTimeout(() => cp.kill(), 2000);
// 	}).then(() => {
// 		const data = output?.trim();
// 		if (data)
// 			return Object.fromEntries(data.split('\n').map(l => l.split('|')));
// 	}).finally(() => server.close());
// }
