import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { config } from './config.js';
import { pool } from './db.js';
import { migrate } from './migrate.js';
import { seed } from './seed.js';
import elementsRoutes from './routes/elements.js';
import cablesRoutes from './routes/cables.js';
import diagramRoutes from './routes/diagram.js';
import analysisRoutes from './routes/analysis.js';
import clientsRoutes from './routes/clients.js';
import polesRoutes from './routes/poles.js';
import exportRoutes from './routes/export.js';

const app = Fastify({ logger: { level: process.env.LOG_LEVEL || 'info' } });

await app.register(cors, { origin: config.corsOrigin });

// Healthcheck (Easypanel / Docker)
app.get('/health', async (req, reply) => {
  try {
    await pool.query('SELECT 1');
    return { status: 'ok', db: 'ok' };
  } catch (e) {
    return reply.code(503).send({ status: 'error', db: e.message });
  }
});

await app.register(async (api) => {
  await api.register(elementsRoutes);
  await api.register(cablesRoutes);
  await api.register(diagramRoutes);
  await api.register(analysisRoutes);
  await api.register(clientsRoutes);
  await api.register(polesRoutes);
  await api.register(exportRoutes);
}, { prefix: '/api/v1' });

// Frontend compilado (SPA)
const here = path.dirname(fileURLToPath(import.meta.url));
const staticDir = path.resolve(config.staticDir || path.join(here, '..', 'public'));
if (fs.existsSync(staticDir)) {
  await app.register(fastifyStatic, { root: staticDir });
  app.setNotFoundHandler((req, reply) => {
    if (req.raw.url.startsWith('/api/')) return reply.code(404).send({ error: 'No encontrado' });
    return reply.sendFile('index.html');
  });
}

if (config.runMigrations) {
  await migrate(app.log);
}
if (process.env.SEED_DEMO === 'true') {
  await seed(app.log);
}

await app.listen({ port: config.port, host: config.host });

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    await app.close();
    await pool.end();
    process.exit(0);
  });
}
