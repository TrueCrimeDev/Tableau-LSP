import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { commands } from 'vscode';

/** Build the source checkout even when the development host opens a demo folder. */
export async function buildAndReloadDevelopmentExtension(extensionPath: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        execFile('node', [join(extensionPath, 'esbuild.mjs'), '--sourcemap'], {
            cwd: extensionPath,
            windowsHide: true,
            timeout: 120_000,
            maxBuffer: 1024 * 1024,
        }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(`Build failed. Ensure Node.js and npm dependencies are installed. ${stderr || stdout || error.message}`));
            } else {
                resolve();
            }
        });
    });
    // The parent debugger lives in the source window. Reload this development
    // host directly, preserving its synthetic workspace and isolation profile.
    await commands.executeCommand('workbench.action.reloadWindow');
}
