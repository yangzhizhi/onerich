"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logInfo = logInfo;
exports.logWarn = logWarn;
exports.logError = logError;
exports.getRecentLogs = getRecentLogs;
exports.cleanupOldLogs = cleanupOldLogs;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const LOGS_DIR = path_1.default.join(__dirname, '..', '..', 'data', 'logs');
const MAX_AGE_DAYS = 30;
// Ensure log directory exists
function ensureLogDir() {
    if (!fs_1.default.existsSync(LOGS_DIR)) {
        fs_1.default.mkdirSync(LOGS_DIR, { recursive: true });
    }
}
// Generate a unique ID for each log entry
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
// Get log file path for a given date
function getLogFilePath(date) {
    return path_1.default.join(LOGS_DIR, `app-${date}.jsonl`);
}
// Beijing time helpers
function bjNow() {
    const now = new Date();
    return new Date(now.getTime() + 8 * 60 * 60 * 1000);
}
function bjDateString() {
    return bjNow().toISOString().slice(0, 10);
}
function bjTimestamp() {
    return bjNow().toISOString();
}
/**
 * Write a structured log entry to both console and the daily JSONL file.
 */
function writeLog(level, message, meta) {
    const entry = {
        id: generateId(),
        timestamp: bjTimestamp(),
        level,
        message,
        ...(meta ? { meta } : {}),
    };
    // Console output with color
    const colors = {
        info: '\x1b[36m',
        warn: '\x1b[33m',
        error: '\x1b[31m',
    };
    const reset = '\x1b[0m';
    const prefix = `${colors[level]}[${level.toUpperCase()}]${reset}`;
    if (meta) {
        console.log(`${prefix} ${message}`, meta);
    }
    else {
        console.log(`${prefix} ${message}`);
    }
    // File output
    try {
        ensureLogDir();
        const dateStr = bjDateString();
        const filePath = getLogFilePath(dateStr);
        fs_1.default.appendFileSync(filePath, JSON.stringify(entry) + '\n');
    }
    catch (err) {
        console.error('Logger write failed:', err);
    }
}
function logInfo(message, meta) {
    writeLog('info', message, meta);
}
function logWarn(message, meta) {
    writeLog('warn', message, meta);
}
function logError(message, meta) {
    writeLog('error', message, meta);
}
/**
 * Retrieve recent app log entries.
 */
function getRecentLogs(hours = 24, level, limit = 200) {
    ensureLogDir();
    const entries = [];
    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    try {
        const files = fs_1.default.readdirSync(LOGS_DIR)
            .filter(f => f.startsWith('app-') && f.endsWith('.jsonl'))
            .sort()
            .reverse();
        for (const file of files) {
            if (entries.length >= limit)
                break;
            const dateStr = file.replace('app-', '').replace('.jsonl', '');
            const fileDate = new Date(dateStr + 'T00:00:00+08:00');
            if (fileDate.getTime() < cutoff - 24 * 60 * 60 * 1000)
                continue;
            const filePath = path_1.default.join(LOGS_DIR, file);
            try {
                const lines = fs_1.default.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
                for (let i = lines.length - 1; i >= 0; i--) {
                    if (entries.length >= limit)
                        break;
                    try {
                        const entry = JSON.parse(lines[i]);
                        const entryTime = new Date(entry.timestamp).getTime();
                        if (entryTime < cutoff)
                            continue;
                        if (level && entry.level !== level)
                            continue;
                        entries.push(entry);
                    }
                    catch { /* skip malformed lines */ }
                }
            }
            catch { /* skip unreadable files */ }
        }
    }
    catch { /* skip if dir doesn't exist */ }
    entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return entries.slice(0, limit);
}
/**
 * Clean up log files older than MAX_AGE_DAYS.
 */
function cleanupOldLogs() {
    ensureLogDir();
    const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
    try {
        const files = fs_1.default.readdirSync(LOGS_DIR);
        for (const file of files) {
            if (!file.endsWith('.jsonl'))
                continue;
            const filePath = path_1.default.join(LOGS_DIR, file);
            try {
                const stat = fs_1.default.statSync(filePath);
                if (stat.mtimeMs < cutoff) {
                    fs_1.default.unlinkSync(filePath);
                }
            }
            catch { /* skip */ }
        }
    }
    catch { /* skip */ }
}
//# sourceMappingURL=logger.js.map