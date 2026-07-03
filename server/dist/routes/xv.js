"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const child_process_1 = require("child_process");
const database_1 = __importDefault(require("../database"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const openai_1 = __importDefault(require("openai"));
const dotenv_1 = __importDefault(require("dotenv"));
const shared_1 = require("./shared");
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '..', '..', '.env') });
const router = (0, express_1.Router)();
// Project-local paths
// PROJECT_ROOT = server/; scripts live at the workspace root (one level up).
const XV_SCRIPT = path_1.default.join(shared_1.PROJECT_ROOT, '..', 'scripts', 'twitter_tracker.py');
const XV_OUTPUT_DIR = path_1.default.join(shared_1.PROJECT_ROOT, 'data', 'xv');
const XV_RAW_DIR = path_1.default.join(XV_OUTPUT_DIR, 'raw');
const XV_IMAGES_DIR = path_1.default.join(XV_OUTPUT_DIR, 'images');
const XV_CONFIG_DIR = shared_1.VTRACK_DIR;
const XV_LEGACY_RAW_DIR = path_1.default.join(XV_CONFIG_DIR, 'twitter_data', 'raw');
const XV_LEGACY_IMAGES_DIR = path_1.default.join(XV_CONFIG_DIR, 'twitter_data', 'images');
const XV_PENDING_DIR = path_1.default.join(XV_OUTPUT_DIR, '.pending');
function serveXVImage(filename, res) {
    const candidates = [
        path_1.default.join(XV_IMAGES_DIR, filename), // project-local (new)
        path_1.default.join(XV_LEGACY_IMAGES_DIR, filename), // legacy v_track dir
    ];
    for (const p of candidates) {
        if (fs_1.default.existsSync(p)) {
            res.sendFile(p);
            return;
        }
    }
    res.status(404).send('Not found');
}
// Helper: load a date's tweets from a JSON backup file (legacy fallback).
function readTweetsJSON(date) {
    const candidates = [
        path_1.default.join(XV_RAW_DIR, `tweets_${date}.json`),
        path_1.default.join(XV_LEGACY_RAW_DIR, `tweets_${date}.json`),
    ];
    for (const p of candidates) {
        if (fs_1.default.existsSync(p)) {
            try {
                return JSON.parse(fs_1.default.readFileSync(p, 'utf-8'));
            }
            catch (err) {
                console.error(`Failed to parse ${p}:`, err);
            }
        }
    }
    return null;
}
// GET /api/xv/dates — list all dates that have tweets (DB-first, JSON fallback).
router.get('/xv/dates', (_req, res) => {
    try {
        const db = (0, database_1.default)();
        let dbDates = [];
        try {
            const rows = db.prepare('SELECT DISTINCT date FROM xv_tweets ORDER BY date DESC').all();
            dbDates = rows.map(r => r.date).filter(Boolean);
        }
        catch (err) {
            // Table might not exist yet — fall through to JSON scan.
            console.warn('xv_tweets table not readable, using JSON fallback:', err.message);
        }
        // Merge with JSON-backed dates (legacy + new).
        const jsonDates = [];
        for (const dir of [XV_RAW_DIR, XV_LEGACY_RAW_DIR]) {
            if (!fs_1.default.existsSync(dir))
                continue;
            try {
                for (const f of fs_1.default.readdirSync(dir)) {
                    if (f.startsWith('tweets_') && f.endsWith('.json')) {
                        jsonDates.push(f.replace('tweets_', '').replace('.json', ''));
                    }
                }
            }
            catch { /* ignore */ }
        }
        const dates = Array.from(new Set([...dbDates, ...jsonDates]))
            .filter(d => !d.includes('unknown'))
            .sort()
            .reverse();
        res.json(dates);
    }
    catch (err) {
        console.error('Failed to list X-V dates:', err);
        res.status(500).json({ error: 'Failed to list dates' });
    }
});
// GET /api/xv/tweets/:date — get tweets for a specific date.
// Response shape stays compatible with the old JSON format so the client doesn't change:
//   { metadata: { date, total_tweets, users_tracked, scraped_at },
//     tweets:    { [username]: Tweet[] } }
router.get('/xv/tweets/:date', (req, res) => {
    const date = String(req.params.date);
    try {
        const db = (0, database_1.default)();
        let rows = [];
        try {
            rows = db.prepare(`SELECT id, username, text, created_at, replies, retweets, likes, views, url,
                image_urls, image_paths, scraped_at
         FROM xv_tweets
         WHERE date = ?
         ORDER BY created_at DESC`).all(date);
        }
        catch (err) {
            console.warn('xv_tweets table not readable, using JSON fallback:', err.message);
        }
        if (rows.length > 0) {
            // Assemble the same {metadata, tweets} shape from DB rows.
            const tweets = {};
            const users = [];
            let latestScrape = '';
            for (const r of rows) {
                if (!tweets[r.username]) {
                    tweets[r.username] = [];
                    users.push(r.username);
                }
                tweets[r.username].push({
                    id: r.id,
                    text: r.text,
                    created_at: r.created_at,
                    metrics: { replies: r.replies, retweets: r.retweets, likes: r.likes, views: r.views },
                    url: r.url,
                    scraped_at: r.scraped_at,
                    image_urls: (0, shared_1.safeParseStrArray)(r.image_urls),
                    image_paths: (0, shared_1.safeParseStrArray)(r.image_paths),
                });
                if (r.scraped_at && r.scraped_at > latestScrape)
                    latestScrape = r.scraped_at;
            }
            res.json({
                metadata: {
                    date,
                    total_tweets: rows.length,
                    users_tracked: users,
                    scraped_at: latestScrape || new Date().toISOString(),
                    version: '3.0',
                },
                tweets,
            });
            return;
        }
        // Fallback: JSON backup files.
        const jsonData = readTweetsJSON(date);
        if (jsonData) {
            res.json(jsonData);
            return;
        }
        res.status(404).json({ error: 'No data for this date' });
    }
    catch (err) {
        console.error('Failed to read X-V tweets:', err);
        res.status(500).json({ error: 'Failed to read tweets' });
    }
});
// Detect a scraper failure even when the script exits 0.
// The python script logs ERROR/WARNING lines to stderr (StreamHandler) AND a file
// handler; on genuine success it always prints a final marker to stdout
// ("Tracking complete!" for scrape, "Migration done:" for migrate).
// Without this check the API would report success after a login timeout.
function detectXVScrapeFailure(stdout, stderr, successMarker) {
    const combined = `${stdout}\n${stderr}`;
    if (successMarker.test(combined))
        return { failed: false };
    if (/Not logged in|login prompt detected|redirected to login page/i.test(combined)) {
        return { failed: true, reason: 'Twitter login failed — cookies expired or session invalid. Refresh cookies.json in server/data/xv/config/ (fallback: v_track).' };
    }
    if (/Timeout \d+ms exceeded|Page\.goto.*Timeout/i.test(combined)) {
        return { failed: true, reason: 'Network timeout reaching x.com — check VPN/proxy, then retry.' };
    }
    const errLine = combined.match(/(?:ERROR|CRITICAL)\s*-\s*(.+)/);
    if (errLine) {
        return { failed: true, reason: `Scraper error: ${errLine[1].trim()}` };
    }
    return { failed: true, reason: 'Scrape finished without a success marker.' };
}
// POST /api/xv/scrape — trigger the project-local scraper (async, non-blocking).
// The script writes tweets into the xv_tweets table (canonical) AND keeps JSON backups.
// The process runs detached; the client polls GET /xv/scrape/status for progress.
router.post('/xv/scrape', (req, res) => {
    const { date } = req.body || {};
    if (!date || typeof date !== 'string' || !/^\d{8}$/.test(date)) {
        res.status(400).json({ error: 'date (YYYYMMDD) is required' });
        return;
    }
    if (!fs_1.default.existsSync(XV_SCRIPT)) {
        res.status(500).json({ error: `Scraper script not found: ${XV_SCRIPT}` });
        return;
    }
    // Kill any existing scrape process to avoid overlaps.
    const pidFile = path_1.default.join(XV_PENDING_DIR, 'scrape.pid');
    const logFile = path_1.default.join(XV_PENDING_DIR, 'scrape.log');
    const resultFile = path_1.default.join(XV_PENDING_DIR, 'scrape.result');
    fs_1.default.mkdirSync(XV_PENDING_DIR, { recursive: true });
    try {
        if (fs_1.default.existsSync(pidFile)) {
            const oldPid = parseInt(fs_1.default.readFileSync(pidFile, 'utf8').trim(), 10);
            if (oldPid && !isNaN(oldPid)) {
                try {
                    process.kill(oldPid, 'SIGTERM');
                }
                catch { /* already exited */ }
            }
            fs_1.default.unlinkSync(pidFile);
        }
    }
    catch { }
    // Use the v_track venv (it has playwright + browsers installed).
    const venvActivate = path_1.default.join(XV_CONFIG_DIR, 'venv', 'bin', 'activate');
    const scriptArgs = ['--from-date', date, '--headless'];
    const logStream = fs_1.default.createWriteStream(logFile, { flags: 'w' });
    logStream.write(`=== X-V scrape for ${date} started ${new Date().toISOString()} ===\n`);
    // Spawn via shell so `source venv/bin/activate` works.
    const child = (0, child_process_1.spawn)('bash', ['-c', `source ${venvActivate} && python3 ${XV_SCRIPT} ${scriptArgs.join(' ')}`], { cwd: XV_CONFIG_DIR, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const childPid = child.pid;
    let stdoutBuf = '';
    let stderrBuf = '';
    child.stdout?.on('data', (d) => { const s = d.toString(); stdoutBuf += s; logStream.write(s); });
    child.stderr?.on('data', (d) => { const s = d.toString(); stderrBuf += s; logStream.write(s); });
    child.on('close', (code) => {
        logStream.write(`\n=== process ${childPid} exited with code ${code} at ${new Date().toISOString()} ===\n`);
        logStream.end();
        // Determine success / failure and write a result file for the status endpoint.
        let result;
        if (code !== 0) {
            const reason = code === null ? 'Scraper timed out — likely network blocked.' : `Scraper exited with code ${code}.`;
            result = { status: 'failed', error: 'Scrape failed', reason };
            console.error('X-V scrape failed: exit', code);
        }
        else {
            const detection = detectXVScrapeFailure(stdoutBuf, stderrBuf, /Tracking complete!/);
            if (detection.failed) {
                console.error('X-V scrape reported failure:', detection.reason);
                result = { status: 'failed', error: 'Scrape failed', reason: detection.reason };
            }
            else {
                const rowsMatch = stdoutBuf.match(/DB rows:\s*(\d+)/);
                result = { status: 'done', tweets_saved: rowsMatch ? Number(rowsMatch[1]) : undefined };
            }
        }
        try {
            fs_1.default.writeFileSync(resultFile, JSON.stringify({ ...result, date, finished_at: new Date().toISOString() }));
        }
        catch { }
        // Clean up PID file if it still belongs to us.
        try {
            if (fs_1.default.existsSync(pidFile)) {
                const savedPid = parseInt(fs_1.default.readFileSync(pidFile, 'utf8').trim(), 10);
                if (savedPid === childPid)
                    fs_1.default.unlinkSync(pidFile);
            }
        }
        catch { }
    });
    child.on('error', (e) => {
        logStream.write(`\n=== spawn error: ${e.message} ===\n`);
        logStream.end();
        try {
            fs_1.default.writeFileSync(resultFile, JSON.stringify({ status: 'failed', error: 'Spawn failed', reason: e.message, date, finished_at: new Date().toISOString() }));
        }
        catch { }
    });
    // Persist the PID so the status endpoint can report liveness.
    fs_1.default.writeFileSync(pidFile, String(childPid));
    child.unref();
    res.json({ status: 'running', date, message: `Scrape started for ${date}.` });
});
// GET /api/xv/scrape/status — check whether a scrape is in progress and return log tail.
router.get('/xv/scrape/status', (_req, res) => {
    const pidFile = path_1.default.join(XV_PENDING_DIR, 'scrape.pid');
    const logFile = path_1.default.join(XV_PENDING_DIR, 'scrape.log');
    const resultFile = path_1.default.join(XV_PENDING_DIR, 'scrape.result');
    // Check for a finished result first.
    let result = null;
    try {
        if (fs_1.default.existsSync(resultFile)) {
            result = JSON.parse(fs_1.default.readFileSync(resultFile, 'utf8'));
        }
    }
    catch { }
    // Check PID liveness.
    let running = false;
    try {
        if (fs_1.default.existsSync(pidFile)) {
            const pid = parseInt(fs_1.default.readFileSync(pidFile, 'utf8').trim(), 10);
            if (pid && !isNaN(pid)) {
                try {
                    process.kill(pid, 0);
                    running = true;
                }
                catch { /* exited */ }
            }
        }
    }
    catch { }
    // Return the last 3 KB of the log for a progress preview.
    let logTail = '';
    try {
        if (fs_1.default.existsSync(logFile)) {
            const stat = fs_1.default.statSync(logFile);
            const size = stat.size;
            const start = Math.max(0, size - 3072);
            const fd = fs_1.default.openSync(logFile, 'r');
            const buf = Buffer.alloc(size - start);
            fs_1.default.readSync(fd, buf, 0, buf.length, start);
            fs_1.default.closeSync(fd);
            logTail = buf.toString('utf8');
        }
    }
    catch { }
    if (running) {
        res.json({ status: 'running', log: logTail });
        return;
    }
    if (result) {
        // Return the result and clean up the result file if it's done/failed.
        res.json({
            status: result.status || 'done',
            log: logTail,
            tweets_saved: result.tweets_saved,
            error: result.error,
            reason: result.reason,
            date: result.date,
        });
        // Clean up stale result file so it doesn't show up on next page visit.
        try {
            if (fs_1.default.existsSync(resultFile))
                fs_1.default.unlinkSync(resultFile);
        }
        catch { }
        return;
    }
    res.json({ status: 'idle', log: '' });
});
// POST /api/xv/migrate — one-time ingestion of legacy JSON files into the DB.
router.post('/xv/migrate', (_req, res) => {
    if (!fs_1.default.existsSync(XV_SCRIPT)) {
        res.status(500).json({ error: `Scraper script not found: ${XV_SCRIPT}` });
        return;
    }
    const venvActivate = path_1.default.join(XV_CONFIG_DIR, 'venv', 'bin', 'activate');
    const cmd = `source ${venvActivate} && python3 ${XV_SCRIPT} --migrate`;
    (0, child_process_1.exec)(cmd, { cwd: XV_CONFIG_DIR, timeout: 120000 }, (err, stdout, stderr) => {
        if (err) {
            const reason = err.killed
                ? 'Migration timed out (2 min limit).'
                : `Scraper exited with code ${err.code}.`;
            console.error('X-V migrate failed:', err, stderr);
            res.status(502).json({ error: 'Migration failed', reason, detail: (stderr || '').slice(-800) });
            return;
        }
        const detection = detectXVScrapeFailure(stdout, stderr, /Migration done:/);
        if (detection.failed) {
            console.error('X-V migrate reported failure:', detection.reason);
            res.status(502).json({
                error: 'Migration failed',
                reason: detection.reason,
                detail: (stderr || stdout || '').slice(-800),
            });
            return;
        }
        res.json({ message: 'Migration completed', output: stdout });
    });
});
// GET /api/xv/images/:filename — serve tweet images (project-local or legacy).
router.get('/xv/images/:filename', (req, res) => {
    serveXVImage(req.params.filename, res);
});
// GET /api/xv/summaries — list all saved AI summaries
router.get('/xv/summaries', (_req, res) => {
    try {
        const db = (0, database_1.default)();
        const rows = db.prepare(`
      SELECT id, date, overall_summary, key_topics, stock_mentions, ai_company_mentions,
             market_sentiment, notable_images, created_at
      FROM xv_summaries ORDER BY date DESC
    `).all();
        const summaries = rows.map(r => ({
            id: r.id,
            date: r.date,
            overallSummary: r.overall_summary,
            keyTopics: JSON.parse(r.key_topics),
            stockMentions: JSON.parse(r.stock_mentions),
            aiCompanyMentions: JSON.parse(r.ai_company_mentions),
            marketSentiment: r.market_sentiment,
            notableImages: JSON.parse(r.notable_images),
            createdAt: r.created_at,
        }));
        res.json(summaries);
    }
    catch (err) {
        console.error('Failed to load XV summaries:', err.message);
        res.status(500).json({ error: 'Failed to load summaries' });
    }
});
// POST /api/xv/summarize/:date — DeepSeek AI daily summary
router.post('/xv/summarize/:date', async (req, res) => {
    const date = String(req.params.date).trim();
    const customInstructions = String(req.body?.instructions || '').trim();
    // Prefer DB-backed tweet data; fall back to JSON files (legacy).
    const db = (0, database_1.default)();
    let tweetData = null;
    try {
        const rows = db.prepare(`SELECT id, username, text, created_at, replies, retweets, likes, views, url,
              image_urls, image_paths, scraped_at
       FROM xv_tweets
       WHERE date = ?
       ORDER BY created_at DESC`).all(date);
        if (rows.length > 0) {
            const tweets = {};
            const usersTracked = [];
            let latestScrape = '';
            for (const r of rows) {
                if (!tweets[r.username]) {
                    tweets[r.username] = [];
                    usersTracked.push(r.username);
                }
                tweets[r.username].push({
                    id: r.id,
                    text: r.text,
                    created_at: r.created_at,
                    metrics: { replies: r.replies, retweets: r.retweets, likes: r.likes, views: r.views },
                    url: r.url,
                    scraped_at: r.scraped_at,
                    image_urls: (0, shared_1.safeParseStrArray)(r.image_urls),
                    image_paths: (0, shared_1.safeParseStrArray)(r.image_paths),
                });
                if (r.scraped_at && r.scraped_at > latestScrape)
                    latestScrape = r.scraped_at;
            }
            tweetData = {
                metadata: {
                    date,
                    total_tweets: rows.length,
                    users_tracked: usersTracked,
                    scraped_at: latestScrape || new Date().toISOString(),
                    version: '3.0',
                },
                tweets,
            };
        }
    }
    catch (err) {
        console.warn('xv_tweets not readable for summarize, using JSON fallback:', err.message);
    }
    if (!tweetData) {
        tweetData = readTweetsJSON(date);
    }
    if (!tweetData) {
        res.status(404).json({ error: 'No data for this date' });
        return;
    }
    try {
        const users = Object.keys(tweetData.tweets || {});
        if (users.length === 0) {
            res.status(400).json({ error: 'No tweets found for this date' });
            return;
        }
        // Build tweet digest with image info
        const tweetDigest = [];
        const imageFiles = [];
        for (const user of users) {
            const tweets = tweetData.tweets[user] || [];
            for (const t of tweets) {
                const time = new Date(t.created_at).toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' });
                const imgCount = (t.image_paths || []).length;
                tweetDigest.push(`[@${user} ${time}] ${t.text || '(image/video post)'}${imgCount > 0 ? ` [has ${imgCount} image(s)]` : ''}`);
                if (t.image_paths && t.image_paths.length > 0) {
                    for (const ip of t.image_paths) {
                        imageFiles.push({ filename: ip.split('/').pop(), user, tweetId: t.id });
                    }
                }
            }
        }
        // Build image info for prompt (DeepSeek deepseek-chat is text-only, no vision)
        const imageInfo = [];
        for (const img of imageFiles.slice(0, 20)) {
            imageInfo.push(`- @${img.user} (tweet ${img.tweetId}): has an attached image`);
        }
        const apiKey = process.env.DEEPSEEK_API_KEY;
        if (!apiKey) {
            res.status(500).json({ error: 'Missing DEEPSEEK_API_KEY' });
            return;
        }
        const client = new openai_1.default({ apiKey, baseURL: 'https://api.deepseek.com' });
        const systemPrompt = `You are an expert financial analyst specializing in stock markets, AI industry, and tech trends.
Always respond in Chinese (simplified).
You MUST respond with valid JSON only, no markdown, no code fences.`;
        const userPrompt = `Please analyze the following tweets from Big-V (influential) accounts for ${date}.
These are tweets from influential tech/finance accounts on X (Twitter).

## All Tweets
${tweetDigest.join('\n\n')}

${imageInfo.length > 0 ? `\n## Images\n${imageInfo.join('\n')}\n` : ''}

${customInstructions ? `## Custom Instructions\n${customInstructions}\n\n` : ''}## Default Instructions
Based on ALL the tweets above, provide a comprehensive daily summary.

1. Focus especially on:
   - Any stocks, companies, or tickers mentioned (with context)
   - AI companies and AI industry developments
   - Market sentiment and trends
2. For each mentioned stock/company, note which tweet(s) mentioned it (source attribution).
3. If tweets mention charts or visual data, note that in notableImages.

Respond with ONLY a JSON object in this exact format:
{
  "overallSummary": "\u5168\u6587\u7efc\u8ff0\uff0c2-4\u53e5\u8bdd\u603b\u7ed3\u4eca\u65e5\u6240\u6709\u63a8\u6587\u7684\u6838\u5fc3\u5185\u5bb9\uff0c\u5305\u62ec\u56fe\u7247\u4e2d\u7684\u4fe1\u606f",
  "keyTopics": ["\u4e3b\u98981", "\u4e3b\u98982", ...],
  "stockMentions": [
    {"name": "\u516c\u53f8/\u80a1\u7968\u540d\u79f0", "summary": "\u76f8\u5173\u4fe1\u606f\u603b\u7ed3", "sources": [{"user": "@username", "tweetId": "id", "snippet": "\u539f\u6587\u6458\u8981"}]}
  ],
  "aiCompanyMentions": [
    {"name": "AI\u516c\u53f8\u540d\u79f0", "summary": "\u76f8\u5173\u4fe1\u606f\u603b\u7ed3", "sources": [{"user": "@username", "tweetId": "id", "snippet": "\u539f\u6587\u6458\u8981"}]}
  ],
  "marketSentiment": "\u5e02\u573a\u60c5\u7eea\u5224\u65ad\uff1a\u770b\u591a/\u770b\u7a7a/\u4e2d\u6027\uff0c\u52a0\u7b80\u77ed\u7406\u7531",
  "notableImages": [{"user": "@username", "tweetId": "id", "description": "\u56fe\u7247\u5185\u5bb9\u63cf\u8ff0"}]
}`;
        const completion = await client.chat.completions.create({
            model: 'deepseek-chat',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            temperature: 0.3,
            max_tokens: 8000,
        });
        const content = completion.choices?.[0]?.message?.content || '';
        let jsonStr = typeof content === 'string' ? content : JSON.stringify(content);
        const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (fenceMatch)
            jsonStr = fenceMatch[1].trim();
        // Try parsing, and if truncated, attempt to repair the JSON
        let result;
        try {
            result = JSON.parse(jsonStr);
        }
        catch (parseErr) {
            // Attempt to fix truncated JSON by closing open structures
            console.warn('X-V summarize JSON parse failed, attempting repair...');
            let repaired = jsonStr;
            // Remove trailing incomplete string (after last unescaped quote)
            const lastQuoteIdx = repaired.lastIndexOf('"');
            // Find the last well-formed key-value pair by looking for closing patterns
            // Strategy: truncate to last complete array element or object property
            // Try progressively shorter truncations
            for (let attempts = 0; attempts < 10; attempts++) {
                // Remove trailing incomplete content after last } or ]
                const lastBrace = repaired.lastIndexOf('}');
                const lastBracket = repaired.lastIndexOf(']');
                const lastClose = Math.max(lastBrace, lastBracket);
                if (lastClose > 0) {
                    repaired = repaired.substring(0, lastClose + 1);
                }
                // Count open/close brackets to figure out what's missing
                let openBraces = 0, openBrackets = 0;
                let inStr = false, escaped = false;
                for (let i = 0; i < repaired.length; i++) {
                    const ch = repaired[i];
                    if (escaped) {
                        escaped = false;
                        continue;
                    }
                    if (ch === '\\') {
                        escaped = true;
                        continue;
                    }
                    if (ch === '"') {
                        inStr = !inStr;
                        continue;
                    }
                    if (inStr)
                        continue;
                    if (ch === '{')
                        openBraces++;
                    if (ch === '}')
                        openBraces--;
                    if (ch === '[')
                        openBrackets++;
                    if (ch === ']')
                        openBrackets--;
                }
                // Close missing brackets
                for (let b = 0; b < openBrackets; b++)
                    repaired += ']';
                for (let b = 0; b < openBraces; b++)
                    repaired += '}';
                try {
                    result = JSON.parse(repaired);
                    console.warn('X-V summarize JSON repaired successfully after truncation');
                    break;
                }
                catch (e) {
                    // Remove the last element and try again
                    const idx = repaired.lastIndexOf(',');
                    if (idx > 0) {
                        repaired = repaired.substring(0, idx);
                    }
                    else {
                        throw parseErr;
                    }
                }
            }
            if (!result)
                throw parseErr;
        }
        result.date = date;
        // Save to database (upsert by date)
        try {
            const db = (0, database_1.default)();
            db.prepare(`
        INSERT INTO xv_summaries (date, overall_summary, key_topics, stock_mentions, ai_company_mentions, market_sentiment, notable_images)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(date) DO UPDATE SET
          overall_summary = excluded.overall_summary,
          key_topics = excluded.key_topics,
          stock_mentions = excluded.stock_mentions,
          ai_company_mentions = excluded.ai_company_mentions,
          market_sentiment = excluded.market_sentiment,
          notable_images = excluded.notable_images
      `).run(date, result.overallSummary || '', JSON.stringify(result.keyTopics || []), JSON.stringify(result.stockMentions || []), JSON.stringify(result.aiCompanyMentions || []), result.marketSentiment || '', JSON.stringify(result.notableImages || []));
        }
        catch (dbErr) {
            console.error('Failed to save XV summary to DB:', dbErr.message);
            // Don't fail the request - just log the error
        }
        res.json(result);
    }
    catch (err) {
        console.error('X-V summarize failed:', err.message);
        res.status(500).json({ error: `AI summary failed: ${err.message?.slice(0, 500)}` });
    }
});
exports.default = router;
//# sourceMappingURL=xv.js.map