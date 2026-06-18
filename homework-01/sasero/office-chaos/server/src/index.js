import express from 'express';
import http from 'node:http';
import cors from 'cors';
import { Server } from 'socket.io';
import authRoutes from './routes/auth.js';
import workspaceRoutes from './routes/workspaces.js';
import { initSocket } from './game/socket.js';
import { startWeeklyResetJob } from './jobs/weeklyReset.js';

const PORT = Number(process.env.PORT || 4000);

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api', workspaceRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

initSocket(io);
startWeeklyResetJob();

httpServer.listen(PORT, () => console.log(`Office Chaos server on :${PORT}`));
