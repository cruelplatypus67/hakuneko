import { describe, expect, it, vi } from 'vitest';
import { Initialize, Key } from './SettingsGlobal';
import { SettingsManager, Text } from './SettingsManager';
import type { StorageController } from './StorageController';

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
