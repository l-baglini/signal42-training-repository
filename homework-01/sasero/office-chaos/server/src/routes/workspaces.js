import { Router } from 'express';
import crypto from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../lib/auth.js';
import { compileMap, DEFAULT_LAYOUT, validateLayout } from '../game/map.js';
import { C } from '../game/constants.js';
import { buildLeaderboard } from '../game/scoring.js';
import { kickFromRoom } from '../game/rooms.js';

const router = Router();
router.use(authRequired);

const INVITE_TTL_MS = 48 * 60 * 60 * 1000; // FR-1.3: link expires after 48 h

async function requireMembership(req, res, next) {
  const membership = await prisma.membership.findUnique({
    where: { userId_workspaceId: { userId: req.userId, workspaceId: req.params.id } },
  });
  if (!membership) return res.status(403).json({ error: 'Not a member of this workspace' });
  req.membership = membership;
  next();
}

async function nextFreeDesk(workspaceId) {
  const taken = new Set(
    (await prisma.membership.findMany({ where: { workspaceId }, select: { deskIndex: true } })).map((m) => m.deskIndex)
  );
  for (let i = 0; i < C.MAX_PLAYERS_PER_ROOM; i++) if (!taken.has(i)) return i;
  return null;
}

// Create a workspace (FR-1.2); creator becomes admin at desk 0
router.post('/workspaces', async (req, res) => {
  const name = (req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Workspace name required' });
  const workspace = await prisma.workspace.create({
    data: {
      name: name.slice(0, 40),
      memberships: { create: { userId: req.userId, role: 'admin', deskIndex: 0 } },
    },
  });
  res.status(201).json({ workspace: { id: workspace.id, name: workspace.name } });
});

router.get('/workspaces/:id', requireMembership, async (req, res) => {
  const workspace = await prisma.workspace.findUnique({
    where: { id: req.params.id },
    include: {
      memberships: {
        include: { user: { select: { id: true, displayName: true, jobTitle: true, avatar: true } } },
        orderBy: { deskIndex: 'asc' },
      },
    },
  });
  if (!workspace) return res.status(404).json({ error: 'Workspace not found' });
  res.json({
    workspace: { id: workspace.id, name: workspace.name, hasLayout: !!workspace.layout },
    you: { role: req.membership.role, deskIndex: req.membership.deskIndex },
    members: workspace.memberships.map((m) => ({
      userId: m.user.id,
      displayName: m.user.displayName,
      jobTitle: m.user.jobTitle,
      avatar: m.user.avatar,
      deskIndex: m.deskIndex,
      role: m.role,
    })),
  });
});

// The office for the renderer — the workspace's custom layout (or the default)
router.get('/workspaces/:id/map', requireMembership, async (req, res) => {
  const ws = await prisma.workspace.findUnique({ where: { id: req.params.id }, select: { layout: true } });
  const compiled = compileMap(ws?.layout || DEFAULT_LAYOUT);
  res.json({ map: compiled.clientMap() });
});

// Save the office layout built in the 3D editor. Creation-time only: allowed for
// the admin while no layout exists yet; locked once set.
router.put('/workspaces/:id/layout', requireMembership, async (req, res) => {
  if (req.membership.role !== 'admin') return res.status(403).json({ error: 'Only the workspace admin can build the office' });
  const ws = await prisma.workspace.findUnique({ where: { id: req.params.id }, select: { layout: true } });
  if (ws?.layout) return res.status(409).json({ error: 'The office has already been built and is locked' });

  const layout = req.body?.layout;
  const result = validateLayout(layout);
  if (result.error) return res.status(400).json({ error: result.error });

  const clean = {
    width: layout.width,
    height: layout.height,
    tiles: layout.tiles,
    objects: layout.objects.map((o) => ({ type: o.type, x: o.x, y: o.y, rot: ((o.rot % 4) + 4) % 4 || 0 })),
  };
  await prisma.workspace.update({ where: { id: req.params.id }, data: { layout: clean } });
  res.json({ ok: true, deskCount: result.deskCount });
});

// The default office layout, as a starting point in the editor
router.get('/default-layout', (req, res) => {
  res.json({ layout: DEFAULT_LAYOUT });
});

// Shareable invite link (FR-1.3)
router.post('/workspaces/:id/invites', requireMembership, async (req, res) => {
  const invite = await prisma.invite.create({
    data: {
      token: crypto.randomBytes(16).toString('hex'),
      workspaceId: req.params.id,
      createdById: req.userId,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    },
  });
  res.status(201).json({ token: invite.token, expiresAt: invite.expiresAt });
});

router.post('/invites/:token/accept', async (req, res) => {
  const invite = await prisma.invite.findUnique({
    where: { token: req.params.token },
    include: { workspace: { select: { id: true, name: true } } },
  });
  if (!invite) return res.status(404).json({ error: 'Invite not found' });
  if (invite.expiresAt < new Date()) return res.status(410).json({ error: 'Invite link has expired' });

  const existing = await prisma.membership.findUnique({
    where: { userId_workspaceId: { userId: req.userId, workspaceId: invite.workspaceId } },
  });
  if (existing) return res.json({ workspace: invite.workspace, alreadyMember: true });

  const deskIndex = await nextFreeDesk(invite.workspaceId);
  if (deskIndex === null) return res.status(409).json({ error: 'Workspace is full (20 players max)' });

  await prisma.membership.create({
    data: { userId: req.userId, workspaceId: invite.workspaceId, deskIndex },
  });
  res.status(201).json({ workspace: invite.workspace, alreadyMember: false });
});

// Admin can remove users (FR-1.5)
router.delete('/workspaces/:id/members/:userId', requireMembership, async (req, res) => {
  if (req.membership.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  if (req.params.userId === req.userId) return res.status(400).json({ error: 'Cannot remove yourself' });
  const target = await prisma.membership.findUnique({
    where: { userId_workspaceId: { userId: req.params.userId, workspaceId: req.params.id } },
  });
  if (!target) return res.status(404).json({ error: 'Member not found' });
  await prisma.membership.delete({ where: { id: target.id } });
  kickFromRoom(req.params.id, req.params.userId);
  res.json({ ok: true });
});

// Dual weekly boards (FR-7.1..7.6)
router.get('/workspaces/:id/leaderboard', requireMembership, async (req, res) => {
  res.json(await buildLeaderboard(req.params.id));
});

// All-time Hall of Shame (FR-7.7)
router.get('/workspaces/:id/hall-of-shame', requireMembership, async (req, res) => {
  const snapshots = await prisma.leaderboardSnapshot.findMany({
    where: { workspaceId: req.params.id },
    orderBy: { weekStart: 'desc' },
    take: 12,
  });
  res.json({ snapshots: snapshots.map((s) => ({ weekStart: s.weekStart, data: s.data })) });
});

// Victim notifications shown on next login (FR-5.4)
router.get('/workspaces/:id/notifications', requireMembership, async (req, res) => {
  const notifications = await prisma.notification.findMany({
    where: { userId: req.userId, workspaceId: req.params.id, read: false },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ notifications });
});

router.post('/workspaces/:id/notifications/read', requireMembership, async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  await prisma.notification.updateMany({
    where: { id: { in: ids }, userId: req.userId },
    data: { read: true },
  });
  res.json({ ok: true });
});

export default router;
