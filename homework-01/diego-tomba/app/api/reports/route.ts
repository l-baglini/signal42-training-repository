import { NextResponse } from 'next/server';
import { getContainer } from '@/lib/server-container';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limitParam = searchParams.get('limit');
  const limit = limitParam ? Number(limitParam) : undefined;

  const { container } = await getContainer();
  const reports = await container.reportRepo.list(limit);
  // List view doesn't need the full markdown — keep the payload light.
  return NextResponse.json(
    reports.map((r) => ({
      id: r.id,
      repoOwner: r.repoOwner,
      repoName: r.repoName,
      eventsProcessed: r.eventsProcessed,
      costUsd: r.costUsd,
      generatedAt: r.generatedAt,
    })),
  );
}
