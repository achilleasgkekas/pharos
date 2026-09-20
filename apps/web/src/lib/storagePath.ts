// Render a remote file path from user-configurable templates (Settings → Storage).
// Pure + dependency-free so it can be unit-reasoned and previewed live in the UI.

export type StorageTokens = {
  kind: string; // 'receipts' | 'statements' | 'equipment'
  store?: string;
  date?: string; // YYYY-MM-DD (falls back to today-less '' parts if absent)
  total?: number;
  id?: string;
  original?: string; // original filename without extension
  ext: string; // e.g. 'pdf' (with or without leading dot)
};

export const DEFAULT_FOLDER_TEMPLATE = '{kind}/{year}/{month}';
export const DEFAULT_NAME_TEMPLATE = '{date}_{store}_{id}';

export const TEMPLATE_TOKENS: { token: string; desc: string }[] = [
  { token: '{kind}', desc: 'receipts / statements / equipment' },
  { token: '{store}', desc: 'merchant name (sanitized)' },
  { token: '{date}', desc: 'YYYY-MM-DD' },
  { token: '{year}', desc: 'YYYY' },
  { token: '{month}', desc: 'MM' },
  { token: '{day}', desc: 'DD' },
  { token: '{total}', desc: 'amount, e.g. 129.98' },
  { token: '{id}', desc: 'short record id (keeps names unique)' },
  { token: '{original}', desc: 'original filename' },
];

/** Make a single path segment filesystem/SMB/FTP-safe (keeps unicode letters). */
function sanitizeSegment(s: string): string {
  return (s || '')
    .replace(/[\\/:*?"<>|\x00-\x1f]+/g, ' ') // illegal path chars + control
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s/g, '_')
    .replace(/^\.+/, '') // no leading dots (hidden / traversal)
    .slice(0, 80);
}

function parts(date?: string): { year: string; month: string; day: string; date: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date || '');
  if (m) return { year: m[1], month: m[2], day: m[3], date: `${m[1]}-${m[2]}-${m[3]}` };
  return { year: '', month: '', day: '', date: date || '' };
}

function tokenValue(name: string, t: StorageTokens): string {
  const p = parts(t.date);
  switch (name) {
    case 'kind':
      return sanitizeSegment(t.kind || 'files');
    case 'store':
      return sanitizeSegment(t.store || 'unknown');
    case 'date':
      return sanitizeSegment(p.date);
    case 'year':
      return p.year;
    case 'month':
      return p.month;
    case 'day':
      return p.day;
    case 'total':
      return t.total != null && t.total > 0 ? String(t.total.toFixed(2)) : '';
    case 'id':
      return sanitizeSegment(t.id || '');
    case 'original':
      return sanitizeSegment(t.original || '');
    default:
      return '';
  }
}

function fill(template: string, t: StorageTokens): string {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => tokenValue(name, t));
}

/**
 * Build a remote-relative path like "receipts/2026/06/2026-06-04_Skroutz_a1b2.pdf".
 * Folder template '/' chars act as directory separators; token values are sanitized
 * so they can never inject extra path segments. The name is always a single segment.
 *
 * The LITERAL text of the template was never sanitized, only the values substituted into it, so a
 * folder template of `../../elsewhere` produced a path that climbed out of the configured remote
 * folder (#196). Nobody else can set that template — it is an admin editing their own storage
 * settings, pointed at their own NAS — so this guards against a typo and a slash in the wrong
 * place, not against an attacker. But a path that leaves the folder the user chose is wrong
 * whoever typed it, and the remote backends (SMB/FTP/OneDrive) have no equivalent of the local
 * `resolveWithinStorage` check to catch it.
 */
export function renderStoragePath(folderTemplate: string, nameTemplate: string, t: StorageTokens): string {
  const folder = fill(folderTemplate || DEFAULT_FOLDER_TEMPLATE, t)
    .split('/')
    .map((seg) => seg.trim())
    // Drop `.` and `..` outright rather than rewriting them: there is no sensible path a person
    // meant by "the parent of my receipts folder", and silently relocating their files somewhere
    // else on the share is worse than ignoring the segment.
    .filter((seg) => seg && seg !== '.' && seg !== '..')
    .join('/');

  let name = fill(nameTemplate || DEFAULT_NAME_TEMPLATE, t).replace(/\//g, '_');
  // Collapse separators left by empty tokens (e.g. missing store/total) and trim edges.
  name = name.replace(/[_\-.]{2,}/g, (mm) => mm[0]).replace(/^[_\-.]+|[_\-.]+$/g, '');
  if (!name) name = sanitizeSegment(t.id || t.original || 'file') || 'file';

  const ext = (t.ext || '').replace(/^\.+/, '').toLowerCase();
  const file = ext ? `${name}.${ext}` : name;
  return folder ? `${folder}/${file}` : file;
}
