export type ElementType = 'NODO' | 'CEO' | 'CTO' | 'POSTE' | 'CAMARA' | 'CLIENTE';
export type ElementStatus = 'proyecto' | 'no_implantado' | 'implantado' | 'certificado';

export interface NetElement {
  id: number;
  type: ElementType;
  name: string;
  status: ElementStatus | string;
  properties: Record<string, string>;
  lat: number;
  lng: number;
}

export interface Cable {
  id: number;
  name: string;
  fiber_count: number;
  from_element_id: number | null;
  to_element_id: number | null;
  length_m: number;
  properties: Record<string, unknown>;
  coordinates: [number, number][]; // [lng, lat]
}

export interface Fiber {
  id: number;
  cable_id: number;
  number: number;
  tube: number;
  color: string;
  tube_color: string;
  status: string;
}

export interface DiagramCable {
  id: number;
  name: string;
  fiber_count: number;
  direction: 'in' | 'out';
  remote_name: string | null;
  fibers: Fiber[];
}

export interface Splitter {
  id: number;
  name: string;
  ratio: number;
  level: number;
  allows_client: boolean;
  x: number;
  y: number;
}

export type EquipmentKind = 'OLT' | 'ODF' | 'ONU' | 'ROUTER' | 'TRANSCEPTOR';
export interface Equipment {
  id: number;
  kind: EquipmentKind;
  name: string;
  slots: number;
  ports: number;
  properties: Record<string, string | number>;
  x: number;
  y: number;
}

export type EndKind = 'fiber' | 'splitter_in' | 'splitter_out' | 'equipment';

export interface Connection {
  id: number;
  a_kind: EndKind; a_id: number; a_port: number;
  b_kind: EndKind; b_id: number; b_port: number;
  kind: 'fusion' | 'conector';
}

export interface Diagram {
  element: { id: number; type: ElementType; name: string; status: string; properties: Record<string, string> };
  cables: DiagramCable[];
  splitters: Splitter[];
  equipment: Equipment[];
  connections: Connection[];
  /** potencia (dBm) que llega a cada extremo iluminado; clave: fiber:id, spl_in:id, spl_out:id:p, eq:id:p */
  signal: Record<string, number | null>;
}

export interface KeyPoint {
  type: 'splitter' | 'receptor' | 'olt';
  name: string;
  kind?: string;
  ratio?: number;
  port?: number;
  power: number | null;
  element_id: number;
  element?: string;
  element_type?: string;
  lat?: number;
  lng?: number;
}

export interface FlashlightResult {
  start: { t: string; id: number; port: number; power: number | null };
  direction: 'down' | 'up';
  ends: Record<string, number | null>;
  connections: number[];
  fibers: number[];
  cables: number[];
  keyPoints: KeyPoint[];
}

export interface AutoRoute {
  length_m: number;
  coordinates: [number, number][];
  poles: { id: number; name: string }[];
}

export interface AppConfig { googleMapsKey: string | null; mapCenter: [number, number] | null }

const BASE = '/api/v1';

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || `HTTP ${res.status}`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

interface FC<P> { features: { geometry: { coordinates: any }; properties: P }[] }

export const api = {
  config: () => req<AppConfig>('GET', '/config'),

  async elements(): Promise<NetElement[]> {
    const fc = await req<FC<NetElement>>('GET', '/elements');
    return fc.features.map(f => ({ ...f.properties, lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }));
  },
  createElement: (e: { type: ElementType; name: string; status?: string; properties?: Record<string, string>; lat: number; lng: number }) =>
    req<NetElement>('POST', '/elements', e),
  updateElement: (id: number, e: Partial<{ name: string; status: string; properties: Record<string, string>; lat: number; lng: number }>) =>
    req<NetElement>('PATCH', `/elements/${id}`, e),
  deleteElement: (id: number) => req<void>('DELETE', `/elements/${id}`),

  async cables(): Promise<Cable[]> {
    const fc = await req<FC<Cable>>('GET', '/cables');
    return fc.features.map(f => ({ ...f.properties, coordinates: f.geometry.coordinates }));
  },
  createCable: (c: { name: string; fiber_count: number; from_element_id: number; to_element_id: number; coordinates: [number, number][]; properties?: Record<string, unknown> }) =>
    req<Cable>('POST', '/cables', c),
  deleteCable: (id: number) => req<void>('DELETE', `/cables/${id}`),
  autoRoute: (from_element_id: number, to_element_id: number, max_span_m: number) =>
    req<AutoRoute>('POST', '/routes/auto', { from_element_id, to_element_id, max_span_m }),
  importPoles: (csv: string) =>
    req<{ inserted: number; skipped: number; errors: { line: number; error: string }[] }>('POST', '/poles/import', { csv, skipDuplicates: true }),

  diagram: (id: number) => req<Diagram>('GET', `/elements/${id}/diagram`),
  addSplitter: (elementId: number, s: { ratio: number; level: number; allows_client: boolean; x: number; y: number }) =>
    req<Splitter>('POST', `/elements/${elementId}/splitters`, s),
  moveSplitter: (id: number, x: number, y: number) => req<Splitter>('PATCH', `/splitters/${id}`, { x, y }),
  deleteSplitter: (id: number) => req<void>('DELETE', `/splitters/${id}`),
  addEquipment: (elementId: number, e: { kind: EquipmentKind; name?: string; slots?: number; ports?: number; properties?: Record<string, string | number>; x: number; y: number }) =>
    req<Equipment>('POST', `/elements/${elementId}/equipment`, e),
  moveEquipment: (id: number, x: number, y: number) => req<Equipment>('PATCH', `/equipment/${id}`, { x, y }),
  deleteEquipment: (id: number) => req<void>('DELETE', `/equipment/${id}`),
  connect: (elementId: number, c: Omit<Connection, 'id' | 'kind'> & { kind?: string }) =>
    req<Connection>('POST', `/elements/${elementId}/connections`, c),
  disconnect: (id: number) => req<void>('DELETE', `/connections/${id}`),

  flashlight: (kind: EndKind, id: number, port: number, direction: 'down' | 'up') =>
    req<FlashlightResult>('GET', `/flashlight?kind=${kind}&id=${id}&port=${port}&direction=${direction}`),
  coverage: (lat: number, lng: number, radius: number) =>
    req<CoverageResult>('GET', `/coverage?lat=${lat}&lng=${lng}&radius=${radius}`),
  budget: (p: BudgetInput) => req<BudgetResult>('POST', '/budget', p),
};

export interface CoverageNap {
  id: number; name: string; lat: number; lng: number; distance_m: number; capacity: number; used: number; free: number;
}
export interface CoverageResult { viable: boolean; best: CoverageNap | null; candidates: CoverageNap[]; radius: number }

export interface BudgetInput {
  lengthKm: number; attenuationDbKm?: number; fusions?: number; connectors?: number;
  splitters?: number[]; marginDb?: number; ponClass?: string;
}
export interface BudgetResult {
  breakdown: Record<string, number>; totalLossDb: number; availableBudgetDb: number;
  estimatedRxDbm: number; ok: boolean; remainingDb: number;
}
