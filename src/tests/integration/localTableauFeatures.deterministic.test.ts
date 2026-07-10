import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { FormattingOptions, Range } from 'vscode-languageserver';
import { buildWorkbookDigest } from '../../chat/workbookDigest.js';
import { format, formatRange } from '../../format.js';
import { addOrUpdateWorkbookCalculation, validateWorkbookXml } from '../../parsers/workbookCalculations.js';
import { runWorkbookEditTransaction } from '../../services/workbookEditService.js';
import { LocalTableauConnectorHub } from '../../services/localTableauConnectors.js';
import { buildWorkbookFieldContext } from '../../services/workbookFieldContext.js';

const FIXED_NOW = Date.parse('2026-07-09T12:00:00.000Z');
const OLDEST = new Date('2026-01-01T00:00:00.000Z');
const MIDDLE = new Date('2026-01-02T00:00:00.000Z');
const NEWEST = new Date('2026-01-03T00:00:00.000Z');
const FORMAT_OPTIONS: FormattingOptions = { tabSize: 4, insertSpaces: true };

const WORKBOOK_XML = `<workbook>
  <datasources>
    <datasource caption='Orders' name='orders'>
      <column caption='Sales' datatype='real' name='[Sales]' role='measure' />
      <column caption='Region' datatype='string' name='[Region]' role='dimension' />
      <column caption='High Value' datatype='string' name='[Calculation_1]' role='dimension'>
        <calculation formula='IF [Sales] &gt; 100 THEN &quot;High&quot; ELSE &quot;Low&quot; END' />
      </column>
    </datasource>
    <datasource caption='Targets' name='targets'>
      <column caption='Sales' datatype='integer' name='[Sales]' role='measure' />
    </datasource>
  </datasources>
</workbook>`;

async function writeFixture(filePath: string, content: string, modifiedAt: Date): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf8');
    await fs.utimes(filePath, modifiedAt, modifiedAt);
}

describe('deterministic local Tableau connector and formatter acceptance', () => {
    let fixtureRoot: string;
    let installationRoot: string;
    let repositoryRoot: string;
    let connectedWorkbook: string;

    beforeAll(async () => {
        fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tableau-deterministic-'));
        installationRoot = path.join(fixtureRoot, 'Program Files', 'Tableau');
        repositoryRoot = path.join(fixtureRoot, 'Documents', 'My Tableau Repository');
        connectedWorkbook = path.join(repositoryRoot, 'Workbooks', 'Sales.twb');

        await writeFixture(
            path.join(installationRoot, 'Tableau 2023.2', 'bin', 'tableau.exe'),
            'tableau-2023.2',
            OLDEST
        );
        await writeFixture(
            path.join(installationRoot, 'Tableau 2026.1', 'bin', 'tableau.exe'),
            'tableau-2026.1',
            NEWEST
        );
        await writeFixture(connectedWorkbook, WORKBOOK_XML, NEWEST);
        await writeFixture(
            path.join(repositoryRoot, 'Workbooks', 'Archive', 'Legacy.twb'),
            '<workbook />',
            OLDEST
        );
        await writeFixture(
            path.join(repositoryRoot, 'Workbooks', 'Packaged.twbx'),
            'packaged-workbook',
            MIDDLE
        );
        await writeFixture(
            path.join(repositoryRoot, 'Workbooks', 'Data', 'Sales.hyper'),
            'hyper-extract',
            MIDDLE
        );
        await writeFixture(
            path.join(repositoryRoot, 'Datasources', 'Warehouse.tds'),
            '<datasource />',
            OLDEST
        );
        await writeFixture(
            path.join(repositoryRoot, 'Datasources', 'Packaged.tdsx'),
            'packaged-datasource',
            OLDEST
        );
        await writeFixture(
            path.join(repositoryRoot, 'Datasources', 'Warehouse.hyper'),
            'hyper-extract',
            OLDEST
        );
        await writeFixture(
            path.join(repositoryRoot, 'Connectors', 'deterministic.taco'),
            'connector-package',
            OLDEST
        );
        await writeFixture(
            path.join(repositoryRoot, 'Logs', 'tableau.log'),
            'desktop-log',
            OLDEST
        );
        await writeFixture(
            path.join(repositoryRoot, 'Logs', 'tabprotosrv.txt'),
            'protocol-log',
            OLDEST
        );
    });

    afterAll(async () => {
        await fs.rm(fixtureRoot, { recursive: true, force: true });
    });

    it('returns the exact same connector snapshot from controlled local inputs', async () => {
        const snapshot = await new LocalTableauConnectorHub({
            installationRoots: [installationRoot],
            repositoryRoots: [repositoryRoot],
            processProbe: async () => true,
            now: () => FIXED_NOW,
        }).discover();
        const counts = snapshot.artifacts.reduce<Record<string, number>>((result, artifact) => {
            result[artifact.kind] = (result[artifact.kind] ?? 0) + 1;
            return result;
        }, {});

        expect(snapshot.discoveredAt).toBe(FIXED_NOW);
        expect(snapshot.desktopRunning).toBe(true);
        expect(snapshot.installations.map(item => item.version)).toEqual(['2026.1', '2023.2']);
        expect(snapshot.repositories.map(item => item.rootPath)).toEqual([repositoryRoot]);
        expect(counts).toEqual({
            workbook: 2,
            'packaged-workbook': 1,
            extract: 2,
            datasource: 1,
            'packaged-datasource': 1,
            connector: 1,
            log: 2,
        });
        expect(snapshot.artifacts
            .filter(item => item.kind === 'workbook')
            .map(item => path.basename(item.filePath)))
            .toEqual(['Sales.twb', 'Legacy.twb']);
    });

    it('feeds a discovered workbook into the shared LSP and chat field model', async () => {
        const xml = await fs.readFile(connectedWorkbook, 'utf8');
        const sourceUri = pathToFileURL(connectedWorkbook).toString();
        const context = buildWorkbookFieldContext(xml, 'Sales.twb', sourceUri);
        const salesFields = context.fields.filter(field => field.name === 'Sales');
        const salesDefinition = context.definitions.find(field => field.name === 'Sales');
        const digest = buildWorkbookDigest(xml, 'fields', 'Sales.twb', sourceUri, 'Sales');

        expect(salesFields.map(field => field.datasource)).toEqual(['Orders', 'Targets']);
        expect(salesDefinition).toMatchObject({
            name: 'Sales',
            type: 'Number',
            datasource: 'Orders | Targets',
            sourceUri,
        });
        expect(context.fields.find(field => field.name === 'High Value')?.kind).toBe('calculation');
        expect(digest).toContain('## Datasource fields (3)');
        expect(digest).toContain('### Orders (2)');
        expect(digest).toContain('### Targets (1)');
        expect(digest).toContain('- Sales (real, measure)');
    });

    it('adds a native calculation transactionally and exposes it to LSP and chat context', async () => {
        const original = await fs.readFile(connectedWorkbook, 'utf8');
        const first = addOrUpdateWorkbookCalculation(original, {
            datasource: 'Orders',
            caption: 'Sales per Region',
            formula: 'SUM([Sales]) / COUNTD([Region])',
            datatype: 'real',
        });
        const second = addOrUpdateWorkbookCalculation(original, {
            datasource: 'Orders',
            caption: 'Sales per Region',
            formula: 'SUM([Sales]) / COUNTD([Region])',
            datatype: 'real',
        });
        let persisted = original;
        let backup = '';
        const receipt = await runWorkbookEditTransaction(original, first.updatedXml, {
            createBackup: async content => { backup = content; return 'deterministic-backup.twb'; },
            write: async content => { persisted = content; },
            read: async () => persisted,
        });
        const sourceUri = pathToFileURL(connectedWorkbook).toString();
        const context = buildWorkbookFieldContext(persisted, 'Sales.twb', sourceUri);
        const digest = buildWorkbookDigest(persisted, 'calcs', 'Sales.twb', sourceUri);

        expect(first.updatedXml).toBe(second.updatedXml);
        expect(first.internalName).toMatch(/^\[Calculation_\d{16}\]$/);
        expect(() => validateWorkbookXml(persisted)).not.toThrow();
        expect(backup).toBe(original);
        expect(receipt).toMatchObject({ backup: 'deterministic-backup.twb', verified: true });
        expect(context.fields.find(field => field.name === 'Sales per Region')).toMatchObject({
            datasource: 'Orders',
            kind: 'calculation',
        });
        expect(digest).toContain('Sales per Region');
        expect(digest).toContain('SUM([Sales]) / COUNTD([Region])');
    });

    it('produces exact and repeatable output for every formatting profile', () => {
        const conditional = TextDocument.create(
            'test://deterministic/readable.twbl',
            'tableau',
            1,
            'IF [Sales]>100 THEN "High" ELSE "Low" END'
        );
        const readable = format(conditional, { ...FORMAT_OPTIONS, profile: 'readable' })[0].newText;
        expect(readable).toBe([
            'IF [Sales] > 100 THEN',
            '    "High"',
            'ELSE',
            '    "Low"',
            'END',
        ].join('\n'));

        const functionCall = TextDocument.create(
            'test://deterministic/function.twbl',
            'tableau',
            1,
            'IFNULL([Sales],0)'
        );
        expect(format(functionCall, { ...FORMAT_OPTIONS, profile: 'compact' })[0].newText)
            .toBe('IFNULL([Sales], 0)');
        expect(format(functionCall, { ...FORMAT_OPTIONS, profile: 'expanded' })[0].newText)
            .toBe(['IFNULL(', '    [Sales],', '    0', ')'].join('\n'));

        const alreadyFormatted = TextDocument.create(
            'test://deterministic/idempotent.twbl',
            'tableau',
            1,
            readable
        );
        expect(format(alreadyFormatted, { ...FORMAT_OPTIONS, profile: 'readable' })[0].newText)
            .toBe(readable);
    });

    it('formats exactly one selected calculation and leaves neighboring text out of the edit', () => {
        const middle = 'IF [Profit]>0 THEN "Yes" ELSE "No" END';
        const document = TextDocument.create(
            'test://deterministic/selection.twbl',
            'tableau',
            1,
            `SUM([Sales])\n${middle}\nAVG([Discount])`
        );
        const range = Range.create(1, 0, 1, middle.length);
        const edits = formatRange(document, range, { ...FORMAT_OPTIONS, profile: 'readable' });

        expect(edits).toEqual([{
            range,
            newText: [
                'IF [Profit] > 0 THEN',
                '    "Yes"',
                'ELSE',
                '    "No"',
                'END',
            ].join('\n'),
        }]);
        expect(edits[0].newText).not.toContain('SUM([Sales])');
        expect(edits[0].newText).not.toContain('AVG([Discount])');
    });

    it('keeps the command and configuration wiring present in the extension manifest', async () => {
        const packageJson = JSON.parse(
            await fs.readFile(path.join(process.cwd(), 'package.json'), 'utf8')
        ) as {
            contributes: {
                commands: Array<{ command: string }>;
                configuration: { properties: Record<string, { default?: unknown }> };
            };
        };
        const commands = packageJson.contributes.commands.map(item => item.command);

        expect(commands).toEqual(expect.arrayContaining([
            'tableau-language-support.local.connectWorkbook',
            'tableau-language-support.local.openInDesktop',
            'tableau-language-support.local.showStatus',
            'tableau-language-support.local.openRepository',
            'tableau-language-support.formatting.selectProfile',
            'tableau-language-support.workbook.addCalculation',
        ]));
        expect(packageJson.contributes.configuration.properties[
            'tableau-language-support.formatting.profile'
        ].default).toBe('readable');
        expect(packageJson.contributes.configuration.properties[
            'tableau-language-support.local.repositoryPaths'
        ].default).toEqual([]);
    });
});
