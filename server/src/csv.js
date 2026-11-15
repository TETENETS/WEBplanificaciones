// Parser CSV para importar postes, clientes o NAPs (soporta , ; y tabulador, comillas y coma decimal).
// Coordenadas: columnas lat/lng (decimal o grados/minutos/segundos) o una columna con
// enlace de Google Maps / "lat, lng" (coordenadas, ubicacion, link, enlace, url, maps).
import { parseCoordPair, parseCoordValue } from './coords.js';


const NAME_COLS = ['nombre', 'name', 'codigo', 'code', 'id', 'poste', 'cliente', 'nap'];
const PAIR_COLS = ['coordenadas', 'coordenada', 'coords', 'ubicacion', 'link', 'enlace', 'url', 'maps', 'google maps', 'gps'];
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

const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

export function parseCsv(text, { namePrefix = 'P' } = {}) {
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) throw new Error('El CSV está vacío');
  const first = lines[0];
  const sep = first.includes('\t') ? '\t' : first.includes(';') ? ';' : ',';

  let header = splitLine(first, sep).map(norm);
  const hasHeader = header.some(h => LAT_COLS.includes(h) || LNG_COLS.includes(h) || PAIR_COLS.includes(h));
  let start = 1;
  if (!hasHeader) {
    // sin cabecera: nombre, lat, lng
    header = ['nombre', 'lat', 'lng'];
    start = 0;
  }
  const iName = header.findIndex(h => NAME_COLS.includes(h));
  const iLat = header.findIndex(h => LAT_COLS.includes(h));
  const iLng = header.findIndex(h => LNG_COLS.includes(h));
  const iPair = header.findIndex(h => PAIR_COLS.includes(h));
  if ((iLat < 0 || iLng < 0) && iPair < 0) {
    throw new Error('No se encontraron columnas de coordenadas (lat y lng, o coordenadas / enlace de Google Maps)');
  }

  const rows = [];
  const errors = [];
  for (let n = start; n < lines.length; n++) {
    const cells = splitLine(lines[n], sep);
    let lat = iLat >= 0 ? parseCoordValue(cells[iLat]) : NaN;
    let lng = iLng >= 0 ? parseCoordValue(cells[iLng]) : NaN;
    if ((!Number.isFinite(lat) || !Number.isFinite(lng)) && iPair >= 0) {
      const pair = parseCoordPair(cells[iPair]);
      if (pair) ({ lat, lng } = pair);
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      errors.push({ line: n + 1, error: 'Coordenadas inválidas' });
      continue;
    }
    const properties = {};
    header.forEach((h, i) => {
      if (i !== iName && i !== iLat && i !== iLng && i !== iPair && cells[i]) properties[h] = cells[i];
    });
    rows.push({ name: (iName >= 0 && cells[iName]) || `${namePrefix}-${n + (hasHeader ? 0 : 1)}`, lat, lng, properties });
  }
  return { rows, errors, columns: header };
}
