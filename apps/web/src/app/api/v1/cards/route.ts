import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { readBody } from '@/lib/apiBody';
import { cardFieldsFromBody } from '@/lib/cardFields';
import { connectDB } from '@/lib/db';
import { Card as CardModel } from '@/models/Card';
import { currentModel } from '@/lib/tenancy/connection';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

/** GET /api/v1/cards → all payment cards (active first, then by name). */
export async function GET(req: NextRequest) {
  return withAuth(req, async () => {
    await connectDB();
    const Card = await currentModel(CardModel);
    const docs = (await Card.find().sort({ active: -1, name: 1 }).lean()) as CardLean[];
    return NextResponse.json({ cards: docs.map(trim) });
  });
}

/** POST /api/v1/cards  { name, last4?, bank?, kind?, type?, color?, creditLimit?, notes? } */
export async function POST(req: NextRequest) {
  return withAuth(req, async () => {
    const b = await readBody(req);
    const set = cardFieldsFromBody(b, false);
    if (!set) return apiError('name required');
    await connectDB();
    const Card = await currentModel(CardModel);
    const doc = await Card.create({ ...set, active: true });
    return NextResponse.json({ card: trim(doc.toObject() as CardLean) }, { status: 201 });
  });
}
