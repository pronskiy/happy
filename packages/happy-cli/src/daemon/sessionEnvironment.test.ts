import { describe, expect, it } from 'vitest';
import {
    buildSessionChildEnvironment,
    validateRequestedSessionEnvironment,
    sanitizeSessionEnvironment,
    SESSION_SCOPED_ENV_KEYS,
    sessionEnvironmentKeysToUnset,
    wrapTmuxCommandWithSessionEnvironmentSanitizer,
} from './sessionEnvironment';

function contaminatedEnvironment(): NodeJS.ProcessEnv {
    return {
        KEEP_ME: 'safe',
        ...Object.fromEntries(SESSION_SCOPED_ENV_KEYS.map((key) => [key, `stale-${key}`])),
    };
}

describe('sessionEnvironment', () => {
    it('removes all inherited session-scoped values without mutating the source', () => {
        const source = contaminatedEnvironment();

        const sanitized = sanitizeSessionEnvironment(source);

        expect(sanitized).toMatchObject({ KEEP_ME: 'safe' });
        for (const key of SESSION_SCOPED_ENV_KEYS) {
            expect(sanitized).not.toHaveProperty(key);
            expect(source[key]).toBe(`stale-${key}`);
        }
    });

    it('keeps explicit fork values after removing stale ambient values', () => {
        const childEnv = buildSessionChildEnvironment(contaminatedEnvironment(), {
            HAPPY_FORKED_FROM_SESSION_ID: 'new-parent-session',
            HAPPY_FORKED_FROM_MESSAGE_ID: 'new-parent-message',
            HAPPY_FORK_CODEX_THREAD_ID: 'new-codex-thread',
            HAPPY_SIDE_CHAT: '1',
        });

        expect(childEnv).toMatchObject({
            KEEP_ME: 'safe',
            HAPPY_FORKED_FROM_SESSION_ID: 'new-parent-session',
            HAPPY_FORKED_FROM_MESSAGE_ID: 'new-parent-message',
            HAPPY_FORK_CODEX_THREAD_ID: 'new-codex-thread',
            HAPPY_SIDE_CHAT: '1',
        });
        expect(childEnv).not.toHaveProperty('CODEX_THREAD_ID');
        expect(childEnv).not.toHaveProperty('HAPPY_RECONNECT_SESSION_ID');
    });

    it('replaces stale reconnect state with the values for the resumed session', () => {
        const childEnv = buildSessionChildEnvironment(contaminatedEnvironment(), {
            HAPPY_RECONNECT_SESSION_ID: 'new-session',
            HAPPY_RECONNECT_ENCRYPTION_KEY: 'new-key',
            HAPPY_RECONNECT_ENCRYPTION_VARIANT: 'dataKey',
            HAPPY_RECONNECT_SEQ: '12',
            HAPPY_RECONNECT_METADATA_VERSION: '13',
            HAPPY_RECONNECT_AGENT_STATE_VERSION: '14',
        });

        expect(childEnv).toMatchObject({
            HAPPY_RECONNECT_SESSION_ID: 'new-session',
            HAPPY_RECONNECT_ENCRYPTION_KEY: 'new-key',
            HAPPY_RECONNECT_ENCRYPTION_VARIANT: 'dataKey',
            HAPPY_RECONNECT_SEQ: '12',
            HAPPY_RECONNECT_METADATA_VERSION: '13',
            HAPPY_RECONNECT_AGENT_STATE_VERSION: '14',
        });
        expect(childEnv).not.toHaveProperty('HAPPY_FORK_CODEX_THREAD_ID');
        expect(childEnv).not.toHaveProperty('CODEX_THREAD_ID');
    });

    it('unsets inherited tmux values without removing an explicit fork value', () => {
        const explicitEnv = { HAPPY_FORK_CODEX_THREAD_ID: 'new-codex-thread' };
        const keysToUnset = sessionEnvironmentKeysToUnset(explicitEnv);
        const command = wrapTmuxCommandWithSessionEnvironmentSanitizer('node happy.mjs codex', explicitEnv);

        expect(keysToUnset).not.toContain('HAPPY_FORK_CODEX_THREAD_ID');
        expect(keysToUnset).toContain('CODEX_THREAD_ID');
        expect(command).toMatch(/^unset /);
        expect(command).toContain('CODEX_THREAD_ID');
        expect(command).not.toContain('unset HAPPY_FORK_CODEX_THREAD_ID');
        expect(command).toMatch(/node happy\.mjs codex$/);
    });
});

describe('untrusted session environment overrides', () => {
    it.each(['NODE_OPTIONS', 'NODE_PATH', 'PATH', 'Path', 'HOME', 'CODEX_HOME', 'CLAUDE_CONFIG_DIR', 'LD_PRELOAD', 'DYLD_INSERT_LIBRARIES', 'HAPPY_SERVER_URL', 'DANGEROUSLY_LOG_TO_SERVER_FOR_AI_AUTO_DEBUGGING', '__proto__'])(
        'rejects %s', key => {
            expect(() => validateRequestedSessionEnvironment({ [key]: 'injected' })).toThrow('not allowed');
        },
    );
    it('preserves allowed provider configuration and literal values', () => {
        const input = { ANTHROPIC_AUTH_TOKEN: '${MY_TOKEN}', OPENAI_BASE_URL: 'https://provider.example', TMUX_SESSION_NAME: 'work' };
        expect(validateRequestedSessionEnvironment(input)).toEqual(input);
        expect(validateRequestedSessionEnvironment(input)).not.toBe(input);
        expect(validateRequestedSessionEnvironment(undefined)).toEqual({});
    });
    it.each([null, [], 'bad', { OPENAI_API_KEY: 123 }, { OPENAI_API_KEY: 'bad\0value' }])('rejects malformed values', input => {
        expect(() => validateRequestedSessionEnvironment(input)).toThrow();
    });
});
