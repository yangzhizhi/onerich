// ============ S-A (Stock Analysis) Types ============

export interface LBProfile {
  symbol: string;
  name: string;
  name_cn: string;
  exchange: string;
  currency: string;
  lot_size: number;
  total_shares: number;
  circulating_shares: number;
  eps: number;
  eps_ttm: number;
  bps: number;
  dividend_yield: number;
  board: string;
}

export interface LBQuote {
  last_done: string;
  prev_close: string;
  open: string;
  high: string;
  low: string;
  volume: number;
  turnover: string;
  timestamp: string;
}

export interface StockCandle {
  date: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: number;
}

export interface StockData {
  profile: LBProfile;
  quote: LBQuote;
  candles: StockCandle[];
}

export interface SentimentResult {
  sentiment: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  summary: string;
  keyDrivers: string[];
  risks: string[];
  outlook: string;
  sources: { title: string; url: string; snippet: string }[];
  // Enhanced AI analysis fields
  trendAnalysis?: string;
  entryPoint?: string;
  takeProfit?: string;
  stopLoss?: string;
  riskLevel?: string;
}

export interface IndicatorSignal {
  indicator: string;
  date: string;
  value: number;
  signal: 'bullish' | 'bearish' | 'neutral';
  description: string;
  extra?: Record<string, number>;
}

export interface CompositeScore {
  score: number;
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  details: { indicator: string; signal: string; description: string; weight: number }[];
}

export interface GapInfo {
  direction: 'bullish' | 'bearish';
  gapType: string;
  status: 'filled' | 'unfilled';
  date: string;
  upperBound: number;
  lowerBound: number;
  gapSize: number;
  gapSizePct: number;
  filledDate: string | null;
}

export interface IndicatorAnalysis {
  signals: Record<string, IndicatorSignal[]>;
  composite: CompositeScore;
  gaps: GapInfo[];
  period: string;
}

// ============ X-V (X/Twitter Big V Tracker) Types ============

export interface XVStockMention {
  name: string;
  summary: string;
  sources: { user: string; tweetId: string; snippet: string }[];
}

export interface XVDailySummary {
  id?: number;
  date: string;
  overallSummary: string;
  keyTopics: string[];
  stockMentions: XVStockMention[];
  aiCompanyMentions: XVStockMention[];
  marketSentiment: string;
  notableImages: { user: string; tweetId: string; description: string }[];
  createdAt?: string;
}

export interface XVScrapeStatus {
  status: 'idle' | 'running' | 'done' | 'failed';
  log?: string;
  tweets_saved?: number;
  error?: string;
  reason?: string;
  date?: string;
}

// ============ O-R (OneRich Research) Types ============

export interface ORDecisionCard {
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

export interface ORReport extends ORDecisionCard {
  date: string;
  filename: string;
  mtime: string;
}

export interface ORReportDetail {
  date: string;
  ticker: string;
  company: string;
  markdown: string;
  card: ORDecisionCard;
}

export interface ORResearchStatus {
  ticker: string;
  /** "running" | "done" | "idle" | "unknown" */
  status: string;
  /** last ~3 KB of the qodercli headless log */
  log: string;
}

export interface ORActiveTask {
  ticker: string;
  status: string;
}
