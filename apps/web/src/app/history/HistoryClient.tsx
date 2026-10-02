'use client';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { MessageSquare, Search, Trash2, Check, ChevronDown, Activity, Download, Copy, AlertTriangle } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input, filterControlClass } from '@/components/ui/Input';
import { PAGE_MAIN, PageHeader, HeaderButton, HeaderTotals, FilterLayout, FilterSection, FilterOptions } from '@/components/ui/PageHeader';
import { ActivityTabs } from '@/components/ui/ActivityTabs';
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
import { useLocale, useT } from '@/components/LocaleProvider';
import { relTime } from '@/lib/i18n/format';
import type { TKey } from '@/lib/i18n';

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

// AI run features, named as on Settings → Provider & features.
const FEATURE_KEYS: Record<string, TKey> = {
  commandBar: 'af.commandBar',
  receipts: 'af.receipts',
  expenses: 'af.expenses',
  statements: 'af.statements',
  statementCategorize: 'af.statementCategorize',
  itemsImport: 'af.itemsImport',
  scraperPrice: 'sys.checkScraper',
  productPhoto: 'af.productPhoto',
  vehicles: 'af.vehicles',
  vouchers: 'af.vouchers',
  cards: 'af.cards',
  subscriptions: 'af.subscriptions',
  test: 'hist.featTest',
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
  const locale = useLocale();
  const [pending, start] = useTransition();
  const featureLabel = (f: string) => (FEATURE_KEYS[f] ? t(FEATURE_KEYS[f]) : f);

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

  const filtersActive = featureFilter !== 'all' || statusFilter !== 'all' || modelFilter !== 'all' || datePreset === 'custom';
  function resetRunFilters() {
    setDatePreset('all');
    setDateFrom('');
    setDateTo('');
    setFeatureFilter('all');
    setModelFilter('all');
    setStatusFilter('all');
    void loadRuns({ dateFrom: undefined, dateTo: undefined, feature: undefined, model: undefined, status: undefined });
  }
  const cost = (micros: number) => formatCost(micros, currency, fxRate);
  const duration = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`);

  const periodSwitch = (
    <FilterOptions
      variant="segmented"
      value={datePreset === 'custom' || datePreset === 'yesterday' ? ('' as typeof datePreset) : datePreset}
      onChange={handlePresetChange}
      options={[
        { value: 'all', label: t('hist.pAll') },
        { value: 'today', label: t('hist.pToday') },
        { value: '7d', label: t('hist.p7d') },
        { value: 'month', label: t('hist.pMonth') },
      ]}
    />
  );
  const runFilters = (
    <div>
      <FilterSection label={t('hist.from')}>
        <DateInput
          value={dateFrom}
          onValueChange={(val) => {
            setDatePreset('custom');
            setDateFrom(val);
            void loadRuns({ dateFrom: val || undefined });
          }}
          keepWhileTyping
        />
      </FilterSection>
      <FilterSection label={t('hist.to')}>
        <DateInput
          value={dateTo}
          onValueChange={(val) => {
            setDatePreset('custom');
            setDateTo(val);
            void loadRuns({ dateTo: val || undefined });
          }}
          keepWhileTyping
        />
      </FilterSection>
      <FilterSection label={t('hist.feature')}>
        <select
          aria-label={t('hist.feature')}
          value={featureFilter}
          onChange={(e) => {
            setFeatureFilter(e.target.value);
            void loadRuns({ feature: e.target.value !== 'all' ? e.target.value : undefined });
          }}
          className={filterControlClass}
        >
          <option value="all">{t('hist.allFeatures')}</option>
          {Object.keys(FEATURE_KEYS).map((k) => (
            <option key={k} value={k}>
              {featureLabel(k)}
            </option>
          ))}
        </select>
      </FilterSection>
      <FilterSection label={t('common.status')}>
        <select
          aria-label={t('common.status')}
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            void loadRuns({ status: e.target.value !== 'all' ? e.target.value : undefined });
          }}
          className={filterControlClass}
        >
          <option value="all">{t('hist.allStatuses')}</option>
          <option value="ok">{t('hist.stOk')}</option>
          <option value="error">{t('hist.stError')}</option>
          <option value="blocked">{t('hist.stBlockedHint')}</option>
        </select>
      </FilterSection>
      {modelOptions.length > 0 && (
        <FilterSection label={t('hist.model')}>
          <select
            aria-label={t('hist.model')}
            value={modelFilter}
            onChange={(e) => {
              setModelFilter(e.target.value);
              void loadRuns({ model: e.target.value !== 'all' ? e.target.value : undefined });
            }}
            className={filterControlClass}
          >
            <option value="all">{t('hist.allModels')}</option>
            {modelOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </FilterSection>
      )}
      {filtersActive && (
        <div className="self-end">
          <button type="button" onClick={resetRunFilters} disabled={pending} className="h-10 text-sm text-[color:var(--color-text-dim)] hover:text-[color:var(--color-red)] underline">
            {t('common.resetFilters')}
          </button>
        </div>
      )}
    </div>
  );

  const TABS = [
    { id: 'runs' as const, label: t('hist.tabRuns'), n: runsData.total },
    { id: 'conversations' as const, label: t('hist.tabChats'), n: conversations.length },
  ];

  return (
    <main className={PAGE_MAIN}>
      <PageHeader
        title={t('nav.history')}
        subtitle={activeTab === 'runs' ? t('hist.subtitleRuns') : t('history.intro')}
        summary={
          activeTab === 'runs' && runsData.summary.totalRuns > 0 ? (
            <HeaderTotals
              items={[
                { label: t('hist.calls'), value: runsData.summary.totalRuns.toLocaleString(locale) },
                { label: t('hist.spend'), value: cost(runsData.summary.totalCostMicros).primary, tone: 'accent' },
                { label: t('hist.tokensIn'), value: runsData.summary.totalInputTokens.toLocaleString(locale) },
                { label: t('hist.tokensOut'), value: runsData.summary.totalOutputTokens.toLocaleString(locale) },
              ]}
            />
          ) : undefined
        }
      >
        {activeTab === 'conversations' && conversations.length > 0 && (
          <HeaderButton tone="default" icon={<Trash2 size={15} />} onClick={clearAllConversations} disabled={pending} className="hover:text-[color:var(--color-red)]">
            {t('history.clearAll')}
          </HeaderButton>
        )}
        {activeTab === 'runs' && (
          <HeaderButton icon={<Download size={15} />} onClick={handleExportCsv} disabled={exporting || pending}>
            {exporting ? t('hist.exporting') : t('hist.export')}
          </HeaderButton>
        )}
      </PageHeader>
      <ActivityTabs />

      <div role="tablist" aria-label={t('nav.history')} className="mb-4 flex gap-1 overflow-x-auto no-scrollbar border-b border-[color:var(--color-border)]">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'shrink-0 px-3 py-2 text-sm border-b-2 -mb-px transition-colors',
              activeTab === tab.id
                ? 'border-[color:var(--color-accent)] text-[color:var(--color-text)] font-semibold'
                : 'border-transparent text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)]'
            )}
          >
            {tab.label}
            <span className="ml-1.5 text-[color:var(--color-text-faint)] font-normal tabular-nums">{tab.n}</span>
          </button>
        ))}
      </div>

      {activeTab === 'runs' && (
        <FilterLayout quick={periodSwitch} filters={runFilters} active={filtersActive}>
          {runsData.dailyCosts.length > 1 && (
            <div className="mb-3 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-4 py-3">
              <div className="flex items-center justify-between mb-2 text-xs text-[color:var(--color-text-dim)]">
                <span className="font-medium">{t('hist.dailySpend')}</span>
                <span className="text-[color:var(--color-text-faint)]">{t('hist.daysRecorded', { n: runsData.dailyCosts.length })}</span>
              </div>
              <div className="flex items-end gap-1 h-12 overflow-x-auto no-scrollbar">
                {runsData.dailyCosts.map((d) => {
                  const pct = Math.max(8, Math.round((d.costMicros / maxDailyCost) * 100));
                  return (
                    <div
                      key={d.date}
                      title={`${d.date}: ${cost(d.costMicros).primary} · ${t('hist.callsN', { n: d.count })}`}
                      className="flex-1 min-w-[8px] max-w-[24px] h-full flex items-end"
                    >
                      <div className="w-full rounded-t bg-[color:var(--color-accent)]/60 hover:bg-[color:var(--color-accent)] transition-colors" style={{ height: `${pct}%` }} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {runsData.runs.length === 0 ? (
            <EmptyState
              icon={<Activity />}
              title={filtersActive || datePreset !== 'all' ? t('hist.emptyFiltered') : t('hist.empty')}
              hint={filtersActive || datePreset !== 'all' ? undefined : t('hist.emptyHint')}
            />
          ) : (
            <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] overflow-hidden divide-y divide-[color:var(--color-border)]">
              {runsData.runs.map((r) => {
                const totalTok = r.usage.inputTokens + r.usage.outputTokens;
                const hasCache = r.usage.cacheWriteTokens > 0 || r.usage.cacheReadTokens > 0;
                const c = cost(r.costMicros);
                return (
                  <button
                    key={r._id}
                    type="button"
                    onClick={() => setSelectedRun(r)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[color:var(--color-surface-2)] transition-colors"
                  >
                    <RunDot status={r.status} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-medium truncate">{featureLabel(r.feature)}</span>
                        {r.status !== 'ok' && <RunStatusLabel status={r.status} />}
                      </span>
                      <span className="block text-xs text-[color:var(--color-text-faint)] truncate">
                        {relTime(r.at, t)} · <span style={{ fontFamily: 'var(--font-code)' }}>{r.model}</span> · {totalTok.toLocaleString(locale)} tok
                        {hasCache ? ` · ${t('hist.cache')}` : ''}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-semibold tabular-nums">{c.primary}</span>
                      <span className="block text-xs text-[color:var(--color-text-faint)] tabular-nums">{duration(r.durationMs)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </FilterLayout>
      )}

      {activeTab === 'runs' && (
        <div>
          {/* Inspector Modal for selected AI run */}
          {selectedRun && (
            <Modal open={!!selectedRun} onClose={() => setSelectedRun(null)} title={featureLabel(selectedRun.feature)} size="lg">
              <div className="space-y-5">
                <div className="flex items-center gap-2">
                  <RunDot status={selectedRun.status} />
                  <RunStatusLabel status={selectedRun.status} />
                  <span className="text-xs text-[color:var(--color-text-faint)] tabular-nums">{new Date(selectedRun.at).toLocaleString(locale)}</span>
                </div>

                <div className="grid grid-cols-3 gap-3 p-3 rounded-xl bg-[color:var(--color-surface-2)]">
                  <RunMetric label={t('hist.cost')} value={cost(selectedRun.costMicros).primary} sub={currency !== 'USD' ? cost(selectedRun.costMicros).usd : undefined} accent />
                  <RunMetric label={t('hist.duration')} value={duration(selectedRun.durationMs)} />
                  <RunMetric label={t('hist.totalTokens')} value={(selectedRun.usage.inputTokens + selectedRun.usage.outputTokens).toLocaleString(locale)} />
                </div>

                <dl className="grid grid-cols-2 gap-2 text-xs">
                  <RunPair label={t('hist.input')} value={selectedRun.usage.inputTokens.toLocaleString(locale)} />
                  <RunPair label={t('hist.outputTokens')} value={selectedRun.usage.outputTokens.toLocaleString(locale)} />
                  <RunPair label={t('hist.cacheWrite')} value={selectedRun.usage.cacheWriteTokens.toLocaleString(locale)} />
                  <RunPair label={t('hist.cacheRead')} value={selectedRun.usage.cacheReadTokens.toLocaleString(locale)} />
                </dl>

                <dl className="space-y-1.5 border-t border-[color:var(--color-border)] pt-4 text-xs">
                  <RunLine label={t('hist.providerModel')} value={<span style={{ fontFamily: 'var(--font-code)' }}>{selectedRun.provider} / {selectedRun.model}</span>} />
                  <RunLine label={t('hist.trigger')} value={selectedRun.trigger} />
                  {selectedRun.requestId && (
                    <RunLine
                      label={t('hist.requestId')}
                      value={
                        <span className="flex items-center gap-1 min-w-0">
                          <span className="truncate max-w-[200px]" style={{ fontFamily: 'var(--font-code)' }}>{selectedRun.requestId}</span>
                          <button
                            type="button"
                            onClick={() => {
                              void navigator.clipboard.writeText(selectedRun.requestId || '');
                              setCopiedId(true);
                              setTimeout(() => setCopiedId(false), 2000);
                            }}
                            className="p-1 text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)]"
                            title={t('hist.copyRequestId')}
                            aria-label={t('hist.copyRequestId')}
                          >
                            {copiedId ? <Check size={12} className="text-[color:var(--color-accent)]" /> : <Copy size={12} />}
                          </button>
                        </span>
                      }
                    />
                  )}
                  {selectedRun.stopReason && <RunLine label={t('hist.stopReason')} value={<span style={{ fontFamily: 'var(--font-code)' }}>{selectedRun.stopReason}</span>} />}
                  {selectedRun.conversationId && (
                    <RunLine label={t('hist.conversation')} value={`${selectedRun.conversationId.slice(0, 10)}… · ${t('hist.turn', { n: selectedRun.turn ?? 1 })}`} />
                  )}
                  {selectedRun.record && <RunLine label={t('hist.record')} value={`${selectedRun.record.type} #${selectedRun.record.id.slice(0, 8)}…`} />}
                  {selectedRun.jobId && <RunLine label={t('hist.jobId')} value={<span style={{ fontFamily: 'var(--font-code)' }}>{selectedRun.jobId}</span>} />}
                </dl>

                {selectedRun.error && (
                  <div className="space-y-1.5 border-t border-[color:var(--color-border)] pt-4">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-[color:var(--color-red)]">
                      <AlertTriangle size={14} /> {t('hist.errorDetails')}
                    </div>
                    <pre className="p-3 rounded-lg border border-[color:var(--color-red)]/25 bg-[color:var(--color-red)]/5 text-[color:var(--color-red)] text-xs overflow-x-auto whitespace-pre-wrap">
                      {selectedRun.error}
                    </pre>
                  </div>
                )}

                <div className="space-y-4 border-t border-[color:var(--color-border)] pt-4">
                  <RunText
                    label={t('hist.prompt')}
                    text={selectedRun.prompt}
                    empty={t('hist.noPrompt')}
                    copied={copiedPrompt}
                    copyLabel={t('hist.copyPrompt')}
                    copiedLabel={t('hist.copied')}
                    onCopy={() => {
                      void navigator.clipboard.writeText(selectedRun.prompt || '');
                      setCopiedPrompt(true);
                      setTimeout(() => setCopiedPrompt(false), 2000);
                    }}
                  />
                  <RunText
                    label={t('hist.output')}
                    text={selectedRun.output}
                    empty={t('hist.noOutput')}
                    copied={copiedOutput}
                    copyLabel={t('hist.copyOutput')}
                    copiedLabel={t('hist.copied')}
                    onCopy={() => {
                      void navigator.clipboard.writeText(selectedRun.output || '');
                      setCopiedOutput(true);
                      setTimeout(() => setCopiedOutput(false), 2000);
                    }}
                  />
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
              <div className="mb-3 sm:max-w-sm">
                <Input
                  icon={<Search size={15} />}
                  type="search"
                  value={convSearch}
                  onChange={(e) => setConvSearch(e.target.value)}
                  placeholder={t('history.searchPlaceholder')}
                  aria-label={t('common.search')}
                />
              </div>

              {visibleConversations.length > 0 && (
                <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] overflow-hidden divide-y divide-[color:var(--color-border)]">
                {visibleConversations.map((c) => {
                  const isOpen = openConvId === c.id;
                  return (
                    <div key={c.id}>
                      <div className="flex items-center gap-2 px-4 py-2.5">
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
                </div>
              )}
              {visibleConversations.length === 0 && <EmptyState className="py-10" title={t('history.noMatch')} />}
            </>
          )}
        </>
      )}
    </main>
  );
}

const RUN_TONE: Record<string, string> = { ok: 'var(--color-accent)', blocked: 'var(--color-gold)', error: 'var(--color-red)' };

function RunDot({ status }: { status: string }) {
  return <span aria-hidden className="shrink-0 w-2 h-2 rounded-full" style={{ background: RUN_TONE[status] ?? RUN_TONE.error }} />;
}

function RunStatusLabel({ status }: { status: string }) {
  const t = useT();
  const label = status === 'ok' ? t('hist.stOk') : status === 'blocked' ? t('hist.stBlocked') : t('hist.stError');
  return (
    <span className="shrink-0 text-xs font-semibold" style={{ color: RUN_TONE[status] ?? RUN_TONE.error }}>
      {label}
    </span>
  );
}

function RunMetric({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-[color:var(--color-text-dim)]">{label}</div>
      <div className="text-lg font-bold tabular-nums truncate" style={{ color: accent ? 'var(--color-accent)' : undefined }}>
        {value}
      </div>
      {sub && <div className="text-xs text-[color:var(--color-text-faint)] tabular-nums">{sub}</div>}
    </div>
  );
}

function RunPair({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 px-2.5 py-2 rounded-lg bg-[color:var(--color-surface-2)]">
      <dt className="text-[color:var(--color-text-dim)]">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function RunLine({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 min-w-0">
      <dt className="shrink-0 text-[color:var(--color-text-dim)]">{label}</dt>
      <dd className="min-w-0 text-right truncate">{value}</dd>
    </div>
  );
}

function RunText({
  label,
  text,
  empty,
  copied,
  copyLabel,
  copiedLabel,
  onCopy,
}: {
  label: string;
  text?: string | null;
  empty: string;
  copied: boolean;
  copyLabel: string;
  copiedLabel: string;
  onCopy: () => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[color:var(--color-text-dim)]">{label}</span>
        {text && (
          <button type="button" onClick={onCopy} className="flex items-center gap-1 text-xs text-[color:var(--color-accent)] hover:underline">
            {copied ? <Check size={12} /> : <Copy size={12} />}
            <span>{copied ? copiedLabel : copyLabel}</span>
          </button>
        )}
      </div>
      {text ? (
        <pre className="p-3 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] text-[color:var(--color-text)] text-xs overflow-x-auto whitespace-pre-wrap max-h-52">{text}</pre>
      ) : (
        <div className="text-xs text-[color:var(--color-text-dim)] italic p-2 rounded-lg bg-[color:var(--color-surface-2)]">{empty}</div>
      )}
    </div>
  );
}
