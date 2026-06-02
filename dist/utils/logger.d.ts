export interface LoggerOptions {
    jsonMode: boolean;
    quiet: boolean;
    verbose: boolean;
    command: string;
}
export interface Logger {
    error(msg: string): void;
    warn(msg: string): void;
    info(msg: string): void;
    debug(msg: string): void;
    startSpinner(msg: string): void;
    stopSpinner(success?: boolean): void;
    progress(current: number, total: number, msg: string): void;
}
export declare class LoggerImpl implements Logger {
    private readonly options;
    private readonly chalk;
    private spinner;
    private readonly isTTY;
    private readonly isCI;
    private readonly useColor;
    constructor(options: LoggerOptions);
    error(msg: string): void;
    warn(msg: string): void;
    info(msg: string): void;
    debug(msg: string): void;
    startSpinner(msg: string): void;
    stopSpinner(success?: boolean): void;
    progress(current: number, total: number, msg: string): void;
    private canUseSpinner;
    private format;
}
export declare function createLogger(options?: Partial<LoggerOptions>): Logger;
