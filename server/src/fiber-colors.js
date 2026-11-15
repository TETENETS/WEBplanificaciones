// Código de colores TIA-598 (12 colores) usado para hilos y tubos
export const TIA_598 = [
  { name: 'azul', hex: '#1f5fd6' },
  { name: 'naranja', hex: '#f28c1b' },
  { name: 'verde', hex: '#1f9d3a' },
  { name: 'marrón', hex: '#7a4a24' },
  { name: 'gris', hex: '#8c8c8c' },
  { name: 'blanco', hex: '#f4f4f4' },
  { name: 'rojo', hex: '#d62828' },
  { name: 'negro', hex: '#151515' },
  { name: 'amarillo', hex: '#f2d21b' },
  { name: 'violeta', hex: '#7b3fb8' },
  { name: 'rosa', hex: '#f08fb5' },
  { name: 'aguamarina', hex: '#2ec4c4' },
];

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
