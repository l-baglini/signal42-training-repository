import { NextResponse } from 'next/server';
import { getContainer } from '@/lib/server-container';
import { assertPlatform } from '@core/config/env.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const { container } = await getContainer();
  const repos = await container.watchedRepoRepo.list();
  return NextResponse.json(repos);
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    owner?: string;
    name?: string;
    platform?: string;
    scheduleCron?: string | null;
    enabled?: boolean;
  };

  if (!body.owner || !body.name) {
    return NextResponse.json(
      { error: 'owner and name are required' },
      { status: 400 },
    );
  }

  const { container } = await getContainer();
  const repo = await container.watchedRepoRepo.create({
    owner: body.owner,
    name: body.name,
    platform: assertPlatform(body.platform ?? 'github'),
    scheduleCron: body.scheduleCron ?? null,
    enabled: body.enabled ?? true,
  });
  return NextResponse.json(repo, { status: 201 });
}
