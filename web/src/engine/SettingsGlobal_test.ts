import { afterEach, describe, expect, it, vi } from 'vitest';
import { Initialize, Key } from './SettingsGlobal';
import { SettingsManager, Text, type Directory } from './SettingsManager';
import type { StorageController } from './StorageController';

afterEach(() => vi.unstubAllGlobals());

describe('Global RPC settings', () => {
    it('Should generate a non-default secret for new profiles', async () => {
        const storage = {
            LoadPersistent: vi.fn().mockResolvedValue(undefined),
            SavePersistent: vi.fn(),
        } as unknown as StorageController;
        const manager = new SettingsManager(storage);

        await Initialize(manager, []);

        const secret = manager.OpenScope().Get<Text>(Key.RPCSecret);
        expect(secret).toBeInstanceOf(Text);
        expect(secret.Value).not.toBe('Connection#Secret');
        expect(secret.Value.length).toBeGreaterThanOrEqual(32);
    });

    it('Should replace the legacy default secret', async () => {
        const storage = {
            LoadPersistent: vi.fn().mockResolvedValue({ [Key.RPCSecret]: 'Connection#Secret' }),
            SavePersistent: vi.fn(),
        } as unknown as StorageController;
        const manager = new SettingsManager(storage);

        await Initialize(manager, []);

        expect(manager.OpenScope().Get<Text>(Key.RPCSecret).Value).not.toBe('Connection#Secret');
        expect(storage.SavePersistent).toHaveBeenCalled();
    });
});

describe('Global media directory', () => {
    it('Should use app-owned storage for new Electron profiles', async () => {
        const downloads = { name: 'downloads' } as FileSystemDirectoryHandle;
        const getDirectoryHandle = vi.fn().mockResolvedValue(downloads);
        vi.stubGlobal('ipcRenderer', {});
        vi.stubGlobal('navigator', {
            storage: {
                getDirectory: vi.fn().mockResolvedValue({ getDirectoryHandle }),
            },
        });
        const storage = {
            LoadPersistent: vi.fn().mockResolvedValue(undefined),
            SavePersistent: vi.fn(),
        } as unknown as StorageController;
        const manager = new SettingsManager(storage);

        await Initialize(manager, []);

        expect(manager.OpenScope().Get<Directory>(Key.MediaDirectory).Value).toBe(downloads);
        expect(getDirectoryHandle).toHaveBeenCalledWith('downloads', { create: true });
    });
});
