import { waitUntil, attachDatabasePool } from '@vercel/functions';
import { normalizeQuery } from '../backend/src/serverless-request.js';

// Local development keeps using backend/src/index.js and its worker processes.
process.env.UPLOAD_DIR ||= '/tmp/eduquest-uploads';
let application;
let backgroundWork;

export default async function handler(req, res) {
  if (!process.env.DATABASE_URL) {
    return res.status(503).json({
      error: {
        code: 'DEPLOYMENT_NOT_CONFIGURED',
        message:
          'The hosted database is being configured. Please try again later.',
      },
    });
  }
  application ||= (async () => {
    const { pool } = await import('../backend/db.js');
    attachDatabasePool(pool);
    const { app } = await import('../backend/src/app.js');
    return app;
  })();
  const app = await application;
  normalizeQuery(req);
  res.once('finish', () => {
    // Polling starts/retries a durable DB job; PostgreSQL locks prevent duplicate
    // claims across instances. Keep the invocation alive after the response.
    if (
      req.user &&
      res.statusCode < 400 &&
      /generation-jobs/.test(req.url) &&
      !backgroundWork
    ) {
      backgroundWork = import('../backend/scripts/ai-worker.js')
        .then(({ once }) => once())
        .catch(() => console.error('Hosted AI job pass failed.'))
        .finally(() => {
          backgroundWork = null;
        });
      waitUntil(backgroundWork);
    }
  });
  return app(req, res);
}
