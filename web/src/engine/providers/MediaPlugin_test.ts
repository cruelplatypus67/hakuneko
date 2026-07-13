import { describe, expect, it } from 'vitest';
import { MediaContainer, type MediaItem } from './MediaPlugin';

class TestContainer extends MediaContainer<MediaItem> {
    public updates = 0;
    public release: () => void;

    protected PerformUpdate(): Promise<MediaItem[]> {
        this.updates++;
        return new Promise(resolve => this.release = () => resolve([]));
    }
}

describe('MediaContainer', () => {
    it('Should ignore overlapping updates', async () => {
        const testee = new TestContainer('test', 'Test');

        const first = testee.Update();
        const second = testee.Update();
        await Promise.resolve();

        expect(testee.IsUpdating.Value).toBe(true);
        expect(testee.updates).toBe(1);
        testee.release();
        await Promise.all([first, second]);
        expect(testee.IsUpdating.Value).toBe(false);
    });
});
