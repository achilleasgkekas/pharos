'use client';
import { useMemo, useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  MessageSquare,
  Search,
  Trash2,
  Check,
  ChevronDown,
  Activity,
  Download,
  X,
  Copy,
  Clock,
  Coins,
  Cpu,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { PAGE_MAIN, PageHeader } from '@/components/ui/PageHeader';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { cn } from '@/components/ui/cn';
import { Modal } from '@/components/ui/Modal';
import { DateInput } from '@/components/ui/DateInput';
import {
  deleteConversation,
  clearConversations,
  getAiRunsAction,
  exportRunsCsvAction,
  type ConversationRow,
} from './actions';
import type { SerializedAiRun, AiRunSummary, AiRunFilter } from '@/lib/aiRun';
import { useT } from '@/components/LocaleProvider';
import { relTime } from '@/lib/i18n/format';

function renderRich(text: string) {
  return text.split('\n').map((line, li, arr) => (
    <span key={li}>
      {line.split(/(\*\*[^*]+\*\*)/g).map((p, pi) =>
        /^\*\*[^*]+\*\*$/.test(p) ? <strong key={pi}>{p.slice(2, -2)}</strong> : p
      )}
      {li < arr.length - 1 && <br />}
    </span>
  ));
}

const FEATURE_LABELS: Record<string, string> = {
  commandBar: 'Command bar',
  receipts: 'Receipts',
  expenses: 'Bills & payslips',
  statements: 'Statements',
  statementCategorize: 'Categorize',
  itemsImport: 'Product import',
  scraperPrice: 'Price scraper',
  productPhoto: 'Product photo',
  vehicles: 'Vehicles',
  vouchers: 'Vouchers',
  cards: 'Cards',
  subscriptions: 'Subscriptions',
  test: 'Test probe',
};

function formatCost(
  micros: number,
  currency: string = 'EUR',
  fxRate: number = 0.92
): { primary: string; usd: string } {
  if (micros === 0) {
    const sym = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : `${currency} `;
    return { primary: `${sym}0.00`, usd: '$0.00' };
  }
  const dollars = micros / 1_000_000;
  const sym = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : `${currency} `;
  const usd =
    dollars < 0.0001
      ? '<$0.0001'
      : dollars < 0.01
      ? `$${dollars.toFixed(4)}`
      : `$${dollars.toFixed(2)}`;

  if (currency === 'USD' || fxRate === 1) {
    return { primary: usd, usd };
  }

  const localVal = dollars * fxRate;
  let primary: string;
  if (localVal < 0.0001) primary = `<${sym}0.0001`;
  else if (localVal < 0.01) primary = `${sym}${localVal.toFixed(4)}`;
  else primary = `${sym}${localVal.toFixed(2)}`;

  return { primary, usd };
}

function getDatePresetRange(preset: string): { from?: string; to?: string } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  if (preset === 'today') {
    const todayStr = fmt(now);
    return { from: todayStr, to: todayStr };
  }
  if (preset === 'yesterday') {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    const yStr = fmt(y);
    return { from: yStr, to: yStr };
  }
  if (preset === '7d') {
    const past = new Date(now);
    past.setDate(past.getDate() - 6);
    return { from: fmt(past), to: fmt(now) };
  }
  if (preset === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: fmt(start), to: fmt(now) };
  }
  return {};
}

export function HistoryClient({
  conversations,
  initialRunsData,
  currency = 'EUR',
  fxRate = 0.92,
}: {
  conversations: ConversationRow[];
  initialRunsData?: {
    runs: SerializedAiRun[];
    total: number;
    summary: AiRunSummary;
    dailyCosts: { date: string; costMicros: number; count: number }[];
  };
  currency?: string;
  fxRate?: number;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const t = useT();
  const [pending, start] = useTransition();

  const [activeTab, setActiveTab] = useState<'runs' | 'conversations'>('runs');

  // ─── Runs state & filters ─────────────────────────────────────────────────
  const [runsData, setRunsData] = useState(
    initialRunsData ?? {
      runs: [],
      total: 0,
      summary: { totalRuns: 0, totalCostMicros: 0, totalInputTokens: 0, totalOutputTokens: 0 },
      dailyCosts: [],
    }
  );
  const [datePreset, setDatePreset] = useState<'all' | 'today' | 'yesterday' | '7d' | 'month' | 'custom'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [featureFilter, setFeatureFilter] = useState('all');
  const [modelFilter, setModelFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedRun, setSelectedRun] = useState<SerializedAiRun | null>(null);
  const [exporting, setExporting] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedOutput, setCopiedOutput] = useState(false);

  // Extract distinct models from returned runs for quick filter dropdown
  const modelOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of runsData.runs) {
      if (r.model) set.add(r.model);
    }
    return Array.from(set).sort();
  }, [runsData.runs]);

  async function loadRuns(filterOverrides?: Partial<AiRunFilter>) {
    start(async () => {
      const filters: AiRunFilter = {
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        feature: featureFilter !== 'all' ? featureFilter : undefined,
        model: modelFilter !== 'all' ? modelFilter : undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        limit: 150,
        ...filterOverrides,
      };
      const res = await getAiRunsAction(filters);
      setRunsData(res);
    });
  }

  function handlePresetChange(preset: 'all' | 'today' | 'yesterday' | '7d' | 'month' | 'custom') {
    setDatePreset(preset);
    if (preset === 'custom') return;
    const { from = '', to = '' } = getDatePresetRange(preset);
    setDateFrom(from);
    setDateTo(to);
    void loadRuns({
      dateFrom: from || undefined,
      dateTo: to || undefined,
      feature: featureFilter !== 'all' ? featureFilter : undefined,
      model: modelFilter !== 'all' ? modelFilter : undefined,
      status: statusFilter !== 'all' ? statusFilter : undefined,
    });
  }

  async function handleExportCsv() {
    setExporting(true);
    try {
      const filters: AiRunFilter = {
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        feature: featureFilter !== 'all' ? featureFilter : undefined,
        model: modelFilter !== 'all' ? modelFilter : undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      };
      const csv = await exportRunsCsvAction(filters);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pharos-ai-runs-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  // ─── Conversations state ──────────────────────────────────────────────────
  const [convSearch, setConvSearch] = useState('');
  const [openConvId, setOpenConvId] = useState<string | null>(null);

  const visibleConversations = useMemo(() => {
    const q = convSearch.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) => c.title.toLowerCase().includes(q) || c.messages.some((m) => m.content.toLowerCase().includes(q))
    );
  }, [conversations, convSearch]);

  async function delConversation(id: string) {
    const ok = await confirm({ title: t('history.confirmDelete'), confirmLabel: t('common.delete'), danger: true });
    if (!ok) return;
    start(async () => {
      await deleteConversation(id);
      if (openConvId === id) setOpenConvId(null);
      router.refresh();
    });
  }

  async function clearAllConversations() {
    const ok = await confirm({
      title: t('history.confirmClear'),
      message: t('history.confirmClearBody'),
      confirmLabel: t('history.clearAll'),
      danger: true,
    });
    if (!ok) return;
    start(async () => {
      await clearConversations();
      setOpenConvId(null);
      router.refresh();
    });
  }

  // Calculate max daily cost for chart scaling
  const maxDailyCost = useMemo(() => {
    return Math.max(1, ...runsData.dailyCosts.map((d) => d.costMicros));
  }, [runsData.dailyCosts]);

  return (
    <main className={PAGE_MAIN}>
      <PageHeader
        title={t('nav.history')}
        count={activeTab === 'runs' ? runsData.total : conversations.length}
        subtitle={
          activeTab === 'runs'
            ? 'Complete audit log of token usage, latency, and costs across all AI calls.'
            : t('history.intro')
        }
      >
        {activeTab === 'conversations' && conversations.length > 0 && (
          <Button variant="danger" onClick={clearAllConversations} disabled={pending}>
            <Trash2 size={14} /> {t('history.clearAll')}
          </Button>
        )}
        {activeTab === 'runs' && (
          <Button variant="secondary" onClick={handleExportCsv} disabled={exporting || pending}>
            <Download size={14} /> {exporting ? 'Exporting…' : 'Export CSV'}
          </Button>
        )}
      </PageHeader>

      {/* Tab Switcher */}
      <div className="flex border-b border-[color:var(--color-border)] mb-5">
        <button
          onClick={() => setActiveTab('runs')}
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
            activeTab === 'runs'
              ? 'border-[color:var(--color-accent)] text-[color:var(--color-accent)]'
              : 'border-transparent text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)]'
          )}
        >
          <Activity size={16} />
          <span>AI Runs</span>
          <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-[color:var(--color-surface-2)] text-[color:var(--color-text-dim)] font-mono">
            {runsData.total}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('conversations')}
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
            activeTab === 'conversations'
              ? 'border-[color:var(--color-accent)] text-[color:var(--color-accent)]'
              : 'border-transparent text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)]'
          )}
        >
          <MessageSquare size={16} />
          <span>Command Bar</span>
          <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-[color:var(--color-surface-2)] text-[color:var(--color-text-dim)] font-mono">
            {conversations.length}
          </span>
        </button>
      </div>

      {activeTab === 'runs' && (
        <div className="space-y-5">
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-3.5">
              <div className="text-[11px] uppercase tracking-wider font-semibold text-[color:var(--color-text-dim)] mb-1">
                Total Calls
              </div>
              <div className="text-2xl font-bold font-mono text-[color:var(--color-text)]">
                {runsData.summary.totalRuns.toLocaleString()}
              </div>
            </div>
            <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-3.5">
              <div className="text-[11px] uppercase tracking-wider font-semibold text-[color:var(--color-text-dim)] mb-1">
                Total Spend ({currency})
              </div>
              <div className="text-2xl font-bold font-mono text-[color:var(--color-accent)]">
                {formatCost(runsData.summary.totalCostMicros, currency, fxRate).primary}
              </div>
              {currency !== 'USD' && (
                <div className="text-[11px] text-[color:var(--color-text-faint)] font-mono mt-0.5">
                  {formatCost(runsData.summary.totalCostMicros, currency, fxRate).usd}
                </div>
              )}
            </div>
            <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-3.5">
              <div className="text-[11px] uppercase tracking-wider font-semibold text-[color:var(--color-text-dim)] mb-1">
                Input Tokens
              </div>
              <div className="text-2xl font-bold font-mono text-[color:var(--color-text)]">
                {runsData.summary.totalInputTokens.toLocaleString()}
              </div>
            </div>
            <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-3.5">
              <div className="text-[11px] uppercase tracking-wider font-semibold text-[color:var(--color-text-dim)] mb-1">
                Output Tokens
              </div>
              <div className="text-2xl font-bold font-mono text-[color:var(--color-text)]">
                {runsData.summary.totalOutputTokens.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Daily Spend Mini Chart */}
          {runsData.dailyCosts.length > 0 && (
            <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--color-text-dim)]">
                  Daily Spend Trend
                </span>
                <span className="text-[11px] text-[color:var(--color-text-faint)]">
                  {runsData.dailyCosts.length} days recorded
                </span>
              </div>
              <div className="flex items-end gap-1.5 h-20 pt-2 overflow-x-auto pb-1">
                {runsData.dailyCosts.map((d) => {
                  const pct = Math.max(8, Math.round((d.costMicros / maxDailyCost) * 100));
                  return (
                    <div
                      key={d.date}
                      className="group relative flex-1 min-w-[14px] max-w-[28px] flex flex-col items-center justify-end h-full"
                    >
                      <div
                        className="w-full rounded-t bg-[color:var(--color-accent)]/70 hover:bg-[color:var(--color-accent)] transition-all cursor-pointer"
                        style={{ height: `${pct}%` }}
                      />
                      {/* Tooltip */}
                      <div className="pointer-events-none absolute bottom-full mb-1.5 hidden group-hover:flex flex-col items-center z-10">
                        <div className="rounded bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] px-2 py-1 text-[10px] whitespace-nowrap shadow-lg">
                          <span className="font-semibold">{d.date}</span>: {formatCost(d.costMicros, currency, fxRate).primary} ({d.count} calls)
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Filter Bar */}
          <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-[color:var(--color-text-dim)] mr-1">Period:</span>
              {(['all', 'today', 'yesterday', '7d', 'month', 'custom'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => handlePresetChange(p)}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-xs font-medium transition-colors',
                    datePreset === p
                      ? 'bg-[color:var(--color-accent)]/15 text-[color:var(--color-accent)] font-semibold'
                      : 'bg-[color:var(--color-surface-2)] text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)]'
                  )}
                >
                  {p === 'all'
                    ? 'All time'
                    : p === 'today'
                    ? 'Today'
                    : p === 'yesterday'
                    ? 'Yesterday'
                    : p === '7d'
                    ? 'Last 7 days'
                    : p === 'month'
                    ? 'This month'
                    : 'Custom'}
                </button>
              ))}

              {datePreset === 'custom' && (
                <div className="flex items-center gap-1.5 ml-2">
                  <div className="w-36">
                    <DateInput
                      value={dateFrom}
                      onValueChange={(val) => {
                        setDateFrom(val);
                        void loadRuns({ dateFrom: val || undefined });
                      }}
                      keepWhileTyping
                      className="py-1 text-xs"
                    />
                  </div>
                  <span className="text-xs text-[color:var(--color-text-dim)]">to</span>
                  <div className="w-36">
                    <DateInput
                      value={dateTo}
                      onValueChange={(val) => {
                        setDateTo(val);
                        void loadRuns({ dateTo: val || undefined });
                      }}
                      keepWhileTyping
                      className="py-1 text-xs"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-[color:var(--color-border)]">
              {/* Feature filter */}
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-[color:var(--color-text-dim)]">Feature:</span>
                <select
                  value={featureFilter}
                  onChange={(e) => {
                    setFeatureFilter(e.target.value);
                    void loadRuns({ feature: e.target.value !== 'all' ? e.target.value : undefined });
                  }}
                  className="px-2 py-1 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] text-[color:var(--color-text)] text-xs"
                >
                  <option value="all">All features</option>
                  {Object.entries(FEATURE_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Status filter */}
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-[color:var(--color-text-dim)]">Status:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    void loadRuns({ status: e.target.value !== 'all' ? e.target.value : undefined });
                  }}
                  className="px-2 py-1 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] text-[color:var(--color-text)] text-xs"
                >
                  <option value="all">All statuses</option>
                  <option value="ok">Ok</option>
                  <option value="error">Error</option>
                  <option value="blocked">Blocked (cap/off)</option>
                </select>
              </div>

              {/* Model filter */}
              {modelOptions.length > 0 && (
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-[color:var(--color-text-dim)]">Model:</span>
                  <select
                    value={modelFilter}
                    onChange={(e) => {
                      setModelFilter(e.target.value);
                      void loadRuns({ model: e.target.value !== 'all' ? e.target.value : undefined });
                    }}
                    className="px-2 py-1 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] text-[color:var(--color-text)] text-xs"
                  >
                    <option value="all">All models</option>
                    {modelOptions.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDatePreset('all');
                  setDateFrom('');
                  setDateTo('');
                  setFeatureFilter('all');
                  setModelFilter('all');
                  setStatusFilter('all');
                  void loadRuns({
                    dateFrom: undefined,
                    dateTo: undefined,
                    feature: undefined,
                    model: undefined,
                    status: undefined,
                  });
                }}
                disabled={pending}
                className="ml-auto text-xs py-1"
              >
                <RefreshCw size={12} className={cn(pending && 'animate-spin')} /> Reset
              </Button>
            </div>
          </div>

          {/* Runs Table */}
          {runsData.runs.length === 0 ? (
            <EmptyState icon={<Activity />} title="No AI runs found" hint="AI operations will appear here as they occur." />
          ) : (
            <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[color:var(--color-surface-2)] text-[color:var(--color-text-dim)] uppercase tracking-wider font-semibold border-b border-[color:var(--color-border)]">
                    <tr>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Time</th>
                      <th className="py-2.5 px-3">Feature</th>
                      <th className="py-2.5 px-3">Model</th>
                      <th className="py-2.5 px-3">Tokens</th>
                      <th className="py-2.5 px-3 text-right">Cost ({currency})</th>
                      <th className="py-2.5 px-3 text-right">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[color:var(--color-border)]">
                    {runsData.runs.map((r) => {
                      const totalTok = r.usage.inputTokens + r.usage.outputTokens;
                      const hasCache = r.usage.cacheWriteTokens > 0 || r.usage.cacheReadTokens > 0;
                      return (
                        <tr
                          key={r._id}
                          onClick={() => setSelectedRun(r)}
                          className="hover:bg-[color:var(--color-surface-2)]/50 cursor-pointer transition-colors"
                        >
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            {r.status === 'ok' ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                                ok
                              </span>
                            ) : r.status === 'blocked' ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-amber-500/15 text-amber-600 dark:text-amber-400">
                                blocked
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-red-500/15 text-red-600 dark:text-red-400">
                                error
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap text-[color:var(--color-text-dim)] font-mono text-[11px]">
                            {relTime(r.at, t)}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap font-medium text-[color:var(--color-text)]">
                            {FEATURE_LABELS[r.feature] ?? r.feature}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap font-mono text-[11px] text-[color:var(--color-text-dim)]">
                            <span className="text-[color:var(--color-text-faint)] mr-1">[{r.provider}]</span>
                            {r.model}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap font-mono text-[11px]">
                            <span>{totalTok.toLocaleString()}</span>
                            <span className="text-[color:var(--color-text-faint)] ml-1">
                              (↓{r.usage.inputTokens.toLocaleString()} ↑{r.usage.outputTokens.toLocaleString()})
                            </span>
                            {hasCache && (
                              <span className="text-[10px] ml-1 px-1 rounded bg-[color:var(--color-accent)]/10 text-[color:var(--color-accent)] font-sans">
                                cache
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap text-right font-mono font-medium text-[color:var(--color-accent)]">
                            <div>{formatCost(r.costMicros, currency, fxRate).primary}</div>
                            {currency !== 'USD' && (
                              <div className="text-[10px] text-[color:var(--color-text-faint)] font-normal">
                                {formatCost(r.costMicros, currency, fxRate).usd}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap text-right font-mono text-[11px] text-[color:var(--color-text-dim)]">
                            {r.durationMs >= 1000 ? `${(r.durationMs / 1000).toFixed(1)}s` : `${r.durationMs}ms`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Inspector Modal for selected AI run */}
          {selectedRun && (
            <Modal open={!!selectedRun} onClose={() => setSelectedRun(null)} title="AI Run Details" size="lg">
              <div className="p-6 space-y-5">
                <div className="flex items-center gap-2">
                  {selectedRun.status === 'ok' ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                      ok
                    </span>
                  ) : selectedRun.status === 'blocked' ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-amber-500/15 text-amber-600 dark:text-amber-400">
                      blocked
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-red-500/15 text-red-600 dark:text-red-400">
                      error
                    </span>
                  )}
                  <span className="text-xs text-[color:var(--color-text-faint)] font-mono">
                    {selectedRun.at}
                  </span>
                </div>

                {/* Key Metrics */}
                <div className="grid grid-cols-3 gap-3 p-3 rounded-xl bg-[color:var(--color-surface-2)]">
                  <div>
                    <div className="text-[10px] uppercase font-semibold text-[color:var(--color-text-dim)]">
                      Cost ({currency})
                    </div>
                    <div className="text-lg font-bold font-mono text-[color:var(--color-accent)]">
                      {formatCost(selectedRun.costMicros, currency, fxRate).primary}
                    </div>
                    {currency !== 'USD' && (
                      <div className="text-xs text-[color:var(--color-text-faint)] font-mono">
                        {formatCost(selectedRun.costMicros, currency, fxRate).usd}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-semibold text-[color:var(--color-text-dim)]">
                      Duration
                    </div>
                    <div className="text-lg font-bold font-mono text-[color:var(--color-text)]">
                      {selectedRun.durationMs >= 1000
                        ? `${(selectedRun.durationMs / 1000).toFixed(2)}s`
                        : `${selectedRun.durationMs}ms`}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-semibold text-[color:var(--color-text-dim)]">
                      Total Tokens
                    </div>
                    <div className="text-lg font-bold font-mono text-[color:var(--color-text)]">
                      {(selectedRun.usage.inputTokens + selectedRun.usage.outputTokens).toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Token Usage Breakdown */}
                <div className="space-y-2 border-t border-[color:var(--color-border)] pt-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-[color:var(--color-text-dim)]">
                    Token Breakdown
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                    <div className="flex justify-between p-2 rounded bg-[color:var(--color-surface-2)]">
                      <span className="text-[color:var(--color-text-dim)]">Input:</span>
                      <span className="font-semibold">{selectedRun.usage.inputTokens.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between p-2 rounded bg-[color:var(--color-surface-2)]">
                      <span className="text-[color:var(--color-text-dim)]">Output:</span>
                      <span className="font-semibold">{selectedRun.usage.outputTokens.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between p-2 rounded bg-[color:var(--color-surface-2)]">
                      <span className="text-[color:var(--color-text-dim)]">Cache Write:</span>
                      <span className="font-semibold">{selectedRun.usage.cacheWriteTokens.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between p-2 rounded bg-[color:var(--color-surface-2)]">
                      <span className="text-[color:var(--color-text-dim)]">Cache Read:</span>
                      <span className="font-semibold">{selectedRun.usage.cacheReadTokens.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {/* Diagnostics / Metadata */}
                <div className="space-y-2 border-t border-[color:var(--color-border)] pt-4 text-xs">
                  <div className="text-xs font-semibold uppercase tracking-wider text-[color:var(--color-text-dim)]">
                    Diagnostics
                  </div>
                  <div className="space-y-1.5 font-mono">
                    <div className="flex justify-between">
                      <span className="text-[color:var(--color-text-dim)]">Feature:</span>
                      <span className="font-sans font-medium">
                        {FEATURE_LABELS[selectedRun.feature] ?? selectedRun.feature}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[color:var(--color-text-dim)]">Provider / Model:</span>
                      <span>
                        {selectedRun.provider} / {selectedRun.model}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[color:var(--color-text-dim)]">Trigger:</span>
                      <span className="capitalize">{selectedRun.trigger}</span>
                    </div>
                    {selectedRun.requestId && (
                      <div className="flex items-center justify-between">
                        <span className="text-[color:var(--color-text-dim)]">Request ID:</span>
                        <div className="flex items-center gap-1">
                          <span className="truncate max-w-[200px]">{selectedRun.requestId}</span>
                          <button
                            onClick={() => {
                              void navigator.clipboard.writeText(selectedRun.requestId || '');
                              setCopiedId(true);
                              setTimeout(() => setCopiedId(false), 2000);
                            }}
                            className="p-1 text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)]"
                            title="Copy Request ID"
                          >
                            {copiedId ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                          </button>
                        </div>
                      </div>
                    )}
                    {selectedRun.stopReason && (
                      <div className="flex justify-between">
                        <span className="text-[color:var(--color-text-dim)]">Stop Reason:</span>
                        <span>{selectedRun.stopReason}</span>
                      </div>
                    )}
                    {selectedRun.conversationId && (
                      <div className="flex justify-between">
                        <span className="text-[color:var(--color-text-dim)]">Conversation:</span>
                        <span>
                          {selectedRun.conversationId.slice(0, 10)}… (turn {selectedRun.turn ?? 1})
                        </span>
                      </div>
                    )}
                    {selectedRun.record && (
                      <div className="flex justify-between">
                        <span className="text-[color:var(--color-text-dim)]">Linked Record:</span>
                        <span>
                          {selectedRun.record.type} #{selectedRun.record.id.slice(0, 8)}…
                        </span>
                      </div>
                    )}
                    {selectedRun.jobId && (
                      <div className="flex justify-between">
                        <span className="text-[color:var(--color-text-dim)]">Job ID:</span>
                        <span>{selectedRun.jobId}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Error message if present */}
                {selectedRun.error && (
                  <div className="space-y-1.5 border-t border-[color:var(--color-border)] pt-4">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-red-500">
                      <AlertTriangle size={14} /> Error Details
                    </div>
                    <pre className="p-3 rounded-lg border border-red-500/20 bg-red-500/5 text-red-600 dark:text-red-400 font-mono text-xs overflow-x-auto whitespace-pre-wrap">
                      {selectedRun.error}
                    </pre>
                  </div>
                )}

                {/* Prompt & Output Inspector */}
                <div className="space-y-4 border-t border-[color:var(--color-border)] pt-4">
                  {/* Prompt */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--color-text-dim)]">
                        {t('hist.prompt')}
                      </span>
                      {selectedRun.prompt && (
                        <button
                          type="button"
                          onClick={() => {
                            void navigator.clipboard.writeText(selectedRun.prompt || '');
                            setCopiedPrompt(true);
                            setTimeout(() => setCopiedPrompt(false), 2000);
                          }}
                          className="flex items-center gap-1 text-[11px] text-[color:var(--color-accent)] hover:underline"
                        >
                          {copiedPrompt ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                          <span>{copiedPrompt ? t('hist.copied') : t('hist.copyPrompt')}</span>
                        </button>
                      )}
                    </div>
                    {selectedRun.prompt ? (
                      <pre className="p-3 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] text-[color:var(--color-text)] font-mono text-xs overflow-x-auto whitespace-pre-wrap max-h-52">
                        {selectedRun.prompt}
                      </pre>
                    ) : (
                      <div className="text-xs text-[color:var(--color-text-dim)] italic p-2 rounded bg-[color:var(--color-surface-2)]">
                        {t('hist.noPrompt')}
                      </div>
                    )}
                  </div>

                  {/* Output */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--color-text-dim)]">
                        {t('hist.output')}
                      </span>
                      {selectedRun.output && (
                        <button
                          type="button"
                          onClick={() => {
                            void navigator.clipboard.writeText(selectedRun.output || '');
                            setCopiedOutput(true);
                            setTimeout(() => setCopiedOutput(false), 2000);
                          }}
                          className="flex items-center gap-1 text-[11px] text-[color:var(--color-accent)] hover:underline"
                        >
                          {copiedOutput ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                          <span>{copiedOutput ? t('hist.copied') : t('hist.copyOutput')}</span>
                        </button>
                      )}
                    </div>
                    {selectedRun.output ? (
                      <pre className="p-3 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] text-[color:var(--color-text)] font-mono text-xs overflow-x-auto whitespace-pre-wrap max-h-52">
                        {selectedRun.output}
                      </pre>
                    ) : (
                      <div className="text-xs text-[color:var(--color-text-dim)] italic p-2 rounded bg-[color:var(--color-surface-2)]">
                        {t('hist.noOutput')}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Modal>
          )}
        </div>
      )}

      {activeTab === 'conversations' && (
        <>
          {conversations.length === 0 ? (
            <EmptyState icon={<MessageSquare />} title={t('history.empty')} hint={t('history.emptyHint')} />
          ) : (
            <>
              <div className="mb-4">
                <Input
                  icon={<Search size={14} />}
                  value={convSearch}
                  onChange={(e) => setConvSearch(e.target.value)}
                  placeholder={t('history.searchPlaceholder')}
                  aria-label={t('common.search')}
                />
              </div>

              <div className="space-y-2">
                {visibleConversations.map((c) => {
                  const isOpen = openConvId === c.id;
                  return (
                    <div
                      key={c.id}
                      className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] overflow-hidden"
                    >
                      <div className="flex items-center gap-2 px-3 py-2.5">
                        <button
                          onClick={() => setOpenConvId(isOpen ? null : c.id)}
                          className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
                        >
                          <ChevronDown
                            size={15}
                            className={cn(
                              'shrink-0 text-[color:var(--color-text-faint)] transition-transform',
                              isOpen && 'rotate-180'
                            )}
                          />
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">{c.title}</div>
                            <div
                              className="text-[11px] text-[color:var(--color-text-faint)] truncate"
                              style={{ fontFamily: 'var(--font-mono)' }}
                            >
                              {t(c.turns === 1 ? 'history.prompt' : 'history.prompts', { n: c.turns })} ·{' '}
                              {relTime(c.updatedAt, t)}
                              {c.preview ? ` · ${c.preview}` : ''}
                            </div>
                          </div>
                        </button>
                        <button
                          onClick={() => delConversation(c.id)}
                          disabled={pending}
                          title={t('common.delete')}
                          className="shrink-0 grid place-items-center w-8 h-8 rounded-lg text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)] hover:bg-[color:var(--color-surface-2)] transition-colors"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>

                      {isOpen && (
                        <div className="border-t border-[color:var(--color-border)] p-3 space-y-2.5 bg-[color:var(--color-bg)]/30">
                          {c.messages.map((m, i) => (
                            <div
                              key={i}
                              className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}
                            >
                              <div
                                className={cn(
                                  'max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed',
                                  m.role === 'user'
                                    ? 'bg-[color:var(--color-accent)]/15 text-[color:var(--color-text)]'
                                    : 'bg-[color:var(--color-surface-2)] text-[color:var(--color-text)]'
                                )}
                              >
                                {m.role === 'assistant' ? renderRich(m.content) : m.content}
                                {m.actions && m.actions.length > 0 && (
                                  <div className="flex flex-wrap gap-1.5 mt-2">
                                    {m.actions.map((a, j) => (
                                      <span
                                        key={j}
                                        className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-[color:var(--color-accent)]/15 text-[color:var(--color-accent)]"
                                        style={{ fontFamily: 'var(--font-mono)' }}
                                      >
                                        <Check size={11} /> {a.summary}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                {visibleConversations.length === 0 && (
                  <EmptyState className="py-10" title={t('history.noMatch')} />
                )}
              </div>
            </>
          )}
        </>
      )}
    </main>
  );
}
