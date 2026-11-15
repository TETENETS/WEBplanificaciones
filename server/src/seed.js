// Carga una red de ejemplo:
// Nodo principal (OLT + ODF) → postes → CEO (splitter 1:8) → 2 CTO (splitter 1:8) → cliente con ONU.
// Uso: npm run seed   (o SEED_DEMO=true al arrancar con la base vacía)
import { fileURLToPath } from 'node:url';
import { pool, tx } from './db.js';
import { migrate } from './migrate.js';
import { fiberColor } from './fiber-colors.js';

export async function seed(log = console) {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM elements');
  if (rows[0].n > 0) { log.info('seed: la base ya tiene datos, se omite'); return; }

  await tx(async (c) => {
    const el = async (type, name, [lng, lat], properties = {}) => (await c.query(
      `INSERT INTO elements (type, name, status, properties, geom)
       VALUES ($1,$2,'implantado',$3, ST_SetSRID(ST_MakePoint($4,$5),4326)) RETURNING id`,
      [type, name, properties, lng, lat])).rows[0].id;
    const cable = async (name, n, from, to, coords) => {
      const id = (await c.query(
        `INSERT INTO cables (name, fiber_count, from_element_id, to_element_id, geom)
         VALUES ($1,$2,$3,$4, ST_SetSRID(ST_GeomFromGeoJSON($5),4326)) RETURNING id`,
        [name, n, from, to, JSON.stringify({ type: 'LineString', coordinates: coords })])).rows[0].id;
      const fibers = [];
      for (let i = 1; i <= n; i++) {
        const fc = fiberColor(i);
        fibers.push((await c.query(
          `INSERT INTO fibers (cable_id, number, tube, color, tube_color) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
          [id, i, fc.tube, fc.color, fc.tube_color])).rows[0].id);
      }
      return fibers;
    };
    const splitter = async (elementId, name, ratio, level, x, y) => (await c.query(
      `INSERT INTO splitters (element_id, name, ratio, level, diagram_x, diagram_y) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [elementId, name, ratio, level, x, y])).rows[0].id;
    const equipment = async (elementId, kind, name, slots, ports, props, x, y) => (await c.query(
      `INSERT INTO equipment (element_id, kind, name, slots, ports, properties, diagram_x, diagram_y)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [elementId, kind, name, slots, ports, props, x, y])).rows[0].id;
    const conn = (elementId, ak, ai, ap, bk, bi, bp, kind = 'fusion') => c.query(
      `INSERT INTO connections (element_id, a_kind, a_id, a_port, b_kind, b_id, b_port, kind) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [elementId, ak, ai, ap, bk, bi, bp, kind]);

    // Coordenadas de ejemplo (Buenos Aires). Cambiar libremente.
    const P = {
      nodo: [-58.3816, -34.6037], ceo: [-58.3775, -34.6019], cto1: [-58.3754, -34.6006],
      cto2: [-58.3754, -34.6034], cli: [-58.3749, -34.6002],
    };
    const nodo = await el('NODO', 'Nodo Central', P.nodo, { direccion: 'Av. Ejemplo 100', responsable: 'NOC' });
    const ceo = await el('CEO', 'CEO-01', P.ceo, { modelo: 'Domo 48F', bandejas: '4' });
    const cto1 = await el('CTO', 'NAP-01', P.cto1, { codigo: 'NAP-01', capacidad: '8' });
    const cto2 = await el('CTO', 'NAP-02', P.cto2, { codigo: 'NAP-02', capacidad: '8' });
    const cli = await el('CLIENTE', 'Cliente demo', P.cli, { documento: 'V-12345678', plan: '300 Mbps', serial_onu: 'ZTEG00000001' });

    // Postes cada ~45 m a lo largo de cada tramo (vértices intermedios del cable)
    let poleN = 0;
    const poleLine = async (a, b) => {
      const m = 111320;
      const dist = Math.hypot((b[0] - a[0]) * m * Math.cos((a[1] * Math.PI) / 180), (b[1] - a[1]) * m);
      const parts = Math.max(1, Math.ceil(dist / 45));
      const pts = [];
      for (let i = 1; i < parts; i++) {
        const pt = [a[0] + ((b[0] - a[0]) * i) / parts, a[1] + ((b[1] - a[1]) * i) / parts].map(v => Math.round(v * 1e6) / 1e6);
        await el('POSTE', `P-${String(++poleN).padStart(3, '0')}`, pt, { material: 'concreto', altura_m: '9' });
        pts.push(pt);
      }
      return pts;
    };
    const bend = [-58.3796, -34.6031];
    const feederPath = [P.nodo, ...(await poleLine(P.nodo, bend)), bend, ...(await poleLine(bend, P.ceo)), P.ceo];
    await el('POSTE', `P-${String(++poleN).padStart(3, '0')}`, bend, { material: 'concreto', altura_m: '9' });
    const d1Path = [P.ceo, ...(await poleLine(P.ceo, P.cto1)), P.cto1];
    const d2Path = [P.ceo, ...(await poleLine(P.ceo, P.cto2)), P.cto2];

    const feeder = await cable('C-Nodo-CEO01', 12, nodo, ceo, feederPath);
    const d1 = await cable('C-CEO01-NAP01', 2, ceo, cto1, d1Path);
    const d2 = await cable('C-CEO01-NAP02', 2, ceo, cto2, d2Path);
    const drop = await cable('Drop-Cliente demo', 1, cto1, cli, [P.cto1, P.cli]);

    // Nodo principal: OLT puerto 1 → ODF lado A 1 → ODF lado B 1 → hilo 1 del troncal
    const olt = await equipment(nodo, 'OLT', 'OLT-01', 1, 8, { marca: 'Genérica', ip: '10.0.0.2', potencia_dbm: 5 }, 300, 30);
    const odf = await equipment(nodo, 'ODF', 'ODF-01', 1, 12, {}, 520, 30);
    await conn(nodo, 'equipment', olt, 1, 'equipment', odf, 1, 'conector');
    await conn(nodo, 'equipment', odf, 1001, 'fiber', feeder[0], 0, 'conector');

    // CEO: hilo 1 → splitter 1:8 (nivel 1, de red) → salidas 1 y 2 a cada NAP
    const s1 = await splitter(ceo, 'SPL-N1', 8, 1, 440, 40);
    await c.query('UPDATE splitters SET allows_client=false WHERE id=$1', [s1]);
    await conn(ceo, 'fiber', feeder[0], 0, 'splitter_in', s1, 0);
    await conn(ceo, 'splitter_out', s1, 1, 'fiber', d1[0], 0);
    await conn(ceo, 'splitter_out', s1, 2, 'fiber', d2[0], 0);

    // NAP: splitter 1:8 nivel 2
    const sN1 = await splitter(cto1, 'SPL-N2', 8, 2, 460, 40);
    await conn(cto1, 'fiber', d1[0], 0, 'splitter_in', sN1, 0);
    await conn(cto1, 'splitter_out', sN1, 1, 'fiber', drop[0], 0, 'conector');
    const sN2 = await splitter(cto2, 'SPL-N2', 8, 2, 460, 40);
    await conn(cto2, 'fiber', d2[0], 0, 'splitter_in', sN2, 0);

    // Cliente: drop → ONU
    const onu = await equipment(cli, 'ONU', 'ONU Cliente demo', 1, 1, { serial: 'ZTEG00000001' }, 460, 40);
    await conn(cli, 'fiber', drop[0], 0, 'equipment', onu, 1, 'conector');

    await c.query(`UPDATE fibers SET status='ocupado' WHERE id = ANY($1)`, [[feeder[0], d1[0], d2[0], drop[0]]]);
    await c.query(
      `INSERT INTO clients (name, address, element_id, port, geom)
       VALUES ('Cliente demo', 'Calle Falsa 123', $1, 1, ST_SetSRID(ST_MakePoint($2,$3),4326))`, [cto1, ...P.cli]);
  });
  log.info('seed: red de ejemplo cargada');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrate().then(() => seed()).then(() => pool.end()).catch(e => { console.error(e); process.exit(1); });
}
