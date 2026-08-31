/**
 * prisma-prompt.repository.ts
 * ---------------------------
 * Prisma-backed PromptRepository. Exactly one prompt is active at a time:
 * activating one deactivates the others within a transaction.
 */

import type { PrismaClient } from '@prisma/client';
import type { PromptRepository } from '../../../domain/repositories/prompt-repository.ts';
import type { Prompt, NewPrompt } from '../../../domain/entities/prompt.ts';

export class PrismaPromptRepository implements PromptRepository {
  constructor(private readonly db: PrismaClient) {}

  async list(): Promise<Prompt[]> {
    return this.db.prompt.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async getActive(): Promise<Prompt | null> {
    return this.db.prompt.findFirst({ where: { isActive: true } });
  }

  async create(prompt: NewPrompt): Promise<Prompt> {
    return this.db.prompt.create({
      data: { name: prompt.name, content: prompt.content },
    });
  }

  async update(id: number, patch: Partial<NewPrompt>): Promise<Prompt> {
    return this.db.prompt.update({
      where: { id },
      data: { name: patch.name, content: patch.content },
    });
  }

  async activate(id: number): Promise<void> {
    await this.db.$transaction([
      this.db.prompt.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      }),
      this.db.prompt.update({ where: { id }, data: { isActive: true } }),
    ]);
  }

  async remove(id: number): Promise<void> {
    await this.db.prompt.delete({ where: { id } });
  }
}
