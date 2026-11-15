// Motor de propagación de luz sobre la topología lógica.
// Nodos del grafo (extremos):
//   fiber:<id>            un hilo (sus dos puntas comparten nodo; cada caja tiene su conexión)
//   spl_in:<id>           entrada de splitter
//   spl_out:<id>:<p>      salida p de splitter
//   eq:<id>:<p>           puerto p de un equipo (OLT/ODF/ONU...). ODF: lado A = p, lado B = 1000+p
import { query } from './db.js';
import { SPLITTER_LOSS_DB } from './budget.js';

const LOSS = { fusion: 0.1, conector: 0.5, odf: 0.5 };
export const RECEIVER_KINDS = new Set(['ONU', 'ROUTER', 'TRANSCEPTOR']);
const DEFAULT_LAUNCH_DBM = 5;

const endKey = (kind, id, port) => {
  if (kind === 'fiber') return `fiber:${id}`;
  if (kind === 'splitter_in') return `spl_in:${id}`;
  if (kind === 'splitter_out') return `spl_out:${id}:${port}`;
  return `eq:${id}:${port}`;
};

export function parseKey(key) {
  const [t, id, port] = key.split(':');
  return { t, id: Number(id), port: port === undefined ? 0 : Number(port) };
}

export async function loadNetwork() {
  const [fib, con, spl, eq, cab, els] = await Promise.all([
    query('SELECT id, cable_id, number, color FROM fibers'),
    query('SELECT * FROM connections'),
    query('SELECT id, element_id, name, ratio, level FROM splitters'),
    query('SELECT id, element_id, kind, name, slots, ports, properties FROM equipment'),
    query(`SELECT id, name, from_element_id, to_element_id, attenuation_db_km::float8 AS att,
                  ST_Length(geom::geography) AS length_m FROM cables`),
    query('SELECT id, type, name, ST_X(geom) AS lng, ST_Y(geom) AS lat FROM elements'),
  ]);
  const net = {
    fibers: new Map(fib.rows.map(r => [r.id, r])),
    splitters: new Map(spl.rows.map(r => [r.id, r])),
    equipment: new Map(eq.rows.map(r => [r.id, r])),
    cables: new Map(cab.rows.map(r => [r.id, r])),
    elements: new Map(els.rows.map(r => [r.id, r])),
    connections: con.rows,
    adj: new Map(), // key -> [{ to, conn }]
  };
  const add = (a, b, conn) => {
    if (!net.adj.has(a)) net.adj.set(a, []);
    net.adj.get(a).push({ to: b, conn });
  };
  for (const c of con.rows) {
    const a = endKey(c.a_kind, c.a_id, c.a_port);
    const b = endKey(c.b_kind, c.b_id, c.b_port);
    add(a, b, c);
    add(b, a, c);
  }
  return net;
}

/** Pérdida al cruzar una conexión hacia `to` (incluye la longitud del hilo si se entra a un hilo) */
function edgeLoss(net, conn, toKey) {
  let loss = conn.loss_db != null ? Number(conn.loss_db) : LOSS[conn.kind] ?? 0.1;
  const k = parseKey(toKey);
  if (k.t === 'fiber') {
    const f = net.fibers.get(k.id);
    const cab = f && net.cables.get(f.cable_id);
    if (cab) loss += (cab.length_m / 1000) * cab.att;
  }
  return loss;
}

/**
 * Pasos internos desde un nodo al que se llegó por una conexión externa (`fromExternal`)
 * o desde dentro del mismo componente.
 * direction: 'down' (hacia clientes) | 'up' (hacia el nodo/OLT)
 */
function internalHops(net, key, direction) {
  const k = parseKey(key);
  if (k.t === 'spl_in' && direction === 'down') {
    const s = net.splitters.get(k.id);
    if (!s) return [];
    const loss = SPLITTER_LOSS_DB[s.ratio] ?? 0;
    return Array.from({ length: s.ratio }, (_, i) => ({ to: `spl_out:${k.id}:${i + 1}`, loss, splitter: s }));
  }
  if (k.t === 'spl_out' && direction === 'up') {
    const s = net.splitters.get(k.id);
    if (!s) return [];
    return [{ to: `spl_in:${k.id}`, loss: SPLITTER_LOSS_DB[s.ratio] ?? 0, splitter: s }];
  }
  if (k.t === 'eq') {
    const e = net.equipment.get(k.id);
    if (e?.kind === 'ODF') {
      const other = k.port > 1000 ? k.port - 1000 : k.port + 1000;
      return [{ to: `eq:${k.id}:${other}`, loss: LOSS.odf }];
    }
  }
  return [];
}

/**
 * Recorre la luz desde un extremo. Devuelve los nodos iluminados con su potencia estimada,
 * las conexiones recorridas y los puntos clave (splitters y receptores).
 */
export function illuminate(net, startKey, { direction = 'down', launchDbm } = {}) {
  const start = parseKey(startKey);
  let power = launchDbm;
  if (power === undefined && start.t === 'eq') {
    const e = net.equipment.get(start.id);
    if (e?.kind === 'OLT') power = Number(e.properties?.potencia_dbm ?? DEFAULT_LAUNCH_DBM);
  }
  const lit = new Map();      // key -> { power, via }
  const conns = new Set();
  const keyPoints = [];
  const seenSplitters = new Set();
  // cola: { key, power, arrivedExternal (bool), viaConn }
  const queue = [{ key: startKey, power: power ?? null, arrivedExternal: false, viaConn: null }];
  lit.set(startKey, { power: power ?? null });

  while (queue.length) {
    const cur = queue.shift();
    const k = parseKey(cur.key);

    // receptores: el recorrido termina aquí
    if (k.t === 'eq' && cur.key !== startKey) {
      const e = net.equipment.get(k.id);
      if (e && RECEIVER_KINDS.has(e.kind)) {
        keyPoints.push({ type: 'receptor', kind: e.kind, name: e.name, element_id: e.element_id, power: cur.power });
        continue;
      }
      if (e?.kind === 'OLT') {
        keyPoints.push({ type: 'olt', name: e.name, port: k.port, element_id: e.element_id, power: cur.power });
        continue;
      }
    }

    const next = [];
    // 1) saltos internos (splitter / ODF) sólo si llegamos desde fuera (o es el inicio)
    if (cur.arrivedExternal || cur.key === startKey) {
      for (const h of internalHops(net, cur.key, direction)) {
        next.push({ to: h.to, loss: h.loss, external: false, splitter: h.splitter });
      }
    }
    // 2) conexiones externas (no la que nos trajo). Si llegamos desde dentro, o es un hilo, salimos.
    const canExit = !cur.arrivedExternal || k.t === 'fiber' || cur.key === startKey;
    if (canExit) {
      for (const { to, conn } of net.adj.get(cur.key) || []) {
        if (cur.viaConn && conn.id === cur.viaConn.id) continue;
        // en una entrada de splitter, bajando, no se sale por la entrada
        if (direction === 'down' && k.t === 'spl_out' && cur.arrivedExternal) continue;
        next.push({ to, loss: edgeLoss(net, conn, to), external: true, conn });
      }
    }

    for (const n of next) {
      if (lit.has(n.to)) continue;
      const p = cur.power == null ? null : Math.round((cur.power - n.loss) * 100) / 100;
      lit.set(n.to, { power: p });
      if (n.conn) conns.add(n.conn.id);
      if (n.splitter && !seenSplitters.has(n.splitter.id)) {
        seenSplitters.add(n.splitter.id);
        keyPoints.push({
          type: 'splitter', name: n.splitter.name, ratio: n.splitter.ratio,
          element_id: n.splitter.element_id, power: cur.power,
        });
      }
      queue.push({ key: n.to, power: p, arrivedExternal: n.external, viaConn: n.conn || null });
    }
  }

  // hilos y cables iluminados
  const fiberIds = [];
  const cableIds = new Set();
  for (const key of lit.keys()) {
    const k = parseKey(key);
    if (k.t === 'fiber') {
      fiberIds.push(k.id);
      const f = net.fibers.get(k.id);
      if (f) cableIds.add(f.cable_id);
    }
  }
  // puntos finales libres (hilos que no siguen conectados)
  const elementsIds = new Set(keyPoints.map(p => p.element_id));
  for (const c of net.connections) if (conns.has(c.id)) elementsIds.add(c.element_id);

  return {
    lit, connections: [...conns], fiberIds, cableIds: [...cableIds], keyPoints,
    elementIds: [...elementsIds],
  };
}

/** Ilumina toda la red desde todos los puertos OLT conectados (para saber qué hilos reciben señal). */
export function networkSignal(net) {
  const power = new Map(); // key -> mejor potencia
  for (const e of net.equipment.values()) {
    if (e.kind !== 'OLT') continue;
    for (let p = 1; p <= e.slots * e.ports; p++) {
      const key = `eq:${e.id}:${p}`;
      if (!net.adj.has(key)) continue;
      const r = illuminate(net, key, { direction: 'down' });
      for (const [k, v] of r.lit) {
        const prev = power.get(k);
        if (prev === undefined || (v.power ?? -999) > (prev ?? -999)) power.set(k, v.power);
      }
    }
  }
  return power;
}

export { endKey };
