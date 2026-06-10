#!/usr/bin/env python3
"""
Extract receipt/invoice ATTACHMENTS (PDF + images) from a Gmail Takeout MBOX into
the app's storage inbox, so the app can import + AI-parse them.

  python3 scripts/extract-email-receipts.py [mbox] [out_dir]

Defaults:
  mbox    = .email-import/receipts.mbox
  out_dir = data/storage/email-inbox   (== /storage/email-inbox inside the container)

Dedupes identical attachments by content hash. Writes a manifest.json (sender/date/
subject per file) for context. Body-only "order confirmation" emails (no attachment)
are a separate phase — this script only pulls real attached documents.
"""
import sys, os, re, json, hashlib, mailbox
from email.header import decode_header, make_header

MBOX = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', '.email-import', 'receipts.mbox')
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), '..', 'data', 'storage', 'email-inbox')
os.makedirs(OUT, exist_ok=True)


def hdr(raw):
    try:
        return str(make_header(decode_header(raw or '')))
    except Exception:
        return raw or ''


def domain_of(frm):
    addr = frm.split('<')[-1].rstrip('> ').lower() if '<' in frm else frm.lower()
    m = re.search(r'@([\w.-]+)', addr)
    host = m.group(1) if m else 'unknown'
    # skroutz.gr → skroutz, eorders.plaisio.gr → plaisio
    parts = host.split('.')
    return parts[-2] if len(parts) >= 2 else host


def ext_for(filename, ctype):
    fn = (filename or '').lower()
    for e in ('.pdf', '.jpg', '.jpeg', '.png', '.webp', '.gif'):
        if fn.endswith(e):
            return '.jpg' if e == '.jpeg' else e
    if ctype == 'application/pdf':
        return '.pdf'
    if ctype.startswith('image/'):
        return '.' + ctype.split('/')[-1].split(';')[0]
    return '.pdf'  # octet-stream invoices are almost always PDF here


mb = mailbox.mbox(MBOX)
seen = set()
manifest = []
saved = 0
dup = 0
for msg in mb:
    frm = hdr(msg.get('From'))
    subj = hdr(msg.get('Subject'))[:120]
    date = msg.get('Date', '')
    dom = domain_of(frm)
    for part in msg.walk():
        ct = (part.get_content_type() or '').lower()
        fn = part.get_filename()
        cd = str(part.get('Content-Disposition') or '')
        is_doc = fn and ('attachment' in cd or ct == 'application/pdf' or ct.startswith('image/'))
        if not is_doc:
            continue
        try:
            data = part.get_payload(decode=True)
        except Exception:
            data = None
        if not data or len(data) < 1000:  # skip tiny/inline tracking pixels
            continue
        h = hashlib.sha256(data).hexdigest()
        if h in seen:
            dup += 1
            continue
        seen.add(h)
        ext = ext_for(hdr(fn), ct)
        out_name = f"{dom}_{h[:10]}{ext}"
        with open(os.path.join(OUT, out_name), 'wb') as f:
            f.write(data)
        manifest.append({'file': out_name, 'from': frm[:80], 'subject': subj, 'date': date, 'orig': hdr(fn)})
        saved += 1
        break  # one primary doc per email is enough

with open(os.path.join(OUT, 'manifest.json'), 'w') as f:
    json.dump(manifest, f, ensure_ascii=False, indent=1)

by_dom = {}
for m in manifest:
    d = m['file'].split('_')[0]
    by_dom[d] = by_dom.get(d, 0) + 1
print(f"saved {saved} attachment receipts → {os.path.normpath(OUT)}  ({dup} duplicates skipped)")
print("by source:")
for d, c in sorted(by_dom.items(), key=lambda x: -x[1]):
    print(f"  {c:4}  {d}")
