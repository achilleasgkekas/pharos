/**
 * P72 — shipment / delivery tracking for items sitting in `ordered`.
 *
 * Scope on purpose: this is a QUICK LINK builder, not a carrier integration. There is no
 * polling, no API key, no per-courier account — the user keeps the tracking number on the
 * item and one click opens the courier's own page with it. Live carrier APIs would mean an
 * integration (and usually a contract) per courier, which is out of scope here.
 *
 * `carrier` is a FREE STRING, matching the relaxed-enum idiom used elsewhere in Items
 * (categories, statuses from Settings → Lists): the chips below are only the common ones,
 * and anything else the user types still saves and still shows.
 *
 * The URL templates are best-effort public patterns. Couriers change them without warning,
 * which is exactly why `Item.trackingUrl` exists as an explicit override: a hand-pasted URL
 * always wins over whatever we would have guessed.
 */

/** Suggested chips in the form. Not a whitelist — any other carrier name saves fine. */
export const COMMON_CARRIERS = [
  'ACS',
  'ELTA',
  'Speedex',
  'Geniki Taxydromiki',
  'BoxNow',
  'DHL',
  'UPS',
  'FedEx',
  'DPD',
] as const;

/** Matched loosely (lowercased, non-letters stripped) so "ACS Courier" hits "acs". */
const URL_TEMPLATES: { match: string; url: (n: string) => string }[] = [
  { match: 'acs', url: (n) => `https://www.acscourier.net/el/track-and-trace/?tracking_number=${n}` },
  { match: 'elta', url: (n) => `https://itemsearch.elta.gr/Query/Direct/${n}` },
  { match: 'speedex', url: (n) => `https://speedex.gr/isapp/Tracking.aspx?voucher=${n}` },
  { match: 'genikitaxydromiki', url: (n) => `https://www.taxydromiki.com/track/${n}` },
  { match: 'taxydromiki', url: (n) => `https://www.taxydromiki.com/track/${n}` },
  { match: 'boxnow', url: (n) => `https://boxnow.gr/track?parcelId=${n}` },
  { match: 'dhl', url: (n) => `https://www.dhl.com/en/express/tracking.html?AWB=${n}` },
  { match: 'ups', url: (n) => `https://www.ups.com/track?tracknum=${n}` },
  { match: 'fedex', url: (n) => `https://www.fedex.com/fedextrack/?trknbr=${n}` },
  { match: 'dpd', url: (n) => `https://tracking.dpd.de/status/en_US/parcel/${n}` },
];

function normalizeCarrier(carrier: string): string {
  return (carrier || '').toLowerCase().replace(/[^a-z]/g, '');
}

/** True when we know a link pattern for this carrier name (used to hint in the form). */
export function hasKnownCarrier(carrier: string): boolean {
  const key = normalizeCarrier(carrier);
  return key.length > 0 && URL_TEMPLATES.some((t) => key.includes(t.match));
}

export type TrackingInput = {
  carrier?: string | null;
  trackingNumber?: string | null;
  /** Manual override; whatever the user pasted always wins over a guessed template. */
  trackingUrl?: string | null;
};

/**
 * The URL the "Track package" button should open, or null when there is nothing safe to
 * open. Null (rather than a search-engine fallback) is deliberate: a wrong link is worse
 * than no link, and the number itself is still shown for copy/paste.
 *
 * Only http(s) overrides are honoured, so a stored `javascript:` or `data:` string can
 * never end up in an href.
 */
export function resolveTrackingUrl(input: TrackingInput): string | null {
  const override = (input.trackingUrl || '').trim();
  if (override) return /^https?:\/\//i.test(override) ? override : null;

  const number = (input.trackingNumber || '').trim();
  if (!number) return null;
  const key = normalizeCarrier(input.carrier || '');
  if (!key) return null;
  const hit = URL_TEMPLATES.find((t) => key.includes(t.match));
  return hit ? hit.url(encodeURIComponent(number)) : null;
}
