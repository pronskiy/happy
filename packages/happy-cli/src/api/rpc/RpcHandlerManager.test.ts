import { describe, expect, it, vi } from 'vitest';
import { RpcHandlerManager } from './RpcHandlerManager';
import { decodeBase64, decrypt, encodeBase64, encrypt } from '../encryption';

describe.each(['legacy', 'dataKey'] as const)('RPC authentication (%s)', variant => {
    const key = new Uint8Array(32).fill(7);
    function setup() {
        const manager = new RpcHandlerManager({ scopePrefix: 'machine', encryptionKey: key, encryptionVariant: variant, logger: vi.fn() });
        const handler = vi.fn(async () => ({ success: true }));
        manager.registerHandler('stop-daemon', handler);
        return { manager, handler };
    }
    it('never invokes a parameterless handler after authentication failure', async () => {
        const { manager, handler } = setup();
        const ciphertext = encrypt(key, variant, {});
        ciphertext[ciphertext.length - 1] ^= 1;
        const response = await manager.handleRequest({ method: 'machine:stop-daemon', params: encodeBase64(ciphertext) });
        expect(handler).not.toHaveBeenCalled();
        expect(decrypt(key, variant, decodeBase64(response))).toHaveProperty('error');
    });
    it('rejects malformed and null payloads', async () => {
        const { manager, handler } = setup();
        for (const params of ['', 'garbage', encodeBase64(encrypt(key, variant, null))]) {
            await manager.handleRequest({ method: 'machine:stop-daemon', params });
        }
        expect(handler).not.toHaveBeenCalled();
    });
    it('preserves valid requests using the existing mobile format', async () => {
        const { manager, handler } = setup();
        const response = await manager.handleRequest({ method: 'machine:stop-daemon', params: encodeBase64(encrypt(key, variant, {})) });
        expect(handler).toHaveBeenCalledOnce();
        expect(handler).toHaveBeenCalledWith({});
        expect(decrypt(key, variant, decodeBase64(response))).toEqual({ success: true });
    });
});
