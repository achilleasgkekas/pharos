#!/usr/bin/env python3
"""
Phase 2: extract the HTML BODY of order-confirmation emails (no attachment, but a
real purchase: order/invoice keyword + a price) from the Gmail Takeout MBOX into
the app's email inbox as .html files. The app imports them as draft receipts and
the "re-scan all" job parses them via the new html→text branch (parseReceiptText).

  python3 scripts/extract-email-bodies.py [mbox] [out_dir]

Defaults: mbox=.email-import/receipts.mbox  out_dir=data/storage/email-inbox
Skips newsletters/marketing and pure shipping/tracking notices.
"""
import sys, os, re, json, hashlib, mailbox
from email.header import decode_header, make_header

MBOX = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', '.email-import', 'receipts.mbox')
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), '..', 'data', 'storage', 'email-inbox')
os.makedirs(OUT, exist_ok=True)


def H(raw):
    try:
        return str(make_header(decode_header(raw or '')))
    except Exception:
        return str(raw or '')


def domain_of(frm):
    addr = frm.split('<')[-1].rstrip('> ').lower() if '<' in frm else frm.lower()
    m = re.search(r'@([\w.-]+)', addr)
    host = (m.group(1) if m else 'unknown').split('.')
    return host[-2] if len(host) >= 2 else host[0]


def has_attachment(msg):
    for part in msg.walk():
        ct = (part.get_content_type() or '').lower()
        fn = part.get_filename()
        cd = str(part.get('Content-Disposition') or '')
        if fn and ('attachment' in cd or ct == 'application/pdf' or ct.startswith('image/')):
            try:
                if len(part.get_payload(decode=True) or b'') > 1000:
                    return True
            except Exception:
                pass  # a malformed part is treated as having no attachment
    return False


def best_body(msg):
    """Prefer the HTML part; fall back to text wrapped in <pre>."""
    html = text = ''
    for part in msg.walk():
        ct = (part.get_content_type() or '').lower()
        if ct == 'text/html' and not html:
            try:
                html = (part.get_payload(decode=True) or b'').decode('utf-8', 'ignore')
            except Exception:
                pass  # undecodable body: keep looking in the other parts
        elif ct == 'text/plain' and not text:
            try:
                text = (part.get_payload(decode=True) or b'').decode('utf-8', 'ignore')
            except Exception:
                pass  # undecodable body: keep looking in the other parts
    if html:
        return html
    if text:
        return '<pre>' + text + '</pre>'
    return ''


RX_ORDER = re.compile(r'(order|παραγγελ|invoice|τιμολ|απόδειξ|receipt|purchase|αγορά|confirmation|επιβεβαίωσ)', re.I)
RX_SHIP = re.compile(r'(shipped|απεστάλη|on its way|tracking|αποστολ|παραλαβ|boxnow|courier|delivery|παράδοση)', re.I)
RX_NEWS = re.compile(r'(newsletter|unsubscribe|προσφορ|offer|sale|έκπτωσ|deal|wishlist|επιθυμ)', re.I)
RX_PRICE = re.compile(r'(€|\bEUR\b)\s?\d|\d+[.,]\d{2}\s?€')

mb = mailbox.mbox(MBOX)
seen = set()
manifest = []
saved = 0
for msg in mb:
    if has_attachment(msg):
        continue
    frm = H(msg.get('From'))
    addr = frm.split('<')[-1].rstrip('> ').lower() if '<' in frm else frm.lower()
    subj = H(msg.get('Subject'))
    body = best_body(msg)
    blob = subj + ' ' + body[:20000]
    has_price = bool(RX_PRICE.search(blob))
    is_order = bool(RX_ORDER.search(subj)) or (bool(RX_ORDER.search(blob)) and has_price)
    is_news = bool(RX_NEWS.search(subj)) or 'newsletter' in addr or 'marketing' in addr
    if not (is_order and has_price) or is_news or not body:
        continue
    h = hashlib.sha256(body.encode('utf-8', 'ignore')).hexdigest()
    if h in seen:
        continue
    seen.add(h)
    dom = domain_of(frm)
    out_name = f"{dom}_{h[:10]}.html"
    with open(os.path.join(OUT, out_name), 'w', encoding='utf-8') as f:
        f.write(body)
    manifest.append({'file': out_name, 'from': frm[:80], 'subject': subj[:160], 'date': msg.get('Date', '')})
    saved += 1

# Merge with any existing manifest (attachment phase wrote one too)
mpath = os.path.join(OUT, 'manifest.json')
existing = []
try:
    with open(mpath, encoding='utf-8') as f:
        existing = json.load(f)
except Exception:
    pass  # no manifest yet (or unreadable): start a fresh one
with open(mpath, 'w', encoding='utf-8') as f:
    json.dump(existing + manifest, f, ensure_ascii=False, indent=1)

by = {}
for m in manifest:
    d = m['file'].split('_')[0]
    by[d] = by.get(d, 0) + 1
print(f"saved {saved} order-email bodies (.html) → {os.path.normpath(OUT)}")
print("by source:")
for d, c in sorted(by.items(), key=lambda x: -x[1])[:20]:
    print(f"  {c:4}  {d}")
