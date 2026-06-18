import { NextResponse } from 'next/server';
import { getContainer } from '@/lib/server-container';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function mask(token: string): { set: boolean; last4: string } {
  return { set: token.length > 0, last4: token.slice(-4) };
}

export async function GET() {
  const { settings } = await getContainer();
  return NextResponse.json({
    githubToken: mask(settings.githubToken),
    anthropicToken: mask(settings.anthropicToken),
    monthlyBudgetUsd: settings.monthlyBudgetUsd,
  });
}

export async function PUT(req: Request) {
  const body = (await req.json()) as {
    githubToken?: string;
    anthropicToken?: string;
    monthlyBudgetUsd?: number;
  };
  const { container } = await getContainer();

  const patch: {
    githubToken?: string;
    anthropicToken?: string;
    monthlyBudgetUsd?: number;
  } = {};
  // Only overwrite a token when a non-empty value is supplied, so saving the
  // form without re-typing a secret doesn't wipe it.
  if (typeof body.githubToken === 'string' && body.githubToken.length > 0)
    patch.githubToken = body.githubToken;
  if (typeof body.anthropicToken === 'string' && body.anthropicToken.length > 0)
    patch.anthropicToken = body.anthropicToken;
  if (typeof body.monthlyBudgetUsd === 'number')
    patch.monthlyBudgetUsd = body.monthlyBudgetUsd;

  await container.settingsRepo.update(patch);
  return NextResponse.json({ ok: true });
}
