import { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, Pressable, RefreshControl, ActivityIndicator, ScrollView, StyleSheet, Alert, Linking, Image, type DimensionValue } from 'react-native';
import { C } from '../theme';
import { money, Spinner, ErrorText, Empty, Input, TextArea, IconButton, Button, Chip, ListItem, ModalSheet, contentWidth } from '../ui';
import { getItems, createItem, deleteItemRecord, importItemUrl, updateItem, getItem, logItemPrice, getItemPlans, linkItemPlan, unlinkItemPlan, convertItemToTask, aiFillItem, fileSource, type Item, type ItemDetail, type Verdict, type InstallmentPlanRow } from '../api';

function verdictMeta(v: Verdict): { label: string; color: string } | null {
  switch (v) {
    case 'deal': return { label: 'Deal · at/below target', color: C.accent };
    case 'dropping': return { label: '↓ Dropping', color: C.accent };
    case 'rising': return { label: '↑ Rising · maybe wait', color: C.gold };
    case 'good': return { label: 'Good price', color: C.cyan };
    case 'high': return { label: 'Above usual', color: C.gold };
    default: return null;
  }
}
const clampPct = (n: number): DimensionValue => `${Math.max(0, Math.min(100, n))}%` as DimensionValue;

function docIcon(mimeType: string): string {
  if (mimeType.startsWith('image/')) return '🖼';
  if (mimeType === 'application/pdf') return '📄';
  return '📎';
}
function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return bytes > 0 ? `${bytes} B` : '';
}

/** Read-only price picture mirroring the web PricePanel: best-now + verdict, position bar,
 *  where-to-buy (tap → open store), log-a-price, full history, photos, warranty, links. */
function PriceBlock({ detail, onChanged }: { detail: ItemDetail; onChanged: () => void }) {
  const p = detail.price;
  const [logging, setLogging] = useState(false);
  const [lprice, setLprice] = useState('');
  const [lstore, setLstore] = useState('');
  const [busy, setBusy] = useState(false);
  const [showHist, setShowHist] = useState(false);
  const vm = verdictMeta(p.verdict);
  const hasRange = p.lo != null && p.hi != null && p.hi > p.lo && p.bestNow != null;
  const toGo = p.target != null && p.bestNow ? p.bestNow.price - p.target : null;
  const open = (url: string) => Linking.openURL(url).catch(() => {});

  async function submit() {
    const v = parseFloat(lprice.replace(',', '.'));
    if (!(v > 0)) return;
    setBusy(true);
    try { const r = await logItemPrice(detail.id, v, lstore.trim()); if (r.ok) { setLprice(''); setLstore(''); setLogging(false); onChanged(); } }
    finally { setBusy(false); }
  }

  return (
    <View style={pb.wrap}>
      {/* Hero best-now + verdict */}
      <View style={pb.heroRow}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
          <Text style={pb.hero}>{p.bestNow ? money(p.bestNow.price) : '—'}</Text>
          {!!p.bestNow?.store && <Text style={pb.heroAt}>at {p.bestNow.store}</Text>}
        </View>
        {p.trend !== 0 && (
          <Text style={[pb.trend, { color: p.trend < 0 ? C.accent : C.gold }]}>
            {p.trend < 0 ? '↓' : '↑'} {money(Math.abs(p.trend))}
          </Text>
        )}
      </View>
      {vm && <Text style={[pb.verdict, { color: vm.color }]}>{vm.label}</Text>}

      {/* Position bar */}
      {hasRange && (
        <View style={{ marginTop: 12 }}>
          <View style={pb.track}>
            {p.target != null && p.target >= p.lo! && p.target <= p.hi! && (
              <View style={[pb.tick, { left: clampPct(((p.target - p.lo!) / (p.hi! - p.lo!)) * 100) }]} />
            )}
            <View style={[pb.dot, { left: clampPct(((p.bestNow!.price - p.lo!) / (p.hi! - p.lo!)) * 100) }]} />
          </View>
          <View style={pb.scaleRow}>
            <Text style={[pb.scale, { color: C.accent }]}>low {money(p.lo!)}</Text>
            {p.target != null && <Text style={[pb.scale, { color: C.cyan }]}>target {money(p.target)}</Text>}
            <Text style={pb.scale}>high {money(p.hi!)}</Text>
          </View>
        </View>
      )}

      {/* Where to buy */}
      {p.stores.length > 0 && (
        <View style={{ marginTop: 14 }}>
          <Text style={pb.section}>WHERE TO BUY</Text>
          {p.stores.slice(0, 5).map((st, i) => (
            <Pressable key={i} onPress={() => open(st.url)} style={pb.storeRow}>
              <View style={[pb.storeDot, { backgroundColor: i === 0 ? C.accent : C.faint }]} />
              <Text style={pb.storeName} numberOfLines={1}>{st.store}</Text>
              {i === 0 && p.stores.length > 1 && <Text style={pb.cheapest}>CHEAPEST</Text>}
              <Text style={pb.storePrice}>{money(st.price)}</Text>
              <Text style={pb.openIcon}>↗</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Target + Log a price */}
      <View style={pb.actionRow}>
        {p.target != null ? (
          <Text style={pb.targetTxt}>🎯 {money(p.target)}{toGo != null && (toGo <= 0 ? ' · reached' : ` · ${money(toGo)} to go`)}</Text>
        ) : <View />}
        {!logging && <Pressable onPress={() => setLogging(true)}><Text style={pb.logBtn}>＋ Log a price</Text></Pressable>}
      </View>
      {logging && (
        <View style={pb.logRow}>
          <Input value={lprice} onChangeText={setLprice} keyboardType="decimal-pad" placeholder="price" style={{ width: 80 }} />
          <Input value={lstore} onChangeText={setLstore} placeholder="store" style={{ flex: 1 }} />
          <Pressable onPress={submit} disabled={busy || !(parseFloat(lprice.replace(',', '.')) > 0)} style={[pb.logSave, (busy || !(parseFloat(lprice.replace(',', '.')) > 0)) && { opacity: 0.4 }]}>
            {busy ? <ActivityIndicator color={C.onAccent} /> : <Text style={pb.logSaveText}>Save</Text>}
          </Pressable>
        </View>
      )}

      {/* Full history */}
      {detail.priceHistory.length > 0 && (
        <View style={{ marginTop: 12 }}>
          <Pressable onPress={() => setShowHist((h) => !h)}><Text style={pb.histToggle}>{showHist ? '▾' : '▸'} Full history · {detail.priceHistory.length}</Text></Pressable>
          {showHist && detail.priceHistory.slice(0, 30).map((e, i) => (
            <View key={i} style={pb.histRow}>
              <Text style={pb.histPrice}>{money(e.price)}</Text>
              <Text style={pb.histStore} numberOfLines={1}>{e.store}</Text>
              <Text style={pb.histDate}>{new Date(e.date).toLocaleDateString('en-GB')}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Photos */}
      {detail.photos.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 14 }}>
          {detail.photos.slice(0, 8).map((ph, i) => (
            <Image key={i} source={fileSource(ph)} style={pb.photo} />
          ))}
        </ScrollView>
      )}

      {/* Documents (manuals, warranty certs — read-only) */}
      {detail.attachments.length > 0 && (
        <View style={{ marginTop: 14 }}>
          <Text style={pb.section}>DOCUMENTS</Text>
          {detail.attachments.slice(0, 20).map((a, i) => (
            <Pressable
              key={i}
              onPress={() => {
                if (!a.mimeType.startsWith('image/')) {
                  Alert.alert('Not available yet', `Open "${a.name || 'this file'}" from the Pharos web app for now.`);
                }
              }}
              style={pb.docRow}
            >
              {a.mimeType.startsWith('image/')
                ? <Image source={fileSource(a.path)} style={pb.docThumb} />
                : <Text style={pb.docIcon}>{docIcon(a.mimeType)}</Text>}
              <Text style={pb.linkLabel} numberOfLines={1}>{a.name || a.path.split('/').pop()}</Text>
              {!!fmtSize(a.size) && <Text style={pb.docSize}>{fmtSize(a.size)}</Text>}
            </Pressable>
          ))}
        </View>
      )}

      {/* Links (non-priced too) */}
      {detail.links.length > 0 && (
        <View style={{ marginTop: 14 }}>
          <Text style={pb.section}>LINKS</Text>
          {detail.links.slice(0, 8).map((l, i) => (
            <Pressable key={i} onPress={() => open(l.url)} style={pb.linkRow}>
              <Text style={pb.linkLabel} numberOfLines={1}>{l.label || l.url}</Text>
              <Text style={pb.openIcon}>↗</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Warranty / purchase */}
      {(detail.warrantyUntil || detail.purchasedFrom || detail.location) && (
        <View style={{ marginTop: 14, gap: 4 }}>
          {!!detail.warrantyUntil && <Text style={pb.meta}>🛡 Warranty until {new Date(detail.warrantyUntil).toLocaleDateString('en-GB')}</Text>}
          {!!detail.purchasedFrom && <Text style={pb.meta}>🧾 Bought from {detail.purchasedFrom}</Text>}
          {!!detail.location && <Text style={pb.meta}>📍 {detail.location}</Text>}
        </View>
      )}
    </View>
  );
}

function monthLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

/** Link this item to a credit-card installment plan (δόσεις). A purchase paid monthly
 *  shows up as one plan; attaching it surfaces payoff on the product. Mirror of the web
 *  "Link a δόσεις plan" picker. Loads lazily on first expand. */
function PlansBlock({ itemId }: { itemId: string }) {
  const [open, setOpen] = useState(false);
  const [plans, setPlans] = useState<InstallmentPlanRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try { const r = await getItemPlans(itemId); setPlans(r.plans); } catch { setPlans([]); }
    finally { setLoading(false); }
  }, [itemId]);

  async function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next && plans == null) await reload();
  }
  async function link(sig: string) {
    setBusy(sig);
    try { await linkItemPlan(itemId, sig); await reload(); } finally { setBusy(null); }
  }
  async function unlink(sig: string) {
    setBusy(sig);
    try { await unlinkItemPlan(itemId, sig); await reload(); } finally { setBusy(null); }
  }

  const linked = plans?.filter((p) => p.linked) ?? [];
  const available = plans?.filter((p) => !p.linked) ?? [];

  return (
    <View style={pl.wrap}>
      {/* Always show linked plans, even before the picker opens */}
      {linked.map((p) => (
        <View key={p.signature} style={pl.linkedRow}>
          <View style={{ flex: 1 }}>
            <Text style={pl.linkedLabel} numberOfLines={1}>💳 {p.label}</Text>
            <Text style={pl.linkedMeta}>
              {money(p.perAmount)}/mo · {p.paidInstallments}/{p.totalInstallments}
              {p.done ? ' · paid off' : ` · ${money(p.remainingAmount)} left`}
            </Text>
          </View>
          <Pressable onPress={() => unlink(p.signature)} disabled={busy === p.signature} hitSlop={8}>
            {busy === p.signature ? <ActivityIndicator color={C.red} size="small" /> : <Text style={pl.unlink}>✕</Text>}
          </Pressable>
        </View>
      ))}

      <Pressable onPress={toggleOpen}>
        <Text style={pl.toggle}>{open ? '▾' : '▸'} Link an installment plan{plans ? ` · ${available.length} available` : ''}</Text>
      </Pressable>

      {open && (
        <View style={{ marginTop: 8 }}>
          {loading && <ActivityIndicator color={C.accent} style={{ marginVertical: 8 }} />}
          {!loading && available.length === 0 && <Text style={pl.empty}>No unlinked plans. Import a statement first.</Text>}
          {available.map((p) => (
            <Pressable key={p.signature} onPress={() => link(p.signature)} disabled={busy === p.signature} style={pl.availRow}>
              <View style={{ flex: 1 }}>
                <Text style={pl.availLabel} numberOfLines={1}>{p.label}</Text>
                <Text style={pl.availMeta}>
                  {p.card} · {money(p.perAmount)}/mo · {p.paidInstallments}/{p.totalInstallments}
                  {p.done ? ' · done' : ` · ends ${monthLabel(p.projectedEndDate)}`}
                  {p.itemCount > 0 ? ` · ${p.itemCount} linked` : ''}
                </Text>
              </View>
              {busy === p.signature ? <ActivityIndicator color={C.accent} size="small" /> : <Text style={pl.plus}>＋</Text>}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const FILTERS: { key: 'all' | 'inventory' | 'shopping'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'inventory', label: 'Owned' },
  { key: 'shopping', label: 'Shopping' },
];

const STATUSES = ['researching', 'decided', 'ordered', 'received', 'installed', 'sold', 'broken', 'deferred'];

export function ItemsScreen() {
  const [rows, setRows] = useState<Item[]>([]);
  const [filter, setFilter] = useState<'all' | 'inventory' | 'shopping'>('all');
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try { setRows(await getItems(filter)); } catch (e) { setErr((e as Error).message); }
  }, [filter]);
  useEffect(() => { (async () => { await load(); setLoading(false); })(); }, [load]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  const [importing, setImporting] = useState(false);
  const isUrl = /^https?:\/\//i.test(title.trim());

  async function add() {
    const t = title.trim();
    if (!t) return;
    if (isUrl) return importUrl(t);
    setTitle('');
    try { await createItem({ title: t }); setFilter('all'); await load(); } catch (e) { setErr((e as Error).message); }
  }

  async function importUrl(url: string) {
    setImporting(true); setErr(null);
    try {
      const r = await importItemUrl(url, 'shopping');
      setTitle(''); setFilter('shopping'); await load();
      Alert.alert(r.updated ? 'Updated existing' : 'Added to shopping', `${r.title}${r.price ? `  ·  ${money(r.price)}` : ''}  ·  ${r.store}`);
    } catch (e) { setErr((e as Error).message); }
    finally { setImporting(false); }
  }

  function remove(it: Item) {
    Alert.alert('Delete', `Delete "${it.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { setRows((p) => p.filter((x) => x.id !== it.id)); try { await deleteItemRecord(it.id); } catch { await load(); } } },
    ]);
  }

  const [editing, setEditing] = useState<Item | null>(null);
  const [eTitle, setETitle] = useState('');
  const [eStatus, setEStatus] = useState('researching');
  const [eCategory, setECategory] = useState('');
  const [ePrice, setEPrice] = useState('');
  const [eTarget, setETarget] = useState('');
  const [eSpecs, setESpecs] = useState('');
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState(false);
  const [aiFilling, setAiFilling] = useState<null | 'specs' | 'info'>(null);
  const [detail, setDetail] = useState<ItemDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try { setDetail(await getItem(id)); } catch { setDetail(null); }
    finally { setDetailLoading(false); }
  }, []);

  function openEdit(it: Item) {
    setEditing(it);
    setETitle(it.title);
    setEStatus(it.status || 'researching');
    setECategory(it.category || '');
    setEPrice(it.currentPrice ? String(it.currentPrice) : '');
    setETarget(it.targetPrice != null ? String(it.targetPrice) : '');
    setESpecs(it.specs || '');
    setDetail(null);
    loadDetail(it.id);
  }
  async function saveEdit() {
    if (!editing) return;
    const id = editing.id;
    const price = parseFloat(ePrice.replace(',', '.'));
    const target = eTarget.trim() ? parseFloat(eTarget.replace(',', '.')) : null;
    setSaving(true); setErr(null);
    try {
      await updateItem(id, {
        title: eTitle.trim(),
        status: eStatus,
        category: eCategory.trim(),
        currentPrice: Number.isFinite(price) ? price : undefined,
        targetPrice: target != null && Number.isFinite(target) ? target : null,
        specs: eSpecs.trim(),
      });
      setEditing(null);
      await load();
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  }
  async function convertToTask() {
    if (!editing || converting) return;
    setConverting(true); setErr(null);
    try {
      const r = await convertItemToTask(editing.id);
      if (r.ok) Alert.alert('Converted to task', `A task was created from "${editing.title}".`);
      else setErr('Convert failed');
    } catch (e) { setErr((e as Error).message); }
    finally { setConverting(false); }
  }
  async function runAiFill(mode: 'specs' | 'info') {
    if (!editing || aiFilling) return;
    setAiFilling(mode); setErr(null);
    try {
      const r = await aiFillItem(editing.id, mode);
      if (!r.ok) { setErr(r.error || 'AI fill failed'); return; }
      if (mode === 'specs' && r.specs) setESpecs(r.specs);
      await loadDetail(editing.id);
      await load();
      if (mode === 'info') {
        const filled = r.filled ?? [];
        Alert.alert('AI fill', filled.length ? `Filled: ${filled.join(', ')}.` : 'Nothing new to fill.');
      }
    } catch (e) { setErr((e as Error).message); }
    finally { setAiFilling(null); }
  }

  return (
    <View style={s.wrap}>
      <View style={s.filters}>
        {FILTERS.map((f) => (
          <Chip key={f.key} label={f.label} on={filter === f.key} onPress={() => setFilter(f.key)} style={s.filterChip} textStyle={s.filterChipText} />
        ))}
      </View>
      <View style={s.addRow}>
        <Input value={title} onChangeText={setTitle} onSubmitEditing={add} autoCapitalize="none" autoCorrect={false} placeholder="Add an item or paste a link…" style={{ flex: 1 }} />
        <IconButton glyph={isUrl ? '✦' : '＋'} onPress={add} disabled={!title.trim()} busy={importing} style={isUrl ? s.importBtn : undefined} />
      </View>
      {isUrl && <Text style={s.hint}>✦ AI will fetch this link and add it to Shopping</Text>}
      <ErrorText>{err}</ErrorText>
      {loading ? <Spinner /> : (
        <FlatList
          data={rows}
          keyExtractor={(i) => i.id}
          contentContainerStyle={[{ padding: 16, paddingTop: 4 }, contentWidth]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
          ListEmptyComponent={<Empty>No items.</Empty>}
          renderItem={({ item }) => {
            const price = item.purchasedPrice ?? item.currentPrice;
            return (
              <ListItem onPress={() => openEdit(item)} onLongPress={() => remove(item)}>
                <View style={{ flex: 1 }}>
                  {!!item.category && <Text style={s.eyebrow}>{item.category.toUpperCase()}</Text>}
                  <Text style={s.title}>{item.title}</Text>
                  <Text style={s.meta}>{item.status}</Text>
                </View>
                {price > 0 && <Text style={s.price}>{money(price)}</Text>}
              </ListItem>
            );
          }}
        />
      )}

      <ModalSheet visible={!!editing} onClose={() => setEditing(null)} wrapStyle={s.modalPad} cardStyle={s.modalMax}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={s.modalTitle}>Edit item</Text>
              {detailLoading && <ActivityIndicator color={C.accent} style={{ marginVertical: 14 }} />}
              {detail && <PriceBlock detail={detail} onChanged={async () => { if (editing) await loadDetail(editing.id); await load(); }} />}
              {editing && <PlansBlock itemId={editing.id} />}
              <Text style={s.mlabel}>TITLE</Text>
              <Input variant="modal" value={eTitle} onChangeText={setETitle} />
              <Text style={s.mlabel}>STATUS</Text>
              <View style={s.statusWrap}>
                {STATUSES.map((st) => (
                  <Chip key={st} label={st} on={eStatus === st} onPress={() => setEStatus(st)} style={s.statusChip} />
                ))}
              </View>
              <Text style={s.mlabel}>CATEGORY</Text>
              <Input variant="modal" value={eCategory} onChangeText={setECategory} autoCapitalize="none" placeholder="e.g. networking" />
              <View style={s.priceRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.mlabel}>PRICE</Text>
                  <Input variant="modal" value={ePrice} onChangeText={setEPrice} keyboardType="decimal-pad" placeholder="0" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.mlabel}>TARGET</Text>
                  <Input variant="modal" value={eTarget} onChangeText={setETarget} keyboardType="decimal-pad" placeholder="—" />
                </View>
              </View>
              <Text style={s.mlabel}>SPECS</Text>
              <TextArea variant="modal" value={eSpecs} onChangeText={setESpecs} style={s.specs} placeholder="notes / specs" />
              <View style={s.aiBar}>
                <Pressable onPress={() => runAiFill('specs')} disabled={!!aiFilling} style={[s.aiBtn, !!aiFilling && s.dim]}>
                  {aiFilling === 'specs' ? <ActivityIndicator color={C.accent} /> : <Text style={s.aiBtnText}>✦ AI specs</Text>}
                </Pressable>
                <Pressable onPress={() => runAiFill('info')} disabled={!!aiFilling} style={[s.aiBtn, !!aiFilling && s.dim]}>
                  {aiFilling === 'info' ? <ActivityIndicator color={C.accent} /> : <Text style={s.aiBtnText}>✦ AI info</Text>}
                </Pressable>
              </View>
              <Pressable onPress={convertToTask} disabled={converting} style={[s.convertBtn, converting && s.dim]}>
                {converting ? <ActivityIndicator color={C.cyan} /> : <Text style={s.convertBtnText}>＋ Convert to task</Text>}
              </Pressable>
              <View style={s.mbtns}>
                <Button label="Save" onPress={saveEdit} disabled={!eTitle.trim()} busy={saving} style={{ paddingHorizontal: 26, minWidth: 96, alignItems: 'center' }} />
                <Button label="Delete" onPress={() => { const e = editing; setEditing(null); if (e) remove(e); }} variant="danger" />
              </View>
            </ScrollView>
      </ModalSheet>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.bg },
  addRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  importBtn: { backgroundColor: C.cyan },
  hint: { color: C.cyan, fontSize: 11, paddingHorizontal: 16, paddingBottom: 8, marginTop: -2 },
  dim: { opacity: 0.4 },
  filters: { flexDirection: 'row', gap: 8, padding: 16, paddingBottom: 8 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 7 },
  filterChipText: { fontSize: 13 },
  eyebrow: { color: C.faint, fontSize: 10, letterSpacing: 1 },
  title: { color: C.text, fontSize: 15, fontWeight: '600', marginTop: 2 },
  meta: { color: C.faint, fontSize: 12, marginTop: 2 },
  price: { color: C.accent, fontSize: 16, fontWeight: '700' },
  modalPad: { padding: 20 },
  modalMax: { maxHeight: '88%' },
  modalTitle: { color: C.text, fontSize: 18, fontWeight: '800' },
  mlabel: { color: C.faint, fontSize: 10, letterSpacing: 1.2, marginTop: 12, marginBottom: 6 },
  specs: { minHeight: 64, textAlignVertical: 'top' },
  priceRow: { flexDirection: 'row', gap: 12 },
  statusWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  statusChip: { paddingHorizontal: 11, borderRadius: 9 },
  mbtns: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 22 },
  aiBar: { flexDirection: 'row', gap: 10, marginTop: 12 },
  aiBtn: { flex: 1, borderRadius: 12, borderWidth: 1, borderColor: C.accent, paddingVertical: 10, alignItems: 'center' },
  aiBtnText: { color: C.accent, fontSize: 14, fontWeight: '600' },
  convertBtn: { marginTop: 16, borderRadius: 12, borderWidth: 1, borderColor: C.cyan, paddingVertical: 11, alignItems: 'center' },
  convertBtnText: { color: C.cyan, fontSize: 14, fontWeight: '600' },
});

const pb = StyleSheet.create({
  wrap: { marginTop: 14, padding: 14, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, borderRadius: 14 },
  heroRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  hero: { color: C.text, fontSize: 30, fontWeight: '800' },
  heroAt: { color: C.dim, fontSize: 12, marginBottom: 4 },
  trend: { fontSize: 13, fontWeight: '700' },
  verdict: { fontSize: 12, fontWeight: '700', marginTop: 4 },
  track: { height: 6, borderRadius: 3, backgroundColor: C.borderLight, position: 'relative', justifyContent: 'center' },
  dot: { position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: C.text, borderWidth: 2, borderColor: C.surface, marginLeft: -6 },
  tick: { position: 'absolute', width: 2, height: 12, backgroundColor: C.cyan, marginLeft: -1 },
  scaleRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  scale: { color: C.faint, fontSize: 10 },
  section: { color: C.faint, fontSize: 10, letterSpacing: 1, marginBottom: 7 },
  storeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 6 },
  storeDot: { width: 6, height: 6, borderRadius: 3 },
  storeName: { flex: 1, color: C.dim, fontSize: 13 },
  cheapest: { color: C.accent, fontSize: 9, fontWeight: '800' },
  storePrice: { color: C.text, fontSize: 13, fontWeight: '700' },
  openIcon: { color: C.cyan, fontSize: 13 },
  actionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, flexWrap: 'wrap', gap: 8 },
  targetTxt: { color: C.dim, fontSize: 12 },
  logBtn: { color: C.accent, fontSize: 13, fontWeight: '600' },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  logSave: { backgroundColor: C.accent, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 9, alignItems: 'center', justifyContent: 'center' },
  logSaveText: { color: C.onAccent, fontSize: 13, fontWeight: '700' },
  histToggle: { color: C.dim, fontSize: 12, fontWeight: '600' },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginTop: 6 },
  histPrice: { color: C.text, fontSize: 13, fontWeight: '700' },
  histStore: { flex: 1, color: C.dim, fontSize: 12 },
  histDate: { color: C.faint, fontSize: 11 },
  photo: { width: 72, height: 72, borderRadius: 10, marginRight: 8, backgroundColor: C.surface },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 },
  linkLabel: { flex: 1, color: C.cyan, fontSize: 13 },
  meta: { color: C.dim, fontSize: 12 },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 },
  docIcon: { fontSize: 16, width: 22, textAlign: 'center' },
  docThumb: { width: 22, height: 22, borderRadius: 4, backgroundColor: C.surface },
  docSize: { color: C.faint, fontSize: 11 },
});

const pl = StyleSheet.create({
  wrap: { marginTop: 12, padding: 14, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, borderRadius: 14 },
  toggle: { color: C.accent, fontSize: 13, fontWeight: '600' },
  empty: { color: C.faint, fontSize: 12, fontStyle: 'italic', marginVertical: 6 },
  linkedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8 },
  linkedLabel: { color: C.text, fontSize: 13, fontWeight: '600' },
  linkedMeta: { color: C.faint, fontSize: 11, marginTop: 2 },
  unlink: { color: C.red, fontSize: 15, fontWeight: '700', paddingHorizontal: 4 },
  availRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: C.border, marginBottom: 6 },
  availLabel: { color: C.dim, fontSize: 13, fontWeight: '600' },
  availMeta: { color: C.faint, fontSize: 11, marginTop: 2 },
  plus: { color: C.accent, fontSize: 18, fontWeight: '800', paddingHorizontal: 4 },
});
