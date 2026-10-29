import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolve, join, parse } from 'path';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { validatePath } from './pathSecurity';

describe('validatePath', () => {
    let workingDir: string;
    beforeEach(() => { workingDir = realpathSync(mkdtempSync(join(tmpdir(), 'happy-path-basic-'))); });
    afterEach(() => rmSync(workingDir, { recursive: true, force: true }));

    it('should allow paths within working directory', () => {
        expect(validatePath(join(workingDir, 'file.txt'), workingDir)).toEqual({
            valid: true,
            resolvedPath: join(workingDir, 'file.txt'),
        });
        expect(validatePath('file.txt', workingDir)).toEqual({
            valid: true,
            resolvedPath: join(workingDir, 'file.txt'),
        });
        expect(validatePath('./src/file.txt', workingDir)).toEqual({
            valid: true,
            resolvedPath: join(workingDir, 'src/file.txt'),
        });
    });

    it('should reject paths outside working directory', () => {
        const result = validatePath(resolve('/etc/passwd'), workingDir);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('outside the working directory');
    });

    it('should prevent path traversal attacks', () => {
        const result = validatePath('../../.ssh/id_rsa', workingDir);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('outside the working directory');
    });

    it('should allow the working directory itself', () => {
        expect(validatePath('.', workingDir)).toEqual({
            valid: true,
            resolvedPath: workingDir,
        });
        expect(validatePath(workingDir, workingDir)).toEqual({
            valid: true,
            resolvedPath: workingDir,
        });
    });
});

describe.skipIf(process.platform === 'win32')('symlink containment', () => {
    let temp: string;
    let root: string;
    let outside: string;
    beforeEach(() => {
        temp = realpathSync(mkdtempSync(join(tmpdir(), 'happy-path-test-')));
        root = join(temp, 'workspace');
        outside = join(temp, 'outside');
        mkdirSync(root);
        mkdirSync(outside);
        writeFileSync(join(outside, 'secret'), 'secret');
    });
    afterEach(() => rmSync(temp, { recursive: true, force: true }));
    it('rejects existing files and new destinations beneath escaping links', () => {
        symlinkSync(outside, join(root, 'escape'));
        symlinkSync(join(outside, 'secret'), join(root, 'filelink'));
        for (const path of ['escape/secret', 'escape/new', 'escape/new/child', 'filelink']) {
            expect(validatePath(path, root).valid).toBe(false);
        }
    });
    it('rejects dangling links', () => {
        symlinkSync(join(outside, 'missing'), join(root, 'dangling'));
        expect(validatePath('dangling', root).valid).toBe(false);
        expect(validatePath('dangling/new', root).valid).toBe(false);
    });
    it('allows links inside the workspace and returns the canonical destination', () => {
        mkdirSync(join(root, 'real'));
        symlinkSync(join(root, 'real'), join(root, 'alias'));
        expect(validatePath('alias/new', root)).toEqual({ valid: true, resolvedPath: join(root, 'real/new') });
        symlinkSync(root, join(temp, 'workspace-alias'));
        expect(validatePath('new', join(temp, 'workspace-alias'))).toEqual({ valid: true, resolvedPath: join(root, 'new') });
    });
    it('supports filesystem-root working directories', () => {
        expect(validatePath(root, parse(root).root)).toEqual({ valid: true, resolvedPath: root });
    });
});
