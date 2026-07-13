import { describe, expect, it, vi } from 'vitest';
import { SettingsManager } from '../SettingsManager';
import { Store, type StorageController } from '../StorageController';
import { Chapter, DecoratableMangaScraper, MangaPlugin, type Manga } from './MangaPlugin';

class TestScraper extends DecoratableMangaScraper {
    constructor() {
        super('test', 'Test', 'https://example.com');
    }

    public override Initialize(): Promise<void> {
        return Promise.resolve();
    }

    public override FetchChapters(manga: Manga): Promise<Chapter[]> {
        return Promise.resolve([new Chapter(this, manga, 'new-chapter', 'New Chapter')]);
    }
}

describe('MangaPlugin cache', () => {
    it('Should restore manga and chapter lists and save refreshed chapters', async () => {
        const storage = {
            LoadPersistent: vi.fn((store: Store, key: string) => Promise.resolve(store === Store.MediaLists ? {
                test: [{ id: 'cached-manga', title: 'Cached Manga' }],
                'test/cached-manga': [{ id: 'cached-chapter', title: 'Cached Chapter' }],
            }[key] : undefined)),
            SavePersistent: vi.fn(),
        } as unknown as StorageController;
        const plugin = new MangaPlugin(storage, new SettingsManager(storage), new TestScraper());

        await plugin.Ready;
        expect(plugin.Entries.Value.map(entry => entry.Title)).toEqual(['Cached Manga']);

        const manga = plugin.Entries.Value[0];
        await manga.Ready;
        expect(manga.Entries.Value.map(entry => entry.Title)).toEqual(['Cached Chapter']);

        await manga.Update();
        expect(manga.Entries.Value.map(entry => entry.Title)).toEqual(['New Chapter']);
        expect(storage.SavePersistent).toHaveBeenCalledWith(
            [{ id: 'new-chapter', title: 'New Chapter' }],
            Store.MediaLists,
            'test/cached-manga',
        );
    });
});
