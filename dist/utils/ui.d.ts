import chalk from 'chalk';
export type BrandColor = 'success' | 'warning' | 'danger' | 'info' | 'muted';
declare const brand: {
    primary: import("chalk").ChalkInstance;
    secondary: import("chalk").ChalkInstance;
    success: import("chalk").ChalkInstance;
    warning: import("chalk").ChalkInstance;
    danger: import("chalk").ChalkInstance;
    muted: import("chalk").ChalkInstance;
    info: import("chalk").ChalkInstance;
    dim: import("chalk").ChalkInstance;
};
export declare function banner(): string;
export declare function header(title: string, icon?: string): string;
export interface BoxOptions {
    title?: string;
    width?: number;
    borderColor?: typeof chalk;
}
export declare function box(content: string, options?: BoxOptions): string;
export declare function keyValue(key: string, value: string, keyWidth?: number): string;
export declare function scoreBar(score: number | null, width?: number): string;
export declare function severityBadge(severity: string): string;
export declare function statusIcon(status: 'success' | 'warning' | 'error' | 'info'): string;
export interface TableColumn {
    header: string;
    width: number;
    align?: 'left' | 'right' | 'center';
}
export declare function table(columns: TableColumn[], rows: string[][]): string;
export declare function summaryLine(items: Array<{
    label: string;
    value: string | number;
    color?: BrandColor;
}>): string;
export declare function divider(width?: number): string;
export declare function indent(text: string, spaces?: number): string;
export declare function filePath(path: string): string;
export declare function countBadge(count: number, color?: BrandColor): string;
export declare function progressText(current: number, total: number, label: string): string;
export declare function quickStart(): string;
export { brand };
