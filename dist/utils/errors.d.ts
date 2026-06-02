export declare const ErrorCodes: {
    readonly CONFIG_INVALID: "CONFIG_INVALID";
    readonly CONFIG_NOT_FOUND: "CONFIG_NOT_FOUND";
    readonly ALREADY_EXISTS: "ALREADY_EXISTS";
    readonly PARSE_ERROR: "PARSE_ERROR";
    readonly GIT_UNAVAILABLE: "GIT_UNAVAILABLE";
    readonly DIRTY_WORKTREE: "DIRTY_WORKTREE";
    readonly LIMIT_EXCEEDED: "LIMIT_EXCEEDED";
    readonly RESTORE_CONFLICT: "RESTORE_CONFLICT";
    readonly UNKNOWN_COMMAND: "UNKNOWN_COMMAND";
    readonly UNKNOWN_OPTION: "UNKNOWN_OPTION";
    readonly INTERNAL_ERROR: "INTERNAL_ERROR";
};
export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
export declare class VibeguardError extends Error {
    readonly code: ErrorCode;
    readonly details?: Record<string, unknown>;
    constructor(code: ErrorCode, message: string, details?: Record<string, unknown>);
}
export declare function getExitCode(code: ErrorCode): number;
export declare const SCHEMA_VERSION = "1.0.0";
export interface ErrorJsonOutput {
    schemaVersion: string;
    error: {
        code: ErrorCode;
        message: string;
        details?: Record<string, unknown>;
    };
}
export declare function formatErrorJson(error: VibeguardError): ErrorJsonOutput;
export declare function formatErrorTerminal(error: VibeguardError): string;
