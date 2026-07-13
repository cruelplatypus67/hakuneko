import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IPC } from './InterProcessCommunication';
import { PortableStorage as Channels } from '../../../src/ipc/Channels';
import { PortableStorage } from './PortableStorage';

const temporaryDirectories: string[] = [];

afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })));
});

async function CreateFixture() {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hakuneko-portable-'));
    temporaryDirectories.push(root);
    const ipc = { Listen: vi.fn() } as unknown as IPC<Channels.Web, Channels.App>;
    new PortableStorage(ipc, root);
    const callback = vi.mocked(ipc.Listen).mock.calls[0]![1] as unknown as (segments: string[], data: ArrayBuffer) => Promise<void>;
    return { root, ipc, callback };
}

describe('PortableStorage', () => {
    it('Should write files below the portable downloads directory', async () => {
        const { root, ipc, callback } = await CreateFixture();
        const data = new TextEncoder().encode('chapter page');

        await callback(['Manga', 'Chapter 85', '001.webp'], data.buffer);

        expect(ipc.Listen).toHaveBeenCalledWith(Channels.App.WriteFile, expect.anything());
        await expect(fs.readFile(path.join(root, 'downloads', 'Manga', 'Chapter 85', '001.webp'), 'utf8')).resolves.toBe('chapter page');
    });

    it('Should reject paths outside the portable downloads directory', async () => {
        const { callback } = await CreateFixture();
        await expect(callback(['..', 'escape'], new ArrayBuffer(0))).rejects.toThrow('Invalid portable download path');
    });
});
