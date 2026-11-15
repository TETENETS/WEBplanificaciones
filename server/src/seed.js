// Carga una red de ejemplo: POP/OLT → CEO → 2 CTO con splitters 1:8 + 1:8.
// Uso: npm run seed   (o SEED_DEMO=true al arrancar con la base vacía)
import { fileURLToPath } from 'node:url';
import { pool, tx } from './db.js';
import { migrate } from './migrate.js';
import { fiberColor } from './fiber-colors.js';

export async function seed(log = console) {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM elements');
  if (rows[0].n > 0) { log.info('seed: la base ya tiene datos, se omite'); return; }

  await tx(async (c) => {
    const el = async (type, name, lng, lat) => (await c.query(
      `INSERT INTO elements (type, name, status, geom) VALUES ($1,$2,'en_servicio', ST_SetSRID(ST_MakePoint($3,$4),4326)) RETURNING id`,
      [type, name, lng, lat])).rows[0].id;
    const cable = async (name, n, from, to, coords) => {
      const id = (await c.query(
        `INSERT INTO cables (name, fiber_count, from_element_id, to_element_id, geom)
         VALUES ($1,$2,$3,$4, ST_SetSRID(ST_GeomFromGeoJSON($5),4326)) RETURNING id`,
        [name, n, from, to, JSON.stringify({ type: 'LineString', coordinates: coords })])).rows[0].id;
      const fibers = [];
      for (let i = 1; i <= n; i++) {
        const fc = fiberColor(i);
        fibers.push((await c.query(
          'INSERT INTO fibers (cable_id, number, tube, color, tube_color) VALUES ($1,$2,$3,$4,$5) RETURNING id',
          [id, i, fc.tube, fc.color, fc.tube_color])).rows[0].id);
      }
      return fibers;
    };
    const splitter = async (elementId, name, ratio, level, x, y) => (await c.query(
      `INSERT INTO splitters (element_id, name, ratio, level, diagram_x, diagram_y) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [elementId, name, ratio, level, x, y])).rows[0].id;
    const conn = (elementId, ak, ai, ap, bk, bi, bp) => c.query(
      `INSERT INTO connections (element_id, a_kind, a_id, a_port, b_kind, b_id, b_port) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [elementId, ak, ai, ap, bk, bi, bp]);

    // Coordenadas de ejemplo (Buenos Aires). Cambiar libremente.
    const pop = await el('POP', 'POP-Central', -58.3816, -34.6037);
    const ceo = await el('CEO', 'CEO-01', -58.3775, -34.6020);
    const cto1 = await el('CTO', 'CTO-01', -58.3750, -34.6005);
    const cto2 = await el('CTO', 'CTO-02', -58.3748, -34.6035);

    const feeder = await cable('C-POP-CEO', 12, pop, ceo, [[-58.3816, -34.6037], [-58.3795, -34.6030], [-58.3775, -34.6020]]);
    const d1 = await cable('C-CEO-CTO01', 2, ceo, cto1, [[-58.3775, -34.6020], [-58.3750, -34.6005]]);
    const d2 = await cable('C-CEO-CTO02', 2, ceo, cto2, [[-58.3775, -34.6020], [-58.3748, -34.6035]]);

    // CEO: hilo 1 del feeder → splitter 1:8 nivel 1 → salidas 1 y 2 a cada CTO
    const s1 = await splitter(ceo, 'SPL-N1', 8, 1, 420, 40);
    await conn(ceo, 'fiber', feeder[0], 0, 'splitter_in', s1, 0);
    await conn(ceo, 'splitter_out', s1, 1, 'fiber', d1[0], 0);
    await conn(ceo, 'splitter_out', s1, 2, 'fiber', d2[0], 0);

    // CTO: splitter 1:8 nivel 2
    for (const [cto, fib] of [[cto1, d1], [cto2, d2]]) {
      const s2 = await splitter(cto, 'SPL-N2', 8, 2, 460, 40);
      await conn(cto, 'fiber', fib[0], 0, 'splitter_in', s2, 0);
    }
    await c.query(`UPDATE fibers SET status='ocupado' WHERE id = ANY($1)`, [[feeder[0], d1[0], d2[0]]]);

    await c.query(
      `INSERT INTO clients (name, address, element_id, port, geom)
       VALUES ('Cliente demo', 'Calle Falsa 123', $1, 1, ST_SetSRID(ST_MakePoint(-58.3745, -34.6002),4326))`, [cto1]);
  });
  log.info('seed: red de ejemplo cargada');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrate().then(() => seed()).then(() => pool.end()).catch(e => { console.error(e); process.exit(1); });
}
