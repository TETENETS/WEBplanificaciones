export type ElementType = 'POP' | 'OLT' | 'CEO' | 'CTO' | 'POSTE' | 'CAMARA';

export interface NetElement {
  id: number;
  type: ElementType;
  name: string;
  status: string;
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
  x: number;
  y: number;
}

export type EndKind = 'fiber' | 'splitter_in' | 'splitter_out';

export interface Connection {
  id: number;
  a_kind: EndKind; a_id: number; a_port: number;
  b_kind: EndKind; b_id: number; b_port: number;
  kind: 'fusion' | 'conector';
}

export interface Diagram {
  element: { id: number; type: ElementType; name: string };
  cables: DiagramCable[];
  splitters: Splitter[];
  connections: Connection[];
}

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
  async elements(): Promise<NetElement[]> {
    const fc = await req<FC<NetElement>>('GET', '/elements');
    return fc.features.map(f => ({ ...f.properties, lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }));
  },
  createElement: (e: Omit<NetElement, 'id' | 'status'>) => req<NetElement>('POST', '/elements', e),
  deleteElement: (id: number) => req<void>('DELETE', `/elements/${id}`),

  async cables(): Promise<Cable[]> {
    const fc = await req<FC<Cable>>('GET', '/cables');
    return fc.features.map(f => ({ ...f.properties, coordinates: f.geometry.coordinates }));
  },
  createCable: (c: { name: string; fiber_count: number; from_element_id: number; to_element_id: number; coordinates: [number, number][] }) =>
    req<Cable>('POST', '/cables', c),
  deleteCable: (id: number) => req<void>('DELETE', `/cables/${id}`),

  diagram: (id: number) => req<Diagram>('GET', `/elements/${id}/diagram`),
  addSplitter: (elementId: number, s: { ratio: number; level: number; x: number; y: number }) =>
    req<Splitter>('POST', `/elements/${elementId}/splitters`, s),
  moveSplitter: (id: number, x: number, y: number) => req<Splitter>('PATCH', `/splitters/${id}`, { x, y }),
  deleteSplitter: (id: number) => req<void>('DELETE', `/splitters/${id}`),
  connect: (elementId: number, c: Omit<Connection, 'id' | 'kind'> & { kind?: string }) =>
    req<Connection>('POST', `/elements/${elementId}/connections`, c),
  disconnect: (id: number) => req<void>('DELETE', `/connections/${id}`),

  coverage: (lat: number, lng: number, radius: number) =>
    req<CoverageResult>('GET', `/coverage?lat=${lat}&lng=${lng}&radius=${radius}`),
  budget: (p: BudgetInput) => req<BudgetResult>('POST', '/budget', p),
  trace: (fiberId: number) => req<TraceResult>('GET', `/trace/fiber/${fiberId}`),
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
export interface TraceStep { type: string; cable?: string; fiber?: number; color?: string; length_m?: number; element?: string; name?: string; ratio?: number; port?: number }
export interface TraceResult { paths: { steps: TraceStep[]; lengthKm: number; budget: BudgetResult | null }[] }
