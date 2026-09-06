'use client';
import { useState, useTransition, useMemo, useEffect } from 'react';
import {
  Plus,
  Trash2,
  CheckCircle2,
  Circle,
  Clock,
  XCircle,
  AlertCircle,
  X,
  ListChecks,
  LayoutGrid,
  List as ListIcon,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { cn } from '@/components/ui/cn';
import { useOpenParam } from '@/components/useOpenParam';
import type { SerializedTask } from '@/types';
import { useT } from '@/components/LocaleProvider';
import type { TKey } from '@/lib/i18n';
import {
  createTask,
  updateTaskStatus,
  deleteTask,
  updateTaskDetails,
  addStep,
  toggleStep,
  deleteStep,
} from './actions';

// Kanban columns — order also defines the ←/→ quick-move flow on each card.
const COLUMNS = [
  { value: 'todo', label: 'Todo', accent: 'var(--color-text-dim)' },
  { value: 'in-progress', label: 'In Progress', accent: 'var(--color-cyan)' },
  { value: 'blocked', label: 'Blocked', accent: 'var(--color-red)' },
  { value: 'done', label: 'Done', accent: 'var(--color-accent)' },
];

const STATUS_FILTERS = [
  { label: 'All', value: '' },
  { label: 'Todo', value: 'todo' },
  { label: 'In Progress', value: 'in-progress' },
  { label: 'Blocked', value: 'blocked' },
  { label: 'Done', value: 'done' },
];

// status value → i18n key (shared by columns + status pills)
const STATUS_KEY: Record<string, TKey> = {
  todo: 'tk.todo',
  'in-progress': 'tk.inProgress',
  blocked: 'tk.blocked',
  done: 'tk.done',
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  todo: <Circle size={16} className="text-[color:var(--color-text-faint)]" />,
  'in-progress': <Clock size={16} className="text-[color:var(--color-cyan)]" />,
  done: <CheckCircle2 size={16} className="text-[color:var(--color-accent)]" />,
  blocked: <XCircle size={16} className="text-[color:var(--color-red)]" />,
};

// ─── Main component ────────────────────────────────────────────────────────

export function TasksClient({ tasks }: { tasks: SerializedTask[] }) {
  const t = useT();
  const [view, setView] = useState<'board' | 'list'>('board');
  const [statusFilter, setStatusFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<SerializedTask | null>(null);
  // Local mirror so drag-drop / quick-move feels instant; re-synced from the
  // server props whenever a mutation revalidates /tasks.
  const [localTasks, setLocalTasks] = useState(tasks);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => setLocalTasks(tasks), [tasks]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    localTasks.forEach((t) => t.tags.forEach((tag) => set.add(tag)));
    return [...set].sort();
  }, [localTasks]);

  // Deep-link from global search
  useOpenParam((id) => {
    const found = localTasks.find((t) => t._id === id);
    if (found) setSelected(found);
  });

  const visible = useMemo(
    () => (tagFilter ? localTasks.filter((t) => t.tags.includes(tagFilter)) : localTasks),
    [localTasks, tagFilter]
  );

  const byCol = useMemo(() => {
    const m: Record<string, SerializedTask[]> = {};
    for (const c of COLUMNS) m[c.value] = [];
    for (const t of visible) (m[t.status] ??= []).push(t);
    return m;
  }, [visible]);

  function moveTask(id: string, status: string) {
    setLocalTasks((prev) => prev.map((t) => (t._id === id ? { ...t, status } : t)));
    startTransition(() => updateTaskStatus(id, status));
  }
  function removeTask(id: string) {
    setLocalTasks((prev) => prev.filter((t) => t._id !== id));
    startTransition(() => deleteTask(id));
  }
  function handleDropCol(status: string) {
    if (dragId) moveTask(dragId, status);
    setDragId(null);
    setOverCol(null);
  }

  // List-mode filtering (status pills) — done tasks sink to the bottom.
  const listFiltered = useMemo(() => {
    let list = visible;
    if (statusFilter) list = list.filter((t) => t.status === statusFilter);
    return [...list].sort((a, b) => {
      if (a.status === 'done' && b.status !== 'done') return 1;
      if (a.status !== 'done' && b.status === 'done') return -1;
      return 0;
    });
  }, [visible, statusFilter]);

  const openCount = localTasks.filter((t) => t.status !== 'done').length;

  return (
    <main className="max-w-[1400px] mx-auto px-4 py-6 pb-24">
      {/* Page header */}
      <div className="mb-5 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
            {t('nav.tasks')}
            <span className="ml-3 text-sm font-normal text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
              {t('tk.openTotal', { open: openCount, total: localTasks.length })}
            </span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {/* Board / List toggle */}
          <div className="flex bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg p-0.5">
            {([
              ['board', <LayoutGrid key="b" size={15} />],
              ['list', <ListIcon key="l" size={15} />],
            ] as const).map(([v, icon]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                title={v === 'board' ? t('tk.board') : t('v.list')}
                className={cn(
                  'px-2.5 py-1.5 rounded-md transition-colors',
                  view === v ? 'bg-[color:var(--color-accent)] text-black' : 'text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)]'
                )}
              >
                {icon}
              </button>
            ))}
          </div>
          <Button variant="primary" onClick={() => setShowCreate(true)}>
            <Plus size={16} strokeWidth={2.5} /> {t('tk.newTask')}
          </Button>
        </div>
      </div>

      {/* Tag filter (applies to both views) */}
      {allTags.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 mb-5 no-scrollbar">
          <button
            onClick={() => setTagFilter('')}
            className={cn(
              'shrink-0 px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all',
              tagFilter === ''
                ? 'bg-[color:var(--color-surface-2)] text-[color:var(--color-text)] border border-[color:var(--color-border-light)]'
                : 'text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text-dim)]'
            )}
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {t('tk.allTags')}
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setTagFilter(tagFilter === tag ? '' : tag)}
              className={cn(
                'shrink-0 px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all',
                tagFilter === tag ? 'text-[color:var(--color-accent)]' : 'text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text-dim)]'
              )}
              style={{
                fontFamily: 'var(--font-mono)',
                ...(tagFilter === tag ? { background: '#00ff8820', border: '1px solid #00ff8840' } : {}),
              }}
            >
              #{tag}
            </button>
          ))}
        </div>
      )}

      {/* Project progress — a selected tag behaves like a project/phase (the old /phases). */}
      {tagFilter && (() => {
        const proj = localTasks.filter((t) => t.tags.includes(tagFilter));
        if (!proj.length) return null;
        const done = proj.filter((t) => t.status === 'done').length;
        const pct = Math.round((done / proj.length) * 100);
        return (
          <div className="mb-5 -mt-2">
            <div className="flex items-center justify-between text-[10px] mb-1" style={{ fontFamily: 'var(--font-mono)' }}>
              <span className="text-[color:var(--color-text-dim)]">#{tagFilter} · {t('tk.projectProgress')}</span>
              <span className="text-[color:var(--color-accent)]">{t('tk.donePct', { done, total: proj.length, pct })}</span>
            </div>
            <div className="h-1.5 rounded-full bg-[color:var(--color-surface-2)] overflow-hidden">
              <div className="h-full rounded-full bg-[color:var(--color-accent)] transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })()}

      {view === 'board' ? (
        // ─── Kanban board ───────────────────────────────────────────────
        <div className="flex gap-3 overflow-x-auto pb-4 -mx-1 px-1 snap-x">
          {COLUMNS.map((col, colIndex) => {
            const list = byCol[col.value] ?? [];
            const isOver = overCol === col.value;
            return (
              <div
                key={col.value}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (overCol !== col.value) setOverCol(col.value);
                }}
                onDragLeave={(e) => {
                  // only clear if we actually left the column (not a child)
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverCol((c) => (c === col.value ? null : c));
                }}
                onDrop={() => handleDropCol(col.value)}
                className={cn(
                  'shrink-0 w-[290px] sm:w-[300px] snap-start rounded-2xl border p-2.5 flex flex-col transition-colors',
                  isOver
                    ? 'border-[color:var(--color-accent)] bg-[color:var(--color-surface-2)]'
                    : 'border-[color:var(--color-border)] bg-[color:var(--color-surface)]'
                )}
              >
                <div className="flex items-center justify-between px-1.5 py-1 mb-1.5">
                  <span
                    className="text-[0.7rem] font-bold uppercase tracking-[0.1em] flex items-center gap-1.5"
                    style={{ fontFamily: 'var(--font-mono)', color: col.accent }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: col.accent }} />
                    {t(STATUS_KEY[col.value] ?? 'tk.todo')}
                  </span>
                  <span className="text-[10px] text-[color:var(--color-text-faint)] tabular-nums" style={{ fontFamily: 'var(--font-mono)' }}>
                    {list.length}
                  </span>
                </div>
                <div className="flex flex-col gap-2 min-h-[120px] flex-1">
                  {list.length === 0 ? (
                    <div className="flex-1 grid place-items-center text-[10px] text-[color:var(--color-text-faint)] italic py-6" style={{ fontFamily: 'var(--font-mono)' }}>
                      {isOver ? t('tk.dropHere') : '—'}
                    </div>
                  ) : (
                    list.map((task) => (
                      <TaskCard
                        key={task._id}
                        task={task}
                        colIndex={colIndex}
                        dragging={dragId === task._id}
                        onOpen={() => setSelected(task)}
                        onMove={moveTask}
                        onDelete={removeTask}
                        onDragStart={() => setDragId(task._id)}
                        onDragEnd={() => {
                          setDragId(null);
                          setOverCol(null);
                        }}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        // ─── List view ──────────────────────────────────────────────────
        <>
          <div className="flex gap-2 overflow-x-auto pb-1 mb-3 no-scrollbar">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={cn(
                  'shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap',
                  statusFilter === f.value
                    ? 'bg-[color:var(--color-accent)] text-black'
                    : 'bg-[color:var(--color-surface)] text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] border border-[color:var(--color-border)]'
                )}
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {f.value === '' ? t('common.all') : t(STATUS_KEY[f.value] ?? 'tk.todo')}
              </button>
            ))}
          </div>
          <div className="text-xs text-[color:var(--color-text-faint)] mb-3" style={{ fontFamily: 'var(--font-mono)' }}>
            {t('tk.tasksCount', { n: listFiltered.length, total: localTasks.length })}
          </div>
          {listFiltered.length === 0 ? (
            <div className="text-center py-20 text-[color:var(--color-text-faint)]">
              <p className="text-5xl mb-4">✅</p>
              <p className="text-sm">{localTasks.length === 0 ? 'No tasks yet.' : 'No tasks match these filters.'}</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {listFiltered.map((task) => (
                <TaskRow key={task._id} task={task} onOpen={() => setSelected(task)} />
              ))}
            </div>
          )}
        </>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title={t('tk.newTask')} size="xl">
        <TaskCreateForm onClose={() => setShowCreate(false)} />
      </Modal>

      {selected && <TaskDetailModal task={selected} onClose={() => setSelected(null)} />}
    </main>
  );
}

// ─── Task Card (kanban) ────────────────────────────────────────────────────

function TaskCard({
  task,
  colIndex,
  dragging,
  onOpen,
  onMove,
  onDelete,
  onDragStart,
  onDragEnd,
}: {
  task: SerializedTask;
  colIndex: number;
  dragging: boolean;
  onOpen: () => void;
  onMove: (id: string, status: string) => void;
  onDelete: (id: string) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const t = useT();
  const prev = COLUMNS[colIndex - 1];
  const next = COLUMNS[colIndex + 1];
  const doneSteps = task.steps.filter((s) => s.done).length;
  const isDone = task.status === 'done';

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        'group bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-xl p-3 cursor-grab active:cursor-grabbing hover:border-[color:var(--color-border-light)] transition-all',
        dragging && 'opacity-40 ring-1 ring-[color:var(--color-accent)]',
        isDone && 'opacity-60'
      )}
    >
      <div className="flex items-start gap-2">
        <button
          onClick={onOpen}
          className={cn(
            'flex-1 min-w-0 text-left text-sm font-medium leading-snug hover:text-[color:var(--color-accent)] transition-colors',
            isDone && 'line-through text-[color:var(--color-text-dim)]'
          )}
        >
          {task.title}
        </button>
        {task.priority === 'high' && <AlertCircle size={14} className="shrink-0 text-[color:var(--color-red)] mt-0.5" />}
      </div>

      {(task.tags.length > 0 || task.steps.length > 0) && (
        <div className="flex items-center gap-1.5 flex-wrap mt-2">
          {task.steps.length > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
              <ListChecks size={11} /> {doneSteps}/{task.steps.length}
            </span>
          )}
          {task.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="text-[9px] px-1.5 py-0.5 bg-[color:var(--color-surface-3)] border border-[color:var(--color-border)] rounded text-[color:var(--color-text-faint)]"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Quick move (works on touch where native drag doesn't) + delete */}
      <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-[color:var(--color-border)]">
        <div className="flex items-center gap-1">
          <button
            onClick={() => prev && onMove(task._id, prev.value)}
            disabled={!prev}
            title={prev ? `Move to ${prev.label}` : ''}
            className="p-1 rounded text-[color:var(--color-text-faint)] hover:text-[color:var(--color-cyan)] disabled:opacity-20 disabled:hover:text-[color:var(--color-text-faint)] transition-colors"
          >
            <ChevronLeft size={15} />
          </button>
          <button
            onClick={() => next && onMove(task._id, next.value)}
            disabled={!next}
            title={next ? `Move to ${next.label}` : ''}
            className="p-1 rounded text-[color:var(--color-text-faint)] hover:text-[color:var(--color-accent)] disabled:opacity-20 disabled:hover:text-[color:var(--color-text-faint)] transition-colors"
          >
            <ChevronRight size={15} />
          </button>
        </div>
        <button
          onClick={() => onDelete(task._id)}
          title={t('common.delete')}
          className="p-1 rounded opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)] transition-all"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

// ─── Task Create (full-screen) ─────────────────────────────────────────────

function TaskCreateForm({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    title: '',
    status: 'todo',
    priority: 'normal',
    tags: '',
    content: '',
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => fd.set(k, v));
    startTransition(async () => {
      await createTask(fd);
      onClose();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <input
        value={form.title}
        onChange={set('title')}
        required
        autoFocus
        placeholder={t('tk.titlePlaceholder')}
        className="w-full bg-transparent text-2xl font-bold border-0 border-b border-[color:var(--color-border)] pb-2 focus:outline-none focus:border-[color:var(--color-accent)] placeholder:text-[color:var(--color-text-faint)]"
        style={{ fontFamily: 'var(--font-display)' }}
      />
      <div className="flex flex-wrap gap-3 items-center">
        <select value={form.status} onChange={set('status')} className={selectClass}>
          {TASK_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select value={form.priority} onChange={set('priority')} className={selectClass}>
          {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <Input value={form.tags} onChange={set('tags')} placeholder="tags, comma separated" className="flex-1 min-w-[160px]" />
      </div>
      <div>
        <h3 className="text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-wider mb-2" style={{ fontFamily: 'var(--font-mono)' }}>Details</h3>
        <textarea
          value={form.content}
          onChange={set('content')}
          rows={8}
          placeholder={t('tk.notesPlaceholder')}
          className="w-full bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[color:var(--color-accent)] resize-y"
        />
      </div>
      <div className="flex gap-2 pt-2 border-t border-[color:var(--color-border)]">
        <Button type="submit" variant="primary" disabled={pending || !form.title.trim()}>
          {pending ? t('tk.creating') : t('tk.createTask')}
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
      </div>
    </form>
  );
}

// ─── Task Row (list view) ──────────────────────────────────────────────────

function TaskRow({ task, onOpen }: { task: SerializedTask; onOpen: () => void }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const isDone = task.status === 'done';
  const doneSteps = task.steps.filter((s) => s.done).length;

  function handleToggle() {
    const next = isDone ? 'todo' : 'done';
    startTransition(() => updateTaskStatus(task._id, next));
  }

  function handleDelete() {
    startTransition(() => deleteTask(task._id));
  }

  return (
    <div
      className={cn(
        'group flex items-center gap-3 bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded-xl px-4 py-3 transition-all hover:border-[color:var(--color-border-light)]',
        isDone && 'opacity-50'
      )}
    >
      <button
        onClick={handleToggle}
        disabled={pending}
        className="shrink-0 hover:scale-110 transition-transform disabled:opacity-50"
        aria-label={isDone ? 'Reopen' : 'Complete'}
      >
        {STATUS_ICONS[task.status] ?? <Circle size={16} />}
      </button>

      <button
        onClick={onOpen}
        className={cn(
          'flex-1 min-w-0 text-left text-sm font-medium truncate hover:text-[color:var(--color-accent)] transition-colors',
          isDone && 'line-through text-[color:var(--color-text-dim)]'
        )}
      >
        {task.title}
      </button>

      {task.steps.length > 0 && (
        <span className="hidden sm:flex items-center gap-1 text-[10px] text-[color:var(--color-text-faint)] shrink-0" style={{ fontFamily: 'var(--font-mono)' }}>
          <ListChecks size={11} /> {doneSteps}/{task.steps.length}
        </span>
      )}

      <div className="hidden sm:flex gap-1 flex-wrap shrink-0">
        {task.tags.slice(0, 3).map((tag) => (
          <span
            key={tag}
            className="text-[10px] px-1.5 py-0.5 bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded text-[color:var(--color-text-faint)]"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            #{tag}
          </span>
        ))}
      </div>

      {task.priority === 'high' && <AlertCircle size={14} className="shrink-0 text-[color:var(--color-red)]" />}
      {task.status !== 'todo' && task.status !== 'done' && <Badge status={task.status} />}

      <button
        onClick={handleDelete}
        disabled={pending}
        className="shrink-0 opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)] transition-all disabled:opacity-30"
        aria-label={t('common.delete')}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

// ─── Task Detail (full-screen) ─────────────────────────────────────────────

const TASK_STATUSES = [
  { value: 'todo', label: 'Todo' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'done', label: 'Done' },
];
const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
];
const selectClass =
  'bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[color:var(--color-accent)]';

function TaskDetailModal({ task, onClose }: { task: SerializedTask; onClose: () => void }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();
  const [newStep, setNewStep] = useState('');
  const [form, setForm] = useState({
    title: task.title,
    status: task.status,
    priority: task.priority,
    tags: task.tags.join(', '),
    description: task.description,
    content: task.content,
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  function save() {
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => fd.set(k, v));
    startTransition(async () => {
      await updateTaskDetails(task._id, fd);
      onClose();
    });
  }

  function handleAddStep() {
    if (!newStep.trim()) return;
    const text = newStep;
    setNewStep('');
    startTransition(() => addStep(task._id, text));
  }

  async function handleDelete() {
    const ok = await confirm({ title: 'Delete task', message: `Delete "${task.title}"?`, confirmLabel: 'Delete', danger: true });
    if (ok) startTransition(async () => { await deleteTask(task._id); onClose(); });
  }

  const doneSteps = task.steps.filter((s) => s.done).length;

  return (
    <Modal open onClose={onClose} title={task.title} size="xl">
      <div className="space-y-5">
        {/* Title + meta */}
        <input
          value={form.title}
          onChange={set('title')}
          className="w-full bg-transparent text-2xl font-bold border-0 border-b border-[color:var(--color-border)] pb-2 focus:outline-none focus:border-[color:var(--color-accent)]"
          style={{ fontFamily: 'var(--font-display)' }}
        />
        <div className="flex flex-wrap gap-3 items-center">
          <select value={form.status} onChange={set('status')} className={selectClass}>
            {TASK_STATUSES.map((s) => <option key={s.value} value={s.value}>{t(STATUS_KEY[s.value] ?? 'tk.todo')}</option>)}
          </select>
          <select value={form.priority} onChange={set('priority')} className={selectClass}>
            {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <Input value={form.tags} onChange={set('tags')} placeholder="tags, comma separated" className="flex-1 min-w-[160px]" />
        </div>

        {/* Steps */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="flex items-center gap-1.5 text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-wider" style={{ fontFamily: 'var(--font-mono)' }}>
              <ListChecks size={12} /> {t('tk.steps')} {task.steps.length > 0 && `(${doneSteps}/${task.steps.length})`}
            </h3>
          </div>
          <div className="space-y-1.5">
            {task.steps.map((step) => (
              <div key={step._id} className="group flex items-center gap-2.5 bg-[color:var(--color-surface-2)] rounded-lg px-3 py-2">
                <button onClick={() => startTransition(() => toggleStep(task._id, step._id, !step.done))} className="shrink-0">
                  {step.done ? <CheckCircle2 size={16} className="text-[color:var(--color-accent)]" /> : <Circle size={16} className="text-[color:var(--color-text-faint)]" />}
                </button>
                <span className={cn('flex-1 text-sm', step.done && 'line-through text-[color:var(--color-text-faint)]')}>{step.text}</span>
                <button onClick={() => startTransition(() => deleteStep(task._id, step._id))} className="shrink-0 opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)]">
                  <X size={13} />
                </button>
              </div>
            ))}
            <div className="flex gap-2">
              <Input
                value={newStep}
                onChange={(e) => setNewStep(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddStep(); } }}
                placeholder={t('tk.addStep')}
              />
              <Button type="button" variant="secondary" onClick={handleAddStep} disabled={!newStep.trim()} className="shrink-0">
                <Plus size={14} /> {t('common.add')}
              </Button>
            </div>
          </div>
        </div>

        {/* Content / details */}
        <div>
          <h3 className="text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-wider mb-2" style={{ fontFamily: 'var(--font-mono)' }}>{t('tk.details')}</h3>
          {task.content && /<\w+/.test(task.content) ? (
            <div
              className="text-sm text-[color:var(--color-text-dim)] mb-3 [&_h4]:text-[10px] [&_h4]:text-[color:var(--color-text-faint)] [&_h4]:uppercase [&_h4]:tracking-wider [&_h4]:mb-1 [&_h4]:mt-3 [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:space-y-0.5 [&_p]:mb-2"
              dangerouslySetInnerHTML={{ __html: task.content }}
            />
          ) : null}
          <textarea
            value={form.content}
            onChange={set('content')}
            rows={6}
            placeholder={t('tk.notesPlaceholder')}
            className="w-full bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[color:var(--color-accent)] resize-y"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2 border-t border-[color:var(--color-border)]">
          <Button variant="primary" onClick={save} disabled={pending}>{pending ? t('v.saving') : t('common.save')}</Button>
          <Button variant="danger" onClick={handleDelete} disabled={pending} className="ml-auto"><Trash2 size={14} /> {t('common.delete')}</Button>
        </div>
      </div>
    </Modal>
  );
}
