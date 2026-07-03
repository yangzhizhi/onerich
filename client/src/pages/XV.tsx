import { useEffect, useState, useRef } from 'react';
import { RefreshCw, ExternalLink, User, Calendar, Heart, Repeat, MessageCircle, Eye, X, ChevronLeft, ChevronRight, ChevronDown, Brain, Loader2, TrendingUp, Sparkles, Building2, Download, Settings, Terminal } from 'lucide-react';
import { api } from '../api';
import type { XVDailySummary, XVScrapeStatus } from '../types';

const DEFAULT_INSTRUCTIONS = `1. Focus especially on:
   - Any stocks, companies, or tickers mentioned (with context)
   - AI companies and AI industry developments
   - Market sentiment and trends
2. For each mentioned stock/company, note which tweet(s) mentioned it (source attribution).
3. If tweets mention charts or visual data, note that in notableImages.`;

interface Tweet {
  id: string;
  text: string;
  created_at: string;
  metrics: { replies: number; retweets: number; likes: number; views: number };
  url: string;
  scraped_at: string;
  image_urls?: string[];
  image_paths?: string[];
}

interface TweetData {
  metadata: { date: string; total_tweets: number; users_tracked: string[]; scraped_at: string };
  tweets: Record<string, Tweet[]>;
}

export default function XV() {
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [data, setData] = useState<TweetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [fromDate, setFromDate] = useState('');
  const [scrapeLog, setScrapeLog] = useState('');
  const [showScrapeLog, setShowScrapeLog] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  const [selectedUser, setSelectedUser] = useState<string>('all');
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // AI Summary state
  const [summary, setSummary] = useState<XVDailySummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState('');
  const [savedSummaries, setSavedSummaries] = useState<XVDailySummary[]>([]);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [instructions, setInstructions] = useState(DEFAULT_INSTRUCTIONS);
  const [showPromptEditor, setShowPromptEditor] = useState(false);

  const openLightbox = (images: string[], index: number) => {
    setLightboxImages(images);
    setLightboxIndex(index);
  };
  const closeLightbox = () => { setLightboxImages([]); setLightboxIndex(0); };

  const loadDates = async () => {
    try {
      const d = await api.getXVDates();
      setDates(d);
      if (d.length > 0 && !selectedDate) {
        setSelectedDate(d[0]);
      }
    } catch (err) {
      console.error('Failed to load X-V dates:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadSavedSummaries = async () => {
    try {
      const s = await api.getXVSummaries();
      setSavedSummaries(s);
    } catch (err) {
      console.error('Failed to load saved summaries:', err);
    }
  };

  const loadTweets = async (date: string) => {
    if (!date) return;
    try {
      const d = await api.getXVTweets(date);
      setData(d);
    } catch (err) {
      console.error('Failed to load X-V tweets:', err);
      setData(null);
    }
  };

  // AI Daily Summary
  const handleSummarize = async () => {
    if (!selectedDate) return;
    setSummaryLoading(true);
    setSummaryError('');
    try {
      const result = await api.summarizeXV(selectedDate, instructions);
      if ((result as any).error) {
        setSummaryError((result as any).error);
      } else {
        setSummary(result);
        setExpandedDate(selectedDate);
        loadSavedSummaries();
      }
    } catch (err: any) {
      console.error('X-V summarize failed:', err);
      setSummaryError(err.message || 'AI summary failed');
    } finally {
      setSummaryLoading(false);
    }
  };

  // Download PDF via print dialog
  const handleDownloadPDF = (summaryData?: XVDailySummary) => {
    const s = summaryData || summary;
    if (!s) return;
    const d = s.date;
    const title = `X-V Daily Report - ${d}`;

    // Build styled HTML for print
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; color: #1a1a2e; padding: 40px; max-width: 800px; margin: 0 auto; font-size: 14px; line-height: 1.6; }
h1 { font-size: 22px; margin-bottom: 4px; }
.date { color: #888; font-size: 13px; margin-bottom: 20px; }
h2 { font-size: 15px; color: #3b82f6; margin: 18px 0 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
.summary { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin-bottom: 12px; }
.sentiment { background: #eff6ff; border-radius: 6px; padding: 8px 12px; margin-bottom: 12px; }
.topics { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.topics span { background: #eff6ff; color: #3b82f6; padding: 2px 10px; border-radius: 12px; font-size: 12px; }
.card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; margin-bottom: 8px; }
.card-name { font-weight: 600; margin-bottom: 4px; }
.card-summary { color: #555; font-size: 13px; margin-bottom: 6px; }
.card-source { font-size: 11px; color: #888; }
.card-source b { color: #3b82f6; font-weight: 500; }
.img-item { font-size: 12px; color: #555; margin-bottom: 2px; }
.img-item b { color: #3b82f6; font-weight: 500; }
.footer { margin-top: 24px; font-size: 11px; color: #aaa; text-align: center; border-top: 1px solid #eee; padding-top: 8px; }
@media print { body { padding: 20px; } }
</style></head><body>
<h1>${title}</h1>
<div class="date">Generated by X-V Big V Tracker</div>

<div class="summary">${s.overallSummary || ''}</div>

${s.marketSentiment ? `<div class="sentiment">\u{1F4C8} Market Sentiment: ${s.marketSentiment}</div>` : ''}

${s.keyTopics?.length ? `<h2>Key Topics</h2><div class="topics">${s.keyTopics.map(t => `<span>${t}</span>`).join('')}</div>` : ''}

${s.stockMentions?.length ? `<h2>\u{1F4C8} Stocks / Companies Mentioned</h2>${s.stockMentions.map(sm => `<div class="card"><div class="card-name">${sm.name}</div><div class="card-summary">${sm.summary}</div>${sm.sources?.map(src => `<div class="card-source"><b>${src.user}</b> ${src.snippet}</div>`).join('') || ''}</div>`).join('')}` : ''}

${s.aiCompanyMentions?.length ? `<h2>\u{1F9E0} AI Companies</h2>${s.aiCompanyMentions.map(sm => `<div class="card"><div class="card-name">${sm.name}</div><div class="card-summary">${sm.summary}</div>${sm.sources?.map(src => `<div class="card-source"><b>${src.user}</b> ${src.snippet}</div>`).join('') || ''}</div>`).join('')}` : ''}

${s.notableImages?.length ? `<h2>\u{1F4F7} Notable Images</h2>${s.notableImages.map(img => `<div class="img-item"><b>${img.user}</b> ${img.description}</div>`).join('')}` : ''}

<div class="footer">X-V Daily Report \u00B7 ${d} \u00B7 Powered by DeepSeek AI</div>
</body></html>`;

    const win = window.open('', '_blank');
    if (!win) { alert('Please allow popups to download PDF'); return; }
    win.document.write(html);
    win.document.close();
    win.onload = () => { win.print(); };
  };

  useEffect(() => { loadDates(); loadSavedSummaries(); }, []);

  // On mount: check if a scrape is already running (e.g. user navigated away and back).
  // This restores the "Fetching..." state and log panel.
  useEffect(() => {
    let cancelled = false;
    api.getXVScrapeStatus().then((st: XVScrapeStatus) => {
      if (cancelled) return;
      if (st.status === 'running') {
        setScraping(true);
        setShowScrapeLog(true);
        if (st.log) setScrapeLog(st.log);
        pollRef.current = setInterval(() => pollScrapeStatus(undefined), 5000);
      } else if (st.status === 'done' || st.status === 'failed') {
        // A scrape finished while we were away — consume the result.
        pollScrapeStatus(undefined);
      }
    }).catch(() => { /* ignore */ });
    return () => {
      cancelled = true;
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, []);

  useEffect(() => {
    if (selectedDate) {
      loadTweets(selectedDate);
      setSummary(null);
      setSummaryError('');
    }
  }, [selectedDate]);

  // Keyboard navigation for lightbox
  useEffect(() => {
    if (lightboxImages.length <= 1) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && lightboxIndex > 0) setLightboxIndex(prev => prev - 1);
      if (e.key === 'ArrowRight' && lightboxIndex < lightboxImages.length - 1) setLightboxIndex(prev => prev + 1);
      if (e.key === 'Escape') closeLightbox();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [lightboxImages.length, lightboxIndex]);

  // Poll the scrape status endpoint and update UI.
  const pollScrapeStatus = async (triggeredDate?: string) => {
    try {
      const st: XVScrapeStatus = await api.getXVScrapeStatus();
      if (st.log) setScrapeLog(st.log);

      if (st.status === 'running') {
        setScraping(true);
        setShowScrapeLog(true);
        return;
      }

      // Process is no longer running — stop polling.
      setScraping(false);
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }

      if (st.status === 'failed') {
        alert(st.reason || st.error || 'Scrape failed');
        setShowScrapeLog(false);
        return;
      }

      if (st.status === 'done') {
        if (typeof st.tweets_saved === 'number' && st.tweets_saved === 0) {
          alert('Scrape finished, but no new tweets were found for the selected range.');
        }
        // Refresh dates and select the scrape date.
        const newDates = await api.getXVDates();
        setDates(newDates);
        const target = triggeredDate
          ? newDates.find(d => d === triggeredDate) || newDates[0]
          : newDates[0];
        if (target) {
          setSelectedDate(target);
          await loadTweets(target);
        }
        setShowScrapeLog(false);
      }
    } catch {
      // network hiccup — keep polling
    }
  };

  const handleScrape = async () => {
    if (!fromDate) return;
    setScraping(true);
    setShowScrapeLog(true);
    setScrapeLog('Starting scraper...');
    try {
      await api.triggerXVScrape(fromDate.replace(/-/g, ''));
      // Start polling immediately, then on an interval.
      pollScrapeStatus(fromDate);
      pollRef.current = setInterval(() => pollScrapeStatus(fromDate), 5000);
    } catch (err: any) {
      setScraping(false);
      setShowScrapeLog(false);
      alert(err?.message || 'Failed to start scrape');
    }
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full"><p className="text-text-muted">Loading...</p></div>;
  }

  const users = data ? Object.keys(data.tweets) : [];
  const filteredTweets = selectedUser === 'all'
    ? users.flatMap(u => (data?.tweets[u] || []).map(t => ({ ...t, username: u })))
    : (data?.tweets[selectedUser] || []).map(t => ({ ...t, username: selectedUser }));

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-text">X-V</h1>
            <span className="text-xs text-text-muted">Big V Daily Posts</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="text-sm text-text bg-input-bg border border-border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-cta/30 cursor-pointer"
              />
              <button
                onClick={handleScrape}
                disabled={scraping || !fromDate}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-cta text-white rounded-lg hover:bg-cta-hover transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${scraping ? 'animate-spin' : ''}`} />
                {scraping ? 'Fetching...' : 'Fetch From'}
              </button>
            </div>
            {/* AI Summary button */}
            <button
              onClick={handleSummarize}
              disabled={summaryLoading || !selectedDate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-cta/10 text-cta rounded-lg hover:bg-cta/20 transition-colors duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {summaryLoading ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> AI Analyzing...</>
              ) : (
                <><Brain className="w-3.5 h-3.5" /> AI Daily Summary</>
              )}
            </button>
          </div>
        </div>

        {/* Date & User Filters */}
        <div className="flex items-center gap-4 mt-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-text-muted" />
            <select
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="text-sm text-text bg-input-bg border border-border rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-cta/30 cursor-pointer"
            >
              {dates.length === 0 && <option value="">No data</option>}
              {dates.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          {data && (
            <div className="flex items-center gap-1 flex-wrap">
              <button
                onClick={() => setSelectedUser('all')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors duration-200 cursor-pointer ${
                  selectedUser === 'all' ? 'bg-cta/10 text-cta' : 'text-text-muted hover:bg-hover'
                }`}
              >All ({data.metadata.total_tweets})</button>
              {users.map(u => (
                <button
                  key={u}
                  onClick={() => setSelectedUser(u)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors duration-200 cursor-pointer ${
                    selectedUser === u ? 'bg-cta/10 text-cta' : 'text-text-muted hover:bg-hover'
                  }`}
                >{u} ({data.tweets[u].length})</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Scrape progress log — visible while scraping or when manually toggled */}
      {showScrapeLog && (
        <div className="border-b border-border bg-input-bg/50">
          <div className="px-6 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <Terminal className="w-3.5 h-3.5" />
              <span>Scraper {scraping ? 'running' : 'output'}…</span>
            </div>
            {!scraping && (
              <button
                onClick={() => { setShowScrapeLog(false); setScrapeLog(''); }}
                className="text-text-muted hover:text-text text-xs cursor-pointer"
              >Dismiss</button>
            )}
          </div>
          {scrapeLog && (
            <pre className="px-6 pb-3 text-[11px] font-mono text-text-muted overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap">{scrapeLog}</pre>
          )}
        </div>
      )}

      {/* Tweet List */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {/* Prompt Config - Collapsible */}
        <div className="mb-4">
          <button
            onClick={() => setShowPromptEditor(!showPromptEditor)}
            className="flex items-center gap-2 text-xs text-text-muted hover:text-cta transition-colors duration-150 cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Prompt Configuration</span>
            <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${showPromptEditor ? 'rotate-180' : ''}`} />
          </button>
          {showPromptEditor && (
            <div className="mt-2 bg-surface rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-text">Custom Instructions</span>
                <button
                  onClick={() => setInstructions(DEFAULT_INSTRUCTIONS)}
                  className="text-[10px] text-text-muted hover:text-cta transition-colors duration-150 cursor-pointer"
                >
                  Reset to Default
                </button>
              </div>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={6}
                className="w-full text-xs text-text bg-input-bg border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cta/30 resize-y font-mono leading-relaxed placeholder:text-text-muted/30"
                placeholder="Enter custom instructions for the AI summary..."
              />
              <p className="text-[10px] text-text-muted/50">These instructions will be injected into the AI prompt. The system prompt (JSON format requirement) and tweet data are always included automatically.</p>
            </div>
          )}
        </div>

        {/* Loading spinner */}
        {summaryLoading && (
          <div className="bg-surface rounded-xl border border-border p-6 mb-4">
            <div className="flex flex-col items-center justify-center py-6 gap-3">
              <Loader2 className="w-8 h-8 text-cta animate-spin" />
              <p className="text-sm text-text-muted">AI is analyzing all tweets and images...</p>
              <p className="text-xs text-text-muted/50">This may take 15-30 seconds</p>
            </div>
          </div>
        )}

        {/* Error */}
        {summaryError && (
          <div className="bg-surface rounded-xl border border-red-500/30 p-4 mb-4">
            <div className="flex items-start gap-2">
              <span className="text-red-500 text-sm">\u26a0\ufe0f</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-danger font-medium">AI Summary Error</p>
                <p className="text-xs text-danger/70 mt-1 break-all leading-relaxed">{summaryError}</p>
              </div>
            </div>
          </div>
        )}

        {/* Saved Summary for selected date - Collapsible Card */}
        {(() => {
          const s = savedSummaries.find(sum => sum.date === selectedDate);
          if (!s || summaryLoading) return null;
          const isExpanded = expandedDate === s.date || expandedDate === null;
          return (
            <div className="mb-4">
              <div className="bg-surface rounded-xl border border-border overflow-hidden">
                {/* Header */}
                <button
                  onClick={() => setExpandedDate(isExpanded ? '' : s.date)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-hover/50 transition-colors duration-150 cursor-pointer"
                >
                  <ChevronDown className={`w-4 h-4 text-text-muted transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                  <Sparkles className="w-4 h-4 text-cta" />
                  <span className="text-sm font-medium text-text">AI Summary</span>
                  <span className="text-xs text-text-muted">{s.date}</span>
                  <span className="text-xs text-text-muted truncate flex-1">{s.overallSummary?.slice(0, 60)}{s.overallSummary?.length > 60 ? '...' : ''}</span>
                  {s.marketSentiment && (
                    <span className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded ${
                      s.marketSentiment.includes('\u770b\u591a') ? 'bg-red-500/10 text-red-500' :
                      s.marketSentiment.includes('\u770b\u7a7a') ? 'bg-green-500/10 text-green-500' :
                      'bg-yellow-500/10 text-yellow-600'
                    }`}>{s.marketSentiment.split(',')[0]}</span>
                  )}
                  {isExpanded && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDownloadPDF(s); }}
                      className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-cta/10 text-cta rounded hover:bg-cta/20 transition-colors duration-150 cursor-pointer"
                    >
                      <Download className="w-2.5 h-2.5" />PDF
                    </button>
                  )}
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-1 space-y-3 border-t border-border">
                    <p className="text-sm text-text leading-relaxed">{s.overallSummary}</p>
                    {s.marketSentiment && (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-hover">
                        <TrendingUp className="w-4 h-4 text-cta" />
                        <span className="text-sm font-medium text-text">Market Sentiment:</span>
                        <span className="text-sm text-text">{s.marketSentiment}</span>
                      </div>
                    )}
                    {s.keyTopics?.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-text-muted uppercase mb-1.5">Key Topics</h4>
                        <div className="flex flex-wrap gap-1.5">
                          {s.keyTopics.map((t, i) => (
                            <span key={i} className="px-2 py-0.5 text-xs bg-cta/10 text-cta rounded-md">{t}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {s.stockMentions?.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-text-muted uppercase mb-1.5 flex items-center gap-1">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-cta" />Stocks / Companies
                        </h4>
                        <div className="space-y-2">
                          {s.stockMentions.map((sm, i) => (
                            <div key={i} className="rounded-lg border border-border p-3">
                              <div className="flex items-center gap-2 mb-1">
                                <Building2 className="w-3.5 h-3.5 text-cta" />
                                <span className="text-sm font-semibold text-text">{sm.name}</span>
                              </div>
                              <p className="text-xs text-text-muted leading-relaxed mb-1.5">{sm.summary}</p>
                              {sm.sources?.map((src, j) => (
                                <div key={j} className="flex items-start gap-1 text-[11px] text-text-muted/70">
                                  <span className="text-cta/60 font-medium">{src.user}</span>
                                  <span className="truncate">{src.snippet}</span>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {s.aiCompanyMentions?.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-text-muted uppercase mb-1.5 flex items-center gap-1">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-purple-500" />AI Companies
                        </h4>
                        <div className="space-y-2">
                          {s.aiCompanyMentions.map((sm, i) => (
                            <div key={i} className="rounded-lg border border-border p-3">
                              <div className="flex items-center gap-2 mb-1">
                                <Brain className="w-3.5 h-3.5 text-purple-500" />
                                <span className="text-sm font-semibold text-text">{sm.name}</span>
                              </div>
                              <p className="text-xs text-text-muted leading-relaxed mb-1.5">{sm.summary}</p>
                              {sm.sources?.map((src, j) => (
                                <div key={j} className="flex items-start gap-1 text-[11px] text-text-muted/70">
                                  <span className="text-purple-500/60 font-medium">{src.user}</span>
                                  <span className="truncate">{src.snippet}</span>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {s.notableImages?.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-text-muted uppercase mb-1.5">Notable Images</h4>
                        <div className="space-y-1">
                          {s.notableImages.map((img, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs">
                              <span className="text-cta/60 font-medium shrink-0">{img.user}</span>
                              <span className="text-text-muted">{img.description}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {savedSummaries.length === 0 && !summaryLoading && !summaryError && (
          <p className="text-sm text-text-muted/50 text-center py-3 mb-4 border border-dashed border-border rounded-xl">
            No AI summary for this date. Click "AI Daily Summary" to generate.
          </p>
        )}

        {!data ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <User className="w-12 h-12 text-text-muted/20 mx-auto mb-3" />
              <p className="text-sm text-text-muted">No data available. Select a date and click "Fetch From" to scrape.</p>
            </div>
          </div>
        ) : filteredTweets.length === 0 ? (
          <div className="text-center py-8 text-sm text-text-muted">No tweets for this filter</div>
        ) : (
          <div className="space-y-3">
            {filteredTweets.map((tweet) => (
              <div
                key={tweet.id}
                className="bg-surface rounded-xl border border-border p-4 hover:border-cta/20 transition-colors duration-200"
              >
                {/* User & Time */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-cta/10 flex items-center justify-center text-cta text-xs font-bold">
                      {tweet.username[0]?.toUpperCase()}
                    </div>
                    <span className="text-sm font-semibold text-text">@{tweet.username}</span>
                  </div>
                  <span className="text-xs text-text-muted">{formatTime(tweet.created_at)}</span>
                </div>

                {/* Tweet Text */}
                <p className="text-sm text-text leading-relaxed whitespace-pre-wrap break-words">
                  {tweet.text || '(image/video post)'}
                </p>

                {/* Tweet Images */}
                {tweet.image_paths && tweet.image_paths.length > 0 && (
                  <div className="mt-2 flex gap-1.5 flex-wrap">
                    {tweet.image_paths.map((imgPath, idx) => {
                      const filename = imgPath.split('/').pop();
                      return (
                        <img
                          key={idx}
                          src={`/api/xv/images/${filename}`}
                          alt={`Image ${idx + 1}`}
                          className="h-20 w-20 rounded-md border border-border object-cover hover:opacity-90 transition-opacity duration-200 cursor-pointer flex-shrink-0"
                          loading="lazy"
                          onClick={() => {
                            const images = tweet.image_paths!.map(p => `/api/xv/images/${p.split('/').pop()}`);
                            openLightbox(images, idx);
                          }}
                        />
                      );
                    })}
                  </div>
                )}

                {/* Metrics & Link */}
                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1 text-xs text-text-muted">
                      <Heart className="w-3 h-3" />{tweet.metrics.likes}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-text-muted">
                      <Repeat className="w-3 h-3" />{tweet.metrics.retweets}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-text-muted">
                      <MessageCircle className="w-3 h-3" />{tweet.metrics.replies}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-text-muted">
                      <Eye className="w-3 h-3" />{tweet.metrics.views}
                    </span>
                  </div>
                  <a
                    href={tweet.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-cta hover:text-cta-hover transition-colors duration-200"
                  >
                    <ExternalLink className="w-3 h-3" />View on X
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxImages.length > 0 && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={closeLightbox}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <button
            onClick={closeLightbox}
            className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors duration-200 cursor-pointer z-10"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Prev arrow */}
          {lightboxImages.length > 1 && lightboxIndex > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); setLightboxIndex(lightboxIndex - 1); }}
              className="absolute left-4 w-9 h-9 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors duration-200 cursor-pointer z-10"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}

          {/* Next arrow */}
          {lightboxImages.length > 1 && lightboxIndex < lightboxImages.length - 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); setLightboxIndex(lightboxIndex + 1); }}
              className="absolute right-4 w-9 h-9 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors duration-200 cursor-pointer z-10"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          )}

          <img
            src={lightboxImages[lightboxIndex]}
            alt="Preview"
            className="relative max-w-[90vw] max-h-[90vh] rounded-lg shadow-2xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />

          {/* Indicator */}
          {lightboxImages.length > 1 && (
            <span className="absolute bottom-4 text-xs text-white/70">
              {lightboxIndex + 1} / {lightboxImages.length}
            </span>
          )}
        </div>
      )}
    </div>
  );
}