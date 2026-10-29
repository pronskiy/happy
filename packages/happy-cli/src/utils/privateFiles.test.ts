import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chmodSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { appendPrivateFileSync, ensurePrivateDirectory, readPrivateFileSync, writePrivateFileSync } from './privateFiles';

describe('private files', () => {
    let directory: string;
    beforeEach(() => { directory = mkdtempSync(join(tmpdir(), 'happy-private-test-')); });
    afterEach(() => rmSync(directory, { recursive: true, force: true }));

    it.skipIf(process.platform === 'win32')('repairs existing permissions and creates owner-only files', () => {
        chmodSync(directory, 0o755);
        ensurePrivateDirectory(directory);
        const file = join(directory, 'credentials');
        writeFileSync(file, 'old', { mode: 0o644 });
        expect(readPrivateFileSync(file)).toBe('old');
        expect(statSync(file).mode & 0o777).toBe(0o600);
        writePrivateFileSync(file, 'new');
        appendPrivateFileSync(file, '!');
        expect(readFileSync(file, 'utf8')).toBe('new!');
        writePrivateFileSync(join(directory, 'new'), 'secret');
        expect(statSync(join(directory, 'new')).mode & 0o777).toBe(0o600);
        expect(statSync(directory).mode & 0o777).toBe(0o700);
    });
    it.skipIf(process.platform === 'win32')('rejects symlinks and hardlinks without modifying the target', () => {
        const target = join(directory, 'target');
        writeFileSync(target, 'keep');
        for (const [name, makeLink] of [['symlink', symlinkSync], ['hardlink', linkSync]] as const) {
            const link = join(directory, name);
            makeLink(target, link);
            expect(() => readPrivateFileSync(link)).toThrow();
            expect(() => writePrivateFileSync(link, 'overwrite')).toThrow();
            expect(() => appendPrivateFileSync(link, 'append')).toThrow();
            expect(readFileSync(target, 'utf8')).toBe('keep');
        }
        const dir = join(directory, 'dir');
        mkdirSync(dir);
        symlinkSync(dir, join(directory, 'dirlink'));
        expect(() => ensurePrivateDirectory(join(directory, 'dirlink'))).toThrow();
    });
});
