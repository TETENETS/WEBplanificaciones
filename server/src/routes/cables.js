import { query, tx } from '../db.js';
import { fiberColor } from '../fiber-colors.js';

const COLS = `id, name, fiber_count, fibers_per_tube, from_element_id, to_element_id,
  attenuation_db_km::float8 AS attenuation_db_km, slack_m::float8 AS slack_m, properties,
  ROUND(ST_Length(geom::geography)::numeric, 2)::float8 AS length_m,
  ST_AsGeoJSON(geom)::json AS geometry`;

export default async function cablesRoutes(app) {
  app.get('/cables', async () => {
    const { rows } = await query(`SELECT ${COLS} FROM cables ORDER BY id`);
    return {
      type: 'FeatureCollection',
      features: rows.map(({ geometry, ...p }) => ({ type: 'Feature', id: p.id, geometry, properties: p })),
    };
  });

  app.get('/cables/:id/fibers', async (req) => {
    const { rows } = await query('SELECT * FROM fibers WHERE cable_id=$1 ORDER BY number', [req.params.id]);
    return rows;
  });

  // Crea un cable y sus hilos. coordinates: [[lng,lat],...]; si se omite se traza recto entre from/to.
  app.post('/cables', {
    schema: {
      body: {
        type: 'object',
        required: ['name', 'fiber_count'],
        properties: {
          name: { type: 'string', minLength: 1 },
          fiber_count: { type: 'integer', minimum: 1, maximum: 288 },
          fibers_per_tube: { type: 'integer', minimum: 1, maximum: 24 },
          from_element_id: { type: 'integer' },
          to_element_id: { type: 'integer' },
          attenuation_db_km: { type: 'number' },
          coordinates: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
        },
      },
    },
  }, async (req, reply) => {
    const b = req.body;
    const perTube = b.fibers_per_tube || 12;
    const cable = await tx(async (c) => {
      const params = [
        b.name, b.fiber_count, perTube, b.attenuation_db_km ?? null,
        b.from_element_id ?? null, b.to_element_id ?? null,
      ];
      let geomSql;
      if (b.coordinates?.length >= 2) {
        params.push(JSON.stringify({ type: 'LineString', coordinates: b.coordinates }));
        geomSql = 'ST_SetSRID(ST_GeomFromGeoJSON($7), 4326)';
      } else if (b.from_element_id && b.to_element_id) {
        geomSql = '(SELECT ST_MakeLine(a.geom, z.geom) FROM elements a, elements z WHERE a.id=$5 AND z.id=$6)';
      } else {
        const e = new Error('Indique coordinates o from_element_id y to_element_id');
        e.statusCode = 400;
        throw e;
      }
      const { rows } = await c.query(
        `INSERT INTO cables (name, fiber_count, fibers_per_tube, attenuation_db_km, from_element_id, to_element_id, geom)
         VALUES ($1, $2, $3, COALESCE($4, 0.35), $5, $6, ${geomSql}) RETURNING id`,
        params,
      );
      const id = rows[0].id;
      const values = [];
      const args = [];
      for (let n = 1; n <= b.fiber_count; n++) {
        const fc = fiberColor(n, perTube);
        const o = args.length;
        args.push(id, n, fc.tube, fc.color, fc.tube_color);
        values.push(`($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5})`);
      }
      await c.query(`INSERT INTO fibers (cable_id, number, tube, color, tube_color) VALUES ${values.join(',')}`, args);
      return (await c.query(`SELECT ${COLS} FROM cables WHERE id=$1`, [id])).rows[0];
    });
    return reply.code(201).send(cable);
  });

  app.delete('/cables/:id', async (req, reply) => {
    await query('DELETE FROM cables WHERE id=$1', [req.params.id]);
    return reply.code(204).send();
  });
}
