// One-off: re-parse the "failed" receipts that have embedded PDF text but were
// wrongly OCR'd (OCR garbled the Greek → empty). Uses the text + Claude directly.
const { MongoClient } = require('mongodb');
const { execFileSync } = require('child_process');

const MODEL = 'claude-sonnet-4-5-20250929';
const PROMPT =
  'You parse Greek/EU retail receipts and invoices. From the text below, return ONLY a JSON object: ' +
  '{"total": number, "subtotal": number, "vatAmount": number, "items": [{"name": string, "qty": number, "price": number, "vatRate": number}]}. ' +
  '"total" = final gross amount paid (with VAT, ΣΥΝΟΛΟ/ΠΛΗΡΩΤΕΟ). "subtotal" = net (ΚΑΘΑΡΗ ΑΞΙΑ). "price" = gross unit price (with VAT). ' +
  'vatRate is the % (GR: 24/13/6/0). If a value is not present use 0. Output JSON only, no prose.';

(async () => {
  const c = new MongoClient(process.env.MONGO_URI);
  await c.connect();
  const db = c.db('homepage');
  const cfg = await db.collection('appconfigs').findOne({ key: 'singleton' });
  const KEY = cfg.anthropicApiKey;
  const ROOT = process.env.STORAGE_ROOT || '/storage';

  const failed = await db.collection('receipts').find({
    deletedAt: null, archived: { $ne: true }, verified: false, total: 0,
    $or: [{ lineItems: { $size: 0 } }, { lineItems: { $exists: false } }],
    filePath: /\.pdf$/i,
  }).toArray();

  console.log(`Found ${failed.length} failed PDF receipts to try (text mode).`);
  for (const r of failed) {
    const fp = r.filePath.startsWith('/') ? r.filePath : `${ROOT}/${r.filePath}`;
    let text = '';
    try { text = execFileSync('pdftotext', ['-l', '3', fp, '-'], { encoding: 'utf8', maxBuffer: 5e6 }); } catch {}
    if (text.replace(/\s/g, '').length < 80) { console.log(`  ${r.store} → little/no text (image-only), skip`); continue; }
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: MODEL, max_tokens: 1500, messages: [{ role: 'user', content: `${PROMPT}\n\nRECEIPT TEXT:\n${text.slice(0, 6000)}` }] }),
      });
      const j = await res.json();
      if (!j.content) { console.log(`  ${r.store} → API error: ${JSON.stringify(j).slice(0, 120)}`); continue; }
      const raw = j.content[0].text.replace(/```json|```/g, '').trim();
      const p = JSON.parse(raw);
      const total = Number(p.total) || 0;
      if (!(total > 0)) { console.log(`  ${r.store} → no total found`); continue; }
      const items = (p.items || []).filter((it) => it && (it.name || it.price)).map((it) => ({
        name: String(it.name || 'Item'), refinedName: '', qty: Number(it.qty) || 1, price: Number(it.price) || 0, vatRate: Number(it.vatRate) || 24,
      }));
      await db.collection('receipts').updateOne({ _id: r._id }, { $set: {
        total, subtotal: Number(p.subtotal) || 0, vatAmount: Number(p.vatAmount) || 0,
        lineItems: items, aiModel: 'text-reparse+sonnet', aiParsedAt: new Date(),
      } });
      console.log(`  ${r.store} → €${total} · ${items.length} items ✓`);
    } catch (e) { console.log(`  ${r.store} → ${e.message}`); }
  }
  await c.close();
})().catch((e) => console.log('ERR', e.message));
