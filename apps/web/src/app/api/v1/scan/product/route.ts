import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { scanProductPhoto } from '@/app/shopping-list/actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/v1/scan/product  (multipart form, field "file" = product image)
 *  → { data: { name, brand, category, quantity, notes } }  (no save — the app verifies). */
export async function POST(req: NextRequest) {
  return withAuth(req, async () => {
    const form = await req.formData();
    const r = await scanProductPhoto(form);
    if (!r.ok) return apiError(r.error || 'Bad request');
    return NextResponse.json({ data: r.data });
  });
}
