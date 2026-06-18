import { verifyToken } from '../lib/auth.js';
import { prisma } from '../lib/prisma.js';
import { C } from './constants.js';
import { getRoom, setIo } from './rooms.js';

// NFR-5: WebSocket connections authenticated at handshake
export function initSocket(io) {
  setIo(io);

  io.use((socket, next) => {
    try {
      const payload = verifyToken(socket.handshake.auth?.token || '');
      socket.data.userId = payload.sub;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    let room = null;
    let player = null;

    socket.on('join', async ({ workspaceId } = {}, ack) => {
      try {
        const membership = await prisma.membership.findUnique({
          where: { userId_workspaceId: { userId: socket.data.userId, workspaceId: String(workspaceId) } },
          include: { user: { select: { id: true, displayName: true, jobTitle: true, avatar: true } } },
        });
        if (!membership) return ack?.({ error: 'Not a member of this workspace' });

        const r = getRoom(membership.workspaceId);
        if (!r.players.has(socket.data.userId) && r.players.size >= C.MAX_PLAYERS_PER_ROOM) {
          return ack?.({ error: 'Workspace room is full (20 players max)' }); // FR-8.4
        }

        socket.join(r.channel());
        player = await r.addPlayer(socket, membership.user, membership);
        room = r;
        socket.data.workspaceId = membership.workspaceId;
        ack?.({ ok: true, state: r.snapshot(), you: socket.data.userId });
      } catch (err) {
        console.error('join failed', err);
        ack?.({ error: 'Failed to join room' });
      }
    });

    const withPlayer = (fn) => async (data, ack) => {
      if (!room || !player || room.players.get(player.userId)?.socketId !== socket.id) return;
      try {
        const result = await fn(data || {});
        if (result?.error) ack?.({ error: result.error });
        else ack?.({ ok: true });
      } catch (err) {
        console.error('socket action failed', err);
        ack?.({ error: 'Action failed' });
      }
    };

    // Free movement: client streams a desired input vector (dx, dy in tile space)
    socket.on('move', withPlayer(({ dx, dy }) => room.setInput(player, Number(dx) || 0, Number(dy) || 0)));
    socket.on('meeting:log', withPlayer(() => room.logMeeting(player)));
    socket.on('slot', withPlayer(({ slot }) => room.setSlot(player, Number(slot))));
    socket.on('sprint', withPlayer(({ on }) => room.setSprint(player, !!on)));
    socket.on('desk:destroy', withPlayer(({ deskIndex }) => room.destroyDesk(player, Number(deskIndex))));
    socket.on('fire:ignite', withPlayer(({ x, y }) => room.igniteFire(player, Number(x), Number(y))));
    socket.on('fire:extinguish', withPlayer(({ x, y }) => room.extinguishFire(player, Number(x), Number(y))));
    // Directional melee with the equipped weapon, aimed at a world point
    socket.on('attack', withPlayer(({ tx, ty }) => room.attack(player, Number(tx), Number(ty))));
    socket.on('emoji', withPlayer(({ emoji }) => room.emoji(player, emoji)));

    socket.on('disconnect', () => {
      if (room && player) room.removePlayer(player.userId, socket.id);
    });
  });
}
