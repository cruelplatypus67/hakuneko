import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ipcMain, type WebContents } from 'electron';
import { IPC } from './InterProcessCommunication';

vi.mock('electron', () => {
    return {
        ipcMain: {
            handle: vi.fn(),
        }
    };
});

class TestFixture {

    public readonly mockWebContents = {
        send: vi.fn(),
        mainFrame: {},
    } as unknown as WebContents;

    public CreatTestee(): IPC<string, string> {
        return new IPC<string, string>(this.mockWebContents, new URL('https://app.hakuneko.download'));
    }
}

describe('IPC', () => {

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Constructor', () => {

        it('Should create instance', () => {
            const testee = new IPC<string, string>(null as unknown as Electron.WebContents, new URL('https://app.hakuneko.download'));
            expect(testee).toBeDefined();
        });
    });

    describe('Listen', () => {

        it('Should relay subscription to Electron asynchronouos messaging', () => {
            const testee = new IPC<string, string>(null as unknown as Electron.WebContents, new URL('https://app.hakuneko.download'));
            testee.Listen('😎', async () => {});
            expect(ipcMain.handle).toHaveBeenCalledTimes(1);
            expect(ipcMain.handle).toHaveBeenCalledWith('😎', expect.anything());
        });

        it('Should reject IPC from an untrusted frame', async () => {
            const fixture = new TestFixture();
            const callback = vi.fn();
            fixture.CreatTestee().Listen('😎', callback);
            const handler = vi.mocked(ipcMain.handle).mock.calls[0]![1] as (event: Electron.IpcMainInvokeEvent, ...parameters: JSONArray) => Promise<JSONElement>;

            await expect(handler({
                sender: fixture.mockWebContents,
                senderFrame: { url: 'https://evil.example' },
            } as Electron.IpcMainInvokeEvent)).rejects.toThrow('untrusted renderer');
            expect(callback).not.toHaveBeenCalled();
        });

        it('Should accept IPC from the trusted main frame', async () => {
            const fixture = new TestFixture();
            const callback = vi.fn().mockResolvedValue('👍');
            fixture.CreatTestee().Listen('😎', callback);
            const handler = vi.mocked(ipcMain.handle).mock.calls[0]![1] as (event: Electron.IpcMainInvokeEvent, ...parameters: JSONArray) => Promise<JSONElement>;

            await expect(handler({
                sender: fixture.mockWebContents,
                senderFrame: Object.assign(fixture.mockWebContents.mainFrame, { url: 'https://app.hakuneko.download/' }),
            } as Electron.IpcMainInvokeEvent, 7)).resolves.toBe('👍');
            expect(callback).toHaveBeenCalledWith(7);
        });

        it('Should reject a different local file from the trusted main frame', async () => {
            const fixture = new TestFixture();
            const callback = vi.fn();
            const testee = new IPC<string, string>(fixture.mockWebContents, new URL('file:///app/index.html'));
            testee.Listen('😎', callback);
            const handler = vi.mocked(ipcMain.handle).mock.calls[0]![1] as (event: Electron.IpcMainInvokeEvent) => Promise<JSONElement>;

            await expect(handler({
                sender: fixture.mockWebContents,
                senderFrame: Object.assign(fixture.mockWebContents.mainFrame, { url: 'file:///tmp/evil.html' }),
            } as Electron.IpcMainInvokeEvent)).rejects.toThrow('untrusted renderer');
            expect(callback).not.toHaveBeenCalled();
        });
    });

    describe('Send', () => {

        it('Should relay invocation to Electron asynchronouos messaging', () => {
            const fixture = new TestFixture();
            const testee = fixture.CreatTestee();
            testee.Send('😎', 7);
            expect(fixture.mockWebContents.send).toHaveBeenCalledTimes(1);
            expect(fixture.mockWebContents.send).toHaveBeenCalledWith('😎', 7);
        });
    });
});
