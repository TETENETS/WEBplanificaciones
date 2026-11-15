import { query } from '../db.js';

export const ELEMENT_TYPES = ['NODO', 'CEO', 'CTO', 'POSTE', 'CAMARA', 'CLIENTE'];
const COLS = `id, type, name, status, properties, ST_X(geom) AS lng, ST_Y(geom) AS lat, created_at, updated_at`;

const elementBody = {
  type: 'object',
  required: ['type', 'name', 'lat', 'lng'],
  properties: {
    type: { type: 'string', enum: ELEMENT_TYPES },
    name: { type: 'string', minLength: 1 },
    status: { type: 'string' },
    properties: { type: 'object' },
    lat: { type: 'number', minimum: -90, maximum: 90 },
    lng: { type: 'number', minimum: -180, maximum: 180 },
  },
};

export default async function elementsRoutes(app) {
  // GeoJSON de elementos. Filtros opcionales: bbox=minLng,minLat,maxLng,maxLat y type=CTO,CEO
  app.get('/elements', async (req) => {
    const { bbox, type } = req.query;
    const where = [];
    const params = [];
    if (bbox) {
      const b = String(bbox).split(',').map(Number);
      if (b.length === 4 && b.every(Number.isFinite)) {
        params.push(...b);
        where.push(`geom && ST_MakeEnvelope($1,$2,$3,$4,4326)`);
      }
    }
    if (type) {
      params.push(String(type).split(','));
      where.push(`type = ANY($${params.length})`);
    }
    const { rows } = await query(
      `SELECT ${COLS} FROM elements ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id`,
      params,
    );
    return {
      type: 'FeatureCollection',
      features: rows.map(({ lat, lng, ...p }) => ({
        type: 'Feature',
        id: p.id,
        geometry: { type: 'Point', coordinates: [lng, lat] },
        properties: p,
      })),
    };
  });

  app.get('/elements/:id', async (req, reply) => {
    const { rows } = await query(`SELECT ${COLS} FROM elements WHERE id=$1`, [req.params.id]);
    if (!rows[0]) return reply.code(404).send({ error: 'No encontrado' });
    return rows[0];
  });

  app.post('/elements', { schema: { body: elementBody } }, async (req, reply) => {
    const b = req.body;
    const { rows } = await query(
      `INSERT INTO elements (type, name, status, properties, geom)
       VALUES ($1, $2, COALESCE($3, 'proyectado'), $4, ST_SetSRID(ST_MakePoint($5, $6), 4326))
       RETURNING ${COLS}`,
      [b.type, b.name, b.status ?? null, b.properties || {}, b.lng, b.lat],
    );
    return reply.code(201).send(rows[0]);
  });

  app.patch('/elements/:id', async (req, reply) => {
    const b = req.body || {};
    const { rows } = await query(
      `UPDATE elements SET
         name = COALESCE($2, name),
         status = COALESCE($3, status),
         properties = COALESCE($4, properties),
         geom = CASE WHEN $5::float8 IS NOT NULL AND $6::float8 IS NOT NULL
                     THEN ST_SetSRID(ST_MakePoint($5, $6), 4326) ELSE geom END,
         updated_at = now()
       WHERE id=$1 RETURNING ${COLS}`,
      [req.params.id, b.name ?? null, b.status ?? null, b.properties ?? null, b.lng ?? null, b.lat ?? null],
    );
    if (!rows[0]) return reply.code(404).send({ error: 'No encontrado' });
    return rows[0];
  });

  app.delete('/elements/:id', async (req, reply) => {
    await query('DELETE FROM elements WHERE id=$1', [req.params.id]);
    return reply.code(204).send();
  });
}
