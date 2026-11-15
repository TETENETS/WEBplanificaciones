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
