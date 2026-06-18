import { NextResponse } from 'next/server';
import { getContainer } from '@/lib/server-container';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Storytelling generation can take a while; allow a generous budget.
export const maxDuration = 300;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { container, settings } = await getContainer();

  if (!settings.githubToken) {
    return NextResponse.json(
      { error: 'GitHub token not configured. Set it in Setup first.' },
      { status: 400 },
    );
  }

  const repo = await container.watchedRepoRepo.findById(Number(id));
  if (!repo) {
    return NextResponse.json({ error: 'Repo not found' }, { status: 404 });
  }

  try {
    const result = await container.runRepoWatch.execute(
      repo.owner,
      repo.name,
      repo.platform,
    );
    return NextResponse.json({
      reportId: result.report.id,
      eventsFetched: result.eventsFetched,
      eventsProcessed: result.story.eventsProcessed,
      costUsd: result.story.costUsd,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
