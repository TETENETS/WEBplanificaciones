import zlib from 'node:zlib';
import { query } from '../db.js';

const TYPE_INFO = {
  NODO: { folder: 'Nodos principales', color: 'ff7a1f6d', scale: 1.3 },
  CEO: { folder: 'Cajas de empalme (CEO)', color: 'ffa16903', scale: 1.1 },
  CTO: { folder: 'Cajas NAP (CTO)', color: 'ff3d8015', scale: 1.0 },
  POSTE: { folder: 'Postes', color: 'ff4e5357', scale: 0.6 },
  CAMARA: { folder: 'Cámaras', color: 'ff0762a1', scale: 0.8 },
  CLIENTE: { folder: 'Clientes', color: 'ffe36f0f', scale: 0.7 },
};

const esc = s => String(s ?? '').replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));

function extendedData(obj) {
  const entries = Object.entries(obj).filter(([, v]) => v !== null && v !== undefined && v !== '' && typeof v !== 'object');
  if (!entries.length) return '';
  return `<ExtendedData>${entries.map(([k, v]) => `<Data name="${esc(k)}"><value>${esc(v)}</value></Data>`).join('')}</ExtendedData>`;
}

export async function buildKml() {
  const [els, cabs] = await Promise.all([
    query(`SELECT id, type, name, status, properties, ST_X(geom) AS lng, ST_Y(geom) AS lat FROM elements ORDER BY type, name`),
    query(`SELECT id, name, fiber_count, ST_Length(geom::geography) AS length_m, ST_AsGeoJSON(geom)::json AS g FROM cables ORDER BY name`),
  ]);
  const styles = Object.entries(TYPE_INFO).map(([t, s]) => `
    <Style id="t-${t}"><IconStyle><color>${s.color}</color><scale>${s.scale}</scale>
      <Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon></IconStyle></Style>`).join('')
    + `<Style id="cable"><LineStyle><color>ffe9a50e</color><width>3</width></LineStyle></Style>
       <Style id="cable-troncal"><LineStyle><color>ffd84e1d</color><width>5</width></LineStyle></Style>`;

  const folders = Object.entries(TYPE_INFO).map(([t, s]) => {
    const marks = els.rows.filter(e => e.type === t).map(e => `
      <Placemark><name>${esc(e.name)}</name><styleUrl>#t-${t}</styleUrl>
        ${extendedData({ tipo: t, estado: e.status, ...e.properties })}
        <Point><coordinates>${e.lng},${e.lat},0</coordinates></Point></Placemark>`).join('');
    return marks ? `<Folder><name>${esc(s.folder)}</name>${marks}</Folder>` : '';
  }).join('');

  const cables = cabs.rows.map(c => `
      <Placemark><name>${esc(c.name)}</name><styleUrl>#${c.fiber_count >= 48 ? 'cable-troncal' : 'cable'}</styleUrl>
        ${extendedData({ hilos: c.fiber_count, longitud_m: Math.round(c.length_m) })}
        <LineString><tessellate>1</tessellate><coordinates>${c.g.coordinates.map(([x, y]) => `${x},${y},0`).join(' ')}</coordinates></LineString>
      </Placemark>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Red FTTx</name>${styles}
${folders}${cables ? `<Folder><name>Cables</name>${cables}</Folder>` : ''}
</Document></kml>`;
}

// ---- ZIP mínimo (para KMZ) ----
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function zipSingle(filename, content) {
  const data = Buffer.from(content);
  const comp = zlib.deflateRawSync(data);
  const name = Buffer.from(filename);
  const crc = crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6);
  local.writeUInt16LE(8, 8); local.writeUInt32LE(0, 10); local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 8); central.writeUInt16LE(8, 10); central.writeUInt32LE(0, 12);
  central.writeUInt32LE(crc, 16); central.writeUInt32LE(comp.length, 20); central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28); central.writeUInt32LE(0, 30); central.writeUInt32LE(0, 34);
  central.writeUInt32LE(0, 38); central.writeUInt32LE(0, 42);
  const localSize = local.length + name.length + comp.length;
  const centralSize = central.length + name.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6);
  end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(localSize, 16); end.writeUInt16LE(0, 20);
  return Buffer.concat([local, name, comp, central, name, end]);
}

export default async function exportRoutes(app) {
  app.get('/export/map.kml', async (req, reply) => {
    reply.header('Content-Type', 'application/vnd.google-earth.kml+xml; charset=utf-8');
    reply.header('Content-Disposition', 'attachment; filename="red-fttx.kml"');
    return buildKml();
  });

  app.get('/export/map.kmz', async (req, reply) => {
    const kmz = zipSingle('doc.kml', await buildKml());
    reply.header('Content-Type', 'application/vnd.google-earth.kmz');
    reply.header('Content-Disposition', 'attachment; filename="red-fttx.kmz"');
    return reply.send(kmz);
  });

  // Configuración pública para el frontend (claves de mapas, etc.)
  app.get('/config', async () => ({
    googleMapsKey: process.env.GOOGLE_MAPS_API_KEY || null,
    mapCenter: process.env.MAP_CENTER ? process.env.MAP_CENTER.split(",").map(Number) : null,
  }));
}
