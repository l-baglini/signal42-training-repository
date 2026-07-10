import { prisma } from '../lib/prisma.js';
import { weekStartUTC } from '../lib/week.js';

export { weekStartUTC };

const COUNTER_FIELDS = [
  'destructionScore', 'destructions', 'fires', 'combos',
  'rageActivations', 'kos', 'timesKnockedOut',
];

// Persist score deltas after each significant event (architecture §6.1).
// `fields` may include any counter plus `bestKoStreak` (kept as a max).
export async function addScore(workspaceId, userId, fields) {
  const weekStart = weekStartUTC();
  const increments = {};
  for (const f of COUNTER_FIELDS) {
    if (fields[f]) increments[f] = { increment: fields[f] };
  }

  const row = await prisma.weeklyScore.upsert({
    where: { userId_workspaceId_weekStart: { userId, workspaceId, weekStart } },
    create: {
      userId, workspaceId, weekStart,
      ...Object.fromEntries(Object.entries(fields).filter(([k]) => COUNTER_FIELDS.includes(k) || k === 'bestKoStreak')),
    },
    update: increments,
  });

  if (fields.bestKoStreak && fields.bestKoStreak > row.bestKoStreak) {
    await prisma.weeklyScore.update({ where: { id: row.id }, data: { bestKoStreak: fields.bestKoStreak } });
  }
  if (fields.destructionScore) {
    await prisma.user.update({ where: { id: userId }, data: { xp: { increment: fields.destructionScore } } });
  }
}

export const DESTRUCTION_TITLES = ['Destroyer of Desks', 'Master of Mayhem', 'Fire Starter']; // FR-7.5
export const PVP_TITLES = ['Office Brawler', 'Slap Champion', 'The Untouchable']; // FR-7.6

export async function buildLeaderboard(workspaceId, weekStart = weekStartUTC()) {
  const scores = await prisma.weeklyScore.findMany({
    where: { workspaceId, weekStart },
    include: { user: { select: { id: true, displayName: true, avatar: true } } },
  });

  const entry = (s) => ({
    userId: s.userId,
    displayName: s.user.displayName,
    avatar: s.user.avatar,
    destructionScore: s.destructionScore,
    destructions: s.destructions,
    fires: s.fires,
    combos: s.combos,
    rageActivations: s.rageActivations,
    kos: s.kos,
    bestKoStreak: s.bestKoStreak,
    timesKnockedOut: s.timesKnockedOut,
  });

  const destruction = scores
    .filter((s) => s.destructionScore > 0)
    .sort((a, b) => b.destructionScore - a.destructionScore || b.combos - a.combos)
    .map(entry)
    .map((e, i) => ({ ...e, rank: i + 1, title: DESTRUCTION_TITLES[i] || null }));

  const pvp = scores
    .filter((s) => s.kos > 0 || s.timesKnockedOut > 0)
    .sort((a, b) => b.kos - a.kos || b.bestKoStreak - a.bestKoStreak || a.timesKnockedOut - b.timesKnockedOut)
    .map(entry)
    .map((e, i) => ({ ...e, rank: i + 1, title: e.kos > 0 ? PVP_TITLES[i] || null : null }));

  return { weekStart: weekStart.toISOString(), destruction, pvp };
}
