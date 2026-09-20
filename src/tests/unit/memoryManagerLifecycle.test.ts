import type { MemoryManager } from '../../memoryManager.js';

describe('Memory manager lifecycle', () => {
    let memoryManager: MemoryManager;
    let existingListeners: Function[];

    beforeEach(() => {
        jest.useFakeTimers();
        jest.resetModules();
        existingListeners = process.listeners('memoryUsage');
        jest.spyOn(console, 'log').mockImplementation(() => undefined);
    });

    afterEach(() => {
        memoryManager?.shutdown();
        // Isolated imports must not leave their listeners in the shared process,
        // even when a lifecycle assertion fails.
        for (const listener of process.listeners('memoryUsage')) {
            if (!existingListeners.includes(listener)) {
                process.removeListener('memoryUsage', listener);
            }
        }
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    it('does not start background work when the parser imports the manager', () => {
        require('../../incrementalParser.js');
        memoryManager = require('../../memoryManager.js').globalMemoryManager;

        expect(jest.getTimerCount()).toBe(0);
        expect(process.listeners('memoryUsage')).toEqual(existingListeners);
    });

    function loadManager(): MemoryManager {
        memoryManager = require('../../memoryManager.js').globalMemoryManager;
        memoryManager.configure({
            monitoringIntervalMs: 1000,
            enableMemoryLogging: false,
            cleanupThresholdMB: Number.MAX_VALUE,
        });
        return memoryManager;
    }

    it('starts one monitor and checks memory at the configured interval', () => {
        const manager = loadManager();
        const memoryChecks = jest.spyOn(manager, 'getMemoryStats');
        manager.start();
        manager.start();

        expect(jest.getTimerCount()).toBe(1);
        expect(process.listenerCount('memoryUsage')).toBe(existingListeners.length + 1);
        jest.advanceTimersByTime(999);
        expect(memoryChecks).not.toHaveBeenCalled();
        jest.advanceTimersByTime(1);
        expect(memoryChecks).toHaveBeenCalledTimes(1);
    });

    it('disables and re-enables monitoring without an interval change', () => {
        const manager = loadManager();
        manager.start();
        manager.configure({ enableAutoCleanup: false });

        expect(jest.getTimerCount()).toBe(0);
        expect(process.listeners('memoryUsage')).toEqual(existingListeners);

        manager.configure({ enableAutoCleanup: true });
        const memoryChecks = jest.spyOn(manager, 'getMemoryStats');
        jest.advanceTimersByTime(1000);
        expect(memoryChecks).toHaveBeenCalledTimes(1);
        expect(jest.getTimerCount()).toBe(1);
        expect(process.listenerCount('memoryUsage')).toBe(existingListeners.length + 1);
    });

    it('replaces the interval without duplicating process listeners', () => {
        const manager = loadManager();
        manager.start();
        manager.configure({ monitoringIntervalMs: 2000 });
        manager.configure({ monitoringIntervalMs: 3000 });
        const memoryChecks = jest.spyOn(manager, 'getMemoryStats');

        jest.advanceTimersByTime(2999);
        expect(memoryChecks).not.toHaveBeenCalled();
        jest.advanceTimersByTime(1);
        expect(memoryChecks).toHaveBeenCalledTimes(1);
        expect(jest.getTimerCount()).toBe(1);
        expect(process.listenerCount('memoryUsage')).toBe(existingListeners.length + 1);
        process.emit('memoryUsage');
        expect(memoryChecks).toHaveBeenCalledTimes(2);
    });

    it('releases monitoring on shutdown and stays stopped when reconfigured', () => {
        const manager = loadManager();
        manager.start();
        const memoryChecks = jest.spyOn(manager, 'getMemoryStats');
        manager.shutdown();
        manager.shutdown();
        manager.configure({ monitoringIntervalMs: 2000 });
        process.emit('memoryUsage');
        jest.advanceTimersByTime(10000);

        expect(memoryChecks).not.toHaveBeenCalled();
        expect(jest.getTimerCount()).toBe(0);
        expect(process.listeners('memoryUsage')).toEqual(existingListeners);

        manager.start();
        jest.advanceTimersByTime(2000);
        expect(memoryChecks).toHaveBeenCalledTimes(1);
        expect(jest.getTimerCount()).toBe(1);
    });

    it('honors disabled monitoring when the server starts', () => {
        const manager = loadManager();
        manager.configure({ enableAutoCleanup: false });
        manager.start();

        expect(jest.getTimerCount()).toBe(0);
        expect(process.listeners('memoryUsage')).toEqual(existingListeners);

        manager.configure({ enableAutoCleanup: true });
        expect(jest.getTimerCount()).toBe(1);
    });
});
