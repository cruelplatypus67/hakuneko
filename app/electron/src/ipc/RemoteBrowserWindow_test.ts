import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { IPC } from './InterProcessCommunication';
import { RemoteBrowserWindowController } from './RemoteBrowserWindow';
import { RemoteBrowserWindowController as Channels } from '../../../src/ipc/Channels';

const mocks = vi.hoisted(() => {
    const sendCommand = vi.fn();
    const attach = vi.fn();
    const loadURL = vi.fn();
    const BrowserWindow = vi.fn(function(this: object, options: Electron.BrowserWindowConstructorOptions) {
        Object.assign(this, {
            id: 7,
            options,
            autoHideMenuBar: false,
            setMenuBarVisibility: vi.fn(),
            once: vi.fn(),
            destroy: vi.fn(),
            hide: vi.fn(),
            loadURL,
            show: vi.fn(),
            webContents: {
                debugger: { attach, detach: vi.fn(), sendCommand },
                executeJavaScript: vi.fn(),
                setWindowOpenHandler: vi.fn(),
                on: vi.fn(),
            },
        });
    });
    return { attach, BrowserWindow, loadURL, sendCommand };
});

vi.mock('electron', () => ({ BrowserWindow: mocks.BrowserWindow }));

class TestFixture {

    public readonly mockListen = vi.fn();
    public readonly mockIPC = {
        Listen: this.mockListen,
    } as unknown as IPC<string, string>;

    public CreatTestee(): RemoteBrowserWindowController {
        return new RemoteBrowserWindowController(this.mockIPC);
    }
}

describe('RemoteBrowserWindowController', () => {

    beforeEach(() => vi.clearAllMocks());

    describe('Constructor', () => {

        it('Should subscribe to IPC events', () => {
            const fixture = new TestFixture();
            const testee = fixture.CreatTestee();
            expect(testee).toBeDefined();
            expect(fixture.mockIPC.Listen).toHaveBeenCalledTimes(5);
            expect(fixture.mockIPC.Listen).toHaveBeenCalledWith(Channels.App.OpenWindow, expect.anything());
            expect(fixture.mockIPC.Listen).toHaveBeenCalledWith(Channels.App.CloseWindow, expect.anything());
            expect(fixture.mockIPC.Listen).toHaveBeenCalledWith(Channels.App.SetVisibility, expect.anything());
            expect(fixture.mockIPC.Listen).toHaveBeenCalledWith(Channels.App.ExecuteScript, expect.anything());
            expect(fixture.mockIPC.Listen).toHaveBeenCalledWith(Channels.App.LoadURL, expect.anything());
        });
    });

    describe('OpenWindow', () => {

        it('Should create a sandboxed window and inject browser-only preload code', async () => {
            const fixture = new TestFixture();
            fixture.CreatTestee();
            const openWindow = fixture.mockListen.mock.calls.find(([channel]) => channel === Channels.App.OpenWindow)![1] as (show: boolean, preload: string) => Promise<number>;

            await expect(openWindow(false, 'globalThis.marker = 1;')).resolves.toBe(7);

            expect(mocks.BrowserWindow).toHaveBeenCalledWith(expect.objectContaining({
                show: false,
                webPreferences: expect.objectContaining({
                    sandbox: true,
                    webSecurity: true,
                    contextIsolation: true,
                    nodeIntegration: false,
                    nodeIntegrationInWorker: false,
                    nodeIntegrationInSubFrames: false,
                }),
            }));
            expect(mocks.BrowserWindow.mock.calls[0]![0].webPreferences).not.toHaveProperty('preload');
            expect(mocks.sendCommand).toHaveBeenCalledWith('Page.addScriptToEvaluateOnNewDocument', {
                source: 'globalThis.marker = 1;',
            });
        });

        it('Should only load web URLs in controller-owned windows', async () => {
            const fixture = new TestFixture();
            fixture.CreatTestee();
            const openWindow = fixture.mockListen.mock.calls.find(([channel]) => channel === Channels.App.OpenWindow)![1] as (show: boolean, preload: string) => Promise<number>;
            const loadURL = fixture.mockListen.mock.calls.find(([channel]) => channel === Channels.App.LoadURL)![1] as (windowID: number, url: string, options: string) => Promise<void>;
            const executeScript = fixture.mockListen.mock.calls.find(([channel]) => channel === Channels.App.ExecuteScript)![1] as (windowID: number, script: string) => Promise<JSONElement>;
            await openWindow(false, '');

            await expect(loadURL(7, 'file:///etc/passwd', '{}')).rejects.toThrow('Unsupported');
            await expect(executeScript(99, 'document.body.innerText')).rejects.toThrow('controlled window');
            await expect(loadURL(7, 'https://example.com/', '{}')).resolves.toBeUndefined();
            expect(mocks.loadURL).toHaveBeenCalledWith('https://example.com/', {});
        });
    });
});
