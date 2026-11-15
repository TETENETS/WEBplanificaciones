// Código de colores TIA/EIA-598 (12 colores) usado para hilos, tubos, patas de splitter y puertos PON.
// Posiciones 13–24 repiten el color con franja negra (negro con franja amarilla).
export const TIA_598 = [
  { name: 'azul', hex: '#1f3f99' },
  { name: 'anaranjado', hex: '#f47b20' },
  { name: 'verde', hex: '#00834a' },
  { name: 'café', hex: '#6b3a0a' },
  { name: 'gris', hex: '#6f6f6f' },
  { name: 'blanco', hex: '#ffffff' },
  { name: 'rojo', hex: '#b5121b' },
  { name: 'negro', hex: '#000000' },
  { name: 'amarillo', hex: '#fff200' },
  { name: 'violeta', hex: '#5f3f97' },
  { name: 'rosa', hex: '#f6c3c8' },
  { name: 'aqua', hex: '#00b4d0' },
];

/** Nombre TIA-598 de la posición n (1-based), con franja a partir de 13 */
export function tiaName(n) {
  const i = (n - 1) % 24;
  const base = TIA_598[i % 12].name;
  return i < 12 ? base : `${base} con franja ${base === 'negro' ? 'amarilla' : 'negra'}`;
}

/** Devuelve tubo y colores para el hilo n (1-based) */
export function fiberColor(n, fibersPerTube = 12) {
  const idxInTube = (n - 1) % fibersPerTube;
  const tube = Math.floor((n - 1) / fibersPerTube) + 1;
  return {
    tube,
    color: TIA_598[idxInTube % 12].hex,
    tube_color: TIA_598[(tube - 1) % 12].hex,
  };
}
