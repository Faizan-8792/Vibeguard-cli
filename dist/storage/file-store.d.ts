export interface FileStore {
    read<T>(artifactPath: string): Promise<T | null>;
    write<T>(artifactPath: string, data: T): Promise<void>;
    exists(artifactPath: string): Promise<boolean>;
    ensureDir(dirPath: string): Promise<void>;
    getBasePath(): string;
}
export declare class FileStoreImpl implements FileStore {
    private readonly basePath;
    constructor(projectRoot: string, baseDir?: string);
    getBasePath(): string;
    read<T>(artifactPath: string): Promise<T | null>;
    write<T>(artifactPath: string, data: T): Promise<void>;
    exists(artifactPath: string): Promise<boolean>;
    ensureDir(dirPath: string): Promise<void>;
}
