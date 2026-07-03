import { spawn } from 'child_process';
export interface ScriptLogEntry {
    id: string;
    timestamp: string;
    type: string;
    command: string;
    stdout: string;
    stderr: string;
    exitCode: number | null;
    duration: number;
}
/**
 * Run a shell command via exec() and log the result.
 * Returns { stdout, stderr } on success, throws on failure.
 */
export declare function runScript(command: string, options?: {
    cwd?: string;
    timeout?: number;
    shell?: string;
    env?: NodeJS.ProcessEnv;
    type?: string;
}): Promise<{
    stdout: string;
    stderr: string;
}>;
/**
 * Run a command via spawn() (for long-running processes like qodercli).
 * Returns the child process and a log file path for progress tracking.
 */
export declare function spawnScript(command: string, args: string[], options?: {
    cwd?: string;
    type?: string;
    logFile?: string;
}): {
    child: ReturnType<typeof spawn>;
    logPath: string;
};
/**
 * Retrieve recent script execution log entries.
 */
export declare function getRecentScriptLogs(hours?: number, limit?: number): ScriptLogEntry[];
/**
 * Clean up old script log files.
 */
export declare function cleanupOldScriptLogs(): void;
//# sourceMappingURL=scriptRunner.d.ts.map