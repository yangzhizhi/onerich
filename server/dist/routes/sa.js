"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const openai_1 = __importDefault(require("openai"));
const dotenv_1 = __importDefault(require("dotenv"));
const logger_1 = require("../services/logger");
const scriptRunner_1 = require("../services/scriptRunner");
const shared_1 = require("./shared");
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '..', '..', '.env') });
const router = (0, express_1.Router)();
// ---- Project-local data directories ----
// All S-A cached data lives under server/data/sa/.
const SA_DATA_DIR = path_1.default.join(shared_1.PROJECT_ROOT, 'data', 'sa');
const SA_SENTIMENT_DIR = path_1.default.join(SA_DATA_DIR, 'sentiment');
const LB_SCRIPT_DIR = shared_1.STOCK_PRICE_DIR;
// Helper: run a Longbridge Python script and return parsed JSON
async function runLongbridgeScript(pythonScript) {
    const cmd = `source ${LB_SCRIPT_DIR}/venv/bin/activate && python3 << 'LBEOF'
${pythonScript}
LBEOF`;
    try {
        const { stdout, stderr } = await (0, scriptRunner_1.runScript)(cmd, {
            type: 'longbridge',
            timeout: 120000,
        });
        if (stderr)
            (0, logger_1.logError)('Python stderr', { stderr: stderr.slice(0, 500) });
        const jsonStartBrace = stdout.indexOf('{');
        const jsonStartBracket = stdout.indexOf('[');
        let jsonStart;
        if (jsonStartBrace === -1)
            jsonStart = jsonStartBracket;
        else if (jsonStartBracket === -1)
            jsonStart = jsonStartBrace;
        else
            jsonStart = Math.min(jsonStartBrace, jsonStartBracket);
        if (jsonStart === -1) {
            throw new Error('No JSON found in script output');
        }
        const openChar = stdout[jsonStart];
        const closeChar = openChar === '{' ? '}' : ']';
        const jsonEnd = stdout.lastIndexOf(closeChar);
        if (jsonEnd <= jsonStart) {
            throw new Error('Malformed JSON in script output');
        }
        return JSON.parse(stdout.substring(jsonStart, jsonEnd + 1));
    }
    catch (err) {
        throw new Error(err.message?.slice(0, 500) || 'Python script failed');
    }
}
// Helper: map stock code to Longbridge symbol format
function toLBSymbol(code) {
    if (code.includes('.'))
        return code;
    return `${code}.US`;
}
// GET /api/sa/stock/:symbol - Fetch stock profile + quote + 12M candle via Longbridge
router.get('/sa/stock/:symbol', async (req, res) => {
    const symbol = String(req.params.symbol).trim();
    if (!symbol) {
        res.status(400).json({ error: 'Symbol is required' });
        return;
    }
    const lbSymbol = toLBSymbol(symbol);
    const pythonScript = `
import sys, json, os
from datetime import date
from dotenv import load_dotenv
load_dotenv('${shared_1.STOCK_PRICE_DIR}/.env')
from longbridge.openapi import QuoteContext, Config, OAuthBuilder, Period, AdjustType

def silent(url): pass
client_id = os.getenv('LONGBRIDGE_CLIENT_ID')
if not client_id:
    print(json.dumps({"error": "Missing LONGBRIDGE_CLIENT_ID"}))
    sys.exit(0)
try:
    oauth = OAuthBuilder(client_id).build(silent)
    config = Config.from_oauth(oauth)
    ctx = QuoteContext(config)

    # Static info (company profile)
    infos = ctx.static_info(['${lbSymbol}'])
    info = infos[0] if infos else None
    profile = {}
    if info:
        profile = {
            'symbol': '${lbSymbol}',
            'name': getattr(info, 'name_en', '') or '',
            'name_cn': getattr(info, 'name_cn', '') or '',
            'exchange': getattr(info, 'exchange', '') or '',
            'currency': getattr(info, 'currency', '') or '',
            'lot_size': int(getattr(info, 'lot_size', 0) or 0),
            'total_shares': int(getattr(info, 'total_shares', 0) or 0),
            'circulating_shares': int(getattr(info, 'circulating_shares', 0) or 0),
            'eps': float(getattr(info, 'eps', 0) or 0),
            'eps_ttm': float(getattr(info, 'eps_ttm', 0) or 0),
            'bps': float(getattr(info, 'bps', 0) or 0),
            'dividend_yield': float(getattr(info, 'dividend_yield', 0) or 0),
            'board': str(getattr(info, 'board', '')) or '',
        }

    # Real-time quote
    quotes = ctx.quote(['${lbSymbol}'])
    q = quotes[0] if quotes else None
    quote = {}
    if q:
        quote = {
            'last_done': str(q.last_done),
            'prev_close': str(q.prev_close),
            'open': str(q.open),
            'high': str(q.high),
            'low': str(q.low),
            'volume': int(q.volume) if q.volume else 0,
            'turnover': str(q.turnover),
            'timestamp': str(q.timestamp) if q.timestamp else '',
        }

    # 12-month daily candle
    end = date.today()
    start = date(end.year - 1, end.month, end.day)
    candles = ctx.history_candlesticks_by_date('${lbSymbol}', Period.Day, AdjustType.NoAdjust, start, end)
    candle_data = []
    for c in candles:
        ts = c.timestamp
        d = str(ts).split(' ')[0] if ts else ''
        candle_data.append({'date': d, 'open': str(c.open), 'high': str(c.high), 'low': str(c.low), 'close': str(c.close), 'volume': int(c.volume) if c.volume else 0})

    result = {'profile': profile, 'quote': quote, 'candles': candle_data}
    print(json.dumps(result))
except Exception as e:
    print(json.dumps({'error': str(e)}))
`;
    try {
        const data = await runLongbridgeScript(pythonScript);
        if (data.error) {
            console.error('Longbridge error:', data.error);
            res.status(500).json({ error: data.error });
            return;
        }
        res.json(data);
    }
    catch (err) {
        console.error('Longbridge fetch failed:', err.message);
        res.status(500).json({ error: 'Failed to fetch stock data', detail: err.message?.slice(0, 200) });
    }
});
// GET /api/sa/candles/:symbol?period=1h|2h|3h|4h|day - Fetch candle data at different timeframes
router.get('/sa/candles/:symbol', async (req, res) => {
    const symbol = String(req.params.symbol).trim();
    const period = String(req.query.period || 'day').trim().toLowerCase();
    if (!symbol) {
        res.status(400).json({ error: 'Symbol is required' });
        return;
    }
    const validPeriods = ['day', '1h', '2h', '3h', '4h'];
    if (!validPeriods.includes(period)) {
        res.status(400).json({ error: `Invalid period. Must be one of: ${validPeriods.join(', ')}` });
        return;
    }
    const lbSymbol = toLBSymbol(symbol);
    // Map period to Longbridge Period class
    const periodMap = {
        'day': 'Period.Day',
        '1h': 'Period.Min_60',
        '2h': 'Period.Min_120',
        '3h': 'Period.Min_180',
        '4h': 'Period.Min_240',
    };
    const lbPeriod = periodMap[period];
    const pythonScript = `
import sys, json, os
from datetime import date, timedelta
from dotenv import load_dotenv
load_dotenv('${shared_1.STOCK_PRICE_DIR}/.env')
from longbridge.openapi import QuoteContext, Config, OAuthBuilder, Period, AdjustType

def silent(url): pass
client_id = os.getenv('LONGBRIDGE_CLIENT_ID')
if not client_id:
    print(json.dumps({"error": "Missing LONGBRIDGE_CLIENT_ID"}))
    sys.exit(0)
try:
    oauth = OAuthBuilder(client_id).build(silent)
    config = Config.from_oauth(oauth)
    ctx = QuoteContext(config)

    end = date.today()
    # Calculate start date to limit to ~365 candles max
    if '${period}' == 'day':
        start = end - timedelta(days=400)
    else:
        # Intraday: 365 candles. Each day has ~4-8 candles for hourly periods.
        # Use enough days to cover ~365 candles, with margin.
        start = end - timedelta(days=500)

    candles = ctx.history_candlesticks_by_date('${lbSymbol}', ${lbPeriod}, AdjustType.NoAdjust, start, end)
    candle_data = []
    for c in candles:
        ts = c.timestamp
        if '${period}' == 'day':
            d = str(ts).split(' ')[0] if ts else ''
        else:
            # Intraday: include time in the date string for proper display
            ts_str = str(ts)
            d = ts_str[:16].replace('T', ' ') if ts else ''
        candle_data.append({'date': d, 'open': str(c.open), 'high': str(c.high), 'low': str(c.low), 'close': str(c.close), 'volume': int(c.volume) if c.volume else 0})

    # Limit to last 365 candles
    if len(candle_data) > 365:
        candle_data = candle_data[-365:]

    print(json.dumps({'candles': candle_data}))
except Exception as e:
    print(json.dumps({'error': str(e)}))
`;
    try {
        const data = await runLongbridgeScript(pythonScript);
        if (data.error) {
            console.error('Longbridge candle error:', data.error);
            res.status(500).json({ error: data.error });
            return;
        }
        res.json(data);
    }
    catch (err) {
        console.error('Longbridge candle fetch failed:', err.message);
        res.status(500).json({ error: 'Failed to fetch candle data', detail: err.message?.slice(0, 200) });
    }
});
// GET /api/sa/indicators/:symbol?period=day|1h|2h|4h&count=120 - Run kline technical indicator analysis + gap analysis
router.get('/sa/indicators/:symbol', async (req, res) => {
    const symbol = String(req.params.symbol).trim();
    const period = String(req.query.period || 'day').trim().toLowerCase();
    const count = Math.min(Math.max(parseInt(String(req.query.count)) || 120, 30), 1024);
    if (!symbol) {
        res.status(400).json({ error: 'Symbol is required' });
        return;
    }
    const lbSymbol = toLBSymbol(symbol);
    // Map period to Longbridge Period class
    const periodMap = {
        'day': 'Period.Day',
        '1h': 'Period.Min_60',
        '2h': 'Period.Min_120',
        '4h': 'Period.Min_240',
    };
    const lbPeriod = periodMap[period] || 'Period.Day';
    const pythonScript = `
import sys, json, os
from datetime import date, timedelta, datetime, timezone
from dotenv import load_dotenv
load_dotenv('${shared_1.STOCK_PRICE_DIR}/.env')
from longbridge.openapi import QuoteContext, Config, OAuthBuilder, Period, AdjustType

def silent(url): pass
client_id = os.getenv('LONGBRIDGE_CLIENT_ID')
if not client_id:
    print(json.dumps({"error": "Missing LONGBRIDGE_CLIENT_ID"}))
    sys.exit(0)
try:
    oauth = OAuthBuilder(client_id).build(silent)
    config = Config.from_oauth(oauth)
    ctx = QuoteContext(config)

    # Fetch candles with selected period
    resp = ctx.candlesticks('${lbSymbol}', ${lbPeriod}, ${count}, AdjustType.NoAdjust)
    candles = []
    for c in resp:
        ts = c.timestamp
        if hasattr(ts, 'date'):
            d = str(ts.date())
        elif isinstance(ts, int) and ts > 0:
            d = str(datetime.fromtimestamp(ts, tz=timezone.utc).date())
        else:
            d = str(ts).split(' ')[0]
        candles.append({
            'date': d,
            'open': float(c.open),
            'high': float(c.high),
            'low': float(c.low),
            'close': float(c.close),
            'volume': int(c.volume) if c.volume else 0,
            'turnover': float(c.turnover) if c.turnover else 0.0,
        })

    if not candles:
        print(json.dumps({'error': 'No candle data returned'}))
        sys.exit(0)

    # Run indicator analysis
    sys.path.insert(0, '${shared_1.KLINE_DIR}')
    from models import Candle
    from indicators import analyze_all, analyze_gaps

    candle_objs = []
    for c in candles:
        candle_objs.append(Candle(
            date=datetime.strptime(c['date'], '%Y-%m-%d').date(),
            open=c['open'], high=c['high'], low=c['low'], close=c['close'],
            volume=c['volume'], turnover=c['turnover']
        ))

    result = analyze_all(candle_objs)

    # Run gap analysis
    gaps = analyze_gaps('${lbSymbol}', candle_objs)
    gap_data = []
    for g in gaps:
        gap_data.append({
            'direction': g.direction.value,
            'gapType': g.gap_type.value if g.gap_type else 'unknown',
            'status': g.status.value,
            'date': str(g.date),
            'upperBound': g.upper_bound,
            'lowerBound': g.lower_bound,
            'gapSize': g.gap_size,
            'gapSizePct': g.gap_size_pct,
            'filledDate': str(g.filled_date) if g.filled_date else None,
        })

    # Serialize signals
    signals = {}
    for ind_name, ind_signals in result['signals'].items():
        serialized = []
        for s in ind_signals:
            serialized.append({
                'indicator': s.indicator,
                'date': str(s.date),
                'value': s.value,
                'signal': s.signal,
                'description': s.description,
            })
        signals[ind_name] = serialized

    composite = result['composite']

    print(json.dumps({'signals': signals, 'composite': composite, 'gaps': gap_data, 'period': '${period}'}))
except Exception as e:
    import traceback
    traceback.print_exc()
    print(json.dumps({'error': str(e)}))
`;
    try {
        const data = await runLongbridgeScript(pythonScript);
        if (data.error) {
            console.error('Indicator analysis error:', data.error);
            res.status(500).json({ error: data.error });
            return;
        }
        res.json(data);
    }
    catch (err) {
        console.error('Indicator analysis failed:', err.message);
        res.status(500).json({ error: 'Failed to run indicator analysis', detail: err.message?.slice(0, 200) });
    }
});
// ===== S-A Sentiment Analysis (Zhipu Web Search + DeepSeek) =====
// Zhipu web search: uses GLM-4-flash with web_search tool
async function searchNewsZhipu(query) {
    const apiKey = process.env.ZHIPU_API_KEY;
    if (!apiKey)
        throw new Error('Missing ZHIPU_API_KEY');
    const resp = await fetch('https://open.bigmodel.cn/api/paas/v4/tools', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'glm-4-flash',
            messages: [{ role: 'user', content: query }],
            tools: [{ type: 'web_search', web_search: { enable: true, search_result: true } }],
            stream: false,
        }),
    });
    if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        throw new Error(`Zhipu API error ${resp.status}: ${errText.slice(0, 300)}`);
    }
    const data = await resp.json();
    const sources = [];
    // Extract search results from the response
    const choices = data?.choices || [];
    for (const choice of choices) {
        const toolCalls = choice?.message?.tool_calls || [];
        for (const tc of toolCalls) {
            if (tc.type === 'web_search' && tc.web_search) {
                const results = tc.web_search.search_result || [];
                for (const r of results) {
                    sources.push({
                        title: r.title || '',
                        url: r.link || r.url || '',
                        snippet: r.content || r.snippet || '',
                    });
                }
            }
        }
        // Also check for web_search_results in message metadata
        const wsResults = choice?.message?.web_search_results || [];
        for (const r of wsResults) {
            sources.push({
                title: r.title || '',
                url: r.link || r.url || '',
                snippet: r.content || r.snippet || '',
            });
        }
    }
    return sources;
}
// DeepSeek analysis using OpenAI-compatible API
async function analyzeWithDeepSeek(profile, quote, candles, news, indicators) {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey)
        throw new Error('Missing DEEPSEEK_API_KEY');
    const client = new openai_1.default({ apiKey, baseURL: 'https://api.deepseek.com' });
    // Summarize last 30 days of price data
    const recent = candles.slice(-30);
    const priceSummary = recent.map(c => `${c.date}: Open=${c.open}, High=${c.high}, Low=${c.low}, Close=${c.close}, Vol=${c.volume}`).join('\n');
    // Calculate some basic stats
    const prices = recent.map(c => parseFloat(c.close));
    const avgPrice = prices.length > 0 ? (prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2) : 'N/A';
    const lastPrice = prices.length > 0 ? prices[prices.length - 1] : 0;
    const firstPrice = prices.length > 0 ? prices[0] : 0;
    const priceChange = firstPrice > 0 ? (((lastPrice - firstPrice) / firstPrice) * 100).toFixed(2) : 'N/A';
    const newsText = news.map((n, i) => `[${i + 1}] ${n.title}\n${n.snippet}`).join('\n\n');
    // Build indicator summary text
    let indicatorText = '';
    if (indicators && indicators.composite) {
        const comp = indicators.composite;
        indicatorText = `\n## Technical Indicator Analysis (from K-line toolkit)\n- Composite Score: ${comp.score} (range -100 to +100)\n- Direction: ${comp.direction}\n- Confidence: ${comp.confidence}%\n`;
        if (comp.details && comp.details.length > 0) {
            indicatorText += '- Per-indicator signals:\n';
            for (const d of comp.details) {
                indicatorText += `  - ${d.indicator}: ${d.signal} - ${d.description}\n`;
            }
        }
    }
    const systemPrompt = `You are a professional financial analyst with deep expertise in technical analysis and market sentiment.
Always respond in Chinese (simplified).
You MUST respond with valid JSON only, no markdown, no code fences.`;
    const userPrompt = `Perform a comprehensive analysis of the following stock. Provide trend judgment, buy/sell timing, and price targets.

## Company Profile
- Name: ${profile?.name || 'N/A'} (${profile?.name_cn || ''})
- Symbol: ${profile?.symbol || 'N/A'}
- Exchange: ${profile?.exchange || 'N/A'}
- EPS(TTM): ${profile?.eps_ttm || 'N/A'}

## Current Quote
- Last Price: ${quote?.last_done || 'N/A'}
- Previous Close: ${quote?.prev_close || 'N/A'}
- Day High/Low: ${quote?.high || 'N/A'} / ${quote?.low || 'N/A'}
- Volume: ${quote?.volume || 'N/A'}

## Price Trend (Last 30 days)
30-day average: ${avgPrice}
30-day change: ${priceChange}%

${priceSummary}
${indicatorText}
## Recent News
${newsText || 'No recent news found.'}

## Instructions
Based on ALL the data above (price action, technical indicators, and news), provide a comprehensive analysis.
Respond with ONLY a JSON object in this exact format:
{
  "sentiment": "bullish" or "bearish" or "neutral",
  "confidence": <number 0-100>,
  "summary": "<2-3 sentence overall assessment>",
  "trendAnalysis": "<detailed trend analysis combining price action and technical indicators>",
  "entryPoint": "<recommended entry/buy price or timing, e.g. '\u5efa\u8bae\u5728$XX\u9644\u8fd1\u4f4d\u7f6e\u4e70\u5165' or '\u6301\u7eed\u7b49\u5f85\uff0c\u5efa\u8bae\u89c2\u671b' >",
  "takeProfit": "<take-profit target price, e.g. '\u6b62\u76c8\u4f4d$XX' >",
  "stopLoss": "<stop-loss price, e.g. '\u6b62\u635f\u4f4d$XX' >",
  "riskLevel": "<high/medium/low with brief reason>",
  "keyDrivers": ["<driver 1>", "<driver 2>", ...],
  "risks": ["<risk 1>", "<risk 2>", ...],
  "outlook": "<short-term outlook in 1-2 sentences>"
}`;
    const completion = await client.chat.completions.create({
        model: 'deepseek-chat',
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 3000,
    });
    const content = completion.choices?.[0]?.message?.content || '';
    // Try to parse JSON from the response (handle potential markdown fences)
    let jsonStr = content.trim();
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch)
        jsonStr = fenceMatch[1].trim();
    return JSON.parse(jsonStr);
}
// GET /api/sa/sentiments — list all cached sentiment analyses.
router.get('/sa/sentiments', (_req, res) => {
    try {
        if (!fs_1.default.existsSync(SA_SENTIMENT_DIR)) {
            res.json([]);
            return;
        }
        const files = fs_1.default.readdirSync(SA_SENTIMENT_DIR).filter(f => f.endsWith('.json'));
        const result = [];
        for (const f of files) {
            try {
                const raw = JSON.parse(fs_1.default.readFileSync(path_1.default.join(SA_SENTIMENT_DIR, f), 'utf8'));
                result.push({
                    symbol: raw.symbol,
                    date: raw.date,
                    sentiment: raw.sentiment,
                    confidence: raw.confidence,
                    summary: raw.summary,
                    cached_at: raw.cached_at,
                });
            }
            catch { }
        }
        result.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        res.json(result);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to list sentiments', detail: err.message });
    }
});
// GET /api/sa/sentiment/:symbol — get the most recent cached sentiment for a symbol.
router.get('/sa/sentiment/:symbol', (req, res) => {
    const symbol = String(req.params.symbol).trim().toUpperCase();
    if (!symbol) {
        res.status(400).json({ error: 'Symbol is required' });
        return;
    }
    try {
        if (!fs_1.default.existsSync(SA_SENTIMENT_DIR)) {
            res.status(404).json({ error: 'No cached sentiment data' });
            return;
        }
        // Find the most recent file for this symbol.
        const files = fs_1.default.readdirSync(SA_SENTIMENT_DIR)
            .filter(f => f.startsWith(`${symbol}-`) && f.endsWith('.json'))
            .sort().reverse();
        if (files.length === 0) {
            res.status(404).json({ error: `No cached sentiment for ${symbol}` });
            return;
        }
        const raw = JSON.parse(fs_1.default.readFileSync(path_1.default.join(SA_SENTIMENT_DIR, files[0]), 'utf8'));
        res.json(raw);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to read sentiment', detail: err.message });
    }
});
// POST /api/sa/sentiment/:symbol - Sentiment analysis via Zhipu + DeepSeek
// Results are cached in server/data/sa/sentiment/SYMBOL-YYYY-MM-DD.json.
// Pass { forceRefresh: true } in the body to bypass the cache.
router.post('/sa/sentiment/:symbol', async (req, res) => {
    const symbol = String(req.params.symbol).trim();
    if (!symbol) {
        res.status(400).json({ error: 'Symbol is required' });
        return;
    }
    const { profile, quote, candles, indicators, forceRefresh } = req.body || {};
    // Check cache first (unless forceRefresh is requested).
    const today = (0, shared_1.bjDateString)();
    const cacheFile = path_1.default.join(SA_SENTIMENT_DIR, `${symbol.toUpperCase()}-${today}.json`);
    if (!forceRefresh && fs_1.default.existsSync(cacheFile)) {
        try {
            const cached = JSON.parse(fs_1.default.readFileSync(cacheFile, 'utf8'));
            console.log(`S-A sentiment cache hit for ${symbol} (${today})`);
            res.json({ ...cached, cached: true });
            return;
        }
        catch {
            // Corrupt cache file — fall through to live analysis.
        }
    }
    if (!profile || !candles) {
        res.status(400).json({ error: 'Missing stock data (profile, candles required)' });
        return;
    }
    try {
        // Step 1: Search for recent news via Zhipu
        const searchQuery = `${profile.name || symbol} ${symbol} stock news 2025`;
        console.log('Searching news:', searchQuery);
        let news = [];
        try {
            news = await searchNewsZhipu(searchQuery);
            console.log(`Found ${news.length} news articles`);
        }
        catch (err) {
            console.error('Zhipu search failed:', err.message);
            // Continue without news
        }
        // Step 2: Analyze with DeepSeek
        console.log('Analyzing with DeepSeek...');
        const analysis = await analyzeWithDeepSeek(profile, quote, candles, news, indicators);
        const result = {
            symbol: symbol.toUpperCase(),
            date: today,
            cached_at: new Date().toISOString(),
            ...analysis,
            sources: news.slice(0, 10),
        };
        // Save to cache.
        try {
            fs_1.default.mkdirSync(SA_SENTIMENT_DIR, { recursive: true });
            fs_1.default.writeFileSync(cacheFile, JSON.stringify(result, null, 2));
            (0, logger_1.logInfo)('S-A sentiment cached', { symbol: symbol.toUpperCase(), date: today });
        }
        catch (err) {
            console.error('S-A sentiment cache write failed:', err);
        }
        res.json(result);
    }
    catch (err) {
        console.error('Sentiment analysis failed:', err.message);
        res.status(500).json({ error: 'Sentiment analysis failed', detail: err.message?.slice(0, 300) });
    }
});
exports.default = router;
//# sourceMappingURL=sa.js.map