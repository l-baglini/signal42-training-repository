import { NextResponse } from 'next/server';
import { getContainer } from '@/lib/server-container';
import { assertPlatform } from '@core/config/env.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json()) as {
    owner?: string;
    name?: string;
    platform?: string;
    scheduleCron?: string | null;
    enabled?: boolean;
  };

  const { container } = await getContainer();
  const repo = await container.watchedRepoRepo.update(Number(id), {
    owner: body.owner,
    name: body.name,
    platform: body.platform ? assertPlatform(body.platform) : undefined,
    scheduleCron: body.scheduleCron,
    enabled: body.enabled,
  });
  return NextResponse.json(repo);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { container } = await getContainer();
  await container.watchedRepoRepo.remove(Number(id));
  return NextResponse.json({ ok: true });
}
