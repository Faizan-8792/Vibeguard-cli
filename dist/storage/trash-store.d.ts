export interface TrashEntry {
    id: string;
    originalPath: string;
    movedAt: string;
    importance: number;
    lastCommitDate: string | null;
    kind: 'file' | 'export' | 'import' | 'duplicate-component';
}
export interface TrashStore {
    move(filePath: string, meta: Omit<TrashEntry, 'id' | 'movedAt'>): Promise<string>;
    list(): Promise<TrashEntry[]>;
    restore(idOrPath: string, force: boolean): Promise<void>;
    purge(): Promise<void>;
}
export declare class TrashStoreImpl implements TrashStore {
    private readonly trashDir;
    private readonly projectRoot;
    constructor(projectRoot: string);
    move(filePath: string, meta: Omit<TrashEntry, 'id' | 'movedAt'>): Promise<string>;
    list(): Promise<TrashEntry[]>;
    restore(idOrPath: string, force: boolean): Promise<void>;
    purge(): Promise<void>;
}
