import { NextResponse } from 'next/server';
import { getContainer } from '@/lib/server-container';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json()) as { name?: string; content?: string };
  const { container } = await getContainer();
  const prompt = await container.promptRepo.update(Number(id), {
    name: body.name,
    content: body.content,
  });
  return NextResponse.json(prompt);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { container } = await getContainer();
  await container.promptRepo.remove(Number(id));
  return NextResponse.json({ ok: true });
}
