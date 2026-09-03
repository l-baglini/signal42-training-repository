import { NextResponse } from 'next/server';
import { getContainer } from '@/lib/server-container';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const { container } = await getContainer();
  const prompts = await container.promptRepo.list();
  return NextResponse.json(prompts);
}

export async function POST(req: Request) {
  const body = (await req.json()) as { name?: string; content?: string };
  if (!body.name || !body.content) {
    return NextResponse.json(
      { error: 'name and content are required' },
      { status: 400 },
    );
  }
  const { container } = await getContainer();
  const prompt = await container.promptRepo.create({
    name: body.name,
    content: body.content,
  });
  return NextResponse.json(prompt, { status: 201 });
}
