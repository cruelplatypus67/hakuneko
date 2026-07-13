import { describe, expect, it, vi } from 'vitest';
import { FetchProvider } from './FetchProviderCommon';

class TestFetchProvider extends FetchProvider {

    public readonly ChallengeWindow = vi.fn(async (_request: Request, _show: boolean) => undefined);

    public override async FetchWindowPreloadScript<T extends void | JSONElement>(request: Request, _preload: string, _script: string, _delay: number, _timeout: number, show: boolean): Promise<T> {
        await this.ChallengeWindow(request, show);
        return undefined as T;
    }

    public async Fetch(_request: Request): Promise<Response> {
        throw new Error('Not implemented');
    }

    public Validate(response: Response, retry: () => Promise<Response>): Promise<Response> {
        return this.ValidateResponse(response, retry);
    }
}

describe('FetchProvider', () => {

    it('Should show a Cloudflare challenge and retry the request once', async () => {
        const testee = new TestFetchProvider();
        const challenge = new Response('', {
            status: 403,
            headers: { 'CF-Mitigated': 'challenge' },
        });
        Object.defineProperty(challenge, 'url', { value: 'https://example.com/challenge' });
        const recovered = new Response('ok');
        const retry = vi.fn(async () => recovered);

        await expect(testee.Validate(challenge, retry)).resolves.toBe(recovered);
        expect(testee.ChallengeWindow).toHaveBeenCalledOnce();
        expect(testee.ChallengeWindow.mock.calls[0]![0].url).toBe(challenge.url);
        expect(testee.ChallengeWindow.mock.calls[0]![1]).toBe(true);
        expect(retry).toHaveBeenCalledOnce();
    });
});
