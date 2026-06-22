import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { TOOLS, execute } from '@/app/aiTools';

// Remote MCP server (Streamable-HTTP, JSON-RPC 2.0) so an external Claude (mobile
// app / Claude Code / MCP Inspector) can drive Pharos. Tools-only, so plain JSON
// responses (no SSE) are enough. Bearer-token auth (per-user `apiToken`); this route
// is exempt from the cookie middleware (see middleware.ts) and does its own check.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SERVER_INFO = { name: 'pharos', version: '1.0.0' };
const PROTOCOL_VERSION = '2025-06-18';

async function authed(req: NextRequest): Promise<boolean> {
  const m = (req.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i);
  const token = m?.[1]?.trim();
  if (!token) return false;
  await connectDB();
  const u = await User.findOne({ apiToken: token }).select('_id').lean();
  return !!u;
}

function rpc(id: unknown, result: unknown) {
  return NextResponse.json({ jsonrpc: '2.0', id, result });
}
function rpcError(id: unknown, code: number, message: string, status = 200) {
  return NextResponse.json({ jsonrpc: '2.0', id, error: { code, message } }, { status });
}

export async function POST(req: NextRequest) {
  if (!(await authed(req))) {
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
