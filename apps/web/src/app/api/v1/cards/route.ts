import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { connectDB } from '@/lib/db';
import { Card } from '@/models/Card';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KINDS = ['credit', 'debit'];
const TYPES = ['mastercard', 'visa', 'amex', 'maestro', 'other'];

type CardLean = {
  _id: unknown; name: string; last4?: string; bank?: string; kind?: string; type?: string;
  color?: string; creditLimit?: number; notes?: string; active?: boolean;
};

function trim(c: CardLean) {
  return {
    id: String(c._id),
    name: c.name,
    last4: c.last4 ?? '',
    bank: c.bank ?? '',
    kind: c.kind ?? 'credit',
    type: c.type ?? 'other',
    color: c.color ?? '#00d4ff',
    creditLimit: c.creditLimit ?? 0,
    notes: c.notes ?? '',
    active: c.active !== false,
  };
}

/** Build a validated card document from a JSON body (shared by POST + PATCH). */
function fromBody(b: Record<string, unknown>, partial: boolean) {
  const set: Record<string, unknown> = {};
  if (typeof b.name === 'string' && b.name.trim()) set.name = b.name.trim();
  else if (!partial) return null; // name required on create
  if (typeof b.last4 === 'string') set.last4 = b.last4.replace(/\D/g, '').slice(0, 4);
  if (typeof b.bank === 'string') set.bank = b.bank.trim();
  if (typeof b.kind === 'string' && KINDS.includes(b.kind)) set.kind = b.kind;
  if (typeof b.type === 'string' && TYPES.includes(b.type)) set.type = b.type;
  if (typeof b.color === 'string' && b.color.trim()) set.color = b.color.trim();
  if (b.creditLimit != null && Number.isFinite(Number(b.creditLimit))) set.creditLimit = Math.max(0, Number(b.creditLimit));
  if (typeof b.notes === 'string') set.notes = b.notes.trim();
  if (typeof b.active === 'boolean') set.active = b.active;
  return set;
}

/** GET /api/v1/cards → all payment cards (active first, then by name). */
export async function GET(req: NextRequest) {
  return withAuth(req, async () => {
    await connectDB();
    const docs = (await Card.find().sort({ active: -1, name: 1 }).lean()) as CardLean[];
    return NextResponse.json({ cards: docs.map(trim) });
  });
}

/** POST /api/v1/cards  { name, last4?, bank?, kind?, type?, color?, creditLimit?, notes? } */
export async function POST(req: NextRequest) {
  return withAuth(req, async () => {
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const set = fromBody(b, false);
    if (!set) return apiError('name required');
    await connectDB();
    const doc = await Card.create({ ...set, active: true });
    return NextResponse.json({ card: trim(doc.toObject() as CardLean) }, { status: 201 });
  });
}
