export type LogLevel = 'info' | 'warn' | 'error';
export interface LogEntry {
    id: string;
    timestamp: string;
    level: LogLevel;
    message: string;
    meta?: Record<string, any>;
}
export declare function logInfo(message: string, meta?: Record<string, any>): void;
export declare function logWarn(message: string, meta?: Record<string, any>): void;
export declare function logError(message: string, meta?: Record<string, any>): void;
/**
 * Retrieve recent app log entries.
 */
export declare function getRecentLogs(hours?: number, level?: LogLevel, limit?: number): LogEntry[];
/**
 * Clean up log files older than MAX_AGE_DAYS.
 */
export declare function cleanupOldLogs(): void;
//# sourceMappingURL=logger.d.ts.map