import fs from 'fs';
import path from 'path';

const LOGS_DIR = path.join(__dirname, '..', '..', 'data', 'logs');
const MAX_AGE_DAYS = 30;

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
  meta?: Record<string, any>;
}

// Ensure log directory exists
function ensureLogDir(): void {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
}

// Generate a unique ID for each log entry
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Get log file path for a given date
function getLogFilePath(date: string): string {
  return path.join(LOGS_DIR, `app-${date}.jsonl`);
}

// Beijing time helpers
function bjNow(): Date {
  const now = new Date();
  return new Date(now.getTime() + 8 * 60 * 60 * 1000);
}

function bjDateString(): string {
  return bjNow().toISOString().slice(0, 10);
}

function bjTimestamp(): string {
  return bjNow().toISOString();
}

/**
 * Write a structured log entry to both console and the daily JSONL file.
 */
function writeLog(level: LogLevel, message: string, meta?: Record<string, any>): void {
  const entry: LogEntry = {
    id: generateId(),
    timestamp: bjTimestamp(),
    level,
    message,
    ...(meta ? { meta } : {}),
  };

  // Console output with color
  const colors: Record<LogLevel, string> = {
    info: '\x1b[36m',
    warn: '\x1b[33m',
    error: '\x1b[31m',
  };
  const reset = '\x1b[0m';
  const prefix = `${colors[level]}[${level.toUpperCase()}]${reset}`;
  if (meta) {
    console.log(`${prefix} ${message}`, meta);
  } else {
    console.log(`${prefix} ${message}`);
  }

  // File output
  try {
    ensureLogDir();
    const dateStr = bjDateString();
    const filePath = getLogFilePath(dateStr);
    fs.appendFileSync(filePath, JSON.stringify(entry) + '\n');
  } catch (err) {
    console.error('Logger write failed:', err);
  }
}

export function logInfo(message: string, meta?: Record<string, any>): void {
  writeLog('info', message, meta);
}

export function logWarn(message: string, meta?: Record<string, any>): void {
  writeLog('warn', message, meta);
}

export function logError(message: string, meta?: Record<string, any>): void {
  writeLog('error', message, meta);
}

/**
 * Retrieve recent app log entries.
 */
export function getRecentLogs(hours: number = 24, level?: LogLevel, limit: number = 200): LogEntry[] {
  ensureLogDir();
  const entries: LogEntry[] = [];
  const cutoff = Date.now() - hours * 60 * 60 * 1000;

  try {
    const files = fs.readdirSync(LOGS_DIR)
      .filter(f => f.startsWith('app-') && f.endsWith('.jsonl'))
      .sort()
      .reverse();

    for (const file of files) {
      if (entries.length >= limit) break;

      const dateStr = file.replace('app-', '').replace('.jsonl', '');
      const fileDate = new Date(dateStr + 'T00:00:00+08:00');
      if (fileDate.getTime() < cutoff - 24 * 60 * 60 * 1000) continue;

      const filePath = path.join(LOGS_DIR, file);
      try {
        const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
        for (let i = lines.length - 1; i >= 0; i--) {
          if (entries.length >= limit) break;
          try {
            const entry: LogEntry = JSON.parse(lines[i]);
            const entryTime = new Date(entry.timestamp).getTime();
            if (entryTime < cutoff) continue;
            if (level && entry.level !== level) continue;
            entries.push(entry);
          } catch { /* skip malformed lines */ }
        }
      } catch { /* skip unreadable files */ }
    }
  } catch { /* skip if dir doesn't exist */ }

  entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return entries.slice(0, limit);
}

/**
 * Clean up log files older than MAX_AGE_DAYS.
 */
export function cleanupOldLogs(): void {
  ensureLogDir();
  const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

  try {
    const files = fs.readdirSync(LOGS_DIR);
    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;
      const filePath = path.join(LOGS_DIR, file);
      try {
        const stat = fs.statSync(filePath);
        if (stat.mtimeMs < cutoff) {
          fs.unlinkSync(filePath);
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
}
