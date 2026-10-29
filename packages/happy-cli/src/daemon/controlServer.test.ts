import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDaemonControlApp } from './controlServer';

describe('local daemon authentication', () => {
    const controlToken = 'ab'.repeat(32);
    const callbacks = {
        getChildren: vi.fn(() => []),
        stopSession: vi.fn(() => true),
        spawnSession: vi.fn(async () => ({ type: 'success' as const, sessionId: 'new' })),
        requestShutdown: vi.fn(),
        onHappySessionWebhook: vi.fn(),
    };
    const apps: ReturnType<typeof createDaemonControlApp>[] = [];
    function app() {
        const instance = createDaemonControlApp(callbacks, controlToken);
        apps.push(instance);
        return instance;
    }
    afterEach(async () => {
        await Promise.all(apps.splice(0).map(instance => instance.close()));
        vi.clearAllMocks();
    });

    it.each(['/list', '/spawn-session', '/stop-session', '/session-started', '/stop'])(
        'rejects unauthenticated %s before processing its body', async url => {
            const response = await app().inject({ method: 'POST', url, headers: { host: '127.0.0.1:1234' }, payload: {} });
            expect(response.statusCode).toBe(401);
            Object.values(callbacks).forEach(callback => expect(callback).not.toHaveBeenCalled());
        },
    );
    it.each([
        { authorization: `Bearer ${'cd'.repeat(32)}` },
        { authorization: 'Bearer short' },
    ])('rejects the wrong token', async headers => {
        expect((await app().inject({ method: 'POST', url: '/list', headers: { host: '127.0.0.1', ...headers } })).statusCode).toBe(401);
        expect(callbacks.getChildren).not.toHaveBeenCalled();
    });
    it.each([
        { host: 'attacker.example' },
        { host: '127.0.0.1.attacker.example' },
        { host: '127.0.0.1', origin: 'https://attacker.example' },
        { host: '127.0.0.1', origin: 'null' },
    ])('rejects browser origins and unexpected hosts', async headers => {
        expect((await app().inject({ method: 'POST', url: '/list', headers: { authorization: `Bearer ${controlToken}`, ...headers } })).statusCode).toBe(403);
        expect(callbacks.getChildren).not.toHaveBeenCalled();
    });
    it('accepts authenticated CLI calls', async () => {
        const response = await app().inject({ method: 'POST', url: '/spawn-session', headers: { host: '127.0.0.1:1234', authorization: `Bearer ${controlToken}` }, payload: { directory: '/project', agent: 'claude' } });
        expect(response.statusCode).toBe(200);
        expect(response.json().sessionId).toBe('new');
        expect(callbacks.spawnSession).toHaveBeenCalledWith(expect.objectContaining({ directory: '/project', agent: 'claude' }));
    });
});
