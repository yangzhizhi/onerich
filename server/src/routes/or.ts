import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { logInfo, logError } from '../services/logger';
import { spawnScript } from '../services/scriptRunner';
import { PROJECT_ROOT, ONERICH_DIR, bjDateString } from './shared';

const router = Router();

// ---- Project-local data directories ----
// All O-R data lives under server/data/or/.  qodercli still runs in ONERICH_DIR
// and writes reports to ONERICH_REPORTS_DIR; we copy each finished report into
// OR_REPORTS_DIR so the server is self-contained.
const OR_DATA_DIR = path.join(PROJECT_ROOT, 'data', 'or');
const OR_REPORTS_DIR = path.join(OR_DATA_DIR, 'reports');
const OR_PENDING_DIR = path.join(OR_DATA_DIR, '.pending');
const ONERICH_REPORTS_DIR = path.join(ONERICH_DIR, 'reports'); // qodercli output (source)

interface ORDecisionCard {
  ticker: string;
  company: string;
  currentPrice: string;
  decision: string;
  conviction: string;
  score: string;
  target: string;
  buyZone: string;
  stopLoss: string;
  position: string;
  riskReward: string;
  timeframe: string;
  keyCatalyst: string;
  keyRisk: string;
}

// Clean a markdown-table cell or ASCII-box value: strip ** bold, collapse ws.
function cleanCell(s: string): string {
  return s.replace(/\*\*/g, '').replace(/\s+/g, ' ').replace(/\s*[│|].*$/, '').trim();
}

// Parse the Decision Summary Card + header lines out of a full report.
// Handles ALL three layouts produced by the onerich skill:
//   (a) English / ASCII box:   │  DECISION:     BUY (on pullback)   │
//   (b) Chinese / ASCII box:   │  决策:     买入/持有 (BUY/HOLD)   │
//   (c) Markdown table (CN):   | **决策** | **HOLD / WAIT (持有/等待)** |
function parseDecisionCard(md: string, tickerHint: string = ''): ORDecisionCard {
  // Header fields live above the card.
  let ticker = '';
  let company = '';
  let currentPrice = '';

  // Title variants — try in priority order:
  //   1. English dash header: "# OneC Stock Research — MU Consolidated Report"
  //   2. Chinese dash header: "# OneC 股票研究报告 — NBIS 综合报告"
  //   3. Company (TICKER): "# Applied Optoelectronics (AAOI) — 综合投资研究报告"
  //   4. Company (EXCHANGE: TICKER): "# ...Rambus Inc. (NASDAQ: RMBS)"
  //   5. Chinese target line: "**目标**: NBIS — Nebius Group N.V."
  //   6. English target line: "**Target**: MU — Micron Technology"
  const enDash = md.match(/^#\s+OneC Stock Research\s*[—–-]\s*([A-Z.]{1,8})\b/m);
  const cnDash = md.match(/^#\s+(?:OneC|OneRich)\s+股票研究报告\s*[—–-]\s*([A-Z.]{1,8})\b/m);
  const coParen = md.match(/^#\s+([^()\n]+?)\s*\(([A-Z.]{1,8})\)/m);
  const exchParen = md.match(/^#\s+[^()\n]+?\((?:NASDAQ|NYSE|HKEX|SSE|SZSE):\s*([A-Z.]{1,8})\)/im);
  const cnTarget = md.match(/\*\*目标\*\*\s*[:：]\s*([A-Za-z.]+)\s*[\u2014\u2013\-]\s*(.+)/);
  const enTarget = md.match(/\*\*Target\*\*:\s*([A-Za-z.]+)\s*[\u2014\u2013\-]\s*(.+)/);

  if (enDash) {
    ticker = enDash[1];
  } else if (cnDash) {
    ticker = cnDash[1];
  } else if (exchParen) {
    ticker = exchParen[1];
  } else if (coParen) {
    company = coParen[1].trim();
    ticker = coParen[2];
  } else if (cnTarget) {
    ticker = cnTarget[1].trim();
    company = cnTarget[2].trim();
  } else if (enTarget) {
    ticker = enTarget[1].trim();
    company = enTarget[2].trim();
  } else if (tickerHint) {
    ticker = tickerHint;
  }

  const priceMatch = md.match(/\*\*(?:Current Price|当前价格)\*\*[:：]?\s*([^|*\n]+)/);
  if (priceMatch) currentPrice = priceMatch[1].trim();

  // Isolate the Decision Summary Card section so prose doesn't leak in.
  let section = md.slice(0, 4000);
  const cardStart = md.search(/##\s+.*Decision Summary Card/im);
  if (cardStart !== -1) {
    const after = md.slice(cardStart);
    // End at the next top-level ## heading (excluding the card itself) or a --- rule.
    const nextH2 = after.slice(1).search(/^##\s/m);
    const hr = after.search(/^---\s*$/m);
    const ends = [nextH2 === -1 ? Infinity : nextH2 + 1, hr === -1 ? Infinity : hr];
    const end = Math.min(...ends);
    section = end === Infinity ? after : after.slice(0, end);
  }

  // Find a value by trying, in order: English ASCII-box label, Chinese ASCII-box
  // label, markdown-table cell (CN), markdown-table cell (EN).
  const findVal = (enBox: string, cnBox: string, cnTable: string, enTable?: string): string => {
    // English ASCII box:  │  DECISION:     BUY ...   │
    const enRe = new RegExp('\\b' + enBox + ':\\s*([^|\n]+)', 'i');
    const enM = section.match(enRe);
    if (enM) return cleanCell(enM[1]);
    // Chinese ASCII box:  │  决策:     买入/持有 (BUY/HOLD)   │
    const cnRe = new RegExp(cnBox + '\\s*[:：]\\s*([^|\n]+)');
    const cnM = section.match(cnRe);
    if (cnM) return cleanCell(cnM[1]);
    // Markdown table (Chinese label):  | **综合评分** | **52 / 100** |
    const tableCnRe = new RegExp('\\|\\s*\\*\\*' + cnTable + '\\*\\*\\s*\\|\\s*([^|\n]+)\\|', 'i');
    const tableCnM = section.match(tableCnRe);
    if (tableCnM) return cleanCell(tableCnM[1]);
    // Markdown table (English label)
    if (enTable) {
      const tableEnRe = new RegExp('\\|\\s*\\*\\*' + enTable + '\\*\\*\\s*\\|\\s*([^|\n]+)\\|', 'i');
      const tableEnM = section.match(tableEnRe);
      if (tableEnM) return cleanCell(tableEnM[1]);
    }
    return '';
  };

  return {
    ticker, company, currentPrice,
    decision:     findVal('DECISION',     '决策',       '决策',     'Decision'),
    conviction:   findVal('CONVICTION',   '确信度',     '确信度',   'Conviction'),
    score:        findVal('SCORE',        '综合评分',   '综合评分', 'Score'),
    target:       findVal('TARGET',       '目标价',     '基础目标', 'Target'),
    buyZone:      findVal('BUY ZONE',     '买入区间',   '买入区间', 'Buy Zone'),
    stopLoss:     findVal('STOP LOSS',    '止损',       '止损',     'Stop Loss'),
    position:     findVal('POSITION',     '仓位',       '建议仓位', 'Position'),
    riskReward:   findVal('RISK/REWARD',  '风险回报',   '风险回报', 'Risk/Reward'),
    timeframe:    findVal('TIMEFRAME',    '时间框架',   '时间框架', 'Timeframe'),
    keyCatalyst:  findVal('KEY CATALYST', '关键催化剂', '关键催化剂', 'Key Catalyst'),
    keyRisk:      findVal('KEY RISK',     '关键风险',   '关键风险', 'Key Risk'),
  };
}

// GET /api/or/reports — list all full reports grouped by date.
router.get('/or/reports', (_req: Request, res: Response) => {
  try {
    // Read from project-local data dir; fall back to onerich source for any
    // reports that haven't been copied yet.
    const scanDirs = [OR_REPORTS_DIR, ONERICH_REPORTS_DIR];
    const seen = new Set<string>();
    const dateDirs = new Set<string>();
    for (const base of scanDirs) {
      if (!fs.existsSync(base)) continue;
      for (const d of fs.readdirSync(base)) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(d)) dateDirs.add(d);
      }
    }

    const result: (ORDecisionCard & { date: string; filename: string; mtime: string })[] = [];
    for (const date of [...dateDirs].sort().reverse()) {
      for (const base of scanDirs) {
        const dir = path.join(base, date);
        let files: string[];
        try { files = fs.readdirSync(dir); } catch { continue; }
        for (const f of files) {
          if (!/-full-report\.md$/.test(f)) continue;
          const dedupKey = `${date}/${f}`;
          if (seen.has(dedupKey)) continue;
          seen.add(dedupKey);
          const fp = path.join(dir, f);
          try {
            const md = fs.readFileSync(fp, 'utf8');
            const tickerFromFile = f.replace(/-full-report\.md$/, '');
            const card = parseDecisionCard(md, tickerFromFile);
            const st = fs.statSync(fp);
            result.push({ ...card, date, filename: f, mtime: st.mtime.toISOString() });
          } catch (err) {
            console.error('O-R parse failed for', fp, err);
          }
        }
      }
    }
    res.json(result);
  } catch (err: any) {
    console.error('O-R reports list failed:', err);
    res.status(500).json({ error: 'Failed to list reports', detail: err.message });
  }
});

// GET /api/or/report/:date/:ticker — full markdown + parsed card.
router.get('/or/report/:date/:ticker', (req: Request, res: Response) => {
  const date = String(req.params.date);
  const ticker = String(req.params.ticker);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: 'Invalid date format' });
    return;
  }
  // Try project-local data dir first, then fall back to onerich source.
  const candidates = [
    path.join(OR_REPORTS_DIR, date, `${String(ticker).toUpperCase()}-full-report.md`),
    path.join(ONERICH_REPORTS_DIR, date, `${String(ticker).toUpperCase()}-full-report.md`),
  ];
  let fp = '';
  for (const c of candidates) {
    if (fs.existsSync(c)) { fp = c; break; }
  }
  if (!fp) {
    res.status(404).json({ error: 'Report not found' });
    return;
  }
  try {
    const md = fs.readFileSync(fp, 'utf8');
    const card = parseDecisionCard(md, ticker);
    res.json({ date, ticker: card.ticker || ticker, company: card.company, markdown: md, card });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to read report', detail: err.message });
  }
});

// POST /api/or/research — trigger a new research run via the onerich qoder skill.
// Runs `qodercli -p '/onerich TICKER'` in **headless agent mode** — no IDE GUI is
// opened.  The full 5-phase pipeline executes in the background; stdout/stderr are
// tee'd to a log file so the client can poll GET /or/research/status/:ticker for
// progress.  When the process finishes the report lands in
// ONERICH_REPORTS_DIR/YYYY-MM-DD/TICKER-full-report.md; the close handler then
// copies it into OR_REPORTS_DIR so it persists under server/data/or/.

router.post('/or/research', (req: Request, res: Response) => {
  const ticker = String(req.body?.ticker || '').trim().toUpperCase();
  if (!/^[A-Z.]{1,8}$/.test(ticker)) {
    res.status(400).json({ error: 'A valid ticker is required (e.g. AAPL)' });
    return;
  }
  if (!fs.existsSync(ONERICH_DIR)) {
    res.status(500).json({ error: `onerich project directory not found: ${ONERICH_DIR}` });
    return;
  }

  // Resolve the qodercli binary (prefer env override, then PATH lookup).
  const qoderCli = process.env.QODER_CLI || 'qodercli';

  // Prepare the pending directory and log files.
  fs.mkdirSync(OR_PENDING_DIR, { recursive: true });
  const triggerFile = path.join(OR_PENDING_DIR, `${ticker}.trigger`);
  const logFile = path.join(OR_PENDING_DIR, `${ticker}.log`);
  const pidFile = path.join(OR_PENDING_DIR, `${ticker}.pid`);
  const startedAt = new Date().toISOString();

  // Kill any existing research process for the same ticker to avoid races.
  try {
    if (fs.existsSync(pidFile)) {
      const oldPid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
      if (oldPid && !isNaN(oldPid)) {
        try { process.kill(oldPid, 'SIGTERM'); } catch { /* already exited */ }
      }
      fs.unlinkSync(pidFile);
    }
  } catch {}

  try {
    fs.writeFileSync(triggerFile, `${startedAt}\nrequested_by=O-R page (qodercli headless)\n`);
  } catch (err: any) {
    console.error('O-R trigger write failed:', err);
  }

  // Spawn qodercli in headless print mode.
  //   qodercli -p '/onerich TICKER' -w <onerich_dir> --output-format text --dangerously-skip-permissions
  // `--dangerously-skip-permissions` is required because there is no human to
  // approve tool calls in headless mode.
  let started = false;
  let errMsg = '';
  try {
    const logStream = fs.createWriteStream(logFile, { flags: 'w' });
    logStream.write(`=== onerich research for ${ticker} started ${startedAt} ===\n`);

    const child = spawn(
      qoderCli,
      ['-p', `/onerich ${ticker}`, '-w', ONERICH_DIR, '--output-format', 'text', '--dangerously-skip-permissions'],
      { cwd: ONERICH_DIR, detached: true, stdio: ['ignore', 'pipe', 'pipe'] },
    );

    const childPid = child.pid;
    child.stdout?.on('data', (d: Buffer) => logStream.write(d));
    child.stderr?.on('data', (d: Buffer) => logStream.write(d));
    child.on('close', (code) => {
      logStream.write(`\n=== process ${childPid} exited with code ${code} at ${new Date().toISOString()} ===\n`);
      logStream.end();

      // Copy the finished report (and any phase files) from the onerich source
      // directory into our project-local data directory.
      try {
        const today = bjDateString();
        const srcDir = path.join(ONERICH_REPORTS_DIR, today);
        const dstDir = path.join(OR_REPORTS_DIR, today);
        if (fs.existsSync(srcDir)) {
          fs.mkdirSync(dstDir, { recursive: true });
          for (const f of fs.readdirSync(srcDir)) {
            if (!f.startsWith(`${ticker}-`)) continue;
            const srcFile = path.join(srcDir, f);
            const dstFile = path.join(dstDir, f);
            fs.copyFileSync(srcFile, dstFile);
          }
          logInfo('O-R report copied to data dir', { ticker, date: today });
        }
      } catch (err) {
        console.error('O-R report copy failed:', err);
      }

      // Only delete the PID file if it still belongs to THIS process.
      try {
        if (fs.existsSync(pidFile)) {
          const savedPid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
          if (savedPid === childPid) fs.unlinkSync(pidFile);
        }
      } catch {}
    });
    child.on('error', (e) => {
      logStream.write(`\n=== spawn error: ${e.message} ===\n`);
      logStream.end();
      try {
        if (fs.existsSync(pidFile)) {
          const savedPid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
          if (savedPid === childPid) fs.unlinkSync(pidFile);
        }
      } catch {}
    });

    // Persist the PID so the status endpoint can report liveness.
    fs.writeFileSync(pidFile, String(childPid));
    child.unref();
    started = true;
  } catch (err: any) {
    errMsg = err.message;
    console.error('O-R qodercli spawn failed:', err);
  }

  res.json({
    status: started ? 'running' : 'failed',
    ticker,
    mode: 'qodercli-headless',
    started_at: startedAt,
    onerich_dir: ONERICH_DIR,
    message: started
      ? `Headless analysis started for ${ticker} via qodercli. The report will appear in the list when done — click Refresh in a few minutes.`
      : `Failed to start headless analysis: ${errMsg}`,
  });
});

// GET /api/or/research/active — list all currently-running research tasks.
// Scans the .pending/ directory for .pid files and checks process liveness.
// This allows the client to discover running tasks after page navigation or
// browser refresh.
router.get('/or/research/active', (_req: Request, res: Response) => {
  try {
    const tasks: { ticker: string; status: string }[] = [];
    // Scan both project-local and onerich source pending dirs.
    const pendingDirs = [OR_PENDING_DIR];
    const seenTickers = new Set<string>();

    for (const dir of pendingDirs) {
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith('.pid')) continue;
        const ticker = f.replace(/\.pid$/, '');
        if (seenTickers.has(ticker)) continue;
        seenTickers.add(ticker);

        const pidFile = path.join(dir, f);
        let running = false;
        try {
          const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
          if (pid && !isNaN(pid)) {
            try { process.kill(pid, 0); running = true; } catch { /* exited */ }
          }
        } catch {}

        // Also check if a report already exists for today (task may have just finished).
        const today = bjDateString();
        const reportExists = [
          path.join(OR_REPORTS_DIR, today, `${ticker}-full-report.md`),
          path.join(ONERICH_REPORTS_DIR, today, `${ticker}-full-report.md`),
        ].some(p => fs.existsSync(p));

        if (reportExists) {
          tasks.push({ ticker, status: 'done' });
        } else if (running) {
          tasks.push({ ticker, status: 'running' });
        }
      }
    }
    res.json(tasks);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to list active research', detail: err.message });
  }
});

// GET /api/or/research/status/:ticker — check whether a headless research run is
// still in progress and return a tail of the log for the client to display.
router.get('/or/research/status/:ticker', (req: Request, res: Response) => {
  const ticker = String(req.params.ticker).trim().toUpperCase();
  if (!/^[A-Z.]{1,8}$/.test(ticker)) {
    res.status(400).json({ error: 'A valid ticker is required' });
    return;
  }

  const logFile = path.join(OR_PENDING_DIR, `${ticker}.log`);
  const pidFile = path.join(OR_PENDING_DIR, `${ticker}.pid`);
  const today = bjDateString();
  // Check both project-local and onerich source for the finished report.
  const reportCandidates = [
    path.join(OR_REPORTS_DIR, today, `${ticker}-full-report.md`),
    path.join(ONERICH_REPORTS_DIR, today, `${ticker}-full-report.md`),
  ];

  // Report exists → done.
  if (reportCandidates.some(p => fs.existsSync(p))) {
    res.json({ ticker, status: 'done', log: '' });
    return;
  }

  // Check PID liveness → running.
  let running = false;
  try {
    if (fs.existsSync(pidFile)) {
      const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
      if (pid && !isNaN(pid)) {
        try { process.kill(pid, 0); running = true; } catch { /* process exited */ }
      }
    }
  } catch {}

  // Return the last 3 KB of the log for a progress preview.
  let logTail = '';
  try {
    if (fs.existsSync(logFile)) {
      const stat = fs.statSync(logFile);
      const size = stat.size;
      const start = Math.max(0, size - 3072);
      const fd = fs.openSync(logFile, 'r');
      const buf = Buffer.alloc(size - start);
      fs.readSync(fd, buf, 0, buf.length, start);
      fs.closeSync(fd);
      logTail = buf.toString('utf8');
    }
  } catch {}

  res.json({
    ticker,
    status: running ? 'running' : (logTail ? 'idle' : 'unknown'),
    log: logTail,
  });
});

export default router;
