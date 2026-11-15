import { query, tx } from '../db.js';
import { parseCsv } from '../csv.js';

const R = 6371008.8;
const rad = d => (d * Math.PI) / 180;
export function haversine(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Ruta más corta (Dijkstra) entre dos puntos pasando sólo por postes.
 * Dos postes son adyacentes si están a <= maxSpan metros. El origen/destino se enlazan
 * a los postes dentro de maxSpan. No se permite el salto directo origen→destino:
 * si no hay postes en el camino, no hay ruta.
 */
export function routeThroughPoles(from, to, poles, maxSpan) {
  const nodes = [from, ...poles, to];
  const n = nodes.length;
  const T = n - 1;
  const dist = new Array(n).fill(Infinity);
  const prev = new Array(n).fill(-1);
  const done = new Array(n).fill(false);
  dist[0] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || u === T) break;
    done[u] = true;
    for (let v = 1; v < n; v++) {
      if (done[v] || v === u) continue;
      if (u === 0 && v === T) continue; // sin salto directo
      const d = haversine(nodes[u], nodes[v]);
      if (d > maxSpan) continue;
      if (dist[u] + d < dist[v]) { dist[v] = dist[u] + d; prev[v] = u; }
    }
  }
  if (dist[T] === Infinity) return null;
  const path = [];
  for (let v = T; v >= 0; v = prev[v]) { path.unshift(v); if (v === 0) break; }
  return { length_m: Math.round(dist[T] * 100) / 100, nodes: path.map(i => nodes[i]) };
}

/**
 * Ruta por calles (OSRM sobre datos de OpenStreetMap). Devuelve null si OSRM_URL no está
 * configurado o no responde: en ese caso se usa la distancia en línea recta.
 */
export async function streetRoute(from, to) {
  const base = process.env.OSRM_URL;
  if (!base) return null;
  try {
    const url = `${base.replace(/\/$/, '')}/route/v1/foot/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    const r = data.routes?.[0];
    if (data.code !== 'Ok' || !r) return null;
    return { distance_m: r.distance, coordinates: r.geometry.coordinates };
  } catch {
    return null;
  }
}

export default async function polesRoutes(app) {
  // Importa postes desde CSV. Columnas reconocidas: nombre/codigo, lat/latitud, lng/lon/longitud;
  // el resto de columnas se guardan como propiedades del poste.
  app.post('/poles/import', {
    bodyLimit: 10 * 1024 * 1024,
    schema: {
      body: {
        type: 'object',
        required: ['csv'],
        properties: {
          csv: { type: 'string' },
          status: { type: 'string' },
          skipDuplicates: { type: 'boolean', default: true },
        },
      },
    },
  }, async (req, reply) => {
    let parsed;
    try {
      parsed = parseCsv(req.body.csv);
    } catch (e) {
      return reply.code(400).send({ error: e.message });
    }
    const { rows: existing } = await query(`SELECT name FROM elements WHERE type='POSTE'`);
    const names = new Set(existing.map(r => r.name.toLowerCase()));
    let inserted = 0;
    let skipped = 0;
    await tx(async (c) => {
      for (const p of parsed.rows) {
        if (req.body.skipDuplicates && names.has(p.name.toLowerCase())) { skipped++; continue; }
        names.add(p.name.toLowerCase());
        await c.query(
          `INSERT INTO elements (type, name, status, properties, geom)
           VALUES ('POSTE', $1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326))`,
          [p.name, req.body.status || 'implantado', p.properties, p.lng, p.lat]);
        inserted++;
      }
    });
    return { inserted, skipped, errors: parsed.errors, columns: parsed.columns };
  });

  // Trazado automático por postes entre dos elementos
  app.post('/routes/auto', {
    schema: {
      body: {
        type: 'object',
        required: ['from_element_id', 'to_element_id'],
        properties: {
          from_element_id: { type: 'integer' },
          to_element_id: { type: 'integer' },
          max_span_m: { type: 'number', minimum: 5, maximum: 1000, default: 80 },
        },
      },
    },
  }, async (req, reply) => {
    const { from_element_id: a, to_element_id: b, max_span_m: maxSpan } = req.body;
    const ends = (await query(
      `SELECT id, name, ST_X(geom) AS lng, ST_Y(geom) AS lat FROM elements WHERE id = ANY($1)`, [[a, b]])).rows;
    const from = ends.find(e => e.id === a);
    const to = ends.find(e => e.id === b);
    if (!from || !to) return reply.code(404).send({ error: 'Elemento de origen o destino no encontrado' });

    // Postes candidatos: dentro de un corredor alrededor de la línea recta
    const straight = haversine(from, to);
    // Ruta teórica: por calles si hay OSRM, si no en línea recta
    const street = await streetRoute(from, to);
    const theory = {
      reference: street ? 'calles' : 'recta',
      reference_m: Math.round((street?.distance_m ?? straight) * 100) / 100,
      reference_coordinates: street?.coordinates ?? [[from.lng, from.lat], [to.lng, to.lat]],
    };
    const buffer = Math.max(300, straight * 0.6, street ? (street.distance_m - straight) * 0.6 : 0);
    const { rows: poles } = await query(
      `SELECT id, name, ST_X(geom) AS lng, ST_Y(geom) AS lat FROM elements
        WHERE type='POSTE' AND id <> ALL($5) AND ST_DWithin(geom::geography,
          ST_MakeLine(ST_SetSRID(ST_MakePoint($1,$2),4326), ST_SetSRID(ST_MakePoint($3,$4),4326))::geography, $6)
        LIMIT 3000`,
      [from.lng, from.lat, to.lng, to.lat, [a, b], buffer]);
    if (!poles.length) {
      return reply.code(422).send({
        code: 'NO_POLES', ...theory,
        error: `No hay postes entre ${from.name} y ${to.name}. El cable debe trazarse a mano.`,
      });
    }
    // Si el origen/destino está sobre un poste (< 3 m), ese poste es el mismo punto
    const usable = poles.filter(p => haversine(p, from) > 3 && haversine(p, to) > 3);
    const route = routeThroughPoles(from, to, usable, maxSpan);
    if (!route) {
      return reply.code(422).send({
        code: 'NO_POLES', ...theory,
        error: `No hay una ruta continua de postes (vano máximo ${maxSpan} m) entre ${from.name} y ${to.name}. ` +
          'El cable debe trazarse a mano, o agrega los postes que faltan.',
      });
    }
    const polesUsed = route.nodes.slice(1, -1);
    return {
      length_m: route.length_m,
      // ruta teórica (calles o línea recta) y cuánto más larga es la ruta por postes (para avisar de rodeos)
      ...theory,
      detour_ratio: Math.round((route.length_m / Math.max(theory.reference_m, 1)) * 100) / 100,
      coordinates: route.nodes.map(p => [p.lng, p.lat]),
      poles: polesUsed.map(p => ({ id: p.id, name: p.name })),
    };
  });
}
