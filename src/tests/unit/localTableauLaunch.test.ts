import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { LocalTableauConnectorHub } from '../../services/localTableauConnectors.js';

// Keep discovery and filesystem validation real, replacing only OS process creation.
jest.mock('child_process', () => ({ ...jest.requireActual('child_process'), spawn: jest.fn() }));

describe('Tableau Desktop process launch', () => {
    let folder: string;
    let workbook: string;
    let executable: string;

    beforeEach(async () => {
        jest.clearAllMocks();
        folder = await fs.mkdtemp(path.join(os.tmpdir(), 'tableau-launch-'));
        workbook = path.join(folder, 'Sales with spaces.twbx');
        executable = path.join(folder, 'tableau.exe');
        await Promise.all([fs.writeFile(workbook, 'fixture'), fs.writeFile(executable, 'fixture')]);
    });

    afterEach(async () => {
        await fs.rm(folder, { recursive: true, force: true });
    });

    function processBoundary() {
        const child = Object.assign(new EventEmitter(), { unref: jest.fn() });
        let started!: () => void;
        const spawnCalled = new Promise<void>(resolve => { started = resolve; });
        (spawn as jest.Mock).mockImplementation(() => { started(); return child; });
        return { child, spawnCalled };
    }

    it('waits for process creation before returning success and passes the exact workbook as one argument', async () => {
        const { child, spawnCalled } = processBoundary();
        let outcome: 'pending' | 'launched' = 'pending';
        const launch = new LocalTableauConnectorHub({ executablePath: executable }).launchWorkbook(workbook);
        void launch.then(() => { outcome = 'launched'; });
        await spawnCalled;
        await new Promise<void>(resolve => setImmediate(resolve));
        expect(outcome).toBe('pending');
        expect(spawn).toHaveBeenCalledWith(executable, [workbook], {
            detached: true, stdio: 'ignore', windowsHide: true,
        });
        child.emit('spawn');
        await expect(launch).resolves.toBe(executable);
        expect(child.unref).toHaveBeenCalledTimes(1);
    });

    it('reports asynchronous process-start errors to the caller', async () => {
        const { child, spawnCalled } = processBoundary();
        const launch = new LocalTableauConnectorHub({ executablePath: executable }).launchWorkbook(workbook);
        const rejected = expect(launch).rejects.toThrow('Tableau executable cannot be started');
        await spawnCalled;
        child.emit('error', new Error('Tableau executable cannot be started'));
        await rejected;
        expect(child.unref).not.toHaveBeenCalled();
    });

    it('reports a synchronous process creation failure without claiming launch success', async () => {
        (spawn as jest.Mock).mockImplementation(() => { throw new Error('Invalid executable format'); });
        await expect(new LocalTableauConnectorHub({ executablePath: executable }).launchWorkbook(workbook))
            .rejects.toThrow('Invalid executable format');
    });
});
