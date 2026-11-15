// Parser CSV sencillo para listas de postes (soporta , ; y tabulador, comillas y coma decimal).

const NAME_COLS = ['nombre', 'name', 'codigo', 'código', 'code', 'id', 'poste'];
const LAT_COLS = ['lat', 'latitud', 'latitude', 'y'];
const LNG_COLS = ['lng', 'lon', 'long', 'longitud', 'longitude', 'x'];

function splitLine(line, sep) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

const num = s => (s == null || String(s).trim() === '' ? NaN : Number(String(s).trim().replace(',', '.')));
const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

export function parseCsv(text) {
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) throw new Error('El CSV está vacío');
  const first = lines[0];
  const sep = first.includes('\t') ? '\t' : first.includes(';') ? ';' : ',';

  let header = splitLine(first, sep).map(norm);
  const hasHeader = header.some(h => LAT_COLS.includes(h) || LNG_COLS.includes(h));
  let start = 1;
  if (!hasHeader) {
    // sin cabecera: nombre, lat, lng
    header = ['nombre', 'lat', 'lng'];
    start = 0;
  }
  const iName = header.findIndex(h => NAME_COLS.includes(h));
  const iLat = header.findIndex(h => LAT_COLS.includes(h));
  const iLng = header.findIndex(h => LNG_COLS.includes(h));
  if (iLat < 0 || iLng < 0) throw new Error('No se encontraron columnas de latitud y longitud (lat, lng)');

  const rows = [];
  const errors = [];
  for (let n = start; n < lines.length; n++) {
    const cells = splitLine(lines[n], sep);
    const lat = num(cells[iLat]);
    const lng = num(cells[iLng]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      errors.push({ line: n + 1, error: 'Coordenadas inválidas' });
      continue;
    }
    const properties = {};
    header.forEach((h, i) => {
      if (i !== iName && i !== iLat && i !== iLng && cells[i]) properties[h] = cells[i];
    });
    rows.push({ name: (iName >= 0 && cells[iName]) || `P-${n + (hasHeader ? 0 : 1)}`, lat, lng, properties });
  }
  return { rows, errors, columns: header };
}
