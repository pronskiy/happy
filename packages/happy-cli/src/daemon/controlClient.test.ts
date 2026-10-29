import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DaemonLocallyPersistedState } from '@/persistence';

const fixture = vi.hoisted(() => ({ state: null as DaemonLocallyPersistedState | null }));
vi.mock('@/persistence', () => ({
    readDaemonState: vi.fn(async () => fixture.state),
    clearDaemonState: vi.fn(),
}));
import { checkIfDaemonRunningAndCleanupStaleState, listDaemonSessions, spawnDaemonSession, stopDaemonSession } from './controlClient';

describe('authenticated daemon client', () => {
    beforeEach(() => {
        fixture.state = { pid: process.pid, httpPort: 12345, controlToken: 'ab'.repeat(32), startTime: '', startedWithCliVersion: 'test' };
    });
    afterEach(() => vi.unstubAllGlobals());
    it('sends the private token on control and health requests and refuses redirects', async () => {
        const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ children: [], success: true }) }));
        vi.stubGlobal('fetch', fetch);
        await listDaemonSessions();
        await spawnDaemonSession('/project');
        await stopDaemonSession('session');
        expect(await checkIfDaemonRunningAndCleanupStaleState()).toBe(true);
        expect(fetch).toHaveBeenCalledTimes(4);
        for (const call of fetch.mock.calls as unknown as [string, RequestInit][]) {
            expect(call[1].headers).toHaveProperty('Authorization', `Bearer ${fixture.state!.controlToken}`);
            expect(call[1].redirect).toBe('error');
        }
    });
    it('never sends control requests to a legacy unauthenticated daemon', async () => {
        delete fixture.state!.controlToken;
        const fetch = vi.fn();
        vi.stubGlobal('fetch', fetch);
        const response = await spawnDaemonSession('/project');
        expect(response.error).toContain('Restart');
        expect(fetch).not.toHaveBeenCalled();
    });
    it('does not treat HTTP authentication failures as a healthy daemon', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401 })));
        expect(await checkIfDaemonRunningAndCleanupStaleState()).toBe(false);
    });
});
