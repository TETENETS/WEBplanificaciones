/**
 * Código de colores TIA/EIA-598 para hilos, tubos, patas de splitter y puertos PON.
 * Posiciones 1–12: color sólido. 13–24: mismo color con franja negra
 * (la posición 20, negro, lleva franja amarilla). Más allá de 24 se repite el ciclo.
 */
export const TIA_598 = [
  { name: 'Azul', hex: '#1f3f99' },
  { name: 'Anaranjado', hex: '#f47b20' },
  { name: 'Verde', hex: '#00834a' },
  { name: 'Café', hex: '#6b3a0a' },
  { name: 'Gris', hex: '#6f6f6f' },
  { name: 'Blanco', hex: '#ffffff' },
  { name: 'Rojo', hex: '#b5121b' },
  { name: 'Negro', hex: '#000000' },
  { name: 'Amarillo', hex: '#fff200' },
  { name: 'Violeta', hex: '#5f3f97' },
  { name: 'Rosa', hex: '#f6c3c8' },
  { name: 'Aqua', hex: '#00b4d0' },
] as const;

export interface TiaColor {
  hex: string;
  name: string;
  /** Color de la franja (posiciones 13–24), o null si es sólido */
  stripe: string | null;
  label: string;
}

/** Color TIA-598 de la posición n (1-based) */
export function tiaColor(n: number): TiaColor {
  const i = (((n - 1) % 24) + 24) % 24;
  const base = TIA_598[i % 12];
  if (i < 12) return { hex: base.hex, name: base.name, stripe: null, label: base.name };
  const stripe = base.name === 'Negro' ? '#fff200' : '#000000';
  return { hex: base.hex, name: base.name, stripe, label: `${base.name} con franja ${base.name === 'Negro' ? 'amarilla' : 'negra'}` };
}

/** Color del hilo según su posición dentro del tubo */
export function fiberTia(number: number, fibersPerTube = 12): TiaColor {
  return tiaColor(((number - 1) % fibersPerTube) + 1);
}
