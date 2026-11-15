// Lectura de coordenadas en distintos formatos:
//  - decimales:             10.4806, -66.9036   (admite coma decimal: 10,4806)
//  - enlaces de Google Maps: .../@10.4806,-66.9036,17z  ?q=10.48,-66.90  !3d10.48!4d-66.90  ll=  query=
//  - grados/minutos/segundos: 10°28'50.2"N 66°54'13.0"W   (también 10 28 50.2 N, o con signo)

const DMS_ONE = /^\s*([-+]?\d+(?:[.,]\d+)?)\s*[°º:\s]\s*(?:(\d+(?:[.,]\d+)?)\s*['′’:\s]\s*)?(?:(\d+(?:[.,]\d+)?)\s*(?:["″”]|'')?\s*)?([NSEWOnsewo])?\s*$/;
const toNum = s => Number(String(s).replace(',', '.'));

/** Un valor suelto: decimal o DMS. `axis` = 'lat' | 'lng' para validar rangos. */
export function parseCoordValue(raw) {
  if (raw == null) return NaN;
  let s = String(raw).trim();
  if (!s) return NaN;
  // decimal con hemisferio opcional ("10.48 N", "66.9W")
  let m = s.match(/^([-+]?\d+(?:[.,]\d+)?)\s*([NSEWOnsewo])?$/);
  if (m) {
    const v = toNum(m[1]);
    return /[SWOswo]/.test(m[2] || '') ? -Math.abs(v) : v;
  }
  // prefijo de hemisferio: "N 10°28'50"
  const pre = s.match(/^([NSEWOnsewo])\s*(.+)$/);
  if (pre) s = `${pre[2]} ${pre[1]}`;
  m = s.match(DMS_ONE);
  if (!m) return NaN;
  const deg = toNum(m[1]);
  const min = m[2] ? toNum(m[2]) : 0;
  const sec = m[3] ? toNum(m[3]) : 0;
  if (min >= 60 || sec >= 60) return NaN;
  let v = Math.abs(deg) + min / 60 + sec / 3600;
  if (deg < 0 || String(m[1]).startsWith('-') || /[SWOswo]/.test(m[4] || '')) v = -v;
  return Math.round(v * 1e7) / 1e7;
}

/** Un texto con las dos coordenadas: enlace de Google Maps, "lat, lng" o par DMS. */
export function parseCoordPair(raw) {
  if (raw == null) return null;
  const s = decodeURIComponent(String(raw).trim().replace(/\+/g, ' '));
  if (!s) return null;
  const n = '([-+]?\\d+(?:\\.\\d+)?)';
  const patterns = [
    new RegExp(`!3d${n}!4d${n}`),                       // datos del lugar (más precisos)
    new RegExp(`[?&](?:q|query|ll|center|destination|daddr)=${n}\\s*,\\s*${n}`),
    new RegExp(`@${n},${n}`),                           // vista del mapa
    new RegExp(`/place/${n}\\s*,\\s*${n}`),
    new RegExp(`/search/${n}\\s*,\\s*${n}`),
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) return valid(Number(m[1]), Number(m[2]));
  }
  // "lat, lng" / "lat; lng" decimal
  let m = s.match(/^\s*([-+]?\d+(?:\.\d+)?)\s*[,;\s]\s*([-+]?\d+(?:\.\d+)?)\s*$/);
  if (m) return valid(Number(m[1]), Number(m[2]));
  // par DMS: separar por la letra de hemisferio de la latitud o por coma/punto y coma
  m = s.match(/^(.+?[NSns])\s*[,;]?\s*(.+)$/) || s.match(/^(.+?)\s*[,;]\s*(.+)$/);
  if (m) return valid(parseCoordValue(m[1]), parseCoordValue(m[2]));
  return null;
}

function valid(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}
