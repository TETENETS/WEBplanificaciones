import type { ElementType, NetElement } from './api';

export const TYPE_STYLE: Record<ElementType, { color: string; label: string; radius: number; prefix: string }> = {
  NODO: { color: '#6d28d9', label: 'Nodo principal', radius: 11, prefix: 'NODO' },
  CEO: { color: '#0369a1', label: 'Caja de empalme (CEO)', radius: 8, prefix: 'CEO' },
  CTO: { color: '#15803d', label: 'Caja NAP (CTO)', radius: 7, prefix: 'NAP' },
  POSTE: { color: '#57534e', label: 'Poste', radius: 4, prefix: 'P' },
  CAMARA: { color: '#a16207', label: 'Cámara', radius: 5, prefix: 'CAM' },
  CLIENTE: { color: '#c2410c', label: 'Cliente', radius: 5, prefix: 'CLI' },
};

/** Color para elementos con el diagrama lógico vacío */
export const NO_DATA_COLOR = '#a8a29e';

/** Elementos que tienen diagrama interno */
export const HAS_DIAGRAM: ElementType[] = ['NODO', 'CEO', 'CTO', 'CLIENTE'];

export const STATUSES: { value: string; label: string }[] = [
  { value: 'proyecto', label: 'En proyecto' },
  { value: 'no_implantado', label: 'No implantado' },
  { value: 'implantado', label: 'Implantado' },
  { value: 'certificado', label: 'Certificado' },
];

export interface Field {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'select' | 'textarea';
  options?: string[];
  placeholder?: string;
}

/** Datos de conexión / ficha técnica que se piden al crear cada tipo de elemento */
export const FIELDS: Record<ElementType, Field[]> = {
  NODO: [
    { key: 'direccion', label: 'Dirección' },
    { key: 'responsable', label: 'Responsable / contacto' },
    { key: 'olt_modelo', label: 'Marca / modelo OLT' },
    { key: 'olt_ip', label: 'IP de gestión OLT', placeholder: '10.0.0.2' },
    { key: 'olt_puertos_pon', label: 'Puertos PON', type: 'number' },
    { key: 'clase_pon', label: 'Tecnología', type: 'select', options: ['GPON B+', 'GPON C+', 'XGS-PON', 'EPON'] },
    { key: 'observaciones', label: 'Observaciones', type: 'textarea' },
  ],
  CEO: [
    { key: 'modelo', label: 'Marca / modelo' },
    { key: 'capacidad_fusiones', label: 'Capacidad de fusiones', type: 'number' },
    { key: 'bandejas', label: 'Bandejas', type: 'number' },
    { key: 'nivel', label: 'Nivel', type: 'select', options: ['1', '2', '3'] },
    { key: 'reserva_m', label: 'Reserva técnica (m)', type: 'number' },
    { key: 'direccion', label: 'Dirección' },
    { key: 'observaciones', label: 'Observaciones', type: 'textarea' },
  ],
  CTO: [
    { key: 'codigo', label: 'Código NAP' },
    { key: 'capacidad', label: 'Puertos de cliente', type: 'select', options: ['4', '8', '16', '32'] },
    { key: 'splitter', label: 'Splitter', type: 'select', options: ['1:4', '1:8', '1:16', '1:32'] },
    { key: 'olt_puerto', label: 'Puerto PON (OLT / slot / puerto)', placeholder: 'OLT-01 / 1 / 3' },
    { key: 'potencia_dbm', label: 'Potencia medida (dBm)', type: 'number' },
    { key: 'direccion', label: 'Dirección' },
    { key: 'observaciones', label: 'Observaciones', type: 'textarea' },
  ],
  POSTE: [
    { key: 'tipo', label: 'Tipo', type: 'select', options: ['Aéreo', 'Común', 'Subterráneo'] },
    { key: 'material', label: 'Material', type: 'select', options: ['concreto', 'madera', 'metal', 'fibra de vidrio'] },
    { key: 'altura_m', label: 'Altura (m)', type: 'number' },
    { key: 'propietario', label: 'Propietario' },
    { key: 'licencia', label: 'Licencia', type: 'select', options: ['Desconocida', 'En análisis', 'Licenciado'] },
  ],
  CAMARA: [
    { key: 'codigo', label: 'Código' },
    { key: 'tipo', label: 'Tipo' },
    { key: 'dimensiones', label: 'Dimensiones' },
  ],
  CLIENTE: [
    { key: 'documento', label: 'Documento / código CRM' },
    { key: 'direccion', label: 'Dirección' },
    { key: 'telefono', label: 'Teléfono' },
    { key: 'plan', label: 'Plan' },
    { key: 'serial_onu', label: 'Serial ONU' },
    { key: 'equipo', label: 'Equipo receptor', type: 'select', options: ['ONU', 'ROUTER', 'TRANSCEPTOR'] },
  ],
};

/** Elementos con diagrama lógico vacío (sin equipos, splitters ni conexiones) */
export function isEmptyDiagram(el: Pick<NetElement, 'type' | 'diagram_items'>): boolean {
  return HAS_DIAGRAM.includes(el.type) && !el.diagram_items;
}

export function elementColor(el: NetElement): string {
  return isEmptyDiagram(el) ? NO_DATA_COLOR : TYPE_STYLE[el.type]?.color ?? '#334155';
}
