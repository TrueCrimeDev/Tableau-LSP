import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    LocalTableauConnectorHub,
    TableauArtifactConnector,
    TableauInstallationConnector,
    TableauRepositoryConnector,
    taskListContainsTableau,
} from '../../services/localTableauConnectors.js';

describe('local Tableau connectors', () => {
    let tempRoot: string;

    beforeEach(async () => {
        tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tableau-local-connectors-'));
    });

    afterEach(async () => {
        await fs.rm(tempRoot, { recursive: true, force: true });
    });

    it('discovers installed versions and prefers the newest Tableau Desktop', async () => {
        const installBase = path.join(tempRoot, 'Tableau');
        for (const version of ['Tableau 2023.2', 'Tableau 2026.1']) {
            const bin = path.join(installBase, version, 'bin');
            await fs.mkdir(bin, { recursive: true });
            await fs.writeFile(path.join(bin, 'tableau.exe'), 'fixture');
        }

        const installations = await new TableauInstallationConnector({
            installationRoots: [installBase],
        }).discover();

        expect(installations.map(item => item.version)).toEqual(['2026.1', '2023.2']);
        expect(installations[0].executablePath).toContain(path.join('Tableau 2026.1', 'bin', 'tableau.exe'));
    });

    it('discovers explicit repositories and classifies their local artifacts', async () => {
        const repositoryRoot = path.join(tempRoot, 'My Tableau Repository');
        const fixtures = [
            ['Workbooks', 'Sales.twb'],
            ['Workbooks', 'Packaged.twbx'],
            ['Workbooks', 'Data', 'Extract.hyper'],
            ['Datasources', 'Warehouse.tds'],
            ['Datasources', 'Packaged.tdsx'],
            ['Connectors', 'custom.taco'],
            ['Logs', 'tabprotosrv.txt'],
        ];
        for (const parts of fixtures) {
            const filePath = path.join(repositoryRoot, ...parts);
            await fs.mkdir(path.dirname(filePath), { recursive: true });
            await fs.writeFile(filePath, parts.join('/'));
        }

        const repositories = await new TableauRepositoryConnector({
            repositoryRoots: [repositoryRoot],
        }).discover();
        const artifacts = await new TableauArtifactConnector().discover(repositories);

        expect(repositories).toHaveLength(1);
        expect(new Set(artifacts.map(item => item.kind))).toEqual(new Set([
            'workbook',
            'packaged-workbook',
            'extract',
            'datasource',
            'packaged-datasource',
            'connector',
            'log',
        ]));
    });

    it('combines installation, repository, artifact, and process probes in one snapshot', async () => {
        const installBase = path.join(tempRoot, 'Tableau');
        const executable = path.join(installBase, 'Tableau 2026.1', 'bin', 'tableau.exe');
        await fs.mkdir(path.dirname(executable), { recursive: true });
        await fs.writeFile(executable, 'fixture');
        const repositoryRoot = path.join(tempRoot, 'Repository');
        const workbook = path.join(repositoryRoot, 'Workbooks', 'Connected.twb');
        await fs.mkdir(path.dirname(workbook), { recursive: true });
        await fs.writeFile(workbook, '<workbook />');

        const snapshot = await new LocalTableauConnectorHub({
            installationRoots: [installBase],
            repositoryRoots: [repositoryRoot],
            processProbe: async () => true,
        }).discover();

        expect(snapshot.desktopRunning).toBe(true);
        expect(snapshot.installations).toHaveLength(1);
        expect(snapshot.repositories).toHaveLength(1);
        expect(snapshot.artifacts.find(item => item.filePath === workbook)?.kind).toBe('workbook');
    });

    it('parses CSV and table-style tasklist output without false positives', () => {
        expect(taskListContainsTableau('"tableau.exe","1234","Console","1","1,000 K"')).toBe(true);
        expect(taskListContainsTableau('tableau.exe 1234 Console 1 1,000 K')).toBe(true);
        expect(taskListContainsTableau('INFO: No tasks are running which match the specified criteria.')).toBe(false);
        expect(taskListContainsTableau('tabprotosrv.exe 999 Console 1 1,000 K')).toBe(false);
    });

    it('refuses to launch non-workbook files', async () => {
        await expect(new LocalTableauConnectorHub().launchWorkbook(path.join(tempRoot, 'notes.txt')))
            .rejects.toThrow('Only .twb and .twbx');
    });
});
