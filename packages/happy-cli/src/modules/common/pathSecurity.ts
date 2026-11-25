import { resolve, sep, dirname, basename, relative, isAbsolute } from 'path';
import { lstatSync, realpathSync } from 'node:fs';

// Resolve existing ancestors as well as the final component. A nonexistent
// destination is allowed, but dangling links and inaccessible ancestors fail.
function canonicalPath(path: string): string {
    try {
        lstatSync(path);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || dirname(path) === path) throw error;
        return resolve(canonicalPath(dirname(path)), basename(path));
    }
    return realpathSync(path);
}

function isWithin(path: string, directory: string): boolean {
    const child = relative(directory, path);
    return child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child);
}

export interface PathValidationResult {
    valid: boolean;
    resolvedPath?: string;
    error?: string;
}

/**
 * Validates that a path is within the allowed working directory
 * @param targetPath - The path to validate (can be relative or absolute)
 * @param workingDirectory - The session's working directory (must be absolute)
 * @returns Validation result
 */
export function validatePath(targetPath: string, workingDirectory: string): PathValidationResult {
    // Resolve both paths to absolute paths to handle path traversal attempts
    const resolvedTarget = resolve(workingDirectory, targetPath);
    const resolvedWorkingDir = resolve(workingDirectory);

    if (!isWithin(resolvedTarget, resolvedWorkingDir)) {
        return {
            valid: false,
            resolvedPath: resolvedTarget,
            error: `Access denied: Path '${targetPath}' is outside the working directory`
        };
    }

    try {
        const canonicalRoot = canonicalPath(resolvedWorkingDir);
        const canonicalTarget = canonicalPath(resolvedTarget);
        if (!isWithin(canonicalTarget, canonicalRoot)) {
            return { valid: false, error: `Access denied: Path '${targetPath}' is outside the working directory` };
        }
        return { valid: true, resolvedPath: canonicalTarget };
    } catch {
        return { valid: false, error: `Access denied: Cannot safely resolve path '${targetPath}'` };
    }
}
