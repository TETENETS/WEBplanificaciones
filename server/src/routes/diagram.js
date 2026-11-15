import { query } from '../db.js';

const KINDS = ['fiber', 'splitter_in', 'splitter_out'];

/**
 * Diagrama lógico interno de un elemento (CEO/CTO): cables que entran/salen,
 * sus hilos, splitters y fusiones/conectores.
 */
export default async function diagramRoutes(app) {
  app.get('/elements/:id/diagram', async (req, reply) => {
    const id = Number(req.params.id);
    const el = (await query('SELECT id, type, name FROM elements WHERE id=$1', [id])).rows[0];
    if (!el) return reply.code(404).send({ error: 'No encontrado' });

    const cables = (await query(
      `SELECT c.id, c.name, c.fiber_count, c.fibers_per_tube,
              CASE WHEN c.to_element_id = $1 THEN 'in' ELSE 'out' END AS direction,
              CASE WHEN c.to_element_id = $1 THEN fe.name ELSE te.name END AS remote_name
         FROM cables c
         LEFT JOIN elements fe ON fe.id = c.from_element_id
         LEFT JOIN elements te ON te.id = c.to_element_id
        WHERE c.from_element_id = $1 OR c.to_element_id = $1
        ORDER BY c.id`, [id])).rows;

    const fibers = cables.length
      ? (await query('SELECT * FROM fibers WHERE cable_id = ANY($1) ORDER BY cable_id, number',
        [cables.map(c => c.id)])).rows
      : [];
    for (const c of cables) c.fibers = fibers.filter(f => f.cable_id === c.id);

    const splitters = (await query(
      `SELECT id, name, ratio, level, connectorized, diagram_x::float8 AS x, diagram_y::float8 AS y
         FROM splitters WHERE element_id=$1 ORDER BY level, id`, [id])).rows;
    const connections = (await query(
      `SELECT id, a_kind, a_id, a_port, b_kind, b_id, b_port, kind, tray, loss_db::float8 AS loss_db
         FROM connections WHERE element_id=$1 ORDER BY id`, [id])).rows;

    return { element: el, cables, splitters, connections };
  });

  app.post('/elements/:id/splitters', {
    schema: {
      body: {
        type: 'object',
        required: ['ratio'],
        properties: {
          name: { type: 'string' },
          ratio: { type: 'integer', enum: [2, 4, 8, 16, 32, 64] },
          level: { type: 'integer', minimum: 1, maximum: 3 },
          connectorized: { type: 'boolean' },
          x: { type: 'number' },
          y: { type: 'number' },
        },
      },
    },
  }, async (req, reply) => {
    const b = req.body;
    const { rows } = await query(
      `INSERT INTO splitters (element_id, name, ratio, level, connectorized, diagram_x, diagram_y)
       VALUES ($1, $2, $3, COALESCE($4, 1), COALESCE($5, false), COALESCE($6, 0), COALESCE($7, 0))
       RETURNING id, name, ratio, level, connectorized, diagram_x::float8 AS x, diagram_y::float8 AS y`,
      [req.params.id, b.name || `Splitter 1:${b.ratio}`, b.ratio, b.level ?? null,
        b.connectorized ?? null, b.x ?? null, b.y ?? null],
    );
    return reply.code(201).send(rows[0]);
  });

  app.patch('/splitters/:id', async (req) => {
    const b = req.body || {};
    const { rows } = await query(
      `UPDATE splitters SET name = COALESCE($2, name), diagram_x = COALESCE($3, diagram_x),
              diagram_y = COALESCE($4, diagram_y)
        WHERE id=$1 RETURNING id, name, ratio, level, diagram_x::float8 AS x, diagram_y::float8 AS y`,
      [req.params.id, b.name ?? null, b.x ?? null, b.y ?? null]);
    return rows[0];
  });

  app.delete('/splitters/:id', async (req, reply) => {
    await query(
      `DELETE FROM connections WHERE (a_kind LIKE 'splitter%' AND a_id=$1) OR (b_kind LIKE 'splitter%' AND b_id=$1)`,
      [req.params.id]);
    await query('DELETE FROM splitters WHERE id=$1', [req.params.id]);
    return reply.code(204).send();
  });

  // Crea una fusión / conexión entre dos extremos dentro del elemento
  app.post('/elements/:id/connections', {
    schema: {
      body: {
        type: 'object',
        required: ['a_kind', 'a_id', 'b_kind', 'b_id'],
        properties: {
          a_kind: { type: 'string', enum: KINDS },
          a_id: { type: 'integer' },
          a_port: { type: 'integer' },
          b_kind: { type: 'string', enum: KINDS },
          b_id: { type: 'integer' },
          b_port: { type: 'integer' },
          kind: { type: 'string', enum: ['fusion', 'conector'] },
          tray: { type: 'integer' },
          loss_db: { type: 'number' },
        },
      },
    },
  }, async (req, reply) => {
    const b = req.body;
    const elementId = Number(req.params.id);
    const ends = [[b.a_kind, b.a_id, b.a_port ?? 0], [b.b_kind, b.b_id, b.b_port ?? 0]];
    // Ambos extremos deben pertenecer a este elemento
    for (const [k, i, p] of ends) {
      const sql = k === 'fiber'
        ? `SELECT 1 FROM fibers f JOIN cables c ON c.id=f.cable_id
            WHERE f.id=$2 AND (c.from_element_id=$1 OR c.to_element_id=$1)`
        : `SELECT 1 FROM splitters WHERE id=$2 AND element_id=$1 AND ($3::int = 0 OR $3::int <= ratio)`;
      const { rowCount } = await query(sql, k === 'fiber' ? [elementId, i] : [elementId, i, k === 'splitter_out' ? p : 0]);
      if (!rowCount) return reply.code(400).send({ error: `El extremo ${k}#${i}:${p} no pertenece a esta caja` });
    }
    // Un extremo sólo puede tener una conexión dentro del mismo elemento
    for (const [k, i, p] of ends) {
      const { rowCount } = await query(
        `SELECT 1 FROM connections WHERE element_id=$1 AND
           ((a_kind=$2 AND a_id=$3 AND a_port=$4) OR (b_kind=$2 AND b_id=$3 AND b_port=$4))`,
        [elementId, k, i, p]);
      if (rowCount) return reply.code(409).send({ error: `El extremo ${k}#${i}:${p} ya está conectado` });
    }
    const { rows } = await query(
      `INSERT INTO connections (element_id, a_kind, a_id, a_port, b_kind, b_id, b_port, kind, tray, loss_db)
       VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8,'fusion'),$9,$10)
       RETURNING id, a_kind, a_id, a_port, b_kind, b_id, b_port, kind, tray, loss_db::float8 AS loss_db`,
      [elementId, ...ends[0], ...ends[1], b.kind ?? null, b.tray ?? null, b.loss_db ?? null]);
    // marca hilos como ocupados
    const fiberIds = ends.filter(e => e[0] === 'fiber').map(e => e[1]);
    if (fiberIds.length) await query(`UPDATE fibers SET status='ocupado' WHERE id = ANY($1)`, [fiberIds]);
    return reply.code(201).send(rows[0]);
  });

  app.delete('/connections/:id', async (req, reply) => {
    const { rows } = await query('DELETE FROM connections WHERE id=$1 RETURNING *', [req.params.id]);
    const c = rows[0];
    if (c) {
      const ids = [c.a_kind === 'fiber' && c.a_id, c.b_kind === 'fiber' && c.b_id].filter(Boolean);
      if (ids.length) {
        await query(
          `UPDATE fibers f SET status='libre' WHERE f.id = ANY($1) AND NOT EXISTS (
             SELECT 1 FROM connections x WHERE (x.a_kind='fiber' AND x.a_id=f.id) OR (x.b_kind='fiber' AND x.b_id=f.id))`,
          [ids]);
      }
    }
    return reply.code(204).send();
  });
}
