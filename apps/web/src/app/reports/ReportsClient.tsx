'use client';
import { cur } from "@/lib/money";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  PieChart,
  Pie,
  Legend,
  CartesianGrid,
} from 'recharts';
import { Store, Package, CalendarClock, Receipt as ReceiptIcon, Layers, ShieldCheck, TrendingUp, CreditCard } from 'lucide-react';

const PALETTE = ['#00ff88', '#00d4ff', '#ffd93d', '#a55eea', '#ff4757', '#00b894', '#fdcb6e', '#6c5ce7'];

type InstallmentPlanRow = {
  key: string;
  label: string;
  linked: boolean;
  paidInstallments: number;
  totalInstallments: number;
  perAmount: number;
  remainingAmount: number;
  totalAmount: number;
  done: boolean;
};

type Data = {
  monthlySpend: { key: string; label: string; total: number; count: number }[];
  upcomingInstallments: { label: string; amount: number }[];
  spendByStore: { name: string; total: number; count: number }[];
  spendByCategory: { name: string; value: number }[];
  subsByCategory: { name: string; value: number }[];
  warrantiesExpiring: { title: string; until: string; days: number }[];
  biggestPurchases: { store: string; total: number; date: string }[];
  installmentPlans: InstallmentPlanRow[];
  incomeExpense: { key: string; label: string; income: number; expense: number }[];
  expenseByCategory: { name: string; value: number }[];
  budgetVsActual: { name: string; budget: number; actual: number }[];
  summary: {
    receiptsTotal: number;
    receiptsVat: number;
    receiptsCount: number;
    outstanding: number;
    ownedValue: number;
    shoppingValue: number;
    monthlySubs: number;
    installmentsCount: number;
    installmentsRemaining: number;
    incomeYear: number;
    expenseYear: number;
    incomeMonth: number;
    expenseMonth: number;
  };
};

const tooltipStyle = {
  background: 'var(--color-surface-2)',
  border: '1px solid var(--color-border)',
  borderRadius: 10,
  fontSize: 12,
  color: 'var(--color-text)',
};

function fmtDate(s: string): string {
  if (!s) return '';
  const d = new Date(s);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export function ReportsClient({ data, months = 12 }: { data: Data; months?: number }) {
  const s = data.summary;
  const spend12 = data.monthlySpend.reduce((a, m) => a + m.total, 0);
  const avgMonth = Math.round(spend12 / Math.max(1, data.monthlySpend.filter((m) => m.total > 0).length || 1));

  return (
    <main className="max-w-[1400px] mx-auto px-4 py-6 pb-16">
      <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <h1 className="text-2xl md:text-3xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
          Reports
        </h1>
        <div className="flex bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg p-0.5" style={{ fontFamily: 'var(--font-mono)' }}>
          {[6, 12, 24].map((m) => (
            <a
              key={m}
              href={`/reports?months=${m}`}
              className={`px-2.5 py-1 rounded-md text-xs transition-colors ${months === m ? 'bg-[color:var(--color-accent)] text-black' : 'text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)]'}`}
            >
              {m}mo
            </a>
          ))}
        </div>
      </div>

      {/* Net position — inventory value minus installment debt */}
      <div className="mb-6 rounded-2xl border border-[color:var(--color-border)] bg-gradient-to-br from-[color:var(--color-surface)] to-[color:var(--color-surface-2)] p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] text-[color:var(--color-text-faint)] mb-1" style={{ fontFamily: 'var(--font-mono)' }}>Net position</p>
            <p className="text-3xl md:text-4xl font-bold" style={{ fontFamily: 'var(--font-display)', color: s.ownedValue - s.installmentsRemaining >= 0 ? 'var(--color-accent)' : 'var(--color-red)' }}>
              {cur()}{(s.ownedValue - s.installmentsRemaining).toLocaleString('en-GB')}
            </p>
          </div>
          <div className="flex gap-5 text-xs" style={{ fontFamily: 'var(--font-mono)' }}>
            <div><span className="text-[color:var(--color-text-faint)] block mb-0.5">Inventory value</span><span className="text-[color:var(--color-text)] text-sm">{cur()}{s.ownedValue.toLocaleString('en-GB')}</span></div>
            <div><span className="text-[color:var(--color-text-faint)] block mb-0.5">Owed · installments</span><span className="text-[color:var(--color-red)] text-sm">-{cur()}{s.installmentsRemaining.toLocaleString('en-GB')}</span></div>
            <div><span className="text-[color:var(--color-text-faint)] block mb-0.5">Card balance</span><span className="text-[color:var(--color-gold)] text-sm">{cur()}{s.outstanding.toLocaleString('en-GB')}</span></div>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat icon={<ReceiptIcon size={14} />} label="Receipts total" value={`${cur()}${s.receiptsTotal.toLocaleString('en-GB')}`} sub={`${s.receiptsCount} receipts · ${cur()}${s.receiptsVat} VAT`} />
        <Stat icon={<TrendingUp size={14} />} label="Spend / month avg" value={`${cur()}${avgMonth.toLocaleString('en-GB')}`} sub={`${cur()}${spend12.toLocaleString('en-GB')} last 12mo`} />
        <Stat icon={<CreditCard size={14} />} label="Cards balance" value={`${cur()}${s.outstanding.toLocaleString('en-GB')}`} sub={`${s.installmentsCount} installments · ${cur()}${s.installmentsRemaining} left`} accent="var(--color-gold)" />
        <Stat icon={<CalendarClock size={14} />} label="Subscriptions" value={`${cur()}${s.monthlySubs}/mo`} sub={`${cur()}${s.monthlySubs * 12}/yr`} />
      </div>

      {/* Monthly spend — full width hero chart */}
      <Card title="Monthly spend · last 12 months" className="mb-4">
        {spend12 === 0 ? (
          <Empty />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={data.monthlySpend} margin={{ left: 0, right: 10, top: 6 }}>
              <defs>
                <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00ff88" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#00ff88" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} width={44} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v: number, _n, p) => [`${cur()}${v} · ${(p?.payload?.count ?? 0)} receipts`, 'spent']}
                cursor={{ stroke: 'var(--color-accent)', strokeWidth: 1, strokeOpacity: 0.3 }}
              />
              <Area type="monotone" dataKey="total" stroke="#00ff88" strokeWidth={2} fill="url(#spendGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Income vs Expense (cash flow) */}
      <Card title="Cash flow · income vs expense · last 12 months">
        {data.incomeExpense.every((m) => m.income === 0 && m.expense === 0) ? (
          <Empty text="No income or expenses logged yet" />
        ) : (
          <>
            <div className="flex flex-wrap gap-x-5 gap-y-1 mb-3 text-xs" style={{ fontFamily: 'var(--font-mono)' }}>
              <span className="text-[color:var(--color-text-dim)]">
                This month: <span className="text-[color:var(--color-accent)]">+{cur()}{s.incomeMonth.toLocaleString('en-GB')}</span> in · <span className="text-[color:var(--color-red)]">-{cur()}{s.expenseMonth.toLocaleString('en-GB')}</span> out · net{' '}
                <span className={s.incomeMonth - s.expenseMonth >= 0 ? 'text-[color:var(--color-accent)]' : 'text-[color:var(--color-red)]'}>
                  {cur()}{(s.incomeMonth - s.expenseMonth).toLocaleString('en-GB')}
                </span>
              </span>
              <span className="text-[color:var(--color-text-dim)]">
                This year: net{' '}
                <span className={s.incomeYear - s.expenseYear >= 0 ? 'text-[color:var(--color-accent)]' : 'text-[color:var(--color-red)]'}>
                  {cur()}{(s.incomeYear - s.expenseYear).toLocaleString('en-GB')}
                </span>
              </span>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.incomeExpense} margin={{ left: 0, right: 10, top: 6 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} width={44} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n) => [`${cur()}${v.toLocaleString('en-GB')}`, n]} cursor={{ fill: 'rgba(127,127,127,0.08)' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="income" name="Income" radius={[5, 5, 0, 0]} fill="#00ff88" />
                <Bar dataKey="expense" name="Expense" radius={[5, 5, 0, 0]} fill="#ff4757" />
              </BarChart>
            </ResponsiveContainer>
          </>
        )}
      </Card>

      {/* Budget · this month (per category, actual vs budget) */}
      {data.budgetVsActual.length > 0 && (
        <Card title="Budget · this month">
          <div className="space-y-2.5">
            {data.budgetVsActual.map((b) => {
              const pct = b.budget > 0 ? Math.min(100, Math.round((b.actual / b.budget) * 100)) : 0;
              const over = b.actual > b.budget;
              return (
                <div key={b.name}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-[color:var(--color-text-dim)]">{b.name}</span>
                    <span style={{ fontFamily: 'var(--font-mono)' }} className={over ? 'text-[color:var(--color-red)]' : 'text-[color:var(--color-text-dim)]'}>
                      {cur()}{b.actual.toLocaleString('en-GB')} / {cur()}{b.budget.toLocaleString('en-GB')}{over ? ` · over ${cur()}${(b.actual - b.budget).toLocaleString('en-GB')}` : ''}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-[color:var(--color-surface-2)] overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(pct, b.actual > 0 ? 3 : 0)}%`, background: over ? 'var(--color-red)' : 'var(--color-accent)' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Upcoming installment obligations */}
        <Card title="Upcoming installments · next 6 months">
          {data.upcomingInstallments.every((m) => m.amount === 0) ? (
            <Empty text="No active installments" />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.upcomingInstallments} margin={{ left: 0, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} width={44} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${cur()}${v}`, 'due']} cursor={{ fill: 'rgba(127,127,127,0.08)' }} />
                <Bar dataKey="amount" radius={[5, 5, 0, 0]} fill="#a55eea" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Spending by store */}
        <Card title="Spending by store · top 8">
          {data.spendByStore.length === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(200, data.spendByStore.length * 30)}>
              <BarChart data={data.spendByStore} layout="vertical" margin={{ left: 8, right: 16 }}>
                <XAxis type="number" tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number, _n, p) => [`${cur()}${v} · ${p?.payload?.count ?? 0} receipts`, 'spent']} cursor={{ fill: 'rgba(127,127,127,0.08)' }} />
                <Bar dataKey="total" radius={[0, 5, 5, 0]}>
                  {data.spendByStore.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Spend by category (owned items) */}
        <Card title="Inventory value by category">
          {data.spendByCategory.length === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={data.spendByCategory} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={2}>
                  {data.spendByCategory.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} stroke="var(--color-bg)" />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${cur()}${v}`, 'value']} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Expenses by category (bills) */}
        <Card title="Expenses by category">
          {data.expenseByCategory.length === 0 ? (
            <Empty text="No expenses logged yet" />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(200, data.expenseByCategory.length * 34)}>
              <BarChart data={data.expenseByCategory} layout="vertical" margin={{ left: 8, right: 16 }}>
                <XAxis type="number" tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${cur()}${v.toLocaleString('en-GB')}`, 'total']} cursor={{ fill: 'rgba(127,127,127,0.08)' }} />
                <Bar dataKey="value" radius={[0, 5, 5, 0]}>
                  {data.expenseByCategory.map((_, i) => (
                    <Cell key={i} fill={PALETTE[(i + 4) % PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Subscriptions monthly by category */}
        <Card title={`Subscriptions (monthly ${cur()}) by category`}>
          {data.subsByCategory.length === 0 ? (
            <Empty text="No active subscriptions" />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.subsByCategory} margin={{ left: 0, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} width={36} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${cur()}${v}/mo`, 'cost']} cursor={{ fill: 'rgba(127,127,127,0.08)' }} />
                <Bar dataKey="value" radius={[5, 5, 0, 0]}>
                  {data.subsByCategory.map((_, i) => (
                    <Cell key={i} fill={PALETTE[(i + 2) % PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Warranties expiring */}
        <Card title="Warranties expiring · next 150 days">
          {data.warrantiesExpiring.length === 0 ? (
            <Empty text="Nothing expiring soon" />
          ) : (
            <div className="space-y-1.5">
              {data.warrantiesExpiring.map((w, i) => {
                const tone = w.days <= 30 ? 'var(--color-red)' : w.days <= 90 ? 'var(--color-gold)' : 'var(--color-accent)';
                return (
                  <div key={i} className="flex items-center justify-between gap-2 bg-[color:var(--color-surface-2)] rounded-lg px-3 py-2">
                    <span className="flex items-center gap-1.5 text-xs font-medium truncate">
                      <ShieldCheck size={12} style={{ color: tone }} className="shrink-0" />
                      {w.title}
                    </span>
                    <span className="text-[10px] shrink-0 tabular-nums" style={{ fontFamily: 'var(--font-mono)', color: tone }}>
                      {w.days}d · {fmtDate(w.until)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Biggest purchases */}
        <Card title="Biggest purchases">
          {data.biggestPurchases.length === 0 ? (
            <Empty />
          ) : (
            <div className="space-y-1.5">
              {data.biggestPurchases.map((b, i) => (
                <div key={i} className="flex items-center justify-between gap-2 bg-[color:var(--color-surface-2)] rounded-lg px-3 py-2">
                  <span className="flex items-center gap-2 text-xs truncate">
                    <span className="text-[10px] text-[color:var(--color-text-faint)] tabular-nums w-4" style={{ fontFamily: 'var(--font-mono)' }}>
                      {i + 1}
                    </span>
                    <Store size={12} className="text-[color:var(--color-text-faint)] shrink-0" />
                    <span className="truncate">{b.store}</span>
                    {b.date && <span className="text-[10px] text-[color:var(--color-text-faint)] shrink-0">{fmtDate(b.date)}</span>}
                  </span>
                  <span className="text-xs font-bold text-[color:var(--color-accent)] shrink-0 tabular-nums" style={{ fontFamily: 'var(--font-mono)' }}>
                    {cur()}{b.total.toLocaleString('en-GB')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Installment payoff — full width */}
      <Card title="Installment payoff" className="mt-4">
        {data.installmentPlans.length === 0 ? (
          <Empty />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
            {data.installmentPlans.map((p) => {
              const pct = p.totalInstallments > 0 ? Math.round((p.paidInstallments / p.totalInstallments) * 100) : 0;
              return (
                <div key={p.key}>
                  <div className="flex items-center justify-between gap-2 mb-1 text-xs">
                    <span className="font-medium truncate flex items-center gap-1.5">
                      {p.linked && <Layers size={11} className="text-[color:var(--color-accent)] shrink-0" />}
                      {p.label}
                    </span>
                    <span className="text-[10px] text-[color:var(--color-text-faint)] shrink-0 tabular-nums" style={{ fontFamily: 'var(--font-mono)' }}>
                      {p.paidInstallments}/{p.totalInstallments}
                    </span>
                  </div>
                  <div className="h-1.5 bg-[color:var(--color-surface-2)] rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: p.done ? 'var(--color-accent)' : 'var(--color-purple)' }} />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-[color:var(--color-text-faint)] mt-0.5" style={{ fontFamily: 'var(--font-mono)' }}>
                    <span>{cur()}{p.perAmount.toFixed(2)}/mo</span>
                    <span>{p.done ? 'paid off ✓' : `${cur()}${p.remainingAmount.toFixed(2)} left`}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </main>
  );
}

function Stat({ icon, label, value, sub, accent }: { icon: React.ReactNode; label: string; value: string; sub: string; accent?: string }) {
  return (
    <div className="bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded-xl p-4">
      <div className="flex items-center gap-1.5 text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-wider mb-1.5" style={{ fontFamily: 'var(--font-mono)' }}>
        {icon}
        {label}
      </div>
      <div className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)', color: accent }}>
        {value}
      </div>
      <div className="text-[10px] text-[color:var(--color-text-faint)] mt-0.5" style={{ fontFamily: 'var(--font-mono)' }}>
        {sub}
      </div>
    </div>
  );
}

function Card({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded-2xl p-5 ${className ?? ''}`}>
      <h2 className="text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-[0.15em] mb-4" style={{ fontFamily: 'var(--font-mono)' }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function Empty({ text = 'No data yet' }: { text?: string }) {
  return <div className="h-[180px] flex items-center justify-center text-xs text-[color:var(--color-text-faint)]">{text}</div>;
}
