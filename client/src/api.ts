import type { StockData, StockCandle, SentimentResult, IndicatorAnalysis, XVDailySummary, XVScrapeStatus, ORReport, ORReportDetail, ORResearchStatus, ORActiveTask } from './types';

const API_BASE = '/api';

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (res.status === 204) return null as T;
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'API Error');
  }
  return res.json();
}

export const api = {
  // X-V
  getXVDates: () => fetchJSON<string[]>('/xv/dates'),

  getXVTweets: (date: string) => fetchJSON<any>(`/xv/tweets/${date}`),

  triggerXVScrape: (date?: string) => fetchJSON<{ status: string; date?: string; message?: string }>('/xv/scrape', { method: 'POST', body: JSON.stringify(date ? { date } : {}) }),

  getXVScrapeStatus: () => fetchJSON<XVScrapeStatus>('/xv/scrape/status'),

  // X-V Daily AI Summary (DeepSeek)
  summarizeXV: (date: string, instructions?: string) => fetchJSON<XVDailySummary>(`/xv/summarize/${date}`, {
    method: 'POST',
    body: JSON.stringify(instructions ? { instructions } : {}),
  }),

  // X-V Get saved summaries
  getXVSummaries: () => fetchJSON<XVDailySummary[]>('/xv/summaries'),

  // S-A Stock Analysis (Longbridge)
  getStockData: (symbol: string) => fetchJSON<StockData>(`/sa/stock/${encodeURIComponent(symbol)}`),

  // S-A Candles at different timeframes (1h, 2h, 3h, 4h, day)
  getStockCandles: (symbol: string, period: string) =>
    fetchJSON<{ candles: StockCandle[] }>(`/sa/candles/${encodeURIComponent(symbol)}?period=${encodeURIComponent(period)}`),

  // S-A Technical Indicators (kline analysis)
  getIndicators: (symbol: string, period: string = 'day', count: number = 120) =>
    fetchJSON<IndicatorAnalysis>(`/sa/indicators/${encodeURIComponent(symbol)}?period=${encodeURIComponent(period)}&count=${count}`),

  // S-A Sentiment Analysis (Zhipu + DeepSeek)
  analyzeSentiment: (symbol: string, stockData: StockData, indicators?: IndicatorAnalysis) =>
    fetchJSON<SentimentResult>(`/sa/sentiment/${encodeURIComponent(symbol)}`, {
      method: 'POST',
      body: JSON.stringify({ ...stockData, indicators }),
    }),

  // O-R (OneRich) — research report browser
  getORReports: () => fetchJSON<ORReport[]>('/or/reports'),

  getORReport: (date: string, ticker: string) =>
    fetchJSON<ORReportDetail>(`/or/report/${encodeURIComponent(date)}/${encodeURIComponent(ticker)}`),

  triggerORResearch: (ticker: string) =>
    fetchJSON<{ status: string; ticker: string; mode: string; started_at: string; onerich_dir: string; message: string }>('/or/research', {
      method: 'POST',
      body: JSON.stringify({ ticker }),
    }),

  // O-R research status polling (headless qodercli progress)
  getORResearchStatus: (ticker: string) =>
    fetchJSON<ORResearchStatus>(`/or/research/status/${encodeURIComponent(ticker)}`),

  // O-R list all active/running research tasks (for restoring UI state)
  getORActiveResearch: () =>
    fetchJSON<ORActiveTask[]>('/or/research/active'),
};
