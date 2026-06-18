import { NextResponse } from 'next/server';
import { getContainer } from '@/lib/server-container';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const { container, settings } = await getContainer();
  const summary = await container.getUsageSummary.execute(
    settings.monthlyBudgetUsd,
  );
  return NextResponse.json(summary);
}
