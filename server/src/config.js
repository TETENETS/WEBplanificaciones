export const config = {
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || '0.0.0.0',
  databaseUrl: process.env.DATABASE_URL || 'postgres://fttx:fttx@localhost:5432/fttx',
  databaseSsl: process.env.DATABASE_SSL === 'true',
  runMigrations: process.env.RUN_MIGRATIONS !== 'false',
  corsOrigin: process.env.CORS_ORIGIN || true,
  staticDir: process.env.STATIC_DIR || null,
};
