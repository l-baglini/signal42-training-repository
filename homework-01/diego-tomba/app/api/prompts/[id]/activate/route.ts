import { NextResponse } from 'next/server';
import { getContainer } from '@/lib/server-container';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { container } = await getContainer();
  await container.promptRepo.activate(Number(id));
  return NextResponse.json({ ok: true });
}
