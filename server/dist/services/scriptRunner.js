"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runScript = runScript;
exports.spawnScript = spawnScript;
exports.getRecentScriptLogs = getRecentScriptLogs;
exports.cleanupOldScriptLogs = cleanupOldScriptLogs;
const child_process_1 = require("child_process");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const logger_1 = require("./logger");
const LOGS_DIR = path_1.default.join(__dirname, '..', '..', 'data', 'logs');
const MAX_AGE_DAYS = 30;
function ensureLogDir() {
    if (!fs_1.default.existsSync(LOGS_DIR)) {
        fs_1.default.mkdirSync(LOGS_DIR, { recursive: true });
    }
}
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function bjTimestamp() {
    const now = new Date();
    return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString();
}
function bjDateString() {
    const now = new Date();
    return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function getScriptLogFilePath(date) {
    return path_1.default.join(LOGS_DIR, `script-${date}.jsonl`);
}
/**
 * Save a script execution log entry to file.
 */
function saveScriptLog(entry) {
    try {
        ensureLogDir();
        const filePath = getScriptLogFilePath(bjDateString());
        fs_1.default.appendFileSync(filePath, JSON.stringify(entry) + '\n');
    }
    catch (err) {
        (0, logger_1.logError)('Failed to save script log', { error: String(err) });
    }
}
/**
 * Run a shell command via exec() and log the result.
 * Returns { stdout, stderr } on success, throws on failure.
 */
async function runScript(command, options = {}) {
    const startTime = Date.now();
    const type = options.type || 'script';
    const id = generateId();
    (0, logger_1.logInfo)(`[${type}] Starting: ${command.slice(0, 200)}`);
    const execFile = (await Promise.resolve().then(() => __importStar(require('util')))).promisify(child_process_1.exec);
    try {
        const result = await execFile(command, {
            cwd: options.cwd,
            timeout: options.timeout || 120000,
            shell: options.shell || '/bin/zsh',
            env: { ...process.env, ...options.env },
        });
        const duration = Date.now() - startTime;
        const entry = {
            id,
            timestamp: bjTimestamp(),
            type,
            command: command.slice(0, 1000),
            stdout: (result.stdout || '').slice(-5000),
            stderr: (result.stderr || '').slice(-2000),
            exitCode: 0,
            duration,
        };
        saveScriptLog(entry);
        (0, logger_1.logInfo)(`[${type}] Completed in ${duration}ms`, { exitCode: 0, duration });
        return result;
    }
    catch (err) {
        const duration = Date.now() - startTime;
        const entry = {
            id,
            timestamp: bjTimestamp(),
            type,
            command: command.slice(0, 1000),
            stdout: (err.stdout || '').slice(-5000),
            stderr: (err.stderr || '').slice(-2000),
            exitCode: err.code || 1,
            duration,
        };
        saveScriptLog(entry);
        (0, logger_1.logError)(`[${type}] Failed in ${duration}ms`, { exitCode: err.code, error: err.message?.slice(0, 500) });
        throw err;
    }
}
/**
 * Run a command via spawn() (for long-running processes like qodercli).
 * Returns the child process and a log file path for progress tracking.
 */
function spawnScript(command, args, options = {}) {
    const type = options.type || 'spawn';
    const id = generateId();
    const logPath = options.logFile || path_1.default.join(LOGS_DIR, `spawn-${id}.log`);
    (0, logger_1.logInfo)(`[${type}] Spawning: ${command} ${args.join(' ')}`);
    const child = (0, child_process_1.spawn)(command, args, {
        cwd: options.cwd,
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    // Set up log stream
    ensureLogDir();
    const logStream = fs_1.default.createWriteStream(logPath, { flags: 'w' });
    const startTime = Date.now();
    logStream.write(`=== ${type} started ${bjTimestamp()} ===\n`);
    logStream.write(`Command: ${command} ${args.join(' ')}\n\n`);
    child.stdout?.on('data', (d) => logStream.write(d));
    child.stderr?.on('data', (d) => logStream.write(d));
    child.on('close', (code) => {
        const duration = Date.now() - startTime;
        logStream.write(`\n=== process exited with code ${code} in ${duration}ms at ${bjTimestamp()} ===\n`);
        logStream.end();
        const entry = {
            id,
            timestamp: bjTimestamp(),
            type,
            command: `${command} ${args.join(' ')}`.slice(0, 1000),
            stdout: '',
            stderr: '',
            exitCode: code,
            duration,
        };
        saveScriptLog(entry);
        if (code === 0) {
            (0, logger_1.logInfo)(`[${type}] Spawned process completed in ${duration}ms`, { exitCode: code });
        }
        else {
            (0, logger_1.logError)(`[${type}] Spawned process failed in ${duration}ms`, { exitCode: code });
        }
    });
    child.on('error', (e) => {
        logStream.write(`\n=== spawn error: ${e.message} ===\n`);
        logStream.end();
        (0, logger_1.logError)(`[${type}] Spawn error: ${e.message}`);
    });
    return { child, logPath };
}
/**
 * Retrieve recent script execution log entries.
 */
function getRecentScriptLogs(hours = 24, limit = 50) {
    ensureLogDir();
    const entries = [];
    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    try {
        const files = fs_1.default.readdirSync(LOGS_DIR)
            .filter(f => f.startsWith('script-') && f.endsWith('.jsonl'))
            .sort()
            .reverse();
        for (const file of files) {
            if (entries.length >= limit)
                break;
            const dateStr = file.replace('script-', '').replace('.jsonl', '');
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
 * Clean up old script log files.
 */
function cleanupOldScriptLogs() {
    ensureLogDir();
    const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
    try {
        const files = fs_1.default.readdirSync(LOGS_DIR);
        for (const file of files) {
            if (!file.startsWith('script-') || !file.endsWith('.jsonl'))
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
//# sourceMappingURL=scriptRunner.js.map