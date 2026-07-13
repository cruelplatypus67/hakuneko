import { describe, expect, it } from 'vitest';
import type { MangaPlugin, MangaScraper } from '../../providers/MangaPlugin';
import { PatternLinkGenerator } from './Common';

describe('PatternLinkGenerator', () => {

    it('Should stop after the requested number of links', () => {
        const scraper = { URI: new URL('https://example.com') } as MangaScraper;
        const provider = { Identifier: 'provider' } as MangaPlugin;
        const generate = PatternLinkGenerator<MangaPlugin>('/search?offset={page}', 0, 32, 3);

        const actual = Array.from(generate.call(scraper, provider), url => url.href);

        expect(actual).toStrictEqual([
            'https://example.com/search?offset=0',
            'https://example.com/search?offset=32',
            'https://example.com/search?offset=64',
        ]);
    });
});
