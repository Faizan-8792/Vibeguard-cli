export interface GitUtils {
    isGitRepo(cwd: string): Promise<boolean>;
    getCommitFrequency(file: string, sinceDays: number, cwd: string): Promise<number>;
    getLastCommitDate(file: string, cwd: string): Promise<string | null>;
    isWorkingTreeClean(cwd: string): Promise<boolean>;
    createBranch(name: string, cwd: string): Promise<void>;
    commitAll(message: string, cwd: string): Promise<void>;
}
export declare class GitUtilsImpl implements GitUtils {
    isGitRepo(cwd: string): Promise<boolean>;
    getCommitFrequency(file: string, sinceDays: number, cwd: string): Promise<number>;
    getLastCommitDate(file: string, cwd: string): Promise<string | null>;
    isWorkingTreeClean(cwd: string): Promise<boolean>;
    createBranch(name: string, cwd: string): Promise<void>;
    commitAll(message: string, cwd: string): Promise<void>;
}
export declare function createGitUtils(): GitUtils;
