'use client';
import { useRef, useState, useTransition } from 'react';
import { Camera, Gauge, Loader2, Paperclip, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useT } from '@/components/LocaleProvider';
import { Button } from '@/components/ui/Button';
import { DateInput } from '@/components/ui/DateInput';
import { Field } from '@/components/ui/Field';
import { Input, controlClass } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { todayLocal } from '@/lib/dates';
import { VEHICLE_FUEL_TYPES } from '@/lib/vehicles';
import { addVehicleLog, scanVehicleDocument, updateVehicleLog } from './actions';
import { FormFooter } from './VehicleForm';
import { FUEL_LABEL, dateOnly, fileUrl, type LogItem, type LogRow, type VehicleRow } from './shared';

type Kind = 'fuel' | 'service';
const str = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));
const round = (n: number, d: number) => String(Math.round(n * 10 ** d) / 10 ** d);

/**
 * Add or edit a fuel fill or a service (#363). "Scan" reads a photo or PDF of the pump receipt /
 * garage invoice into the fields; nothing is saved until the user presses Save, and the file
 * goes up with the entry and stays attached to it. A dashboard photo can fill the odometer.
 */
export function LogForm({
  vehicle,
  kind,
  log,
  scanEnabled,
  onClose,
}: {
  vehicle: VehicleRow;
  kind: Kind;
  log?: LogRow | null;
  scanEnabled: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const editing = !!log;
  const [f, setF] = useState({
    date: log ? dateOnly(log.date) : todayLocal(),
    odometer: str(log?.odometer),
    liters: log && log.liters ? str(log.liters) : '',
    pricePerLiter: str(log?.pricePerLiter),
    cost: log && log.cost ? str(log.cost) : '',
    fuelType: (log?.fuelType || (kind === 'fuel' ? vehicle.fuelType : '') || '') as string,
    shop: log?.shop ?? '',
    fullTank: log ? log.fullTank : true,
    description: log?.description ?? '',
    nextServiceKm: str(log?.nextServiceKm),
    nextServiceDate: dateOnly(log?.nextServiceDate),
    logExpense: true,
  });
  const [items, setItems] = useState<LogItem[]>(log?.items ?? []);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [scanning, setScanning] = useState<'' | 'doc' | 'odometer'>('');
  const [pending, startTransition] = useTransition();
  const docRef = useRef<HTMLInputElement>(null);
  const odoRef = useRef<HTMLInputElement>(null);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));

  async function scan(which: 'doc' | 'odometer', picked: File) {
    setError('');
    setNotice('');
    setScanning(which);
    const fd = new FormData();
    fd.set('file', picked);
    try {
      const r = await scanVehicleDocument(which === 'odometer' ? 'odometer' : kind, fd);
      if (!r.ok) return setError(r.error);
      if (r.kind === 'odometer') {
        if (r.data.odometer !== null) set({ odometer: String(Math.round(r.data.odometer)) });
        setNotice(r.data.odometer !== null ? t('veh.scanOdometerDone') : t('veh.scanNothing'));
        return;
      }
      setFile(picked);
      if (r.kind === 'fuel') {
        const d = r.data;
        let liters = d.liters;
        let total = d.total;
        if (liters === null && total !== null && d.pricePerLiter) liters = total / d.pricePerLiter;
        if (total === null && liters !== null && d.pricePerLiter) total = liters * d.pricePerLiter;
        set({
          ...(d.date ? { date: d.date } : {}),
          ...(d.station ? { shop: d.station } : {}),
          ...(liters !== null ? { liters: round(liters, 2) } : {}),
          ...(d.pricePerLiter !== null ? { pricePerLiter: round(d.pricePerLiter, 3) } : {}),
          ...(total !== null ? { cost: round(total, 2) } : {}),
          ...(d.fuelType ? { fuelType: d.fuelType } : {}),
          ...(d.odometer !== null ? { odometer: String(Math.round(d.odometer)) } : {}),
        });
      } else {
        const d = r.data;
        set({
          ...(d.date ? { date: d.date } : {}),
          ...(d.garage ? { shop: d.garage } : {}),
          ...(d.odometer !== null ? { odometer: String(Math.round(d.odometer)) } : {}),
          ...(d.total !== null ? { cost: round(d.total, 2) } : {}),
          ...(d.description ? { description: d.description } : {}),
          ...(d.nextServiceKm !== null ? { nextServiceKm: String(Math.round(d.nextServiceKm)) } : {}),
          ...(d.nextServiceDate ? { nextServiceDate: d.nextServiceDate } : {}),
        });
        if (d.items.length) setItems(d.items);
      }
      setNotice(t('veh.scanDone'));
    } catch (e) {
      setError((e as Error).message || t('common.failed'));
    } finally {
      setScanning('');
    }
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!e.currentTarget.reportValidity()) return;
    setError('');
    const fd = new FormData();
    fd.set('vehicleId', vehicle._id);
    fd.set('kind', kind);
    for (const k of ['date', 'odometer', 'liters', 'pricePerLiter', 'cost', 'fuelType', 'shop', 'description', 'nextServiceKm', 'nextServiceDate'] as const) fd.set(k, f[k]);
    if (f.fullTank) fd.set('fullTank', 'on');
    if (!editing && f.logExpense) fd.set('logExpense', 'on');
    fd.set('items', JSON.stringify(items));
    if (file) fd.set('file', file);
    startTransition(async () => {
      const res = editing ? await updateVehicleLog(log!._id, fd) : await addVehicleLog(fd);
      if (res.ok) onClose();
      else setError(res.error || t('common.failed'));
    });
  }

  const title = `${editing ? (kind === 'fuel' ? t('veh.editFuel') : t('veh.editService')) : kind === 'fuel' ? t('veh.addFuel') : t('veh.addService')} · ${vehicle.name}`;
  const busy = scanning !== '';

  return (
    <Modal open onClose={onClose} title={title} size="lg">
      <form onSubmit={submit} className="space-y-3" noValidate={false}>
        {scanEnabled && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-[color:var(--color-border)] p-2.5">
            <Button type="button" size="sm" onClick={() => docRef.current?.click()} disabled={busy || pending}>
              {scanning === 'doc' ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />} {kind === 'fuel' ? t('veh.scanFuel') : t('veh.scanService')}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => odoRef.current?.click()} disabled={busy || pending}>
              {scanning === 'odometer' ? <Loader2 size={14} className="animate-spin" /> : <Gauge size={14} />} {t('veh.scanOdometer')}
            </Button>
            <span className="text-[11px] text-[color:var(--color-text-faint)] flex items-center gap-1"><Sparkles size={11} /> {t('veh.scanHint')}</span>
            <input ref={docRef} type="file" accept="image/*,application/pdf" capture="environment" className="hidden" aria-label={kind === 'fuel' ? t('veh.scanFuel') : t('veh.scanService')}
              onChange={(e) => { const p = e.target.files?.[0]; e.target.value = ''; if (p) void scan('doc', p); }} />
            <input ref={odoRef} type="file" accept="image/*" capture="environment" className="hidden" aria-label={t('veh.scanOdometer')}
              onChange={(e) => { const p = e.target.files?.[0]; e.target.value = ''; if (p) void scan('odometer', p); }} />
          </div>
        )}
        {notice && <p role="status" className="text-xs text-[color:var(--color-accent)]">{notice}</p>}

        <div className="grid grid-cols-2 gap-3">
          <Field label={t('veh.date')}><DateInput name="date" required value={f.date} onValueChange={(v) => set({ date: v })} /></Field>
          <Field label={t('veh.odometer')}><Input name="odometer" type="number" min="0" step="1" required={kind === 'fuel'} value={f.odometer} onChange={(e) => set({ odometer: e.target.value })} /></Field>
          {kind === 'fuel' && (
            <>
              <Field label={t('veh.liters')}><Input name="liters" type="number" min="0" step="any" required value={f.liters} onChange={(e) => set({ liters: e.target.value })} /></Field>
              <Field label={t('veh.pricePerLiter')}><Input name="pricePerLiter" type="number" min="0" step="any" value={f.pricePerLiter} onChange={(e) => set({ pricePerLiter: e.target.value })} /></Field>
            </>
          )}
          <Field label={t('veh.cost')}><Input name="cost" type="number" min="0" step="any" value={f.cost} onChange={(e) => set({ cost: e.target.value })} /></Field>
          {kind === 'fuel' ? (
            <Field label={t('veh.fuelType')}>
              <select name="fuelType" value={f.fuelType} onChange={(e) => set({ fuelType: e.target.value })} className={controlClass}>
                <option value="">–</option>
                {VEHICLE_FUEL_TYPES.filter(Boolean).map((x) => <option key={x} value={x}>{t(FUEL_LABEL[x as Exclude<typeof x, ''>])}</option>)}
              </select>
            </Field>
          ) : (
            <Field label={t('veh.garage')}><Input name="shop" value={f.shop} onChange={(e) => set({ shop: e.target.value })} /></Field>
          )}
          {kind === 'fuel' && <Field label={t('veh.station')} className="col-span-2"><Input name="shop" value={f.shop} onChange={(e) => set({ shop: e.target.value })} /></Field>}
        </div>

        {kind === 'service' && (
          <>
            <Field label={t('veh.serviceWhat')}><Input name="description" required placeholder={t('veh.serviceHint')} value={f.description} onChange={(e) => set({ description: e.target.value })} /></Field>
            <ItemsEditor items={items} onChange={setItems} />
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('veh.nextServiceKm')}><Input name="nextServiceKm" type="number" min="0" step="1" value={f.nextServiceKm} onChange={(e) => set({ nextServiceKm: e.target.value })} /></Field>
              <Field label={t('veh.nextServiceDate')}><DateInput name="nextServiceDate" value={f.nextServiceDate} onValueChange={(v) => set({ nextServiceDate: v })} /></Field>
            </div>
          </>
        )}

        {kind === 'fuel' && (
          <label className="flex items-center gap-2 text-sm text-[color:var(--color-text-dim)] cursor-pointer">
            <input type="checkbox" checked={f.fullTank} onChange={(e) => set({ fullTank: e.target.checked })} /> {t('veh.fullTank')}
          </label>
        )}
        {!editing && (
          <label className="flex items-center gap-2 text-sm text-[color:var(--color-text-dim)] cursor-pointer">
            <input type="checkbox" checked={f.logExpense} onChange={(e) => set({ logExpense: e.target.checked })} /> {t('veh.logExpense')}
          </label>
        )}

        <div className="flex flex-wrap items-center gap-2 text-xs text-[color:var(--color-text-dim)]">
          <Paperclip size={13} />
          {file ? (
            <span className="truncate max-w-[240px]">{file.name}</span>
          ) : log?.filePath ? (
            <a href={fileUrl(log.filePath)} target="_blank" rel="noopener noreferrer" className="text-[color:var(--color-cyan)] hover:underline">{t('veh.keptFile')}</a>
          ) : (
            <span>{t('veh.noFile')}</span>
          )}
          <label className="cursor-pointer text-[color:var(--color-accent)] hover:underline">
            {file || log?.filePath ? t('veh.replaceFile') : t('veh.attachFile')}
            <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { const p = e.target.files?.[0]; e.target.value = ''; if (p) setFile(p); }} />
          </label>
        </div>

        <FormFooter error={error} pending={pending || busy} onClose={onClose} />
      </form>
    </Modal>
  );
}

/** The invoice lines of a service: description, part / labour / other, cost. */
function ItemsEditor({ items, onChange }: { items: LogItem[]; onChange: (items: LogItem[]) => void }) {
  const t = useT();
  const update = (i: number, p: Partial<LogItem>) => onChange(items.map((x, j) => (j === i ? { ...x, ...p } : x)));
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-[color:var(--color-text-dim)]">{t('veh.invoiceLines')}</p>
      {items.map((it, i) => (
        <div key={i} className="grid grid-cols-[1fr_auto_6rem_auto] gap-1.5 items-center">
          <Input aria-label={t('veh.lineDescription')} value={it.description} onChange={(e) => update(i, { description: e.target.value })} />
          <select aria-label={t('veh.lineKind')} value={it.kind} onChange={(e) => update(i, { kind: e.target.value as LogItem['kind'] })} className={`${controlClass} w-auto`}>
            <option value="part">{t('veh.linePart')}</option>
            <option value="labor">{t('veh.lineLabor')}</option>
            <option value="other">{t('veh.lineOther')}</option>
          </select>
          <Input aria-label={t('veh.cost')} type="number" min="0" step="any" value={it.cost || ''} onChange={(e) => update(i, { cost: Number(e.target.value) || 0 })} />
          <button type="button" aria-label={t('common.delete')} onClick={() => onChange(items.filter((_, j) => j !== i))} className="p-1.5 text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)]"><Trash2 size={14} /></button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...items, { description: '', kind: 'part', cost: 0 }])} className="flex items-center gap-1 text-xs text-[color:var(--color-accent)] hover:underline">
        <Plus size={12} /> {t('veh.addLine')}
      </button>
    </div>
  );
}
