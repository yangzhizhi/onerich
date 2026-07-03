import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search,
  TrendingUp,
  Globe,
  Building2,
  DollarSign,
  BarChart3,
  Loader2,
  Activity,
  Brain,
  AlertTriangle,
  Sparkles,
  ExternalLink,
  ChevronRight,
  Shield,
  Target,
  Crosshair,
  Zap,
} from 'lucide-react';
import { createChart, ColorType, CrosshairMode, CandlestickSeries, HistogramSeries, LineSeries } from 'lightweight-charts';
import { api } from '../api';
import type { StockData, StockCandle, SentimentResult, IndicatorAnalysis } from '../types';

function formatShares(value: number): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(2)}K`;
  return value.toLocaleString();
}

function formatNumber(value: number, decimals = 2): string {
  return value.toFixed(decimals);
}

export default function SA() {
  const [query, setQuery] = useState('');
  const [stockData, setStockData] = useState<StockData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Candle period state
  const [candlePeriod, setCandlePeriod] = useState<string>('day');
  const [activeCandles, setActiveCandles] = useState<StockCandle[]>([]);
  const [candleLoading, setCandleLoading] = useState(false);

  // Section 2: Technical Indicators
  const [indicatorPeriod, setIndicatorPeriod] = useState<string>('day');
  const [indicatorCount, setIndicatorCount] = useState<number>(120);
  const [indicatorResult, setIndicatorResult] = useState<IndicatorAnalysis | null>(null);
  const [indicatorLoading, setIndicatorLoading] = useState(false);
  const [indicatorError, setIndicatorError] = useState('');

  // Section 3: AI Analysis
  const [sentiment, setSentiment] = useState<SentimentResult | null>(null);
  const [sentimentLoading, setSentimentLoading] = useState(false);
  const [sentimentError, setSentimentError] = useState('');

  const handleSearch = async () => {
    const symbol = query.trim();
    if (!symbol) return;

    setLoading(true);
    setError('');
    setStockData(null);

    try {
      setSentiment(null);
      setSentimentError('');
      setIndicatorPeriod('day');
      setIndicatorCount(120);
      setIndicatorResult(null);
      setIndicatorError('');
      setCandlePeriod('day');
      setCandleLoading(false);
      const data = await api.getStockData(symbol);
      if ((data as any).error) {
        setError((data as any).error);
      } else {
        setStockData(data);
        setActiveCandles(data.candles || []);
      }
    } catch (err: any) {
      console.error('Failed to load stock data:', err);
      setError(err.message || 'Failed to fetch stock data');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  // Fetch candles for a specific period
  const handlePeriodChange = useCallback(async (period: string) => {
    const symbol = query.trim();
    if (!symbol) return;

    if (period === 'day') {
      setCandlePeriod('day');
      setActiveCandles(stockData?.candles || []);
      return;
    }

    setCandlePeriod(period);
    setCandleLoading(true);
    try {
      const data = await api.getStockCandles(symbol, period);
      if ((data as any).error) {
        setCandlePeriod('day');
        setActiveCandles(stockData?.candles || []);
      } else {
        setActiveCandles(data.candles || []);
      }
    } catch (err: any) {
      console.error('Failed to load candles:', err);
      setCandlePeriod('day');
      setActiveCandles(stockData?.candles || []);
    } finally {
      setCandleLoading(false);
    }
  }, [query, stockData]);

  // Section 2: Run indicators
  const handleRunIndicators = async (period?: string, count?: number) => {
    const symbol = query.trim();
    if (!symbol) return;
    const p = period || indicatorPeriod;
    const c = count || indicatorCount;
    setIndicatorPeriod(p);
    setIndicatorCount(c);
    setIndicatorLoading(true);
    setIndicatorError('');
    setIndicatorResult(null);

    try {
      const data = await api.getIndicators(symbol, p, c);
      if ((data as any).error) {
        setIndicatorError((data as any).error);
      } else {
        setIndicatorResult(data);
      }
    } catch (err: any) {
      console.error('Indicator analysis failed:', err);
      setIndicatorError(err.message || 'Indicator analysis failed');
    } finally {
      setIndicatorLoading(false);
    }
  };

  // Section 3: AI comprehensive analysis
  const handleAnalyze = async () => {
    const symbol = query.trim();
    if (!symbol || !stockData) return;

    setSentimentLoading(true);
    setSentimentError('');
    setSentiment(null);

    try {
      const result = await api.analyzeSentiment(symbol, stockData, indicatorResult || undefined);
      if ((result as any).error) {
        setSentimentError((result as any).error);
      } else {
        setSentiment(result);
      }
    } catch (err: any) {
      console.error('Sentiment analysis failed:', err);
      setSentimentError(err.message || 'Analysis failed');
    } finally {
      setSentimentLoading(false);
    }
  };

  const { profile, quote } = stockData || { profile: null, quote: null };
  const candles = activeCandles;
  const lastPrice = quote?.last_done ? parseFloat(quote.last_done) : 0;
  const prevClose = quote?.prev_close ? parseFloat(quote.prev_close) : 0;
  const change = lastPrice - prevClose;
  const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;
  const isUp = change >= 0;

  return (
    <div className="h-full flex flex-col">
      {/* Header with Search */}
      <div className="px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3 mb-3">
          <BarChart3 className="w-5 h-5 text-cta" />
          <h1 className="text-xl font-semibold text-text">S-A</h1>
          <span className="text-xs text-text-muted">Stock Analysis</span>
        </div>

        {/* Search Bar */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value.toUpperCase())}
              onKeyDown={handleKeyDown}
              placeholder="Enter stock ticker (e.g. USAR, 700.HK, TSLA)..."
              className="w-full pl-10 pr-4 py-2.5 text-sm text-text bg-input-bg border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-cta/30 placeholder:text-text-muted/50"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={loading || !query.trim()}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-cta text-white rounded-lg hover:bg-cta-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Search
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {!stockData && !loading && !error ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <TrendingUp className="w-16 h-16 text-text-muted/15 mx-auto mb-4" />
              <h2 className="text-lg font-medium text-text-muted/60 mb-1">Enter a Stock Ticker</h2>
              <p className="text-sm text-text-muted/40">
                Type a ticker symbol (e.g. USAR, 700.HK, TSLA) to view analysis
              </p>
            </div>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 text-cta animate-spin" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <p className="text-sm text-danger">{error}</p>
              <p className="text-xs text-text-muted mt-1">Check the ticker symbol and try again</p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* ===== SECTION 1: Company Profile + Price Chart ===== */}
            {profile && (
              <div className="bg-surface rounded-xl border border-border overflow-hidden">
                <div className="px-6 py-5 border-b border-border">
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 rounded-lg bg-cta/10 flex items-center justify-center">
                      <Building2 className="w-7 h-7 text-cta" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h2 className="text-lg font-semibold text-text">{profile.name}</h2>
                        <span className="px-2 py-0.5 text-xs font-bold bg-cta/10 text-cta rounded">
                          {profile.symbol}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-text-muted">
                        <span className="inline-flex items-center gap-1">
                          <Globe className="w-3.5 h-3.5" />
                          {profile.exchange}
                        </span>
                        <span>{profile.currency}</span>
                        <span>{profile.board}</span>
                      </div>
                    </div>

                    {quote && (
                      <div className="text-right">
                        <p className="text-2xl font-bold text-text">{quote.last_done}</p>
                        <div className={`flex items-center justify-end gap-1 text-sm font-medium ${isUp ? 'text-red-500' : 'text-green-500'}`}>
                          <span>{isUp ? '+' : ''}{change.toFixed(3)}</span>
                          <span>({isUp ? '+' : ''}{changePct.toFixed(2)}%)</span>
                        </div>
                        <p className="text-[10px] text-text-muted mt-1">
                          {quote.timestamp ? new Date(quote.timestamp + ' UTC').toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }) : ''}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-px bg-border">
                  {quote && (
                    <>
                      <StatCard icon={<Activity className="w-4 h-4" />} label="Prev Close" value={quote.prev_close} />
                      <StatCard icon={<TrendingUp className="w-4 h-4" />} label="Day High" value={quote.high} />
                      <StatCard icon={<TrendingUp className="w-4 h-4" />} label="Day Low" value={quote.low} />
                      <StatCard icon={<DollarSign className="w-4 h-4" />} label="Volume" value={Number(quote.volume).toLocaleString()} />
                    </>
                  )}
                  <StatCard icon={<DollarSign className="w-4 h-4" />} label="Total Shares" value={formatShares(profile.total_shares)} />
                  <StatCard icon={<DollarSign className="w-4 h-4" />} label="EPS (TTM)" value={formatNumber(profile.eps_ttm)} />
                </div>
              </div>
            )}

            {/* Price Chart */}
            {stockData && (
              <div className="bg-surface rounded-xl border border-border p-4">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="w-4.5 h-4.5 text-text-muted" />
                  <h3 className="text-base font-semibold text-text">Price Trend</h3>
                  {candles.length > 0 && (
                    <span className="text-xs text-text-muted">{candles[candles.length - 1]?.date} ~ {candles[0]?.date}</span>
                  )}
                  <div className="ml-auto flex items-center gap-1">
                    <div className="flex items-center rounded-lg border border-border overflow-hidden">
                      {[
                        { key: 'day', label: 'Day' },
                        { key: '1h', label: '1H' },
                        { key: '2h', label: '2H' },
                        { key: '3h', label: '3H' },
                        { key: '4h', label: '4H' },
                      ].map(p => (
                        <button
                          key={p.key}
                          onClick={() => handlePeriodChange(p.key)}
                          disabled={candleLoading}
                          className={`px-2.5 py-1 text-xs font-medium transition-colors duration-150 cursor-pointer ${
                            candlePeriod === p.key
                              ? 'bg-cta text-white'
                              : 'bg-surface text-text-muted hover:bg-cta/10 hover:text-cta'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                    {candleLoading && <Loader2 className="w-4 h-4 text-cta animate-spin ml-1" />}
                  </div>
                </div>
                <div className="h-[420px] relative">
                  {candleLoading ? (
                    <div className="flex items-center justify-center h-full">
                      <Loader2 className="w-6 h-6 text-cta animate-spin" />
                    </div>
                  ) : candles.length > 0 ? (
                    <StockChart candles={candles} isIntraday={candlePeriod !== 'day'} prevClose={prevClose} />
                  ) : (
                    <div className="flex items-center justify-center h-full text-sm text-text-muted">
                      No candle data available for this period
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ===== SECTION 2: Technical Indicator Analysis ===== */}
            <div className="bg-surface rounded-xl border border-border p-5">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="w-5 h-5 text-cta" />
                <h3 className="text-base font-semibold text-text">Technical Indicators</h3>
            
                {/* Period selector for indicators */}
                <div className="ml-4 flex items-center gap-1">
                  {[
                    { key: 'day', label: 'Day' },
                    { key: '1h', label: '1H' },
                    { key: '2h', label: '2H' },
                    { key: '4h', label: '4H' },
                  ].map(p => (
                    <button
                      key={p.key}
                      onClick={() => {
                        setIndicatorPeriod(p.key);
                        if (stockData) handleRunIndicators(p.key);
                      }}
                      disabled={indicatorLoading}
                      className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors duration-150 cursor-pointer ${
                        indicatorPeriod === p.key
                          ? 'bg-cta/15 text-cta font-semibold'
                          : 'text-text-muted hover:text-cta hover:bg-cta/5'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                {/* Count selector for indicators */}
                <div className="flex items-center gap-1 ml-1">
                  <span className="text-[11px] text-text-muted">Periods:</span>
                  {[60, 120, 250, 365].map(n => (
                    <button
                      key={n}
                      onClick={() => setIndicatorCount(n)}
                      className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors duration-150 cursor-pointer ${
                        indicatorCount === n
                          ? 'bg-cta/15 text-cta font-semibold'
                          : 'text-text-muted hover:text-cta hover:bg-cta/5'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => handleRunIndicators()}
                  disabled={indicatorLoading || !stockData}
                  className="ml-auto inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium bg-cta text-white rounded-lg hover:bg-cta-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
                >
                  {indicatorLoading ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analyzing...</>
                  ) : (
                    <><Activity className="w-3.5 h-3.5" /> Run Indicators</>
                  )}
                </button>
              </div>
            
              {indicatorLoading && (
                <div className="flex flex-col items-center justify-center py-8 gap-3">
                  <Loader2 className="w-8 h-8 text-cta animate-spin" />
                  <p className="text-sm text-text-muted">Running technical indicator analysis ({indicatorPeriod === 'day' ? 'Daily' : indicatorPeriod.toUpperCase()})...</p>
                  <p className="text-xs text-text-muted/50">This may take 10-15 seconds</p>
                </div>
              )}
            
              {indicatorError && (
                <div className="text-center py-4">
                  <p className="text-sm text-danger">{indicatorError}</p>
                </div>
              )}
            
              {indicatorResult && !indicatorLoading && (
                <div className="space-y-4">
                  {/* Composite Score Badge */}
                  <div className="flex items-start gap-4">
                    <div className={`shrink-0 px-4 py-2 rounded-lg text-center ${
                      indicatorResult.composite.direction === 'bullish' ? 'bg-red-500/10 text-red-500' :
                      indicatorResult.composite.direction === 'bearish' ? 'bg-green-500/10 text-green-500' :
                      'bg-yellow-500/10 text-yellow-600'
                    }`}>
                      <div className="text-lg font-bold capitalize">{indicatorResult.composite.direction === 'bullish' ? 'Bullish' : indicatorResult.composite.direction === 'bearish' ? 'Bearish' : 'Neutral'}</div>
                      <div className="text-xs opacity-75">Score: {indicatorResult.composite.score > 0 ? '+' : ''}{indicatorResult.composite.score}</div>
                      <div className="text-xs opacity-75">Confidence: {indicatorResult.composite.confidence}%</div>
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-text-muted mb-2">Composite trend score from 8 technical indicators (range: -100 to +100)</p>
                    </div>
                  </div>
            
                  {/* Indicator Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {indicatorResult.composite.details.map((d, i) => {
                      const indSignals = indicatorResult.signals[d.indicator] || [];
                      const latestSignals = indSignals.slice(-3);
                      return (
                        <div key={i} className="rounded-lg border border-border p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`inline-block w-2 h-2 rounded-full ${
                              d.signal === 'bullish' ? 'bg-red-500' :
                              d.signal === 'bearish' ? 'bg-green-500' : 'bg-yellow-500'
                            }`} />
                            <span className="text-sm font-semibold text-text">{d.indicator}</span>
                            <span className={`ml-auto text-xs font-medium px-1.5 py-0.5 rounded ${
                              d.signal === 'bullish' ? 'bg-red-500/10 text-red-500' :
                              d.signal === 'bearish' ? 'bg-green-500/10 text-green-500' :
                              'bg-yellow-500/10 text-yellow-600'
                            }`}>
                              {d.signal === 'bullish' ? 'Bull' : d.signal === 'bearish' ? 'Bear' : 'Neutral'}
                            </span>
                          </div>
                          <p className="text-xs text-text-muted mb-1">{d.description}</p>
                          {latestSignals.length > 0 && (
                            <div className="mt-1.5 space-y-0.5">
                              {latestSignals.map((s, j) => (
                                <div key={j} className="flex items-center gap-1 text-[10px] text-text-muted/70">
                                  <span>{s.date}</span>
                                  <span className={
                                    s.signal === 'bullish' ? 'text-red-500/70' :
                                    s.signal === 'bearish' ? 'text-green-500/70' : 'text-yellow-500/70'
                                  }>{s.signal === 'bullish' ? '\u25b2' : s.signal === 'bearish' ? '\u25bc' : '\u25c6'}</span>
                                  <span className="truncate">{s.description}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
            
                  {/* Gap Analysis */}
                  {indicatorResult.gaps && indicatorResult.gaps.length > 0 && (
                    <div className="mt-4">
                      <h4 className="text-sm font-semibold text-text mb-2 flex items-center gap-1.5">
                        <Zap className="w-4 h-4 text-cta" />
                        Gap Analysis
                        <span className="text-xs font-normal text-text-muted">({indicatorResult.gaps.length} gaps detected)</span>
                      </h4>
                      <div className="space-y-1.5 max-h-64 overflow-y-auto">
                        {[...indicatorResult.gaps].reverse().map((gap, gi) => (
                          <div key={gi} className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-xs ${
                            gap.status === 'unfilled'
                              ? 'border-border bg-surface'
                              : 'border-border/50 bg-surface/50 opacity-60'
                          }`}>
                            {/* Direction badge */}
                            <span className={`shrink-0 inline-flex items-center gap-0.5 font-medium ${
                              gap.direction === 'bullish' ? 'text-red-500' : 'text-green-500'
                            }`}>
                              {gap.direction === 'bullish' ? '\u2191 Bullish' : '\u2193 Bearish'}
                            </span>
            
                            {/* Gap type */}
                            <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              gap.gapType === 'breakaway' ? 'bg-purple-500/10 text-purple-500' :
                              gap.gapType === 'runaway' ? 'bg-blue-500/10 text-blue-500' :
                              gap.gapType === 'exhaustion' ? 'bg-orange-500/10 text-orange-500' :
                              'bg-gray-500/10 text-gray-500'
                            }`}>
                              {gap.gapType}
                            </span>
            
                            {/* Date */}
                            <span className="text-text-muted">{gap.date}</span>
            
                            {/* Size */}
                            <span className="text-text-muted">
                              {gap.gapSize.toFixed(2)} ({gap.gapSizePct.toFixed(2)}%)
                            </span>
            
                            {/* Range */}
                            <span className="text-text-muted/70">
                              [{gap.lowerBound.toFixed(2)} - {gap.upperBound.toFixed(2)}]
                            </span>
            
                            {/* Status */}
                            <span className={`ml-auto shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              gap.status === 'unfilled'
                                ? 'bg-amber-500/10 text-amber-600'
                                : 'bg-green-500/10 text-green-600'
                            }`}>
                              {gap.status === 'unfilled' ? 'Unfilled' : `Filled ${gap.filledDate ? gap.filledDate : ''}`}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            
              {!indicatorResult && !indicatorLoading && !indicatorError && (
                <p className="text-sm text-text-muted/50 text-center py-4">
                  Click "Run Indicators" to analyze MA, MACD, RSI, KDJ, BOLL, ATR, BBW, OBV + Gap Analysis and get a composite trend score.
                </p>
              )}
            </div>

            {/* ===== SECTION 3: AI Comprehensive Analysis ===== */}
            <div className="bg-surface rounded-xl border border-border p-5">
              <div className="flex items-center gap-2 mb-4">
                <Brain className="w-5 h-5 text-cta" />
                <h3 className="text-base font-semibold text-text">AI Comprehensive Analysis</h3>
                {!indicatorResult && !sentimentLoading && (
                  <span className="text-[10px] text-yellow-500 bg-yellow-500/10 px-1.5 py-0.5 rounded">Run indicators first for better results</span>
                )}
                <button
                  onClick={handleAnalyze}
                  disabled={sentimentLoading || !stockData}
                  className="ml-auto inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium bg-cta text-white rounded-lg hover:bg-cta-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
                >
                  {sentimentLoading ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analyzing...</>
                  ) : (
                    <><Sparkles className="w-3.5 h-3.5" /> AI Analyze</>
                  )}
                </button>
              </div>

              {sentimentLoading && (
                <div className="flex flex-col items-center justify-center py-8 gap-3">
                  <Loader2 className="w-8 h-8 text-cta animate-spin" />
                  <p className="text-sm text-text-muted">Searching news & analyzing with AI...</p>
                  <p className="text-xs text-text-muted/50">This may take 15-30 seconds</p>
                </div>
              )}

              {sentimentError && (
                <div className="text-center py-4">
                  <p className="text-sm text-danger">{sentimentError}</p>
                </div>
              )}

              {sentiment && !sentimentLoading && (
                <div className="space-y-4">
                  {/* Trend Badge + Summary */}
                  <div className="flex items-start gap-4">
                    <div className={`shrink-0 px-4 py-2 rounded-lg text-center ${
                      sentiment.sentiment === 'bullish' ? 'bg-red-500/10 text-red-500' :
                      sentiment.sentiment === 'bearish' ? 'bg-green-500/10 text-green-500' :
                      'bg-yellow-500/10 text-yellow-600'
                    }`}>
                      <div className="text-lg font-bold capitalize">{sentiment.sentiment}</div>
                      <div className="text-xs opacity-75">Confidence: {sentiment.confidence}%</div>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-text leading-relaxed">{sentiment.summary}</p>
                    </div>
                  </div>

                  {/* Key Metrics: Entry / Take Profit / Stop Loss / Risk */}
                  {(sentiment.entryPoint || sentiment.takeProfit || sentiment.stopLoss || sentiment.riskLevel) && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {sentiment.entryPoint && (
                        <MetricCard
                          icon={<Target className="w-4 h-4 text-cta" />}
                          label="Entry Point"
                          value={sentiment.entryPoint}
                          color="blue"
                        />
                      )}
                      {sentiment.takeProfit && (
                        <MetricCard
                          icon={<TrendingUp className="w-4 h-4 text-red-500" />}
                          label="Take Profit"
                          value={sentiment.takeProfit}
                          color="red"
                        />
                      )}
                      {sentiment.stopLoss && (
                        <MetricCard
                          icon={<Crosshair className="w-4 h-4 text-green-500" />}
                          label="Stop Loss"
                          value={sentiment.stopLoss}
                          color="green"
                        />
                      )}
                      {sentiment.riskLevel && (
                        <MetricCard
                          icon={<Zap className="w-4 h-4 text-yellow-500" />}
                          label="Risk Level"
                          value={sentiment.riskLevel}
                          color="yellow"
                        />
                      )}
                    </div>
                  )}

                  {/* Trend Analysis */}
                  {sentiment.trendAnalysis && (
                    <div className="rounded-lg border border-border p-3">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <TrendingUp className="w-3.5 h-3.5 text-cta" />
                        <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">Trend Analysis</span>
                      </div>
                      <p className="text-sm text-text leading-relaxed">{sentiment.trendAnalysis}</p>
                    </div>
                  )}

                  {/* Key Drivers + Risks */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="rounded-lg bg-red-500/5 border border-red-500/15 p-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <TrendingUp className="w-3.5 h-3.5 text-red-500" />
                        <span className="text-xs font-semibold text-red-500 uppercase tracking-wide">Key Drivers</span>
                      </div>
                      <ul className="space-y-1.5">
                        {sentiment.keyDrivers.map((d, i) => (
                          <li key={i} className="flex items-start gap-1.5 text-xs text-text">
                            <ChevronRight className="w-3 h-3 text-red-500 mt-0.5 shrink-0" />
                            <span>{d}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="rounded-lg bg-green-500/5 border border-green-500/15 p-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-green-500" />
                        <span className="text-xs font-semibold text-green-500 uppercase tracking-wide">Risks</span>
                      </div>
                      <ul className="space-y-1.5">
                        {sentiment.risks.map((r, i) => (
                          <li key={i} className="flex items-start gap-1.5 text-xs text-text">
                            <ChevronRight className="w-3 h-3 text-green-500 mt-0.5 shrink-0" />
                            <span>{r}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Outlook */}
                  <div className="rounded-lg border border-border p-3">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Shield className="w-3.5 h-3.5 text-cta" />
                      <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">Short-term Outlook</span>
                    </div>
                    <p className="text-sm text-text">{sentiment.outlook}</p>
                  </div>

                  {/* Sources */}
                  {sentiment.sources.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Sources</div>
                      <div className="space-y-1.5">
                        {sentiment.sources.slice(0, 6).map((s, i) => (
                          <a
                            key={i}
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-start gap-2 text-xs text-text-muted hover:text-cta transition-colors group"
                          >
                            <ExternalLink className="w-3 h-3 mt-0.5 shrink-0" />
                            <span className="line-clamp-2 group-hover:underline">{s.title || s.snippet.slice(0, 80)}</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!sentiment && !sentimentLoading && !sentimentError && (
                <p className="text-sm text-text-muted/50 text-center py-4">
                  Click "AI Analyze" to search company news, combine with technical indicators, and get AI-powered trend judgment with entry/exit points.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-surface px-4 py-3">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-text-muted">{icon}</span>
        <span className="text-xs text-text-muted">{label}</span>
      </div>
      <p className="text-sm font-semibold text-text">{value}</p>
    </div>
  );
}

function MetricCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  const borderColor = color === 'red' ? 'border-red-500/20' : color === 'green' ? 'border-green-500/20' : color === 'blue' ? 'border-cta/20' : 'border-yellow-500/20';
  return (
    <div className={`rounded-lg border ${borderColor} p-3`}>
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-xs font-medium text-text-muted">{label}</span>
      </div>
      <p className="text-sm font-semibold text-text leading-snug">{value}</p>
    </div>
  );
}

// Lightweight Charts: professional K-line chart with MA, volume, and zoom
function StockChart({ candles, isIntraday, prevClose }: { candles: StockCandle[]; isIntraday: boolean; prevClose: number }) {
  const chartRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartRef.current || candles.length === 0) return;

    const candleData = candles.map(c => {
      let time: number;
      if (isIntraday) {
        const d = new Date(c.date.replace(' ', 'T') + ':00');
        time = Math.floor(d.getTime() / 1000);
      } else {
        time = c.date as any;
      }
      return {
        time: time as any,
        open: parseFloat(c.open),
        high: parseFloat(c.high),
        low: parseFloat(c.low),
        close: parseFloat(c.close),
      };
    });
    const volumeData = candles.map(c => {
      let time: number;
      if (isIntraday) {
        const d = new Date(c.date.replace(' ', 'T') + ':00');
        time = Math.floor(d.getTime() / 1000);
      } else {
        time = c.date as any;
      }
      return {
        time: time as any,
        value: c.volume,
        color: parseFloat(c.close) >= parseFloat(c.open) ? 'rgba(239,68,68,0.5)' : 'rgba(34,197,94,0.5)',
      };
    });

    function calcMA(data: typeof candleData, period: number) {
      const result: { time: any; value: number }[] = [];
      for (let i = period - 1; i < data.length; i++) {
        const slice = data.slice(i - period + 1, i + 1);
        const sum = slice.reduce((a, b) => a + b.close, 0);
        result.push({ time: data[i].time, value: sum / period });
      }
      return result;
    }

    const maPeriods = [5, 10, 20, 30, 60, 120];
    const maColors = ['#f59e0b', '#8b5cf6', '#06b6d4', '#22c55e', '#f97316', '#ef4444'];

    const chart = createChart(chartRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: 'rgba(156, 163, 175, 1)',
      },
      grid: {
        vertLines: { color: 'rgba(55, 65, 81, 0.5)' },
        horzLines: { color: 'rgba(55, 65, 81, 0.5)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(255,255,255,0.3)', width: 1, style: 2, visible: true, labelBackgroundColor: '#374151' },
        horzLine: { color: 'rgba(255,255,255,0.3)', width: 1, style: 2, visible: true, labelBackgroundColor: '#374151' },
      },
      rightPriceScale: {
        borderColor: 'rgba(55, 65, 81, 0.8)',
      },
      timeScale: {
        borderColor: 'rgba(55, 65, 81, 0.8)',
        timeVisible: isIntraday,
        secondsVisible: false,
        rightOffset: 0,
        barSpacing: isIntraday ? 6 : 10,
      },
      handleScroll: {
        vertTouchDrag: true,
        mouseWheel: true,
        pressedMouseMove: true,
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#ef4444',
      downColor: '#22c55e',
      borderUpColor: '#ef4444',
      borderDownColor: '#22c55e',
      wickUpColor: '#ef4444',
      wickDownColor: '#22c55e',
    });
    candleSeries.setData(candleData);

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });
    volumeSeries.setData(volumeData);

    const maSeries: any[] = [];
    maPeriods.forEach((period, idx) => {
      const maData = calcMA(candleData, period);
      const series = chart.addSeries(LineSeries, {
        color: maColors[idx],
        lineWidth: 1,
        crosshairMarkerVisible: false,
        lastValueVisible: false,
        priceLineVisible: false,
      });
      series.setData(maData);
      maSeries.push(series);
    });

    if (isIntraday) {
      chart.timeScale().fitContent();
    } else {
      const sortedData = [...candleData].sort((a, b) => (a.time as string).localeCompare(b.time as string));
      const lastDateStr = sortedData[sortedData.length - 1].time as string;
      const lastDateObj = new Date(lastDateStr);
      const threeMonthsAgo = new Date(lastDateObj);
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      const fromDateStr = threeMonthsAgo.toISOString().split('T')[0];

      chart.timeScale().setVisibleRange({
        from: fromDateStr,
        to: lastDateStr,
      });
    }

    let isAdjusting = false;
    chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
      if (!range || isAdjusting) return;
      const lastIndex = candleData.length - 1;
      if (range.to > lastIndex) {
        isAdjusting = true;
        const overflow = range.to - lastIndex;
        chart.timeScale().setVisibleLogicalRange({
          from: range.from - overflow,
          to: lastIndex,
        });
        isAdjusting = false;
      }
    });

    chart.subscribeCrosshairMove(param => {
      if (!tooltipRef.current) return;

      if (!param.time || !param.seriesData || !param.seriesData.get(candleSeries)) {
        tooltipRef.current.style.display = 'none';
        return;
      }

      const data = param.seriesData.get(candleSeries) as any;
      const rawTime = param.time;
      let dateDisplay: string;
      if (typeof rawTime === 'number') {
        const d = new Date(rawTime * 1000);
        dateDisplay = isIntraday
          ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
          : `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      } else {
        dateDisplay = String(rawTime);
      }
      const isUp = data.close >= data.open;
      const RED = '#ef4444';
      const GREEN = '#22c55e';
      const GRAY = '#9ca3af';
      function priceColor(val: number) {
        if (prevClose > 0) {
          if (val > prevClose) return RED;
          if (val < prevClose) return GREEN;
          return GRAY;
        }
        return isUp ? RED : GREEN;
      }
      const oColor = priceColor(data.open);
      const hColor = priceColor(data.high);
      const lColor = priceColor(data.low);
      const cColor = priceColor(data.close);

      tooltipRef.current.style.display = 'block';
      tooltipRef.current.innerHTML = `
        <div style="
          position: absolute;
          background: rgba(31, 41, 55, 0.95);
          border: 1px solid rgba(75, 85, 99, 0.8);
          border-radius: 6px;
          padding: 8px 12px;
          font-size: 12px;
          color: #e5e7eb;
          pointer-events: none;
          z-index: 1000;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
          left: ${param.point?.x || 0}px;
          top: 10px;
          transform: translateX(-50%);
        ">
          <div style="font-weight: 600; margin-bottom: 4px; color: #9ca3af;">${dateDisplay}</div>
          <div style="display: grid; grid-template-columns: auto auto; gap: 2px 12px;">
            <span style="color: #9ca3af;">O:</span>
            <span style="color: ${oColor}; font-weight: 600;">${data.open?.toFixed(2) || '-'}</span>
            <span style="color: #9ca3af;">H:</span>
            <span style="color: ${hColor}; font-weight: 600;">${data.high?.toFixed(2) || '-'}</span>
            <span style="color: #9ca3af;">L:</span>
            <span style="color: ${lColor}; font-weight: 600;">${data.low?.toFixed(2) || '-'}</span>
            <span style="color: #9ca3af;">C:</span>
            <span style="color: ${cColor}; font-weight: 600;">${data.close?.toFixed(2) || '-'}</span>
          </div>
        </div>
      `;
    });

    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        chart.applyOptions({ width, height });
      }
    });
    ro.observe(chartRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [candles, isIntraday, prevClose]);

  return (
    <div ref={chartRef} className="w-full h-full relative">
      <div ref={tooltipRef} style={{ display: 'none' }} />
    </div>
  );
}
