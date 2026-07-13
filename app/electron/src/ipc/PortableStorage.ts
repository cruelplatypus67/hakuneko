import fs from 'node:fs/promises';
import path from 'node:path';
import type { IPC, Callback } from './InterProcessCommunication';
import { PortableStorage as Channels } from '../../../src/ipc/Channels';

export class PortableStorage {
    private readonly downloads: string;

    constructor(ipc: IPC<Channels.Web, Channels.App>, root: string) {
        this.downloads = path.resolve(root, 'downloads');
        ipc.Listen(Channels.App.WriteFile, this.WriteFile.bind(this) as Callback);
    }

    private async WriteFile(segments: string[], data: ArrayBuffer): Promise<void> {
        if(!segments.length || segments.some(segment => !segment || path.basename(segment) !== segment || segment === '.' || segment === '..')) {
            throw new Error('Invalid portable download path');
        }
        const target = path.resolve(this.downloads, ...segments);
        if(!target.startsWith(this.downloads + path.sep)) {
            throw new Error('Portable download path escaped its root');
        }
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, new Uint8Array(data));
    }
}
