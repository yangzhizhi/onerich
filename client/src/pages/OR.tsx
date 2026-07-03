import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import {
  RefreshCw,
  Search,
  Loader2,
  FileText,
  TrendingUp,
  Target,
  Shield,
  AlertTriangle,
  Sparkles,
  ChevronRight,
  Trophy,
  Languages,
  Terminal,
  CheckCircle2,
} from 'lucide-react';
import { api } from '../api';
import type { ORReport, ORReportDetail, ORResearchStatus, ORActiveTask } from '../types';

// ---------- lightweight markdown renderer (reports use a small MD subset) ----------
function renderInline(text: string): React.ReactNode[] {
  // **bold** and *italic*
  const nodes: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('**')) nodes.push(<strong key={key++} className="font-semibold text-text">{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith('`')) nodes.push(<code key={key++} className="px-1 py-0.5 rounded bg-hover text-cta text-[0.85em] font-mono">{tok.slice(1, -1)}</code>);
    else nodes.push(<em key={key++}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function Markdown({ source }: { source: string }) {
  const blocks = useMemo(() => {
    const out: React.ReactNode[] = [];
    const segments = source.split(/```/);
    segments.forEach((seg, i) => {
      if (i % 2 === 1) {
        // code block — may start with a language-hint line
        const lines = seg.replace(/^\n/, '').split('\n');
        if (lines[0] && !/[\s│┌┐└┘─├┤]/.test(lines[0].trim()) && lines[0].trim().length < 20) {
          // drop language hint like "text"
          lines.shift();
        }
        out.push(
          <pre key={`c${i}`} className="my-3 p-4 rounded-xl bg-[#0d1117] text-gray-200 text-xs leading-relaxed overflow-x-auto font-mono whitespace-pre border border-border">
            {lines.join('\n').replace(/\n$/, '')}
          </pre>
        );
        return;
      }
      // normal markdown — process line by line, grouping tables and lists
      const mdLines = seg.split('\n');
      let li2 = 0;
      while (li2 < mdLines.length) {
        const ln = mdLines[li2];
        const trimmed = ln.trim();

        // blank line
        if (trimmed === '') { li2++; continue; }

        // horizontal rule
        if (/^-{3,}$/.test(trimmed)) {
          out.push(<hr key={`h${i}-${li2}`} className="my-4 border-border" />);
          li2++; continue;
        }

        // heading
        const h = trimmed.match(/^(#{1,4})\s+(.*)/);
        if (h) {
          const level = h[1].length;
          const cls = level === 1 ? 'text-xl font-bold text-text mt-5 mb-3'
            : level === 2 ? 'text-lg font-semibold text-text mt-5 mb-2'
            : level === 3 ? 'text-base font-semibold text-text mt-4 mb-1.5'
            : 'text-sm font-semibold text-text-muted mt-3 mb-1';
          out.push(<div key={`hd${i}-${li2}`} className={cls}>{renderInline(h[2])}</div>);
          li2++; continue;
        }

        // table: a line starting with | and the next line is a separator row
        if (trimmed.startsWith('|') && li2 + 1 < mdLines.length && /^\|\s*[-:]+[-|\s:]+\|\s*$/.test(mdLines[li2 + 1].trim())) {
          const tableLines: string[] = [];
          while (li2 < mdLines.length && mdLines[li2].trim().startsWith('|')) {
            tableLines.push(mdLines[li2].trim());
            li2++;
          }
          // first row = header, second = separator (skip), rest = body
          const headerCells = tableLines[0].slice(1, -1).split('|').map(c => c.trim());
          const bodyRows = tableLines.slice(2).map(row =>
            row.replace(/^\||\|$/g, '').split('|').map(c => c.trim())
          );
          out.push(
            <div key={`tbl${i}-${li2}`} className="my-3 overflow-x-auto">
              <table className="w-full text-xs border-collapse border border-border rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-hover/60">
                    {headerCells.map((c, ci) => (
                      <th key={ci} className="border border-border px-2.5 py-1.5 text-left font-semibold text-text whitespace-nowrap">{renderInline(c)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bodyRows.map((row, ri) => (
                    <tr key={ri} className="even:bg-hover/20">
                      {row.map((c, ci) => (
                        <td key={ci} className="border border-border px-2.5 py-1.5 text-text-muted align-top">{renderInline(c)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
          continue;
        }

        // blockquote
        if (/^>\s?/.test(trimmed)) {
          const quoteLines: string[] = [];
          while (li2 < mdLines.length && /^>\s?/.test(mdLines[li2].trim())) {
            quoteLines.push(mdLines[li2].trim().replace(/^>\s?/, ''));
            li2++;
          }
          out.push(
            <blockquote key={`bq${i}-${li2}`} className="my-2 pl-3 border-l-2 border-cta/40 text-sm text-text-muted italic">
              {quoteLines.join(' ')}
            </blockquote>
          );
          continue;
        }

        // unordered list
        if (/^[-*]\s+/.test(trimmed)) {
          const items: React.ReactNode[] = [];
          while (li2 < mdLines.length && /^[-*]\s+/.test(mdLines[li2].trim())) {
            const itemKey = `l${i}-${li2}`;
            items.push(
              <li key={itemKey} className="ml-5 text-sm text-text leading-relaxed list-disc marker:text-text-muted/50">
                {renderInline(mdLines[li2].trim().replace(/^[-*]\s+/, ''))}
              </li>
            );
            li2++;
          }
          out.push(<ul key={`ul${i}-${li2}`} className="my-1.5 space-y-0.5">{items}</ul>);
          continue;
        }

        // paragraph
        out.push(<p key={`p${i}-${li2}`} className="text-sm text-text leading-relaxed my-1">{renderInline(trimmed)}</p>);
        li2++;
      }
    });
    return out;
  }, [source]);

  return <div className="markdown-body">{blocks}</div>;
}

// ---------- i18n ----------
type Lang = 'en' | 'zh';

const I18N = {
  subtitle:           { en: 'OneRich Systematic Research', zh: 'OneRich 系统化研究' },
  researchPlaceholder:{ en: 'Ticker e.g. AAPL', zh: '代码 例 AAPL' },
  research:           { en: 'Research', zh: '研究' },
  triggering:         { en: 'Starting...', zh: '启动中...' },
  refresh:            { en: 'Refresh', zh: '刷新' },
  filterPlaceholder:  { en: 'Filter ticker / company', zh: '筛选代码 / 公司' },
  noReports:          { en: 'No reports yet.', zh: '暂无报告。' },
  noReportsHint:      { en: 'Enter a ticker and click Research.', zh: '输入代码并点击研究。' },
  selectPrompt:       { en: 'Select a report from the list, or research a new ticker.', zh: '从列表选择报告，或研究新代码。' },
  loadFailed:         { en: 'Failed to load report.', zh: '加载报告失败。' },
  score:              { en: 'Score', zh: '评分' },
  conviction:         { en: 'conviction', zh: '确信度' },
  lblTarget:          { en: 'Target', zh: '目标价' },
  lblBuyZone:         { en: 'Buy Zone', zh: '买入区间' },
  lblStopLoss:        { en: 'Stop Loss', zh: '止损' },
  lblRRPos:           { en: 'R/R · Position', zh: '风险回报 · 仓位' },
  lblCatalyst:        { en: 'Catalyst: ', zh: '催化剂：' },
  lblKeyRisk:         { en: 'Key Risk: ', zh: '关键风险：' },
  triggerFailed:      { en: 'Trigger failed', zh: '启动失败' },
  statusRunning:      { en: 'Analysis in progress', zh: '分析进行中' },
  statusDone:         { en: 'Analysis complete', zh: '分析完成' },
  statusIdle:         { en: 'Process finished — check for report below', zh: '进程已结束 — 请检查下方是否有报告' },
  logTitle:           { en: 'Headless log', zh: '运行日志' },
};

// ---------- decision badge color ----------
function decisionColor(decision: string): { bg: string; text: string; dot: string } {
  const d = decision.toUpperCase();
  if (d.includes('BUY')) return { bg: 'bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' };
  if (d.includes('SELL')) return { bg: 'bg-red-500/10', text: 'text-red-600 dark:text-red-400', dot: 'bg-red-500' };
  if (d.includes('HOLD') || d.includes('WAIT')) return { bg: 'bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-500' };
  return { bg: 'bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400', dot: 'bg-blue-500' };
}

export default function OR() {
  const [reports, setReports] = useState<ORReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem('or-lang') as Lang) || 'en');
  const [selected, setSelected] = useState<{ date: string; ticker: string } | null>(null);
  const [detail, setDetail] = useState<ORReportDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [tickerInput, setTickerInput] = useState('');
  const [triggering, setTriggering] = useState(false);
  const [triggerMsg, setTriggerMsg] = useState('');
  const [filter, setFilter] = useState('');

  // --- headless research status tracking ---
  const [activeTicker, setActiveTicker] = useState<string | null>(null);
  const [researchStatus, setResearchStatus] = useState<ORResearchStatus | null>(null);
  const [showLog, setShowLog] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pollStatus = useCallback(async (ticker: string, autoRefresh = false) => {
    try {
      const s = await api.getORResearchStatus(ticker);
      setResearchStatus(s);
      if (s.status === 'done') {
        // Stop polling and refresh the report list.
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        setActiveTicker(null);
        setTriggerMsg('');
        loadReports(true);
        if (autoRefresh) {
          // auto-select the fresh report if it exists
          const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
          setSelected({ date: today, ticker });
        }
      }
    } catch { /* ignore transient errors */ }
  }, []);

  // Cleanup polling on unmount.
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const loadReports = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const r = await api.getORReports();
      setReports(r);
      // auto-select first if nothing selected
      if (r.length > 0) {
        setSelected(prev => prev ?? { date: r[0].date, ticker: r[0].ticker });
      }
    } catch (err) {
      console.error('Failed to load O-R reports:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => { loadReports(); }, []);

  // On mount: check for any running research tasks and resume polling.
  // This restores progress display when returning to the page after navigation.
  useEffect(() => {
    let cancelled = false;
    api.getORActiveResearch().then((tasks: ORActiveTask[]) => {
      if (cancelled || !tasks || tasks.length === 0) return;
      const running = tasks.filter(t => t.status === 'running');
      const done = tasks.filter(t => t.status === 'done');
      if (done.length > 0) {
        // Refresh report list to surface newly completed reports.
        loadReports(true);
      }
      if (running.length > 0) {
        const ticker = running[0].ticker;
        setActiveTicker(ticker);
        setShowLog(true);
        pollStatus(ticker, true);
        pollRef.current = setInterval(() => pollStatus(ticker, true), 8000);
      }
    }).catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selected) { setDetail(null); return; }
    setDetailLoading(true);
    api.getORReport(selected.date, selected.ticker)
      .then(setDetail)
      .catch(err => { console.error('Failed to load report:', err); setDetail(null); })
      .finally(() => setDetailLoading(false));
  }, [selected]);

  const handleResearch = async () => {
    const t = tickerInput.trim().toUpperCase();
    if (!t) return;
    setTriggering(true);
    setTriggerMsg('');
    setResearchStatus(null);
    try {
      const r = await api.triggerORResearch(t);
      setTriggerMsg(r.message);
      setTickerInput('');
      if (r.status === 'running') {
        setActiveTicker(t);
        setShowLog(true);
        // Start polling every 8 seconds.
        pollStatus(t);
        pollRef.current = setInterval(() => pollStatus(t, true), 8000);
      }
    } catch (err: any) {
      setTriggerMsg(err?.message || I18N.triggerFailed[lang]);
    } finally {
      setTriggering(false);
    }
  };

  // group reports by date
  const grouped = useMemo(() => {
    const f = filter.trim().toUpperCase();
    const filtered = f
      ? reports.filter(r => r.ticker.includes(f) || r.company.toUpperCase().includes(f))
      : reports;
    const map = new Map<string, ORReport[]>();
    for (const r of filtered) {
      if (!map.has(r.date)) map.set(r.date, []);
      map.get(r.date)!.push(r);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [reports, filter]);

  if (loading) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 text-cta animate-spin" /></div>;
  }

  return (
    <div className="h-full flex flex-col -m-6">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-lg flex items-center justify-center">
              <Trophy className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-text leading-tight">O-R</h1>
              <span className="text-xs text-text-muted">{I18N.subtitle[lang]}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Language toggle */}
            <button
              onClick={() => setLang(p => {
                const next = p === 'en' ? 'zh' : 'en';
                localStorage.setItem('or-lang', next);
                return next;
              })}
              title={lang === 'en' ? '切换到中文' : 'Switch to English'}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-sm font-medium text-text-muted bg-hover/50 rounded-lg hover:bg-hover hover:text-text transition-colors duration-200 cursor-pointer"
            >
              <Languages className="w-3.5 h-3.5" />
              {lang === 'en' ? '中文' : 'EN'}
            </button>
            {/* Ticker research trigger */}
            <div className="flex items-center gap-1.5">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-text-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={tickerInput}
                  onChange={e => setTickerInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleResearch(); }}
                  placeholder={I18N.researchPlaceholder[lang]}
                  className="text-sm text-text bg-input-bg border border-border rounded-lg pl-8 pr-3 py-1.5 w-40 focus:outline-none focus:ring-2 focus:ring-cta/30"
                />
              </div>
              <button
                onClick={handleResearch}
                disabled={triggering || !tickerInput.trim()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-cta text-white rounded-lg hover:bg-cta-hover transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {triggering ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                {triggering ? I18N.triggering[lang] : I18N.research[lang]}
              </button>
            </div>
            <button
              onClick={() => loadReports()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-cta/10 text-cta rounded-lg hover:bg-cta/20 transition-colors duration-200 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" /> {I18N.refresh[lang]}
            </button>
          </div>
        </div>
        {(triggerMsg || activeTicker) && (
          <div className="mt-2 space-y-1.5">
            {/* Status row */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-500/10 border border-violet-500/20">
              {researchStatus?.status === 'running' ? (
                <Loader2 className="w-3.5 h-3.5 text-violet-500 shrink-0 animate-spin" />
              ) : researchStatus?.status === 'done' ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-violet-500 shrink-0" />
              )}
              <p className="text-xs text-violet-600 dark:text-violet-300 leading-relaxed flex-1">
                {triggerMsg}
                {activeTicker && researchStatus?.status === 'running' && (
                  <span className="font-mono ml-1">[{activeTicker}] {I18N.statusRunning[lang]}…</span>
                )}
                {activeTicker && researchStatus?.status === 'idle' && (
                  <span className="font-mono ml-1">[{activeTicker}] {I18N.statusIdle[lang]}</span>
                )}
              </p>
              {/* Toggle log visibility */}
              {researchStatus?.log && (
                <button
                  onClick={() => setShowLog(p => !p)}
                  className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium text-violet-600 dark:text-violet-300 bg-violet-500/10 rounded hover:bg-violet-500/20 transition-colors cursor-pointer"
                >
                  <Terminal className="w-3 h-3" />
                  {I18N.logTitle[lang]}
                </button>
              )}
            </div>
            {/* Collapsible log panel */}
            {showLog && researchStatus?.log && (
              <pre className="px-3 py-2 rounded-lg bg-[#0d1117] text-gray-400 text-[11px] leading-relaxed overflow-x-auto font-mono whitespace-pre max-h-44 overflow-y-auto border border-border">
                {researchStatus.log}
              </pre>
            )}
          </div>
        )}
      </div>

      {/* Body: split list / viewer */}
      <div className="flex-1 flex overflow-hidden">
        {/* Report list */}
        <div className="w-72 border-r border-border overflow-y-auto shrink-0">
          {/* filter */}
          <div className="p-3 sticky top-0 bg-surface z-10 border-b border-border">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-text-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={filter}
                onChange={e => setFilter(e.target.value)}
                placeholder={I18N.filterPlaceholder[lang]}
                className="text-xs text-text bg-input-bg border border-border rounded-lg pl-8 pr-3 py-1.5 w-full focus:outline-none focus:ring-2 focus:ring-cta/30"
              />
            </div>
          </div>

          {grouped.length === 0 ? (
            <div className="p-6 text-center">
              <FileText className="w-10 h-10 text-text-muted/20 mx-auto mb-2" />
              <p className="text-sm text-text-muted">{I18N.noReports[lang]}</p>
              <p className="text-xs text-text-muted/60 mt-1">{I18N.noReportsHint[lang]}</p>
            </div>
          ) : (
            <div className="p-2">
              {grouped.map(([date, items]) => (
                <div key={date} className="mb-3">
                  <div className="px-2 py-1 text-[11px] font-semibold text-text-muted/70 uppercase tracking-wider sticky top-[52px] bg-surface">
                    {date}
                  </div>
                  {items.map(r => {
                    const c = decisionColor(r.decision);
                    const isSel = selected?.date === r.date && selected?.ticker === r.ticker;
                    return (
                      <button
                        key={`${r.date}-${r.ticker}`}
                        onClick={() => setSelected({ date: r.date, ticker: r.ticker })}
                        className={`w-full text-left px-2.5 py-2 rounded-lg transition-colors duration-150 cursor-pointer mb-0.5 ${
                          isSel ? 'bg-cta/10 ring-1 ring-cta/30' : 'hover:bg-hover'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className={`w-1.5 h-1.5 rounded-full ${c.dot} shrink-0`} />
                            <span className="text-sm font-semibold text-text">{r.ticker}</span>
                          </div>
                          {r.decision && (
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${c.bg} ${c.text} shrink-0`}>
                              {r.decision.split('(')[0].trim()}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-text-muted truncate mt-0.5">{r.company}</p>
                        <div className="flex items-center gap-2 mt-1 text-[10px] text-text-muted/70">
                          {r.score && <span>Score {r.score.split('/')[0]}</span>}
                          {r.target && <span className="truncate">→ {r.target.split('(')[0].trim()}</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Report viewer */}
        <div ref={detailRef} className="flex-1 overflow-y-auto">
          {!selected ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <Trophy className="w-14 h-14 text-text-muted/20 mx-auto mb-3" />
                <p className="text-sm text-text-muted">{I18N.selectPrompt[lang]}</p>
              </div>
            </div>
          ) : detailLoading ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="w-6 h-6 text-cta animate-spin" />
            </div>
          ) : !detail ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-sm text-text-muted">{I18N.loadFailed[lang]}</p>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto px-6 py-5">
              {/* Decision Summary highlight card */}
              {detail.card && detail.card.decision && (
                <DecisionHighlight card={detail.card} lang={lang} />
              )}
              {/* full markdown */}
              <div className="mt-4">
                <Markdown source={detail.markdown} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Decision Summary highlight card ----------
function DecisionHighlight({ card, lang }: { card: ORReportDetail['card']; lang: Lang }) {
  const c = decisionColor(card.decision);
  const scoreNum = parseInt(card.score, 10);
  return (
    <div className="rounded-2xl border border-border bg-gradient-to-br from-surface to-hover/40 overflow-hidden">
      <div className="px-5 py-3 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-cta/10 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-cta" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-text">{card.ticker}</span>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${c.bg} ${c.text}`}>{card.decision}</span>
            </div>
            <p className="text-xs text-text-muted">{card.company} · {card.currentPrice}</p>
          </div>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-text">{isNaN(scoreNum) ? card.score : scoreNum}</span>
            {!isNaN(scoreNum) && <span className="text-sm text-text-muted">/100</span>}
          </div>
          <span className="text-[11px] text-text-muted">{I18N.score[lang]} · {card.conviction} {I18N.conviction[lang]}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border">
        <SummaryTile icon={<Target className="w-3.5 h-3.5" />} label={I18N.lblTarget[lang]} value={card.target} accent="text-cta" />
        <SummaryTile icon={<TrendingUp className="w-3.5 h-3.5" />} label={I18N.lblBuyZone[lang]} value={card.buyZone} accent="text-emerald-500" />
        <SummaryTile icon={<Shield className="w-3.5 h-3.5" />} label={I18N.lblStopLoss[lang]} value={card.stopLoss} accent="text-red-500" />
        <SummaryTile icon={<ChevronRight className="w-3.5 h-3.5" />} label={I18N.lblRRPos[lang]} value={`${card.riskReward || '—'} · ${card.position || '—'}`} accent="text-text" />
      </div>
      {(card.keyCatalyst || card.keyRisk) && (
        <div className="px-5 py-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          {card.keyCatalyst && (
            <div className="flex items-start gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-cta shrink-0 mt-0.5" />
              <div><span className="font-semibold text-text">{I18N.lblCatalyst[lang]}</span><span className="text-text-muted">{card.keyCatalyst}</span></div>
            </div>
          )}
          {card.keyRisk && (
            <div className="flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
              <div><span className="font-semibold text-text">{I18N.lblKeyRisk[lang]}</span><span className="text-text-muted">{card.keyRisk}</span></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryTile({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent: string }) {
  return (
    <div className="bg-surface px-4 py-2.5">
      <div className="flex items-center gap-1 text-[10px] font-medium text-text-muted uppercase tracking-wide mb-0.5">
        {icon}{label}
      </div>
      <p className={`text-sm font-semibold ${accent}`}>{value || '—'}</p>
    </div>
  );
}
