// Presupuesto óptico (Optical Link Budget) para PON
export const SPLITTER_LOSS_DB = { 2: 3.7, 4: 7.3, 8: 10.5, 16: 13.7, 32: 17.1, 64: 20.5 };

export const PON_CLASSES = {
  'GPON B+': { txMin: 1.5, rxSens: -28 },
  'GPON C+': { txMin: 3, rxSens: -32 },
  'XGS-PON N1': { txMin: 2, rxSens: -28 },
};

/**
 * @param {object} p
 * @param {number} p.lengthKm  longitud total de fibra
 * @param {number} [p.attenuationDbKm=0.35]  1310nm≈0.35, 1490nm≈0.25, 1550nm≈0.22
 * @param {number} [p.fusions=0]
 * @param {number} [p.fusionLossDb=0.1]
 * @param {number} [p.connectors=0]
 * @param {number} [p.connectorLossDb=0.5]
 * @param {number[]} [p.splitters=[]]  ratios, p.ej. [8, 8]
 * @param {number} [p.marginDb=3]
 * @param {string} [p.ponClass='GPON B+']
 */
export function linkBudget(p) {
  const att = p.attenuationDbKm ?? 0.35;
  const fiberLoss = (p.lengthKm || 0) * att;
  const fusionLoss = (p.fusions || 0) * (p.fusionLossDb ?? 0.1);
  const connectorLoss = (p.connectors || 0) * (p.connectorLossDb ?? 0.5);
  const splitterLoss = (p.splitters || []).reduce((s, r) => {
    const l = SPLITTER_LOSS_DB[r];
    if (l === undefined) throw new Error(`Relación de splitter no soportada: 1:${r}`);
    return s + l;
  }, 0);
  const margin = p.marginDb ?? 3;
  const total = fiberLoss + fusionLoss + connectorLoss + splitterLoss + margin;
  const cls = PON_CLASSES[p.ponClass || 'GPON B+'];
  if (!cls) throw new Error(`Clase PON desconocida: ${p.ponClass}`);
  const available = cls.txMin - cls.rxSens;
  const rxPower = cls.txMin - (total - margin);
  const r = n => Math.round(n * 100) / 100;
  return {
    breakdown: {
      fiber: r(fiberLoss), fusions: r(fusionLoss), connectors: r(connectorLoss),
      splitters: r(splitterLoss), margin: r(margin),
    },
    totalLossDb: r(total),
    availableBudgetDb: r(available),
    estimatedRxDbm: r(rxPower),
    ok: total <= available,
    remainingDb: r(available - total),
  };
}
