import { BrowserWindow } from 'electron';
import type { IPC, Callback } from './InterProcessCommunication';
import { RemoteBrowserWindowController as Channels } from '../../../src/ipc/Channels';

export class RemoteBrowserWindowController {

    private readonly windows = new Map<number, BrowserWindow>();

    constructor (private readonly ipc: IPC<Channels.Web, Channels.App>) {
        this.ipc.Listen(Channels.App.OpenWindow, this.OpenWindow.bind(this) as Callback<number>);
        this.ipc.Listen(Channels.App.CloseWindow, this.CloseWindow.bind(this) as Callback);
        this.ipc.Listen(Channels.App.SetVisibility, this.SetVisibility.bind(this) as Callback);
        this.ipc.Listen(Channels.App.ExecuteScript, this.ExecuteScript.bind(this) as Callback);
        this.ipc.Listen(Channels.App.LoadURL, this.LoadURL.bind(this) as Callback);
    }

    private Throw(message: string): never {
        throw new Error(message);
    }

    private FindWindow(windowID: number): BrowserWindow {
        return this.windows.get(windowID) ?? this.Throw(`Failed to find controlled window with id ${windowID}!`);
    }

    private async OpenWindow(show: boolean, preload: string): Promise<number> {
        const win = new BrowserWindow({
            show,
            width: 1280,
            height: 800,
            center: true,
            webPreferences: {
                sandbox: true,
                webSecurity: true,
                contextIsolation: true,
                nodeIntegration: false,
                nodeIntegrationInWorker: false,
                nodeIntegrationInSubFrames: false,
                backgroundThrottling: false,
                disableBlinkFeatures: 'AutomationControlled',
            },
        });
        win.autoHideMenuBar = true;
        win.setMenuBarVisibility(false);
        win.webContents.debugger.attach('1.3');
        if(preload) {
            await win.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: preload });
        }
        win.webContents.setWindowOpenHandler(() => { return { action: 'deny' }; });
        win.webContents.on('dom-ready', () => this.ipc.Send(Channels.Web.OnDomReady, win.id));
        win.webContents.on('did-start-navigation', event => this.ipc.Send(Channels.Web.OnBeforeNavigate, win.id, event.url, event.isMainFrame, event.isSameDocument));
        win.once('closed', () => this.windows.delete(win.id));
        this.windows.set(win.id, win);
        return win.id;
    }

    private async CloseWindow(windowID: number): Promise<void> {
        const win = this.FindWindow(windowID);
        win.webContents.debugger.detach();
        win.destroy();
    }

    private async SetVisibility(windowID: number, show: boolean): Promise<void> {
        const win = this.FindWindow(windowID);
        return show ? win.show() : win.hide();
    }

    private async ExecuteScript<T extends JSONElement>(windowID: number, script: string): Promise<T> {
        return this.FindWindow(windowID).webContents.executeJavaScript(script, true);
    }

    private async LoadURL(windowID: number, url: string, options: string): Promise<void> {
        const protocol = new URL(url).protocol;
        if(!/^https?:$/i.test(protocol)) this.Throw(`Unsupported browser window URL protocol '${protocol}'!`);
        await this.FindWindow(windowID).loadURL(url, JSON.parse(options));
    }
}
