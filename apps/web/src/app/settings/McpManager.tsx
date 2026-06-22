'use client';
import { useEffect, useState } from 'react';
import { Copy, Check, Loader2, KeyRound, RefreshCw, Trash2 } from 'lucide-react';
import { getMcpStatus, generateApiToken, revokeApiToken } from './mcpActions';

const codeCls = 'flex-1 min-w-0 text-xs bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg px-3 py-2 truncate';
const iconBtn = 'shrink-0 p-2 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] hover:border-[color:var(--color-accent)] transition-colors';
const labelCls = 'block text-[10px] uppercase tracking-wider text-[color:var(--color-text-faint)] mb-1';

/** Settings card: a per-user bearer token + connector URL for the remote MCP server. */
export function McpManager() {
  const [hasToken, setHasToken] = useState<boolean | null>(null);
  const [token, setToken] = useState<string | null>(null); // returned once, right after generate
  const [copied, setCopied] = useState('');
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setOrigin(window.location.origin);
    getMcpStatus().then((s) => setHasToken(s.hasToken));
  }, []);

  async function gen() {
    setBusy(true);
    const r = await generateApiToken();
    setBusy(false);
    if (r.ok && r.token) {
      setToken(r.token);
      setHasToken(true);
    }
  }
  async function revoke() {
    setBusy(true);
    await revokeApiToken();
    setBusy(false);
    setToken(null);
    setHasToken(false);
  }
  function copy(text: string, which: string) {
    navigator.clipboard?.writeText(text);
    setCopied(which);
    setTimeout(() => setCopied(''), 1500);
  }

  const url = origin ? `${origin}/api/mcp` : '/api/mcp';

  return (
    <div className="space-y-4" style={{ fontFamily: 'inherit' }}>
      <p className="text-sm text-[color:var(--color-text-dim)]">
        Drive Pharos from an external Claude (mobile app, Claude Code, MCP Inspector) by adding it as a remote MCP
        server. It exposes the same commands as the in-app AI bar: add expense / income / subscription / item / task,
        log a price, search, and an overview.
      </p>

      {/* Connector URL */}
      <div>
        <span className={labelCls} style={{ fontFamily: 'var(--font-mono)' }}>Connector URL</span>
        <div className="flex items-center gap-2">
          <code className={codeCls} style={{ fontFamily: 'var(--font-mono)' }}>{url}</code>
          <button type="button" onClick={() => copy(url, 'url')} className={iconBtn} title="Copy URL">
            {copied === 'url' ? <Check size={14} className="text-[color:var(--color-accent)]" /> : <Copy size={14} />}
          </button>
        </div>
        <p className="text-[11px] text-[color:var(--color-text-faint)] mt-1">
          This is a LAN/HTTP address. To reach it from your phone it must be on <b>public HTTPS</b> — front it with a
          tunnel (Cloudflare Tunnel or Tailscale Funnel) and use that <code>https://</code> URL in Claude.
        </p>
      </div>

      {/* Token */}
      <div>
        <span className={labelCls} style={{ fontFamily: 'var(--font-mono)' }}>API token (Bearer)</span>
        {token ? (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <code className={`${codeCls} text-[color:var(--color-accent)]`} style={{ fontFamily: 'var(--font-mono)' }}>{token}</code>
              <button type="button" onClick={() => copy(token, 'tok')} className={iconBtn} title="Copy token">
                {copied === 'tok' ? <Check size={14} className="text-[color:var(--color-accent)]" /> : <Copy size={14} />}
              </button>
            </div>
            <p className="text-[11px] text-[color:var(--color-gold)]">Copy it now — it is not shown again.</p>
          </div>
        ) : (
          <p className="text-xs text-[color:var(--color-text-faint)]">
            {hasToken === null ? 'Loading…' : hasToken ? 'A token is active. Rotate it to replace it (the old one stops working), or revoke it.' : 'No token yet — generate one to enable the connector.'}
          </p>
        )}
        <div className="flex items-center gap-2 mt-2">
          <button
            type="button"
            onClick={gen}
            disabled={busy}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-accent)] text-[color:var(--color-accent)] hover:opacity-80 transition-colors disabled:opacity-50"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : hasToken ? <RefreshCw size={13} /> : <KeyRound size={13} />}
            {hasToken ? 'Rotate token' : 'Generate token'}
          </button>
          {hasToken && (
            <button
              type="button"
              onClick={revoke}
              disabled={busy}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-red)] hover:border-[color:var(--color-red)] transition-colors disabled:opacity-50"
            >
              <Trash2 size={13} /> Revoke
            </button>
          )}
        </div>
      </div>

      <p className="text-[11px] text-[color:var(--color-text-faint)]">
        In Claude → Settings → Connectors → <b>Add custom connector</b>, paste the public <code>https://…/api/mcp</code> URL
        and the token. Custom connectors need a paid Claude plan. If Claude requires OAuth for the URL, the token still
        works today with MCP Inspector / Claude Code.
      </p>
    </div>
  );
}
