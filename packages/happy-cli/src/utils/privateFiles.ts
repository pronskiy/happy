import { appendFileSync, closeSync, constants, fchmodSync, fstatSync, ftruncateSync, lstatSync, mkdirSync, openSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';

/** Happy-owned directories must not expose credentials or local control tokens. */
export function ensurePrivateDirectory(directory: string): void {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const info = lstatSync(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) {
        throw new Error(`Expected a private directory: ${directory}`);
    }
    if (process.platform !== 'win32') {
        if (info.uid !== process.getuid?.()) throw new Error(`Directory is owned by another user: ${directory}`);
        chmodSync(directory, 0o700);
    }
}

function openPrivateFile(file: string, flags: number): number {
    const fd = openSync(file, flags | (constants.O_NOFOLLOW ?? 0), 0o600);
    try {
        const info = fstatSync(fd);
        if (!info.isFile() || info.nlink !== 1) throw new Error(`Expected a private regular file: ${file}`);
        if (process.platform !== 'win32') {
            if (info.uid !== process.getuid?.()) throw new Error(`File is owned by another user: ${file}`);
            fchmodSync(fd, 0o600);
        }
        return fd;
    } catch (error) {
        closeSync(fd);
        throw error;
    }
}

export function readPrivateFileSync(file: string): string {
    const fd = openPrivateFile(file, constants.O_RDONLY);
    try {
        return readFileSync(fd, 'utf8');
    } finally {
        closeSync(fd);
    }
}

export function writePrivateFileSync(file: string, content: string): void {
    // Validate the existing inode before truncation; never follow a symlink.
    const fd = openPrivateFile(file, constants.O_WRONLY | constants.O_CREAT);
    try {
        ftruncateSync(fd, 0);
        writeFileSync(fd, content, 'utf8');
    } finally {
        closeSync(fd);
    }
}

export function appendPrivateFileSync(file: string, content: string): void {
    const fd = openPrivateFile(file, constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND);
    try {
        appendFileSync(fd, content, 'utf8');
    } finally {
        closeSync(fd);
    }
}
