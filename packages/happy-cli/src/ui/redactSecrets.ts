const sensitiveKey = /(?:token|secret|password|authorization|cookie|api.?key|private.?key|encryption.?key|machine.?key|data.?key|access.?key|environmentVariables|^env$)/i;

function redactText(text: string): string {
    // JSON is frequently passed to the logger as a string (including Axios data).
    try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === 'object') return JSON.stringify(redactSecrets(parsed));
    } catch { /* Ordinary log text. */ }
    return text
        .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 [REDACTED]')
        .replace(/(["']?[\w-]*(?:token|secret|password|api[_-]?key|private[_-]?key|encryption[_-]?key|machine[_-]?key|data[_-]?key|access[_-]?key|authorization|cookie)[\w-]*["']?\s*[:=]\s*)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;}]+)/gi, '$1[REDACTED]')
        .replace(/\bsk-[A-Za-z0-9_-]{16,}/g, '[REDACTED]');
}

/** Redact before formatting/truncation and before any local or remote output. */
export function redactSecrets(value: unknown, seen = new WeakSet<object>()): unknown {
    if (typeof value === 'string') return redactText(value);
    if (!value || typeof value !== 'object') return value;
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return '[binary]';
    if (Array.isArray(value)) return value.map(item => redactSecrets(item, seen));
    const result: Record<string, unknown> = {};
    if (value instanceof Error) {
        result.name = value.name;
        result.message = redactText(value.message);
        if (value.stack) result.stack = redactText(value.stack);
    }
    for (const [key, item] of Object.entries(value)) {
        Object.defineProperty(result, key, {
            value: sensitiveKey.test(key) ? '[REDACTED]' : redactSecrets(item, seen),
            enumerable: true,
        });
    }
    return result;
}
