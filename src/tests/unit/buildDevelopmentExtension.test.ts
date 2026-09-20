import { join } from 'node:path';

jest.mock('node:child_process', () => ({ execFile: jest.fn() }));
jest.mock('vscode', () => ({ commands: { executeCommand: jest.fn() } }), { virtual: true });

import { execFile } from 'node:child_process';
import { commands } from 'vscode';
import { buildAndReloadDevelopmentExtension } from '../../commands/buildDevelopmentExtension';

describe('development host source build', () => {
    beforeEach(() => jest.clearAllMocks());

    test('builds from the extension checkout before reloading the demo host', async () => {
        const source = join('source checkout', 'extension');
        let complete: (error: Error | null, stdout: string, stderr: string) => void = () => {};
        (execFile as unknown as jest.Mock).mockImplementation((_command, _args, _options, callback) => { complete = callback; });
        const result = buildAndReloadDevelopmentExtension(source);
        expect(execFile).toHaveBeenCalledWith('node', [join(source, 'esbuild.mjs'), '--sourcemap'], expect.objectContaining({ cwd: source, windowsHide: true }), expect.any(Function));
        expect(commands.executeCommand).not.toHaveBeenCalled();
        complete(null, '', '');
        await result;
        expect(commands.executeCommand).toHaveBeenCalledWith('workbench.action.reloadWindow');
    });

    test('keeps the current host running when compilation fails', async () => {
        (execFile as unknown as jest.Mock).mockImplementation((_command, _args, _options, callback) => callback(new Error('failed'), '', 'invalid TypeScript'));
        await expect(buildAndReloadDevelopmentExtension('source')).rejects.toThrow('invalid TypeScript');
        expect(commands.executeCommand).not.toHaveBeenCalled();
    });
});
