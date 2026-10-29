import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const fixture = vi.hoisted(() => ({ directory: '' }));
vi.mock('@/configuration', () => ({ configuration: {
    get happyHomeDir() { return fixture.directory; },
    get privateKeyFile() { return `${fixture.directory}/access.key`; },
    get settingsFile() { return `${fixture.directory}/settings.json`; },
    get daemonStateFile() { return `${fixture.directory}/daemon.state.json`; },
} }));
vi.mock('@/ui/logger', () => ({ logger: { debug: vi.fn(), warn: vi.fn() } }));
vi.mock('@/daemon/controlClient', () => ({ stopDaemon: vi.fn(), checkIfDaemonRunningAndCleanupStaleState: vi.fn() }));
vi.mock('@/ui/auth', () => ({ authAndSetupMachineIfNeeded: vi.fn() }));
vi.mock('node:readline', () => ({ createInterface: () => ({ question: (_prompt: string, callback: (answer: string) => void) => callback('yes'), close: vi.fn() }) }));

import { readCredentials, readDaemonState, readSettings, writeCredentialsDataKey, writeCredentialsLegacy, writeDaemonState, writeSettings } from './persistence';
import { handleAuthCommand } from './commands/auth';

describe('credential persistence and logout', () => {
    beforeEach(() => {
        fixture.directory = mkdtempSync(join(tmpdir(), 'happy-persistence-test-'));
        vi.spyOn(console, 'log').mockImplementation(() => {});
    });
    afterEach(() => { vi.restoreAllMocks(); rmSync(fixture.directory, { recursive: true, force: true }); });
    it('round trips both credential formats with private permissions', async () => {
        const key = new Uint8Array(32).fill(1);
        await writeCredentialsLegacy({ secret: key, token: 'legacy-token' });
        expect(await readCredentials()).toMatchObject({ token: 'legacy-token', encryption: { type: 'legacy', secret: key } });
        await writeCredentialsDataKey({ publicKey: key, machineKey: key, token: 'new-token' });
        expect(await readCredentials()).toMatchObject({ token: 'new-token', encryption: { type: 'dataKey', machineKey: key } });
        if (process.platform !== 'win32') expect(statSync(join(fixture.directory, 'access.key')).mode & 0o777).toBe(0o600);
    });
    it('preserves the local control token in private state across heartbeat writes', async () => {
        const state = { pid: process.pid, httpPort: 12345, startTime: 'now', startedWithCliVersion: 'test', controlToken: 'ab'.repeat(32) };
        writeDaemonState(state);
        writeDaemonState({ ...state, lastHeartbeat: 'later' });
        expect(await readDaemonState()).toEqual({ ...state, lastHeartbeat: 'later' });
        if (process.platform !== 'win32') expect(statSync(join(fixture.directory, 'daemon.state.json')).mode & 0o777).toBe(0o600);
    });
    it('logs out without deleting unrelated files in a custom HAPPY_HOME_DIR', async () => {
        await writeCredentialsLegacy({ secret: new Uint8Array(32), token: 'token' });
        await writeSettings({ schemaVersion: 2, onboardingCompleted: true, machineId: 'machine', serverUrl: 'https://server.example' });
        writeFileSync(join(fixture.directory, 'unrelated.txt'), 'keep');
        await handleAuthCommand(['logout']);
        expect(existsSync(join(fixture.directory, 'access.key'))).toBe(false);
        expect((await readSettings()).machineId).toBeUndefined();
        expect((await readSettings()).serverUrl).toBe('https://server.example');
        expect(readFileSync(join(fixture.directory, 'unrelated.txt'), 'utf8')).toBe('keep');
    });
});
