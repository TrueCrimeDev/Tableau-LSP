import { PassThrough } from 'node:stream';
import type { Connection } from 'vscode-languageserver/node';
import type { MessageConnection } from 'vscode-jsonrpc/node';

describe('Language server monitoring lifecycle', () => {
    let server: Connection;
    let client: MessageConnection;
    let clientToServer: PassThrough;
    let serverToClient: PassThrough;

    beforeEach(() => {
        jest.resetModules();
        // Keep JSON-RPC transport scheduling real while controlling monitoring.
        jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'clearImmediate'] });
        jest.spyOn(console, 'log').mockImplementation(() => undefined);

        const lsp = jest.requireActual<typeof import('vscode-languageserver/node')>(
            'vscode-languageserver/node'
        );
        clientToServer = new PassThrough();
        serverToClient = new PassThrough();
        server = lsp.createConnection(
            lsp.ProposedFeatures.all,
            new lsp.StreamMessageReader(clientToServer),
            new lsp.StreamMessageWriter(serverToClient)
        );
        client = lsp.createMessageConnection(
            new lsp.StreamMessageReader(serverToClient),
            new lsp.StreamMessageWriter(clientToServer)
        );
        jest.doMock('vscode-languageserver/node', () => ({
            ...lsp,
            createConnection: () => server,
        }));
        // No workspace files are involved in this transport/lifecycle test.
        const { FieldParser } = require('../../fieldParser.js');
        jest.spyOn(FieldParser, 'findDefinitionFile').mockReturnValue(undefined);

        require('../../server.js');
        server.onRequest('test/monitorCount', () => jest.getTimerCount());
        client.listen();
    });

    afterEach(() => {
        require('../../memoryManager.js').globalMemoryManager.shutdown();
        client?.dispose();
        server?.dispose();
        clientToServer?.destroy();
        serverToClient?.destroy();
        jest.useRealTimers();
        jest.restoreAllMocks();
        jest.dontMock('vscode-languageserver/node');
    });

    it('starts monitoring after initialization and releases all timers on shutdown', async () => {
        expect(jest.getTimerCount()).toBe(0);
        await client.sendRequest('initialize', {
            processId: null,
            capabilities: {},
            rootUri: null,
        });
        expect(jest.getTimerCount()).toBe(0);

        await client.sendNotification('initialized', {});
        // A request after the notification ensures the server has processed it.
        expect(await client.sendRequest('test/monitorCount')).toBe(3);
        await client.sendNotification('initialized', {});
        expect(await client.sendRequest('test/monitorCount')).toBe(3);

        await client.sendRequest('shutdown');
        expect(jest.getTimerCount()).toBe(0);
        expect(process.listenerCount('memoryUsage')).toBe(0);
    });
});
