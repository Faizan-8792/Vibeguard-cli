export const ErrorCodes = {
    CONFIG_INVALID: 'CONFIG_INVALID',
    CONFIG_NOT_FOUND: 'CONFIG_NOT_FOUND',
    ALREADY_EXISTS: 'ALREADY_EXISTS',
    PARSE_ERROR: 'PARSE_ERROR',
    GIT_UNAVAILABLE: 'GIT_UNAVAILABLE',
    DIRTY_WORKTREE: 'DIRTY_WORKTREE',
    LIMIT_EXCEEDED: 'LIMIT_EXCEEDED',
    RESTORE_CONFLICT: 'RESTORE_CONFLICT',
    UNKNOWN_COMMAND: 'UNKNOWN_COMMAND',
    UNKNOWN_OPTION: 'UNKNOWN_OPTION',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
};
export class VibeguardError extends Error {
    code;
    details;
    constructor(code, message, details) {
        super(message);
        this.name = 'VibeguardError';
        this.code = code;
        this.details = details;
    }
}
export function getExitCode(code) {
    switch (code) {
        case ErrorCodes.UNKNOWN_COMMAND:
        case ErrorCodes.UNKNOWN_OPTION:
            return 2;
        case ErrorCodes.INTERNAL_ERROR:
            return 3;
        default:
            return 1;
    }
}
export const SCHEMA_VERSION = '1.0.0';
export function formatErrorJson(error) {
    return {
        schemaVersion: SCHEMA_VERSION,
        error: {
            code: error.code,
            message: error.message,
            ...(error.details ? { details: error.details } : {}),
        },
    };
}
export function formatErrorTerminal(error) {
    return `Error [${error.code}]: ${error.message}`;
}
//# sourceMappingURL=errors.js.map