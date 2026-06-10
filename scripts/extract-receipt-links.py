#!/usr/bin/env python3
"""
Find receipt-DOWNLOAD links hidden inside emails — cases where the receipt is NOT
attached, but the email links to a hosted receipt/invoice page. Classifies them
per store, and (with --fetch) downloads the public-token ones into the app's email
inbox so they import as draft receipts and the "re-scan all" job parses them.

  python3 scripts/extract-receipt-links.py                 # list cases per store (NO network)
  python3 scripts/extract-receipt-links.py --samples       # list + show sample URLs
  python3 scripts/extract-receipt-links.py --fetch         # download the public-token receipts
  python3 scripts/extract-receipt-links.py --fetch --only steam,viva --limit 20

Buckets:
  steam     — store.steampowered.com receipt / VATPurchaseReceipt    (public token, fetchable)
  viva      — viva.com / vivawallet selfcare receipt by tid          (public token, fetchable)
  einvoice  — Greek e-invoice portals: s1/ecos/impact/epsilon/mydata (public token, fetchable)
  paypal    — paypal.com transaction receipts                        (needs login → list only)

Defaults: mbox=.email-import/receipts.mbox  out=data/storage/email-inbox
"""
import sys, os, re, json, hashlib, mailbox, time, urllib.request, urllib.error
from email.header import decode_header, make_header
from html import unescape

ROOT = os.path.join(os.path.dirname(__file__), '..')
MBOX = os.path.join(ROOT, '.email-import', 'receipts.mbox')
OUT = os.path.join(ROOT, 'data', 'storage', 'email-inbox')

FETCH = '--fetch' in sys.argv
SAMPLES = '--samples' in sys.argv or '--sample' in sys.argv


def argval(flag):
    if flag in sys.argv:
        i = sys.argv.index(flag)
        if i + 1 < len(sys.argv):
            return sys.argv[i + 1]
    return None


ONLY = {s for s in (argval('--only') or '').split(',') if s}
LIMIT = int(argval('--limit') or '0')

# (bucket, fetchable, URL regex). First match wins; order matters.
CLASSIFIERS = [
    # Steam: the actual VAT receipt page (skip the bare account/history link)
    ('steam', True, re.compile(r'steampowered\.com/[^\s]*(?:vatpurchasereceipt|/receipt|/purchase)', re.I)),
    ('viva', True, re.compile(r'(?:viva\.com|vivawallet\.com|vivapayments\.com)/[^\s]*(?:tid=|[?&]t=|receipt|selfcare|transactions)', re.I)),
    ('einvoice', True, re.compile(r'(?:s1\.|ecos|impact\.gr|e-?invoic|epsilonnet|epsilon\.|mydata|primer\.gr|el128|softone)[\w.-]*/[^\s]*(?:token|guid|uid|[?&]id=|mark=|invoice|receipt|doc|viewinvoice|edocuments)', re.I)),
    # PayPal: only real transaction receipts (needs login). Exclude t.paypal.com
    # tracking + smarthelp marketing so the count is honest.
    ('paypal', False, re.compile(r'(?<!t\.)paypal\.com/[^\s]*(?:myaccount/(?:activities/details|transactions)|/receipt)', re.I)),
]

# A loose "is this a receipt-ish URL at all" gate for the catch-all bucket.
RX_INTEREST = re.compile(r'(receipt|invoice|απόδειξ|τιμολ|παραστατ|vat|order|παραγγελ|token|purchase)', re.I)
URL_RX = re.compile(r'https?://[^\s"\'<>)\]]+', re.I)
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'


def H(raw):
    try:
        return str(make_header(decode_header(raw or '')))
    except Exception:
        return str(raw or '')


def bodies(msg):
    html = text = ''
    for part in msg.walk():
        ct = (part.get_content_type() or '').lower()
        if ct == 'text/html' and not html:
            try:
                html = (part.get_payload(decode=True) or b'').decode('utf-8', 'ignore')
            except Exception:
                pass
        elif ct == 'text/plain' and not text:
            try:
                text = (part.get_payload(decode=True) or b'').decode('utf-8', 'ignore')
            except Exception:
                pass
    return html, text


def classify(url):
    for name, fetchable, rx in CLASSIFIERS:
        if rx.search(url):
            return name, fetchable
    return None, False


def collect():
    """Return {bucket: [ {url, subject, from, date, fetchable} ]} deduped by URL."""
    mb = mailbox.mbox(MBOX)
    found = {}
    seen_urls = set()
    for msg in mb:
        frm = H(msg.get('From'))
        subj = H(msg.get('Subject'))
        date = msg.get('Date', '')
        html, text = bodies(msg)
        urls = set()
        for blob in (html, text):
            if not blob:
                continue
            for u in URL_RX.findall(blob):
                urls.add(unescape(u).rstrip('.,;)'))
        for u in urls:
            bucket, fetchable = classify(u)
            if not bucket:
                continue
            if u in seen_urls:
                continue
            seen_urls.add(u)
            found.setdefault(bucket, []).append(
                {'url': u, 'subject': subj[:120], 'from': frm[:60], 'date': date, 'fetchable': fetchable}
            )
    return found


def store_for(bucket, url):
    return {'steam': 'Steam', 'viva': 'Viva', 'einvoice': 'e-invoice', 'paypal': 'PayPal'}.get(bucket, bucket)


def fetch_one(entry, bucket):
    """GET the receipt URL; save HTML/PDF into the inbox. Returns filename or None."""
    url = entry['url']
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'text/html,application/pdf,*/*'})
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            ct = (r.headers.get('Content-Type') or '').lower()
            data = r.read()
    except Exception as e:
        return None, f'{type(e).__name__}'
    if not data or len(data) < 400:
        return None, 'empty'
    ext = 'pdf' if ('pdf' in ct or data[:4] == b'%PDF') else 'html'
    h = hashlib.sha256(data).hexdigest()
    store = store_for(bucket, url)
    name = f'{store.lower()}_{h[:10]}.{ext}'
    with open(os.path.join(OUT, name), 'wb') as f:
        f.write(data)
    return name, ext


def main():
    if not os.path.exists(MBOX):
        print(f'! mbox not found: {MBOX}')
        sys.exit(1)
    found = collect()
    order = ['steam', 'viva', 'einvoice', 'paypal']
    buckets = [b for b in order if b in found] + [b for b in found if b not in order]

    total = sum(len(found[b]) for b in buckets)
    print(f'Receipt-link cases found: {total}\n')
    for b in buckets:
        items = found[b]
        fetchable = items[0]['fetchable'] if items else False
        tag = 'fetchable' if fetchable else 'needs login — skip'
        print(f'  {b:10} {len(items):4}   ({tag})')
        if SAMPLES:
            for it in items[:3]:
                print(f'             · {it["url"][:110]}')
    print()

    if not FETCH:
        print('List only. Re-run with --fetch to download the public-token receipts')
        print('(optionally --only steam,viva,einvoice and --limit N).')
        return

    os.makedirs(OUT, exist_ok=True)
    targets = []
    for b in buckets:
        if not found[b] or not found[b][0]['fetchable']:
            continue
        if ONLY and b not in ONLY:
            continue
        targets.extend((b, it) for it in found[b])
    if LIMIT:
        targets = targets[:LIMIT]

    print(f'Fetching {len(targets)} public-token receipts → {os.path.normpath(OUT)}\n')
    manifest = []
    ok = err = 0
    for i, (b, it) in enumerate(targets, 1):
        name, info = fetch_one(it, b)
        if name:
            ok += 1
            manifest.append({'file': name, 'from': it['from'], 'subject': it['subject'], 'date': it['date'], 'url': it['url']})
            print(f'  [{i}/{len(targets)}] ok   {b:9} {name}  ({info})')
        else:
            err += 1
            print(f'  [{i}/{len(targets)}] FAIL {b:9} {info}  {it["url"][:80]}')
        time.sleep(0.7)  # be gentle on the receipt hosts

    # merge manifest
    mpath = os.path.join(OUT, 'manifest.json')
    existing = []
    try:
        with open(mpath, encoding='utf-8') as f:
            existing = json.load(f)
    except Exception:
        pass
    with open(mpath, 'w', encoding='utf-8') as f:
        json.dump(existing + manifest, f, ensure_ascii=False, indent=1)
    print(f'\nDone: {ok} downloaded, {err} failed. Import them from the Receipts page (📧 import), then re-scan.')


if __name__ == '__main__':
    main()
