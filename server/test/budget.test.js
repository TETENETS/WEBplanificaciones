import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linkBudget } from '../src/budget.js';
import { fiberColor } from '../src/fiber-colors.js';

test('presupuesto GPON típico 1:8 + 1:8 a 5 km', () => {
  const r = linkBudget({ lengthKm: 5, fusions: 6, connectors: 4, splitters: [8, 8] });
  assert.equal(r.breakdown.splitters, 21);
  assert.equal(r.totalLossDb, 28.35);
  assert.equal(r.ok, true);
});

test('colores TIA-598 por tubo', () => {
  assert.deepEqual(fiberColor(13, 12).tube, 2);
  assert.equal(fiberColor(1).color, '#1f5fd6');
});
