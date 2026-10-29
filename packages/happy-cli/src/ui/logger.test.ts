import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Logger } from './logger';
import { redactSecrets } from './redactSecrets';

describe('logging privacy', () => {
    let directory: string;
    beforeEach(() => {
        directory = mkdtempSync(join(tmpdir(), 'happy-logger-test-'));
        vi.stubEnv('DEBUG', '');
        vi.stubEnv('DANGEROUSLY_LOG_TO_SERVER_FOR_AI_AUTO_DEBUGGING', 'false');
    });
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        rmSync(directory, { recursive: true, force: true });
    });
    it('does not inspect or write debug payloads by default', () => {
        const file = join(directory, 'log');
        const logger = new Logger(file);
        const getter = vi.fn(() => 'secret');
        logger.debugLargeJson('request', { get token() { return getter(); } });
        logger.debug('private session text');
        expect(getter).not.toHaveBeenCalled();
        expect(existsSync(file)).toBe(false);
    });
    it('redacts secrets before truncation, local writing and remote sending', () => {
        vi.stubEnv('DEBUG', '1');
        vi.stubEnv('DANGEROUSLY_LOG_TO_SERVER_FOR_AI_AUTO_DEBUGGING', 'true');
        vi.stubEnv('HAPPY_SERVER_URL', 'https://logs.example');
        const fetch = vi.fn(async () => ({ ok: true }));
        vi.stubGlobal('fetch', fetch);
        vi.spyOn(console, 'log').mockImplementation(() => {});
        const file = join(directory, 'log');
        const logger = new Logger(file);
        logger.debugLargeJson('request', { token: 'super-secret-token', environmentVariables: { VALUE: 'private-env' }, encryption: { machineKey: 'private-machine-key', dataKey: 'private-data-key' }, ok: 'kept' });
        logger.debug('request failed', Object.assign(new Error('Bearer secret-bearer'), { config: { headers: { Authorization: 'Bearer auth-value' }, data: '{"secret":"private-body"}' } }));
        const output = readFileSync(file, 'utf8') + JSON.stringify(fetch.mock.calls);
        for (const secret of ['super-secret-token', 'private-env', 'secret-bearer', 'auth-value', 'private-body', 'private-machine-key', 'private-data-key']) expect(output).not.toContain(secret);
        expect(output).toContain('[REDACTED]');
        expect(output).toContain('kept');
        expect(fetch).toHaveBeenCalled();
    });
    it('does not enable remote logging for a false flag', () => {
        vi.stubEnv('DEBUG', '1');
        vi.stubEnv('HAPPY_SERVER_URL', 'https://logs.example');
        const fetch = vi.fn();
        vi.stubGlobal('fetch', fetch);
        new Logger(join(directory, 'log')).debug('test');
        expect(fetch).not.toHaveBeenCalled();
    });
    it('handles circular structures and serialized credentials', () => {
        const value: Record<string, unknown> = { accessToken: 'secret', encryptionKey: new Uint8Array([1, 2]), normal: 'okay' };
        value.self = value;
        expect(redactSecrets(value)).toEqual({ accessToken: '[REDACTED]', encryptionKey: '[REDACTED]', normal: 'okay', self: '[Circular]' });
        expect(redactSecrets('prefix {"token":"hidden"}')).not.toContain('hidden');
        expect(redactSecrets('OPENAI_API_KEY=hidden')).not.toContain('hidden');
    });
});
