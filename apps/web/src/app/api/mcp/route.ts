import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { User as UserModel } from '@/models/User';
import { TOOLS, execute, toolWrites } from '@/app/aiTools';
import { apiTenant } from '@/lib/apiAuth';
import { canWrite, parseRole, READ_ONLY_MESSAGE, type Role } from '@/lib/roles';
import { currentModel } from '@/lib/tenancy/connection';
import { withTenant } from '@/lib/tenancy/current';

// Remote MCP server (Streamable-HTTP, JSON-RPC 2.0) so an external Claude (mobile
// app / Claude Code / MCP Inspector) can drive Pharos. Tools-only, so plain JSON
// responses (no SSE) are enough. Bearer-token auth (per-user `apiToken`); this route
// is exempt from the cookie middleware (see middleware.ts) and does its own check.
//
// TENANCY: this is the app's SECOND bearer-token door, and it had its own copy of the auth
// lookup — so when `/api/v1` was taught to resolve the workspace from the host before looking a
// token up, this one was left checking the DEFAULT (registry) `users` collection and then running
// the tools against that same default database. In SaaS mode that means a token is neither found
// in nor confined to the workspace whose subdomain was called. It now uses the SAME resolver as
// `/api/v1` (`apiTenant`), and the ordering matters for the same reason it does there: the tenant
// decides which database holds `users`, so it must be established BEFORE the token lookup.
// SAAS_MODE off → DEFAULT_TENANT with no extra work, i.e. self-hosted is unchanged.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SERVER_INFO = { name: 'pharos', version: '1.0.0' };
const PROTOCOL_VERSION = '2025-06-18';

/** Runs inside the ambient tenant established by `POST`, so the token is looked up in THAT
 *  workspace's `users` collection. A token minted in workspace A does not exist in B's database.
 *
 *  Returns the token's ROLE, not just yes/no: this door has to decide P31 read-only access by
 *  itself. `assertCanWrite()`, which guards every server action the tools call, resolves the
 *  session from COOKIES and passes silently when there is none — on purpose, so background jobs
 *  and cron can write — and an MCP request carries a bearer token and no cookie. So every write
 *  guard downstream saw "no session" and waved the call through, and a read-only account's token
 *  could add, edit and delete records (#192). The role the token belongs to is the only thing
 *  that can answer that here, so it is read together with the token. */
async function authed(req: NextRequest): Promise<Role | null> {
  const m = (req.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i);
  const token = m?.[1]?.trim();
  if (!token) return null;
  await connectDB();
  const User = await currentModel(UserModel);
  const u = (await User.findOne({ apiToken: token }).select('role').lean()) as { role?: string } | null;
  if (!u) return null;
  // An unknown/missing stored role reads as `viewer`, the least privileged — same rule as
  // `verifySession`: a value we cannot interpret may only ever lose privileges.
  return parseRole(u.role) ?? 'viewer';
}

function rpc(id: unknown, result: unknown) {
  return NextResponse.json({ jsonrpc: '2.0', id, result });
}
function rpcError(id: unknown, code: number, message: string, status = 200) {
  return NextResponse.json({ jsonrpc: '2.0', id, error: { code, message } }, { status });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const tenant = await apiTenant();
  if ('error' in tenant) {
    // The body has not been parsed yet, so there is no JSON-RPC id to echo: answer with the same
    // shape an auth failure uses (id null + the transport error code) and the HTTP status the
    // resolver chose — 404 for a host that names no workspace, 403 for one that is not usable.
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, error: { code: -32001, message: tenant.error } },
      { status: tenant.status },
    );
  }
  return withTenant(tenant, () => handle(req));
}

async function handle(req: NextRequest): Promise<NextResponse> {
  const role = await authed(req);
  if (!role) {
    return NextResponse.json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Unauthorized' } }, { status: 401 });
  }

  let body: { id?: unknown; method?: string; params?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return rpcError(null, -32700, 'Parse error', 400);
  }
  const { id = null, method, params } = body;

  switch (method) {
    case 'initialize':
      return rpc(id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: SERVER_INFO });
    case 'notifications/initialized':
    case 'initialized':
      return new NextResponse(null, { status: 202 }); // notification, no result
    case 'ping':
      return rpc(id, {});
    case 'tools/list':
      return rpc(id, {
        tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.input_schema })),
      });
    case 'tools/call': {
      const name = typeof params?.name === 'string' ? params.name : '';
      const args = (params?.arguments && typeof params.arguments === 'object' ? params.arguments : {}) as Record<string, unknown>;
      if (!TOOLS.some((t) => t.name === name)) return rpcError(id, -32602, `Unknown tool: ${name}`);
      // P31: a read-only token may query, never change. Refused HERE rather than inside the
      // tools, because the cookie-based guard they use cannot see a bearer caller at all.
      if (toolWrites(name) && !canWrite(role)) return rpcError(id, -32001, READ_ONLY_MESSAGE);
      const r = await execute(name, args);
      return rpc(id, { content: [{ type: 'text', text: `${r.summary ? r.summary + ' — ' : ''}${r.content}` }] });
    }
    default:
      return rpcError(id, -32601, `Method not found: ${method ?? '(none)'}`);
  }
}

// Some clients probe with GET — return a liveness/info blob.
export async function GET() {
  return NextResponse.json({ name: SERVER_INFO.name, transport: 'streamable-http', note: 'POST JSON-RPC 2.0 with Authorization: Bearer <token>' });
}
