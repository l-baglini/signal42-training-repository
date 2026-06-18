import cron from 'node-cron';
import { prisma } from '../lib/prisma.js';
import { weekStartUTC, buildLeaderboard } from '../game/scoring.js';
import { broadcastAll } from '../game/rooms.js';

// FR-7.1: leaderboard resets every Monday 00:00 UTC. Scores are keyed by
// weekStart, so the "reset" is implicit — this job snapshots the finished
// week into the all-time Hall of Shame (FR-7.7).
export async function snapshotLastWeek() {
  const lastWeek = weekStartUTC(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
  const workspaceIds = await prisma.weeklyScore.findMany({
    where: { weekStart: lastWeek },
    select: { workspaceId: true },
    distinct: ['workspaceId'],
  });

  for (const { workspaceId } of workspaceIds) {
    const board = await buildLeaderboard(workspaceId, lastWeek);
    const data = {
      destructionTop3: board.destruction.slice(0, 3),
      pvpTop3: board.pvp.slice(0, 3),
    };
    await prisma.leaderboardSnapshot.upsert({
      where: { workspaceId_weekStart: { workspaceId, weekStart: lastWeek } },
      create: { workspaceId, weekStart: lastWeek, data },
      update: { data },
    });
  }
  broadcastAll('leaderboard:dirty', {});
  console.log(`Weekly snapshot done for ${workspaceIds.length} workspace(s)`);
}

export function startWeeklyResetJob() {
  cron.schedule('0 0 * * 1', snapshotLastWeek, { timezone: 'UTC' });
  // Catch up on boot in case the server was down at the Monday tick
  snapshotLastWeek().catch((err) => console.error('snapshot catch-up failed', err));
}
