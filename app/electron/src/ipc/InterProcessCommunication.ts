import { ipcMain } from 'electron';

export type Callback<T extends void | JSONElement = void> = (...parameters: JSONArray) => Promise<T>;

export class IPC<TChannelsOut extends string, TChannelsIn extends string> {

    constructor(private readonly webContents: Electron.WebContents, private readonly trustedURL: URL) {}

    public Send(method: TChannelsOut, ...parameters: JSONArray): void {
        this.webContents.send(method, ...parameters);
    }

    public Listen<T extends void | JSONElement = void>(method: TChannelsIn, callback: Callback<T>) {
        ipcMain.handle(method, async (event, ...parameters: JSONArray) => {
            const frame = event.senderFrame;
            if(event.sender !== this.webContents || !frame || frame !== this.webContents.mainFrame) {
                throw new Error('Rejected IPC from untrusted renderer');
            }
            const senderURL = new URL(frame.url);
            const trusted = this.trustedURL.protocol === 'file:' ? senderURL.href === this.trustedURL.href : senderURL.origin === this.trustedURL.origin;
            if(!trusted) {
                throw new Error('Rejected IPC from untrusted renderer');
            }
            return callback(...parameters);
        });
    }
}
