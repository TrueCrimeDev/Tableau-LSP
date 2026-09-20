const fs = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');
const { downloadAndUnzipVSCode, resolveCliPathFromVSCodeExecutablePath } = require('@vscode/test-electron');

const root = path.resolve(__dirname, '..');

async function createProfile(kind) {
  const cache = path.join(root, '.vscode-test');
  await fs.mkdir(cache, { recursive: true });
  const directory = await fs.mkdtemp(path.join(cache, `${kind}-`));
  const extensions = path.join(directory, 'extensions');
  const userData = path.join(directory, 'user-data');
  await fs.mkdir(extensions);
  await fs.mkdir(path.join(userData, 'User'), { recursive: true });
  await fs.writeFile(path.join(userData, 'User', 'settings.json'), JSON.stringify({
    'telemetry.telemetryLevel': 'off',
    'update.mode': 'none',
    'extensions.autoUpdate': false,
    'extensions.autoCheckUpdates': false,
    'workbench.startupEditor': 'none',
    'window.restoreWindows': 'none',
  }));
  return { directory, extensions, userData };
}

async function executablePath() {
  const executable = process.env.VSCODE_EXECUTABLE_PATH || await downloadAndUnzipVSCode(process.env.VSCODE_VERSION || 'stable');
  return resolveHostExecutable(executable);
}

async function resolveHostExecutable(executable, platform = process.platform) {
  try {
    await fs.access(executable);
    return executable;
  } catch (error) {
    if (platform !== 'darwin' || path.basename(path.dirname(executable)) !== 'MacOS') throw error;
  }
  // test-electron 2.x assumes Electron, whose compatibility symlink was removed
  // from recent VS Code bundles. Use macOS's authoritative executable name.
  const macos = path.dirname(executable);
  const plist = await fs.readFile(path.join(path.dirname(macos), 'Info.plist'), 'utf8');
  const name = plist.match(/<key>\s*CFBundleExecutable\s*<\/key>\s*<string>([^<]+)<\/string>/)?.[1];
  if (!name || name === '.' || name === '..' || /[\\/]/.test(name) || path.isAbsolute(name)) {
    throw new Error('VS Code Info.plist does not contain a safe CFBundleExecutable filename');
  }
  const resolved = path.join(macos, name);
  if (!(await fs.stat(resolved)).isFile()) throw new Error('VS Code bundle executable is not a file');
  return resolved;
}

function launchArgs(profile) {
  return [
    `--extensions-dir=${profile.extensions}`,
    `--user-data-dir=${profile.userData}`,
    '--disable-gpu', '--skip-welcome', '--disable-workspace-trust', '--log=error',
  ];
}

async function installVsix(executable, profile, vsix) {
  // Use Electron's Node mode to avoid .cmd/shell quoting on Windows.
  const cli = resolveCliPathFromVSCodeExecutablePath(executable);
  let cliScript = process.platform === 'darwin'
    ? path.resolve(path.dirname(cli), '../out/cli.js')
    : path.resolve(path.dirname(cli), '../resources/app/out/cli.js');
  if (process.platform === 'win32') {
    // User installs may place resources beneath a versioned directory. Resolve
    // the actual CLI target from VS Code's launcher instead of guessing it.
    const launcher = await fs.readFile(cli, 'utf8');
    const target = launcher.match(/%~dp0([^"\r\n]+[\\/]cli\.js)/i);
    if (target) cliScript = path.resolve(path.dirname(cli), target[1]);
  }
  await fs.access(cliScript);
  await new Promise((resolve, reject) => {
    const child = spawn(executable, [cliScript, ...launchArgs(profile), '--install-extension', vsix, '--force'], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: 'inherit', windowsHide: true,
    });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`VSIX installation failed (${code})`)));
  });
}

module.exports = { root, createProfile, executablePath, resolveHostExecutable, launchArgs, installVsix };
