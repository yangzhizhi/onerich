import { exec, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { logInfo, logError, logWarn } from './logger';

const LOGS_DIR = path.join(__dirname, '..', '..', 'data', 'logs');
const MAX_AGE_DAYS = 30;

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

function ensureLogDir(): void {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function bjTimestamp(): string {
  const now = new Date();
  return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString();
}

function bjDateString(): string {
  const now = new Date();
  return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function getScriptLogFilePath(date: string): string {
  return path.join(LOGS_DIR, `script-${date}.jsonl`);
}

/**
 * Save a script execution log entry to file.
 */
function saveScriptLog(entry: ScriptLogEntry): void {
  try {
    ensureLogDir();
    const filePath = getScriptLogFilePath(bjDateString());
    fs.appendFileSync(filePath, JSON.stringify(entry) + '\n');
  } catch (err) {
    logError('Failed to save script log', { error: String(err) });
  }
}

/**
 * Run a shell command via exec() and log the result.
 * Returns { stdout, stderr } on success, throws on failure.
 */
export async function runScript(
  command: string,
  options: {
    cwd?: string;
    timeout?: number;
    shell?: string;
    env?: NodeJS.ProcessEnv;
    type?: string; // label for the log entry
  } = {}
): Promise<{ stdout: string; stderr: string }> {
  const startTime = Date.now();
  const type = options.type || 'script';
  const id = generateId();

  logInfo(`[${type}] Starting: ${command.slice(0, 200)}`);

  const execFile = (await import('util')).promisify(exec);

  try {
    const result = await execFile(command, {
      cwd: options.cwd,
      timeout: options.timeout || 120000,
      shell: options.shell || '/bin/zsh',
      env: { ...process.env, ...options.env },
    });

    const duration = Date.now() - startTime;
    const entry: ScriptLogEntry = {
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
    logInfo(`[${type}] Completed in ${duration}ms`, { exitCode: 0, duration });

    return result;
  } catch (err: any) {
    const duration = Date.now() - startTime;
    const entry: ScriptLogEntry = {
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
    logError(`[${type}] Failed in ${duration}ms`, { exitCode: err.code, error: err.message?.slice(0, 500) });

    throw err;
  }
}

/**
 * Run a command via spawn() (for long-running processes like qodercli).
 * Returns the child process and a log file path for progress tracking.
 */
export function spawnScript(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    type?: string;
    logFile?: string;
  } = {}
): { child: ReturnType<typeof spawn>; logPath: string } {
  const type = options.type || 'spawn';
  const id = generateId();
  const logPath = options.logFile || path.join(LOGS_DIR, `spawn-${id}.log`);

  logInfo(`[${type}] Spawning: ${command} ${args.join(' ')}`);

  const child = spawn(command, args, {
    cwd: options.cwd,
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Set up log stream
  ensureLogDir();
  const logStream = fs.createWriteStream(logPath, { flags: 'w' });
  const startTime = Date.now();

  logStream.write(`=== ${type} started ${bjTimestamp()} ===\n`);
  logStream.write(`Command: ${command} ${args.join(' ')}\n\n`);

  child.stdout?.on('data', (d: Buffer) => logStream.write(d));
  child.stderr?.on('data', (d: Buffer) => logStream.write(d));

  child.on('close', (code) => {
    const duration = Date.now() - startTime;
    logStream.write(`\n=== process exited with code ${code} in ${duration}ms at ${bjTimestamp()} ===\n`);
    logStream.end();

    const entry: ScriptLogEntry = {
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
      logInfo(`[${type}] Spawned process completed in ${duration}ms`, { exitCode: code });
    } else {
      logError(`[${type}] Spawned process failed in ${duration}ms`, { exitCode: code });
    }
  });

  child.on('error', (e) => {
    logStream.write(`\n=== spawn error: ${e.message} ===\n`);
    logStream.end();
    logError(`[${type}] Spawn error: ${e.message}`);
  });

  return { child, logPath };
}

/**
 * Retrieve recent script execution log entries.
 */
export function getRecentScriptLogs(hours: number = 24, limit: number = 50): ScriptLogEntry[] {
  ensureLogDir();
  const entries: ScriptLogEntry[] = [];
  const cutoff = Date.now() - hours * 60 * 60 * 1000;

  try {
    const files = fs.readdirSync(LOGS_DIR)
      .filter(f => f.startsWith('script-') && f.endsWith('.jsonl'))
      .sort()
      .reverse();

    for (const file of files) {
      if (entries.length >= limit) break;

      const dateStr = file.replace('script-', '').replace('.jsonl', '');
      const fileDate = new Date(dateStr + 'T00:00:00+08:00');
      if (fileDate.getTime() < cutoff - 24 * 60 * 60 * 1000) continue;

      const filePath = path.join(LOGS_DIR, file);
      try {
        const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
        for (let i = lines.length - 1; i >= 0; i--) {
          if (entries.length >= limit) break;
          try {
            const entry: ScriptLogEntry = JSON.parse(lines[i]);
            const entryTime = new Date(entry.timestamp).getTime();
            if (entryTime < cutoff) continue;
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
 * Clean up old script log files.
 */
export function cleanupOldScriptLogs(): void {
  ensureLogDir();
  const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

  try {
    const files = fs.readdirSync(LOGS_DIR);
    for (const file of files) {
      if (!file.startsWith('script-') || !file.endsWith('.jsonl')) continue;
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
