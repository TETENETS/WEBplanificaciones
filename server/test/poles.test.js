import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeThroughPoles } from '../src/routes/poles.js';
import { parseCsv } from '../src/csv.js';

const A = { lat: 0, lng: 0 };
const B = { lat: 0, lng: 0.002 }; // ~222 m

test('ruta por postes encadenados', () => {
  const poles = [{ id: 1, lat: 0, lng: 0.0006 }, { id: 2, lat: 0, lng: 0.0012 }, { id: 3, lat: 0, lng: 0.0017 }];
  const r = routeThroughPoles(A, B, poles, 80);
  assert.deepEqual(r.nodes.slice(1, -1).map(p => p.id), [1, 2, 3]);
});

test('sin postes suficientes no hay ruta (ni salto directo)', () => {
  assert.equal(routeThroughPoles(A, B, [{ id: 1, lat: 0, lng: 0.0006 }], 80), null);
  assert.equal(routeThroughPoles(A, B, [], 1000), null);
});

test('CSV con punto y coma, coma decimal y propiedades extra', () => {
  const r = parseCsv('codigo;latitud;longitud;material\nP1;-34,60;-58,38;madera\nX;;\n');
  assert.equal(r.rows.length, 1);
  assert.deepEqual(r.rows[0], { name: 'P1', lat: -34.6, lng: -58.38, properties: { material: 'madera' } });
  assert.equal(r.errors.length, 1);
});

test('CSV sin cabecera: nombre, lat, lng', () => {
  const r = parseCsv('P1,-34.6,-58.3\nP2,-34.7,-58.4');
  assert.equal(r.rows.length, 2);
});

import { parseCoordPair, parseCoordValue } from '../src/coords.js';

test('coordenadas: enlaces de Google Maps', () => {
  assert.deepEqual(parseCoordPair('https://www.google.com/maps/@10.4806,-66.9036,17z'), { lat: 10.4806, lng: -66.9036 });
  assert.deepEqual(parseCoordPair('https://maps.google.com/?q=10.5,-66.91'), { lat: 10.5, lng: -66.91 });
  assert.deepEqual(
    parseCoordPair('https://www.google.com/maps/place/Plaza/@10.49,-66.88,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d10.4912!4d-66.8811'),
    { lat: 10.4912, lng: -66.8811 });
  assert.deepEqual(parseCoordPair('10.4806, -66.9036'), { lat: 10.4806, lng: -66.9036 });
});

test('coordenadas: grados, minutos y segundos', () => {
  assert.equal(parseCoordValue(`10°28'50.2"N`), 10.4806111);
  assert.equal(parseCoordValue(`66°54'13.0"W`), -66.9036111);
  assert.equal(parseCoordValue('66 54 13 O'), -66.9036111);
  assert.equal(parseCoordValue('-34,6'), -34.6);
  assert.deepEqual(parseCoordPair(`10°28'50.2"N 66°54'13.0"W`), { lat: 10.4806111, lng: -66.9036111 });
});

test('CSV con columna de enlace de Google Maps y DMS', () => {
  const r = parseCsv('nombre;ubicacion\nC1;https://www.google.com/maps/@10.48,-66.90,17z\nC2;10°28\'50.2"N 66°54\'13.0"W\nC3;nada', { namePrefix: 'CLI' });
  assert.equal(r.rows.length, 2);
  assert.equal(r.rows[1].lng, -66.9036111);
  assert.equal(r.errors.length, 1);
});
