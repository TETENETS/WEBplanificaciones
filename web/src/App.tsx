import { useCallback, useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Polyline, Circle, Popup, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import type { LatLngBoundsExpression } from 'leaflet';
import { api, Cable, CoverageResult, ElementType, NetElement } from './api';
import BoxEditor from './components/BoxEditor';
import BudgetPanel from './components/BudgetPanel';

type Mode =
  | { kind: 'select' }
  | { kind: 'add'; type: ElementType }
  | { kind: 'cable' }
  | { kind: 'coverage' }
  | { kind: 'budget' };

export const TYPE_STYLE: Record<ElementType, { color: string; label: string; radius: number }> = {
  POP: { color: '#6d28d9', label: 'POP', radius: 10 },
  OLT: { color: '#b91c1c', label: 'OLT', radius: 9 },
  CEO: { color: '#0369a1', label: 'Caja de empalme (CEO)', radius: 8 },
  CTO: { color: '#15803d', label: 'Caja terminal / NAP (CTO)', radius: 7 },
  POSTE: { color: '#57534e', label: 'Poste', radius: 4 },
  CAMARA: { color: '#a16207', label: 'Cámara', radius: 5 },
};

const DEFAULT_CENTER: [number, number] = [
  Number(import.meta.env.VITE_MAP_LAT ?? -34.6037),
  Number(import.meta.env.VITE_MAP_LNG ?? -58.3816),
];

function FitToData({ elements }: { elements: NetElement[] }) {
  const map = useMap();
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (done || !elements.length) return;
    const lats = elements.map(e => e.lat);
    const lngs = elements.map(e => e.lng);
    const b: LatLngBoundsExpression = [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]];
    map.fitBounds(b, { padding: [40, 40], maxZoom: 18 });
    setDone(true);
  }, [elements, done, map]);
  return null;
}

function ClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: e => onClick(e.latlng.lat, e.latlng.lng) });
  return null;
}

export default function App() {
  const [elements, setElements] = useState<NetElement[]>([]);
  const [cables, setCables] = useState<Cable[]>([]);
  const [mode, setMode] = useState<Mode>({ kind: 'select' });
  const [error, setError] = useState<string | null>(null);
  const [openBox, setOpenBox] = useState<NetElement | null>(null);
  const [newName, setNewName] = useState('');
  const [fiberCount, setFiberCount] = useState(12);
  const [draft, setDraft] = useState<{ from: NetElement; points: [number, number][] } | null>(null);
  const [radius, setRadius] = useState(150);
  const [coverage, setCoverage] = useState<{ lat: number; lng: number; result: CoverageResult } | null>(null);

  const reload = useCallback(async () => {
    try {
      const [e, c] = await Promise.all([api.elements(), api.cables()]);
      setElements(e);
      setCables(c);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const elementById = useMemo(() => new Map(elements.map(e => [e.id, e])), [elements]);

  const switchMode = (m: Mode) => {
    setMode(m);
    setDraft(null);
    setCoverage(null);
    setNewName('');
  };

  const onMapClick = async (lat: number, lng: number) => {
    try {
      if (mode.kind === 'add') {
        const n = elements.filter(e => e.type === mode.type).length + 1;
        await api.createElement({ type: mode.type, name: newName || `${mode.type}-${n}`, lat, lng });
        setNewName('');
        await reload();
      } else if (mode.kind === 'cable' && draft) {
        setDraft({ ...draft, points: [...draft.points, [lng, lat]] });
      } else if (mode.kind === 'coverage') {
        setCoverage({ lat, lng, result: await api.coverage(lat, lng, radius) });
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onElementClick = async (el: NetElement) => {
    if (mode.kind !== 'cable') return;
    if (!draft) {
      setDraft({ from: el, points: [[el.lng, el.lat]] });
      return;
    }
    if (el.id === draft.from.id) return;
    try {
      await api.createCable({
        name: newName || `C-${draft.from.name}-${el.name}`,
        fiber_count: fiberCount,
        from_element_id: draft.from.id,
        to_element_id: el.id,
        coordinates: [...draft.points, [el.lng, el.lat]],
      });
      setDraft(null);
      setNewName('');
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const remove = async (fn: () => Promise<void>) => {
    try { await fn(); await reload(); } catch (err) { setError((err as Error).message); }
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <h1>FTTx Platform</h1>
        <p className="muted">Documentación y diseño de redes FTTH / PON</p>

        <section>
          <h2>Herramientas</h2>
          <button className={mode.kind === 'select' ? 'active' : ''} onClick={() => switchMode({ kind: 'select' })}>Seleccionar</button>
          <button className={mode.kind === 'cable' ? 'active' : ''} onClick={() => switchMode({ kind: 'cable' })}>Trazar cable</button>
          <button className={mode.kind === 'coverage' ? 'active' : ''} onClick={() => switchMode({ kind: 'coverage' })}>Viabilidad</button>
          <button className={mode.kind === 'budget' ? 'active' : ''} onClick={() => switchMode({ kind: 'budget' })}>Presupuesto óptico</button>
        </section>

        <section>
          <h2>Agregar elemento</h2>
          {(Object.keys(TYPE_STYLE) as ElementType[]).map(t => (
            <button key={t} className={mode.kind === 'add' && mode.type === t ? 'active' : ''}
              onClick={() => switchMode({ kind: 'add', type: t })}>
              <span className="dot" style={{ background: TYPE_STYLE[t].color }} />{TYPE_STYLE[t].label}
            </button>
          ))}
        </section>

        <section className="mode-panel">
          {mode.kind === 'select' && <p>Haz clic en un elemento del mapa para ver sus datos o abrir el diagrama de la caja.</p>}
          {mode.kind === 'add' && (
            <>
              <label>Nombre (opcional)<input value={newName} onChange={e => setNewName(e.target.value)} placeholder={`${mode.type}-…`} /></label>
              <p>Haz clic en el mapa para ubicar el elemento.</p>
            </>
          )}
          {mode.kind === 'cable' && (
            <>
              <label>Nombre (opcional)<input value={newName} onChange={e => setNewName(e.target.value)} /></label>
              <label>Cantidad de hilos
                <select value={fiberCount} onChange={e => setFiberCount(Number(e.target.value))}>
                  {[2, 4, 6, 12, 24, 36, 48, 72, 96, 144].map(n => <option key={n} value={n}>{n} FO</option>)}
                </select>
              </label>
              <p>{draft
                ? `Origen: ${draft.from.name}. Haz clic en el mapa para agregar vértices y en el elemento destino para terminar.`
                : 'Haz clic en el elemento de origen.'}</p>
              {draft && <button onClick={() => setDraft(null)}>Cancelar trazado</button>}
            </>
          )}
          {mode.kind === 'coverage' && (
            <>
              <label>Radio de búsqueda (m)<input type="number" value={radius} onChange={e => setRadius(Number(e.target.value))} /></label>
              <p>Haz clic en la dirección del cliente.</p>
              {coverage && (
                <div className={`result ${coverage.result.viable ? 'ok' : 'bad'}`}>
                  {coverage.result.viable
                    ? <>✔ Viable: <b>{coverage.result.best!.name}</b> a {coverage.result.best!.distance_m} m ({coverage.result.best!.free} puertos libres)</>
                    : <>✘ Sin cobertura con puertos libres en {coverage.result.radius} m</>}
                  <ul>{coverage.result.candidates.map(c => (
                    <li key={c.id}>{c.name}: {c.distance_m} m · {c.used}/{c.capacity} usados</li>
                  ))}</ul>
                </div>
              )}
            </>
          )}
          {mode.kind === 'budget' && <BudgetPanel />}
        </section>

        {error && <div className="error" onClick={() => setError(null)}>{error}</div>}
        <footer className="muted">{elements.length} elementos · {cables.length} cables</footer>
      </aside>

      <main className={`map mode-${mode.kind}`}>
        <MapContainer center={DEFAULT_CENTER} zoom={15} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url={import.meta.env.VITE_TILE_URL ?? 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'}
            maxZoom={20} maxNativeZoom={19}
          />
          <FitToData elements={elements} />
          <ClickHandler onClick={onMapClick} />

          {cables.map(c => (
            <Polyline key={c.id} positions={c.coordinates.map(([lng, lat]) => [lat, lng])}
              pathOptions={{ color: c.fiber_count >= 48 ? '#1d4ed8' : '#0ea5e9', weight: c.fiber_count >= 48 ? 5 : 3 }}>
              <Tooltip sticky>{c.name} · {c.fiber_count} FO · {Math.round(c.length_m)} m</Tooltip>
              {mode.kind === 'select' && (
                <Popup>
                  <b>{c.name}</b><br />{c.fiber_count} hilos · {Math.round(c.length_m)} m<br />
                  {elementById.get(c.from_element_id ?? -1)?.name} → {elementById.get(c.to_element_id ?? -1)?.name}<br />
                  <button className="danger" onClick={() => remove(() => api.deleteCable(c.id))}>Eliminar cable</button>
                </Popup>
              )}
            </Polyline>
          ))}

          {draft && <Polyline positions={draft.points.map(([lng, lat]) => [lat, lng])} pathOptions={{ color: '#f97316', dashArray: '6 6' }} />}

          {elements.map(el => (
            <CircleMarker key={el.id} center={[el.lat, el.lng]} radius={TYPE_STYLE[el.type].radius}
              pathOptions={{ color: '#fff', weight: 2, fillColor: TYPE_STYLE[el.type].color, fillOpacity: 1 }}
              eventHandlers={{ click: e => { e.originalEvent.stopPropagation(); onElementClick(el); } }}
              bubblingMouseEvents={false}>
              <Tooltip direction="top">{el.name}</Tooltip>
              {mode.kind === 'select' && (
                <Popup>
                  <b>{el.name}</b><br />{TYPE_STYLE[el.type].label} · {el.status}<br />
                  <div className="popup-actions">
                    {['CEO', 'CTO', 'POP', 'OLT'].includes(el.type) && <button onClick={() => setOpenBox(el)}>Abrir diagrama</button>}
                    <button className="danger" onClick={() => remove(() => api.deleteElement(el.id))}>Eliminar</button>
                  </div>
                </Popup>
              )}
            </CircleMarker>
          ))}

          {coverage && (
            <>
              <Circle center={[coverage.lat, coverage.lng]} radius={coverage.result.radius}
                pathOptions={{ color: coverage.result.viable ? '#16a34a' : '#dc2626', fillOpacity: 0.08 }} />
              {coverage.result.best && (
                <Polyline positions={[[coverage.lat, coverage.lng], [coverage.result.best.lat, coverage.result.best.lng]]}
                  pathOptions={{ color: '#16a34a', dashArray: '4 4' }} />
              )}
            </>
          )}
        </MapContainer>
      </main>

      {openBox && <BoxEditor element={openBox} onClose={() => setOpenBox(null)} />}
    </div>
  );
}
