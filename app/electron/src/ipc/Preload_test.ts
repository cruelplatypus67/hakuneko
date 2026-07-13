import { beforeAll, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    exposeInMainWorld: vi.fn(),
    invoke: vi.fn(),
    on: vi.fn(),
}));

vi.mock('electron', () => ({
    contextBridge: { exposeInMainWorld: mocks.exposeInMainWorld },
    ipcRenderer: { invoke: mocks.invoke, on: mocks.on },
}));

describe('Preload IPC bridge', () => {
    let bridge: { invoke(channel: string, ...parameters: JSONArray): Promise<JSONElement>; on(channel: string, callback: (...parameters: JSONArray) => void): void };

    beforeAll(async () => {
        await import('./Preload');
        bridge = mocks.exposeInMainWorld.mock.calls[0]![1] as typeof bridge;
    });

    it('Should reject unknown IPC channels', () => {
        expect(() => bridge.invoke('unknown')).toThrow('IPC channel');
        expect(() => bridge.invoke('RemoteBrowserWindowController::SendDebugCommand')).toThrow('IPC channel');
        expect(() => bridge.on('unknown', vi.fn())).toThrow('IPC channel');
    });

    it('Should hide Electron event objects from renderer callbacks', () => {
        const callback = vi.fn();
        bridge.on('RemoteBrowserWindowController::OnDomReady', callback);
        const listener = mocks.on.mock.calls[0]![1] as (event: unknown, ...parameters: JSONArray) => void;

        listener({ sender: '😈' }, 7);

        expect(callback).toHaveBeenCalledWith(7);
    });
});
