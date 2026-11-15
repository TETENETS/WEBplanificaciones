import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, CircleMarker, Polyline, Circle, Popup, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import type { LatLngBoundsExpression } from 'leaflet';
import { api, AppConfig, AutoRoute, Cable, CoverageResult, ElementType, FlashlightResult, NetElement } from './api';
import { HAS_DIAGRAM, STATUSES, TYPE_STYLE, elementColor, isEmptyDiagram } from './elementTypes';
import BoxEditor from './components/BoxEditor';
import BudgetPanel from './components/BudgetPanel';
import ElementForm, { ElementFormValue } from './components/ElementForm';
import BaseLayers from './components/BaseLayers';

type Mode =
  | { kind: 'select' }
  | { kind: 'add'; type: ElementType }
  | { kind: 'cable' }
  | { kind: 'coverage' }
  | { kind: 'budget' }
  | { kind: 'poles' }
  | { kind: 'flashlight' };

const DEFAULT_CENTER: [number, number] = [
  Number(import.meta.env.VITE_MAP_LAT ?? -34.6037),
  Number(import.meta.env.VITE_MAP_LNG ?? -58.3816),
];
const SNAP_TO_POLE_M = 15;

function distM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 +
    Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.sqrt(h));
}

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

function download(path: string) {
  const a = document.createElement('a');
  a.href = path;
  a.click();
}

export default function App() {
  const [config, setConfig] = useState<AppConfig>({ googleMapsKey: null, mapCenter: null });
  const [elements, setElements] = useState<NetElement[]>([]);
  const [cables, setCables] = useState<Cable[]>([]);
  const [mode, setMode] = useState<Mode>({ kind: 'select' });
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [openBox, setOpenBox] = useState<NetElement | null>(null);
  const [fiberCount, setFiberCount] = useState(12);
  const [cableName, setCableName] = useState('');
  const [autoRoute, setAutoRoute] = useState(true);
  const [maxSpan, setMaxSpan] = useState(80);
  const [draft, setDraft] = useState<{ from: NetElement; points: [number, number][] } | null>(null);
  const [routePreview, setRoutePreview] = useState<{ from: NetElement; to: NetElement; route: AutoRoute } | null>(null);
  const [noPoles, setNoPoles] = useState<{ from: NetElement; to: NetElement; message: string } | null>(null);
  const [detourLimit, setDetourLimit] = useState(1.4);
  // línea guía (recta A→B) que queda visible mientras se agregan postes
  const [guide, setGuide] = useState<[[number, number], [number, number]] | null>(null);
  const [radius, setRadius] = useState(150);
  const [coverage, setCoverage] = useState<{ lat: number; lng: number; result: CoverageResult } | null>(null);
  const [editing, setEditing] = useState<NetElement | null>(null);
  const [flash, setFlash] = useState<FlashlightResult | null>(null);
  const [showPoles, setShowPoles] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

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
  useEffect(() => {
    reload();
    api.config().then(setConfig).catch(() => {});
  }, [reload]);

  const elementById = useMemo(() => new Map(elements.map(e => [e.id, e])), [elements]);
  const poles = useMemo(() => elements.filter(e => e.type === 'POSTE'), [elements]);
  const litCables = useMemo(() => new Set(flash?.cables ?? []), [flash]);

  const fail = (err: unknown) => setError((err as Error).message);

  const switchMode = (m: Mode) => {
    setMode(m);
    setDraft(null);
    setRoutePreview(null);
    setNoPoles(null);
    setCoverage(null);
    setInfo(null);
    if (m.kind !== 'flashlight') setFlash(null);
    setGuide(null);
  };

  const onMapClick = async (lat: number, lng: number) => {
    try {
      if (mode.kind === 'add') {
        // las cajas se ubican sobre el poste más cercano
        let pole: NetElement | undefined;
        if (mode.type !== 'POSTE') {
          pole = poles
            .map(p => ({ p, d: distM(p, { lat, lng }) }))
            .filter(x => x.d <= SNAP_TO_POLE_M)
            .sort((a, b) => a.d - b.d)[0]?.p;
        }
        await createElementAt(mode.type, pole?.lat ?? lat, pole?.lng ?? lng, pole);
      } else if (mode.kind === 'cable' && draft && !autoRoute) {
        setDraft({ ...draft, points: [...draft.points, [lng, lat]] });
      } else if (mode.kind === 'coverage') {
        setCoverage({ lat, lng, result: await api.coverage(lat, lng, radius) });
      }
    } catch (err) {
      fail(err);
    }
  };

  // Crea el elemento y, si tiene diagrama lógico, lo abre de inmediato para rellenarlo.
  const createElementAt = async (type: ElementType, lat: number, lng: number, pole?: NetElement) => {
    const n = elements.filter(e => e.type === type).length + 1;
    const el = await api.createElement({
      type, lat, lng, status: 'proyecto',
      name: `${TYPE_STYLE[type].prefix}-${String(n).padStart(2, '0')}`,
      properties: pole ? { poste: pole.name } : {},
    });
    await reload();
    if (HAS_DIAGRAM.includes(type)) setOpenBox({ ...el, diagram_items: 0 });
  };

  const saveEdit = async (v: ElementFormValue) => {
    if (!editing) return;
    try {
      const upd = await api.updateElement(editing.id, { name: v.name, status: v.status, properties: v.properties });
      if (openBox?.id === upd.id) setOpenBox({ ...openBox, ...upd });
      setEditing(null);
      await reload();
    } catch (err) {
      fail(err);
    }
  };

  const onElementClick = async (el: NetElement) => {
    if (mode.kind !== 'cable') return;
    if (!draft) {
      setRoutePreview(null);
      setDraft({ from: el, points: [[el.lng, el.lat]] });
      return;
    }
    if (el.id === draft.from.id) return;
    try {
      if (autoRoute) {
        const from = draft.from;
        setDraft(null);
        try {
          const route = await api.autoRoute(from.id, el.id, maxSpan);
          setRoutePreview({ from, to: el, route });
        } catch (e) {
          if ((e as { code?: string }).code === 'NO_POLES') setNoPoles({ from, to: el, message: (e as Error).message });
          else throw e;
        }
        return;
      }
      await api.createCable({
        name: cableName || `C-${draft.from.name}-${el.name}`,
        fiber_count: fiberCount,
        from_element_id: draft.from.id,
        to_element_id: el.id,
        coordinates: [...draft.points, [el.lng, el.lat]],
      });
      setDraft(null);
      setCableName('');
      await reload();
    } catch (err) {
      setDraft(null);
      fail(err);
    }
  };

  const confirmRoute = async () => {
    if (!routePreview) return;
    const { from, to, route } = routePreview;
    try {
      await api.createCable({
        name: cableName || `C-${from.name}-${to.name}`,
        fiber_count: fiberCount,
        from_element_id: from.id,
        to_element_id: to.id,
        coordinates: route.coordinates,
        properties: { postes: route.poles.map(p => p.name), trazado: 'automatico' },
      });
      setRoutePreview(null);
      setCableName('');
      await reload();
    } catch (err) {
      fail(err);
    }
  };

  // Pasa a trazado manual conservando el origen
  const traceByHand = (from: NetElement) => {
    setRoutePreview(null);
    setNoPoles(null);
    setAutoRoute(false);
    setDraft({ from, points: [[from.lng, from.lat]] });
  };

  // Cancela y deja el modo "agregar poste" con una guía recta entre A y B
  const addPolesInstead = (from: NetElement, to: NetElement) => {
    switchMode({ kind: 'add', type: 'POSTE' });
    setGuide([[from.lat, from.lng], [to.lat, to.lng]]);
    setInfo(`Agrega los postes que faltan entre ${from.name} y ${to.name} (guía punteada) y vuelve a trazar el cable.`);
  };

  const importCsv = async (file: File) => {
    try {
      const r = await api.importPoles(await file.text());
      setInfo(`Postes importados: ${r.inserted}. Omitidos (ya existían): ${r.skipped}.` +
        (r.errors.length ? ` Filas con error: ${r.errors.map(e => e.line).join(', ')}.` : ''));
      await reload();
    } catch (err) {
      fail(err);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const remove = async (fn: () => Promise<void>) => {
    try { await fn(); await reload(); } catch (err) { fail(err); }
  };

  const openDiagram = (el: NetElement) => {
    if (HAS_DIAGRAM.includes(el.type)) setOpenBox(el);
  };

  const showFlashOnMap = (r: FlashlightResult) => {
    setOpenBox(null);
    setMode({ kind: 'flashlight' });
    setFlash(r);
  };

  const elementsToDraw = showPoles ? elements : elements.filter(e => e.type !== 'POSTE');
  const statusLabel = (s: string) => STATUSES.find(x => x.value === s)?.label ?? s;

  return (
    <div className="app">
      <aside className="sidebar">
        <h1>FTTx Platform</h1>
        <p className="muted">Documentación y diseño de redes FTTH / PON</p>

        <section>
          <h2>Herramientas</h2>
          <button className={mode.kind === 'select' ? 'active' : ''} onClick={() => switchMode({ kind: 'select' })}>Seleccionar</button>
          <button className={mode.kind === 'cable' ? 'active' : ''} onClick={() => switchMode({ kind: 'cable' })}>Trazar cable</button>
          <button className={mode.kind === 'flashlight' ? 'active' : ''} onClick={() => switchMode({ kind: 'flashlight' })}>🔦 Linterna</button>
          <button className={mode.kind === 'coverage' ? 'active' : ''} onClick={() => switchMode({ kind: 'coverage' })}>Viabilidad</button>
          <button className={mode.kind === 'budget' ? 'active' : ''} onClick={() => switchMode({ kind: 'budget' })}>Presupuesto óptico</button>
          <button className={mode.kind === 'poles' ? 'active' : ''} onClick={() => switchMode({ kind: 'poles' })}>Postes e importación</button>
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
          {mode.kind === 'select' && (
            <p>Clic en un elemento para ver sus datos. <b>Doble clic</b> abre su diagrama.
              Los elementos en <span className="grey-chip">gris</span> tienen el diagrama lógico vacío.</p>
          )}
          {mode.kind === 'add' && (
            <p>Haz clic en el mapa para ubicar el elemento.{HAS_DIAGRAM.includes(mode.type) && ' Se abrirá su diagrama lógico para rellenarlo; mientras esté vacío se verá en gris.'}
              {mode.type !== 'POSTE' && ` Si haces clic a menos de ${SNAP_TO_POLE_M} m de un poste, se ubica sobre el poste.`}</p>
          )}
          {mode.kind === 'cable' && (
            <>
              <label>Nombre (opcional)<input value={cableName} onChange={e => setCableName(e.target.value)} /></label>
              <label>Cantidad de hilos
                <select value={fiberCount} onChange={e => setFiberCount(Number(e.target.value))}>
                  {[1, 2, 4, 6, 12, 24, 36, 48, 72, 96, 144].map(n => <option key={n} value={n}>{n} FO</option>)}
                </select>
              </label>
              <label className="check">
                <input type="checkbox" checked={autoRoute} onChange={e => { setAutoRoute(e.target.checked); setDraft(null); setRoutePreview(null); }} />
                Trazado automático por postes
              </label>
              {autoRoute && (
                <label>Vano máximo entre postes (m)
                  <input type="number" min={5} value={maxSpan} onChange={e => setMaxSpan(Number(e.target.value))} />
                </label>
              )}
              {autoRoute && (
                <label>Avisar si la ruta por postes es más larga que la directa (×)
                  <input type="number" min={1} step={0.1} value={detourLimit} onChange={e => setDetourLimit(Number(e.target.value))} />
                </label>
              )}
              {noPoles ? (
                <div className="result warn">
                  ⚠ {noPoles.message}
                  <div className="row">
                    <button className="primary" onClick={() => traceByHand(noPoles.from)}>Trazar a mano</button>
                    <button onClick={() => addPolesInstead(noPoles.from, noPoles.to)}>Agregar postes</button>
                    <button onClick={() => setNoPoles(null)}>Cancelar</button>
                  </div>
                </div>
              ) : routePreview && routePreview.route.detour_ratio > detourLimit ? (
                <div className="result warn">
                  ⚠ La ruta por postes ({routePreview.from.name} → {routePreview.to.name}) mide
                  <b> {Math.round(routePreview.route.length_m)} m</b>, {routePreview.route.detour_ratio}× la distancia directa
                  ({Math.round(routePreview.route.straight_m)} m). Los postes registrados podrían estar rodeando una calle
                  más directa.
                  <div className="row">
                    <button className="primary" onClick={confirmRoute}>Trazar por postes</button>
                    <button onClick={() => addPolesInstead(routePreview.from, routePreview.to)}>Cancelar y agregar postes</button>
                    <button onClick={() => traceByHand(routePreview.from)}>Trazar a mano</button>
                  </div>
                </div>
              ) : routePreview ? (
                <div className="result ok">
                  Ruta por <b>{routePreview.route.poles.length} postes</b>, {Math.round(routePreview.route.length_m)} m
                  ({routePreview.from.name} → {routePreview.to.name}).
                  <div className="row">
                    <button className="primary" onClick={confirmRoute}>Crear cable</button>
                    <button onClick={() => setRoutePreview(null)}>Cancelar</button>
                  </div>
                </div>
              ) : (
                <p>{draft
                  ? autoRoute
                    ? `Origen: ${draft.from.name}. Haz clic en el elemento de destino.`
                    : `Origen: ${draft.from.name}. Haz clic en el mapa para agregar vértices y en el elemento destino para terminar.`
                  : 'Haz clic en el elemento de origen.'}
                  {autoRoute && ' El sistema busca la ruta más corta por postes; si no hay postes, te pedirá trazarlo a mano.'}</p>
              )}
              {draft && <button onClick={() => setDraft(null)}>Cancelar trazado</button>}
            </>
          )}
          {mode.kind === 'flashlight' && (
            flash ? (
              <div className="flash-panel">
                <p><b>{flash.direction === 'down' ? 'Hacia los clientes' : 'Hacia el nodo'}</b> ·
                  {' '}{flash.cables.length} cables iluminados</p>
                <ol>
                  {flash.keyPoints.map((k, i) => (
                    <li key={i} className={`kp kp-${k.type}`}>
                      {k.type === 'splitter' && <>Splitter <b>{k.name}</b> 1:{k.ratio}</>}
                      {k.type === 'receptor' && <>Receptor <b>{k.name}</b></>}
                      {k.type === 'olt' && <>OLT <b>{k.name}</b> puerto {k.port}</>}
                      <span className="muted"> · {k.element}</span>
                      {k.power != null && <span className="pw">{k.power} dBm</span>}
                    </li>
                  ))}
                </ol>
                {!flash.keyPoints.length && <p className="muted">La luz no llega a ningún splitter ni receptor.</p>}
                <button onClick={() => setFlash(null)}>Apagar linterna</button>
              </div>
            ) : (
              <p>Abre el diagrama de un nodo o caja (doble clic), activa <b>🔦 Linterna</b> y haz clic en un puerto de OLT,
                un hilo o un puerto de splitter. Se iluminará todo el recorrido de la luz, con paradas en los splitters
                y en los equipos receptores (ONU, router, transceptor).</p>
            )
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
          {mode.kind === 'poles' && (
            <>
              <p>Importa una lista de postes en CSV. Columnas: <code>nombre</code>, <code>lat</code>, <code>lng</code>
                {' '}(también <code>codigo</code>, <code>latitud</code>, <code>longitud</code>). Separador <code>,</code> o <code>;</code>.
                Las demás columnas se guardan como datos del poste.</p>
              <pre className="sample">nombre;lat;lng;material{'\n'}P-001;-34.6034;-58.3810;concreto</pre>
              <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" onChange={e => e.target.files?.[0] && importCsv(e.target.files[0])} />
              <label className="check">
                <input type="checkbox" checked={showPoles} onChange={e => setShowPoles(e.target.checked)} /> Mostrar postes ({poles.length})
              </label>
            </>
          )}
        </section>

        <section>
          <h2>Exportar mapa</h2>
          <div className="row">
            <button onClick={() => download('/api/v1/export/map.kmz')}>KMZ</button>
            <button onClick={() => download('/api/v1/export/map.kml')}>KML</button>
          </div>
        </section>

        {info && <div className="info" onClick={() => setInfo(null)}>{info}</div>}
        {error && <div className="error" onClick={() => setError(null)}>{error}</div>}
        <footer className="muted">{elements.length - poles.length} elementos · {poles.length} postes · {cables.length} cables</footer>
      </aside>

      <main className={`map mode-${mode.kind}`}>
        <MapContainer center={config.mapCenter ?? DEFAULT_CENTER} zoom={15} doubleClickZoom={false}
          style={{ height: '100%', width: '100%' }}>
          <BaseLayers googleKey={config.googleMapsKey} />
          <FitToData elements={elements} />
          <ClickHandler onClick={onMapClick} />

          {/* halo de linterna debajo de los cables */}
          {cables.filter(c => litCables.has(c.id)).map(c => (
            <Polyline key={`glow-${c.id}`} positions={c.coordinates.map(([lng, lat]) => [lat, lng])}
              pathOptions={{ color: '#facc15', weight: 14, opacity: 0.55 }} interactive={false} />
          ))}

          {cables.map(c => (
            <Polyline key={c.id} positions={c.coordinates.map(([lng, lat]) => [lat, lng])}
              pathOptions={{
                color: litCables.has(c.id) ? '#eab308' : c.fiber_count >= 48 ? '#1d4ed8' : '#0ea5e9',
                weight: c.fiber_count >= 48 ? 5 : c.fiber_count === 1 ? 2 : 3,
                opacity: flash && !litCables.has(c.id) ? 0.35 : 1,
              }}>
              <Tooltip sticky>{c.name} · {c.fiber_count} FO · {Math.round(c.length_m)} m</Tooltip>
              {mode.kind === 'select' && (
                <Popup>
                  <b>{c.name}</b><br />{c.fiber_count} hilos · {Math.round(c.length_m)} m<br />
                  {elementById.get(c.from_element_id ?? -1)?.name} → {elementById.get(c.to_element_id ?? -1)?.name}<br />
                  {Array.isArray(c.properties?.postes) && <>Postes: {(c.properties.postes as string[]).join(', ')}<br /></>}
                  <button className="danger" onClick={() => remove(() => api.deleteCable(c.id))}>Eliminar cable</button>
                </Popup>
              )}
            </Polyline>
          ))}

          {draft && <Polyline positions={draft.points.map(([lng, lat]) => [lat, lng])} pathOptions={{ color: '#f97316', dashArray: '6 6' }} />}
          {(guide || routePreview || noPoles) && (
            <Polyline
              positions={guide ?? (routePreview
                ? [[routePreview.from.lat, routePreview.from.lng], [routePreview.to.lat, routePreview.to.lng]]
                : [[noPoles!.from.lat, noPoles!.from.lng], [noPoles!.to.lat, noPoles!.to.lng]])}
              pathOptions={{ color: '#64748b', weight: 2, dashArray: '2 6' }} interactive={false} />
          )}
          {routePreview && (
            <Polyline positions={routePreview.route.coordinates.map(([lng, lat]) => [lat, lng])}
              pathOptions={{ color: '#f97316', weight: 4, dashArray: '8 6' }} />
          )}

          {elementsToDraw.map(el => {
            const color = elementColor(el);
            const planned = el.status === 'proyecto' || el.status === 'no_implantado';
            return (
              <CircleMarker key={el.id} center={[el.lat, el.lng]} radius={TYPE_STYLE[el.type]?.radius ?? 5}
                pathOptions={{
                  color: planned ? '#334155' : '#fff', weight: 2, dashArray: planned ? '3 2' : undefined,
                  fillColor: color, fillOpacity: flash && !flash.keyPoints.some(k => k.element_id === el.id) ? 0.45 : 1,
                }}
                eventHandlers={{
                  click: e => { e.originalEvent.stopPropagation(); onElementClick(el); },
                  dblclick: e => { e.originalEvent.stopPropagation(); e.target.closePopup(); openDiagram(el); },
                }}
                bubblingMouseEvents={false}>
                <Tooltip direction="top">{el.name}{isEmptyDiagram(el) && ' (diagrama vacío)'}</Tooltip>
                {mode.kind === 'select' && (
                  <Popup>
                    <b>{el.name}</b><br />{TYPE_STYLE[el.type]?.label} · {statusLabel(el.status)}
                    {isEmptyDiagram(el) && <><br /><i>Diagrama lógico vacío</i></>}
                    <table className="props">
                      <tbody>
                        {Object.entries(el.properties || {}).filter(([, v]) => v).map(([k, v]) => (
                          <tr key={k}><td>{k.replace(/_/g, ' ')}</td><td>{String(v)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="popup-actions">
                      {HAS_DIAGRAM.includes(el.type) && <button onClick={() => openDiagram(el)}>Diagrama</button>}
                      <button onClick={() => setEditing(el)}>Editar datos</button>
                      <button className="danger" onClick={() => remove(() => api.deleteElement(el.id))}>Eliminar</button>
                    </div>
                  </Popup>
                )}
              </CircleMarker>
            );
          })}

          {/* puntos clave de la linterna */}
          {flash?.keyPoints.filter(k => k.lat != null).map((k, i) => (
            <CircleMarker key={`kp-${i}`} center={[k.lat!, k.lng!]} radius={k.type === 'receptor' ? 9 : 13}
              pathOptions={{ color: '#ca8a04', weight: 3, fillColor: '#fde047', fillOpacity: 0.5 }} interactive={false}>
              <Tooltip permanent direction="right" className="kp-tip">
                {k.type === 'splitter' ? `1:${k.ratio}` : k.type === 'receptor' ? k.kind : 'OLT'}
                {k.power != null && ` · ${k.power} dBm`}
              </Tooltip>
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

      {openBox && (
        <BoxEditor element={openBox} onClose={() => { setOpenBox(null); reload(); }} onShowOnMap={showFlashOnMap}
          onEditData={() => setEditing(elements.find(e => e.id === openBox.id) ?? openBox)} />
      )}

      {editing && (
        <ElementForm
          type={editing.type}
          title={`Editar: ${editing.name}`}
          initial={{ name: editing.name, status: editing.status, properties: { ...editing.properties } }}
          onSave={saveEdit}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}
