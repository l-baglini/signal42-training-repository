import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { signToken, sanitizeUser, authRequired } from '../lib/auth.js';

const router = Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/register', async (req, res) => {
  const { email, password, displayName, jobTitle } = req.body || {};
  if (!EMAIL_RE.test(email || '')) return res.status(400).json({ error: 'Valid email required' });
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  if (!displayName || !displayName.trim()) return res.status(400).json({ error: 'Display name required' });

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      passwordHash,
      displayName: displayName.trim().slice(0, 30),
      jobTitle: jobTitle?.trim().slice(0, 40) || null,
    },
  });
  res.status(201).json({ token: signToken(user), user: sanitizeUser(user) });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  const user = await prisma.user.findUnique({ where: { email: (email || '').toLowerCase() } });
  if (!user || !(await bcrypt.compare(password || '', user.passwordHash))) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  res.json({ token: signToken(user), user: sanitizeUser(user) });
});

router.get('/me', authRequired, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    include: { memberships: { include: { workspace: { select: { id: true, name: true } } } } },
  });
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({
    user: sanitizeUser(user),
    memberships: user.memberships.map((m) => ({
      workspaceId: m.workspaceId,
      workspaceName: m.workspace.name,
      role: m.role,
      deskIndex: m.deskIndex,
    })),
  });
});

router.put('/me/avatar', authRequired, async (req, res) => {
  const { avatar, displayName, jobTitle } = req.body || {};
  if (!avatar || typeof avatar !== 'object') return res.status(400).json({ error: 'Avatar config required' });
  const { skin, hair, hairColor, outfit } = avatar;
  if ([skin, hair, hairColor, outfit].some((v) => typeof v !== 'number' || v < 0)) {
    return res.status(400).json({ error: 'Invalid avatar config' });
  }
  const data = { avatar: { skin, hair, hairColor, outfit } };
  if (displayName?.trim()) data.displayName = displayName.trim().slice(0, 30);
  if (jobTitle !== undefined) data.jobTitle = jobTitle?.trim().slice(0, 40) || null;
  const user = await prisma.user.update({ where: { id: req.userId }, data });
  res.json({ user: sanitizeUser(user) });
});

export default router;
