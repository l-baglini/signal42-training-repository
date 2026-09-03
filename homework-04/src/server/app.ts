import path from 'path';
import express from 'express';
import { Db } from 'mongodb';
import { router } from './routes';

/** Builds the Express application. TLS is terminated upstream by the ALB. */
export function createApp(database: Db): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('view engine', 'ejs');
  app.set('views', path.resolve(__dirname, '../../views'));
  app.set('database', database);

  // Health check for the load balancer target group.
  app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }));

  app.use(express.static(path.resolve(__dirname, '../../public')));
  app.use(express.json());

  app.use('/', router);

  return app;
}
