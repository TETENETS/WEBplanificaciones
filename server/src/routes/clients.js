import { query } from '../db.js';

const COLS = `id, name, address, external_id, element_id, splitter_id, port, status,
  ST_X(geom) AS lng, ST_Y(geom) AS lat, created_at`;

export default async function clientsRoutes(app) {
  app.get('/clients', async (req) => {
    const params = [];
    let where = '';
    if (req.query.external_id) { params.push(req.query.external_id); where = 'WHERE external_id=$1'; }
    const { rows } = await query(`SELECT ${COLS} FROM clients ${where} ORDER BY id`, params);
    return {
      type: 'FeatureCollection',
      features: rows.map(({ lat, lng, ...p }) => ({
        type: 'Feature', id: p.id, geometry: { type: 'Point', coordinates: [lng, lat] }, properties: p,
      })),
    };
  });

  app.post('/clients', {
    schema: {
      body: {
        type: 'object',
        required: ['name', 'lat', 'lng'],
        properties: {
          name: { type: 'string', minLength: 1 },
          address: { type: 'string' },
          external_id: { type: 'string' },
          element_id: { type: 'integer' },
          splitter_id: { type: 'integer' },
          port: { type: 'integer' },
          lat: { type: 'number' },
          lng: { type: 'number' },
        },
      },
    },
  }, async (req, reply) => {
    const b = req.body;
    const { rows } = await query(
      `INSERT INTO clients (name, address, external_id, element_id, splitter_id, port, geom)
       VALUES ($1,$2,$3,$4,$5,$6, ST_SetSRID(ST_MakePoint($7,$8),4326)) RETURNING ${COLS}`,
      [b.name, b.address ?? null, b.external_id ?? null, b.element_id ?? null,
        b.splitter_id ?? null, b.port ?? null, b.lng, b.lat]);
    return reply.code(201).send(rows[0]);
  });

  app.delete('/clients/:id', async (req, reply) => {
    await query('DELETE FROM clients WHERE id=$1', [req.params.id]);
    return reply.code(204).send();
  });
}
