import { query } from '../db.js';
import { linkBudget, PON_CLASSES, SPLITTER_LOSS_DB } from '../budget.js';

export default async function analysisRoutes(app) {
  // Presupuesto óptico manual
  app.post('/budget', async (req, reply) => {
    try {
      return linkBudget(req.body || {});
    } catch (e) {
      return reply.code(400).send({ error: e.message });
    }
  });

  app.get('/budget/params', async () => ({ ponClasses: PON_CLASSES, splitterLossDb: SPLITTER_LOSS_DB }));

  // Viabilidad de cobertura: CTO/NAP dentro de un radio con puertos libres
  app.get('/coverage', {
    schema: {
      querystring: {
        type: 'object',
        required: ['lat', 'lng'],
        properties: {
          lat: { type: 'number' },
          lng: { type: 'number' },
          radius: { type: 'number', default: 150 },
        },
      },
    },
  }, async (req) => {
    const { lat, lng, radius } = req.query;
    const { rows } = await query(
      `WITH p AS (SELECT ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography AS g)
       SELECT e.id, e.name, e.status, ST_X(e.geom) AS lng, ST_Y(e.geom) AS lat,
              ROUND(ST_Distance(e.geom::geography, p.g)::numeric, 1)::float8 AS distance_m,
              COALESCE((SELECT SUM(s.ratio) FROM splitters s WHERE s.element_id = e.id
                         AND s.level = (SELECT MAX(level) FROM splitters WHERE element_id = e.id)), 0)::int AS capacity,
              (SELECT COUNT(*) FROM clients c WHERE c.element_id = e.id)::int AS used
         FROM elements e, p
        WHERE e.type = 'CTO' AND ST_DWithin(e.geom::geography, p.g, $3)
        ORDER BY distance_m`,
      [lng, lat, radius],
    );
    const naps = rows.map(r => ({ ...r, free: Math.max(r.capacity - r.used, 0) }));
    const best = naps.find(n => n.free > 0) || null;
    return { viable: !!best, best, candidates: naps, radius };
  });

  // Traza aguas abajo desde un hilo: sigue fusiones, cables y splitters hasta los extremos libres.
  // NOTA: carga la topología en memoria; para redes grandes migrar a una consulta recursiva / pgRouting.
  app.get('/trace/fiber/:id', async (req, reply) => {
    const startId = Number(req.params.id);
    const [fibersR, connsR, splR, cabR] = await Promise.all([
      query('SELECT id, cable_id, number, color FROM fibers'),
      query(`SELECT c.*, e.name AS element_name FROM connections c JOIN elements e ON e.id = c.element_id`),
      query('SELECT id, name, ratio, element_id FROM splitters'),
      query(`SELECT c.id, c.name, c.from_element_id, c.to_element_id, c.attenuation_db_km::float8 AS att,
                    ST_Length(c.geom::geography) AS length_m FROM cables c`),
    ]);
    const fibers = new Map(fibersR.rows.map(f => [f.id, f]));
    const cables = new Map(cabR.rows.map(c => [c.id, c]));
    const splitters = new Map(splR.rows.map(s => [s.id, s]));
    if (!fibers.has(startId)) return reply.code(404).send({ error: 'Hilo no encontrado' });

    const key = (k, i, p) => `${k}:${i}:${p}`;
    const byEnd = new Map();
    for (const c of connsR.rows) {
      const a = key(c.a_kind, c.a_id, c.a_port);
      const b = key(c.b_kind, c.b_id, c.b_port);
      if (!byEnd.has(a)) byEnd.set(a, []);
      if (!byEnd.has(b)) byEnd.set(b, []);
      byEnd.get(a).push({ conn: c, other: [c.b_kind, c.b_id, c.b_port] });
      byEnd.get(b).push({ conn: c, other: [c.a_kind, c.a_id, c.a_port] });
    }

    const paths = [];
    const walk = (fiberId, steps, visitedConns) => {
      const f = fibers.get(fiberId);
      const cab = cables.get(f.cable_id);
      steps = [...steps, { type: 'cable', cable: cab.name, fiber: f.number, color: f.color, length_m: Math.round(cab.length_m) }];
      const next = (byEnd.get(key('fiber', fiberId, 0)) || []).filter(n => !visitedConns.has(n.conn.id));
      if (!next.length) { paths.push(steps); return; }
      for (const { conn, other } of next) {
        const visited = new Set(visitedConns).add(conn.id);
        const hop = { type: conn.kind, element: conn.element_name };
        const [k, i] = other;
        if (k === 'fiber') {
          walk(i, [...steps, hop], visited);
        } else if (k === 'splitter_in') {
          const s = splitters.get(i);
          for (let port = 1; port <= s.ratio; port++) {
            const outs = (byEnd.get(key('splitter_out', i, port)) || []).filter(n => !visited.has(n.conn.id));
            const sStep = { type: 'splitter', name: s.name, ratio: s.ratio, port };
            if (!outs.length) { paths.push([...steps, hop, sStep, { type: 'libre' }]); continue; }
            for (const o of outs) {
              if (o.other[0] === 'fiber') {
                walk(o.other[1], [...steps, hop, sStep, { type: o.conn.kind, element: o.conn.element_name }],
                  new Set(visited).add(o.conn.id));
              }
            }
          }
        } else {
          paths.push([...steps, hop]);
        }
      }
    };
    walk(startId, [], new Set());

    const ponClass = req.query.ponClass || 'GPON B+';
    return {
      start: fibers.get(startId),
      paths: paths.map(steps => {
        const lengthKm = steps.filter(s => s.type === 'cable').reduce((a, s) => a + s.length_m, 0) / 1000;
        let budget = null;
        try {
          budget = linkBudget({
            lengthKm,
            fusions: steps.filter(s => s.type === 'fusion').length,
            connectors: steps.filter(s => s.type === 'conector').length + 2,
            splitters: steps.filter(s => s.type === 'splitter').map(s => s.ratio),
            ponClass,
          });
        } catch { /* clase PON inválida */ }
        return { steps, lengthKm: Math.round(lengthKm * 1000) / 1000, budget };
      }),
    };
  });
}
