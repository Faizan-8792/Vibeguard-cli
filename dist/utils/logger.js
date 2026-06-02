import chalk, { Chalk } from 'chalk';
import ora from 'ora';
export class LoggerImpl {
    options;
    chalk;
    spinner = null;
    isTTY;
    isCI;
    useColor;
    constructor(options) {
        this.options = options;
        this.isTTY = Boolean(process.stdout.isTTY);
        this.isCI = Boolean(process.env['CI']);
        this.useColor = this.isTTY && !process.env['NO_COLOR'];
        this.chalk = this.useColor ? chalk : new Chalk({ level: 0 });
    }
    error(msg) {
        const formatted = this.format('error', msg);
        process.stderr.write(formatted + '\n');
    }
    warn(msg) {
        if (this.options.jsonMode) {
            // In JSON mode, warn+ goes to stderr
            const formatted = this.format('warn', msg);
            process.stderr.write(formatted + '\n');
            return;
        }
        if (this.options.quiet)
            return;
        const formatted = this.format('warn', msg);
        process.stderr.write(formatted + '\n');
    }
    info(msg) {
        if (this.options.jsonMode)
            return;
        if (this.options.quiet)
            return;
        const formatted = this.format('info', msg);
        process.stdout.write(formatted + '\n');
    }
    debug(msg) {
        if (this.options.jsonMode)
            return;
        if (!this.options.verbose)
            return;
        const formatted = this.format('debug', msg);
        process.stdout.write(formatted + '\n');
    }
    startSpinner(msg) {
        if (!this.canUseSpinner())
            return;
        this.spinner = ora({ text: msg, color: 'cyan' }).start();
    }
    stopSpinner(success = true) {
        if (!this.spinner)
            return;
        if (success) {
            this.spinner.succeed();
        }
        else {
            this.spinner.fail();
        }
        this.spinner = null;
    }
    progress(current, total, msg) {
        if (this.options.jsonMode)
            return;
        if (this.options.quiet)
            return;
        const percent = Math.round((current / total) * 100);
        const progressMsg = `[${current}/${total}] ${percent}% ${msg}`;
        if (this.spinner) {
            this.spinner.text = progressMsg;
        }
        else {
            this.info(progressMsg);
        }
    }
    canUseSpinner() {
        return this.isTTY && !this.options.jsonMode && !this.isCI;
    }
    format(level, msg) {
        if (this.options.jsonMode) {
            // In JSON mode, just output the raw message (only error/warn reach here)
            return msg;
        }
        const prefix = this.options.command ? `[${this.options.command}] ` : '';
        switch (level) {
            case 'error':
                return `${prefix}${this.chalk.red('error')} ${msg}`;
            case 'warn':
                return `${prefix}${this.chalk.yellow('warn')} ${msg}`;
            case 'info':
                return `${prefix}${this.chalk.blue('info')} ${msg}`;
            case 'debug':
                return `${prefix}${this.chalk.gray('debug')} ${msg}`;
        }
    }
}
export function createLogger(options = {}) {
    return new LoggerImpl({
        jsonMode: options.jsonMode ?? false,
        quiet: options.quiet ?? false,
        verbose: options.verbose ?? false,
        command: options.command ?? '',
    });
}
//# sourceMappingURL=logger.js.map