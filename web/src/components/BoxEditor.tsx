import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  api, Connection, Diagram, EndKind, Equipment, EquipmentKind, Fiber, FlashlightResult, NetElement, Splitter,
} from '../api';
import { TYPE_STYLE } from '../elementTypes';

/**
 * Editor esquemático de un elemento (nodo principal, CEO, NAP, cliente):
 * cables de entrada a la izquierda, de salida a la derecha; splitters y equipos
 * (OLT, ODF, ONU, router, transceptor) en el centro; fusiones/conectores como curvas.
 * Los extremos que reciben luz desde una OLT se muestran rellenos en verde.
 */

const W = 1200;
const ROW = 18;
const CABLE_W = 190;
const SPL_ROW = 16;
const SPL_W = 60;
const EQ_W = 130;
const RX_H = 40;

type End = { kind: EndKind; id: number; port: number };
const endKey = (e: End) => `${e.kind}:${e.id}:${e.port}`;
/** Clave usada por el servidor para la señal / linterna */
const signalKey = (e: End) =>
  e.kind === 'fiber' ? `fiber:${e.id}`
    : e.kind === 'splitter_in' ? `spl_in:${e.id}`
      : e.kind === 'splitter_out' ? `spl_out:${e.id}:${e.port}`
        : `eq:${e.id}:${e.port}`;

interface Point { x: number; y: number }
type ItemRef = { type: 'spl' | 'eq'; id: number };
type Selection = { type: 'conn' | 'spl' | 'eq'; id: number } | null;

const isReceiver = (k: EquipmentKind) => !['OLT', 'ODF'].includes(k);
const EQ_LABEL: Record<EquipmentKind, string> = {
  OLT: 'OLT', ODF: 'ODF', ONU: 'ONU', ROUTER: 'Router', TRANSCEPTOR: 'Transceptor',
};

function equipmentHeight(e: Equipment) {
  if (isReceiver(e.kind)) return RX_H;
  const n = e.kind === 'OLT' ? e.slots * e.ports : e.ports;
  return 30 + n * ROW;
}

export default function BoxEditor({ element, onClose, onShowOnMap, onEditData }: {
  element: NetElement;
  onClose: () => void;
  onShowOnMap: (r: FlashlightResult) => void;
  onEditData: () => void;
}) {
  const [d, setD] = useState<Diagram | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState<End | null>(null);
  const [sel, setSel] = useState<Selection>(null);
  const [ratio, setRatio] = useState(8);
  const [level, setLevel] = useState(1);
  const [allowsClient, setAllowsClient] = useState(true);
  const [eqKind, setEqKind] = useState<EquipmentKind>(element.type === 'CLIENTE' ? 'ONU' : 'OLT');
  const [eqSlots, setEqSlots] = useState(1);
  const [eqPorts, setEqPorts] = useState(8);
  const [eqPower, setEqPower] = useState(5);
  const [drag, setDrag] = useState<(ItemRef & { dx: number; dy: number }) | null>(null);
  const [pos, setPos] = useState<Record<string, Point>>({});
  const [flashMode, setFlashMode] = useState(false);
  const [direction, setDirection] = useState<'down' | 'up'>('down');
  const [flash, setFlash] = useState<FlashlightResult | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const load = useCallback(async () => {
    try {
      setD(await api.diagram(element.id));
      setPos({});
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [element.id]);
  useEffect(() => { load(); }, [load]);

  const layout = useMemo(() => {
    if (!d) return null;
    const points = new Map<string, Point>();
    const blocks: { cable: Diagram['cables'][0]; x: number; y: number; h: number; side: 'in' | 'out' }[] = [];
    const place = (side: 'in' | 'out') => {
      let y = 30;
      for (const c of d.cables.filter(c => c.direction === side)) {
        const h = 28 + c.fibers.length * ROW;
        const x = side === 'in' ? 20 : W - 20 - CABLE_W;
        blocks.push({ cable: c, x, y, h, side });
        c.fibers.forEach((f, i) => {
          points.set(endKey({ kind: 'fiber', id: f.id, port: 0 }), {
            x: side === 'in' ? x + CABLE_W : x, y: y + 28 + i * ROW + ROW / 2,
          });
        });
        y += h + 24;
      }
      return y;
    };
    const hIn = place('in');
    const hOut = place('out');

    let autoY = 30;
    const spl = d.splitters.map((s: Splitter, i) => {
      const h = s.ratio * SPL_ROW + 12;
      const override = pos[`spl:${s.id}`];
      let { x, y } = override ?? s;
      if (!override && x === 0 && y === 0) { x = W / 2 - 60 + (s.level - 1) * 140; y = 30 + i * 40; }
      points.set(endKey({ kind: 'splitter_in', id: s.id, port: 0 }), { x, y: y + h / 2 });
      for (let p = 1; p <= s.ratio; p++) {
        points.set(endKey({ kind: 'splitter_out', id: s.id, port: p }), { x: x + SPL_W, y: y + 6 + (p - 1) * SPL_ROW + SPL_ROW / 2 });
      }
      autoY = Math.max(autoY, y + h + 30);
      return { ...s, x, y, h };
    });

    const eqs = d.equipment.map((e: Equipment, i) => {
      const h = equipmentHeight(e);
      const override = pos[`eq:${e.id}`];
      let { x, y } = override ?? e;
      if (!override && x === 0 && y === 0) { x = 260 + (i % 3) * 170; y = 30 + Math.floor(i / 3) * 200; }
      if (isReceiver(e.kind)) {
        points.set(endKey({ kind: 'equipment', id: e.id, port: 1 }), { x, y: y + h / 2 });
      } else {
        const n = e.kind === 'OLT' ? e.slots * e.ports : e.ports;
        for (let p = 1; p <= n; p++) {
          const py = y + 30 + (p - 1) * ROW + ROW / 2;
          if (e.kind === 'OLT') points.set(endKey({ kind: 'equipment', id: e.id, port: p }), { x: x + EQ_W, y: py });
          else {
            points.set(endKey({ kind: 'equipment', id: e.id, port: p }), { x, y: py });
            points.set(endKey({ kind: 'equipment', id: e.id, port: 1000 + p }), { x: x + EQ_W, y: py });
          }
        }
      }
      return { ...e, x, y, h };
    });
    const hMid = Math.max(0, ...spl.map(s => s.y + s.h), ...eqs.map(e => e.y + e.h));
    return { points, blocks, spl, eqs, height: Math.max(hIn, hOut, hMid + 30, 320) };
  }, [d, pos]);

  const connectedKeys = useMemo(() => {
    const s = new Set<string>();
    d?.connections.forEach(c => {
      s.add(endKey({ kind: c.a_kind, id: c.a_id, port: c.a_port }));
      s.add(endKey({ kind: c.b_kind, id: c.b_id, port: c.b_port }));
    });
    return s;
  }, [d]);

  const fiberById = useMemo(() => {
    const m = new Map<number, Fiber>();
    d?.cables.forEach(c => c.fibers.forEach(f => m.set(f.id, f)));
    return m;
  }, [d]);

  const litConns = useMemo(() => new Set(flash?.connections ?? []), [flash]);

  const runFlash = async (e: End) => {
    try {
      setFlash(await api.flashlight(e.kind, e.id, e.port, direction));
    } catch (er) {
      setErr((er as Error).message);
    }
  };

  const clickEnd = async (e: End) => {
    setSel(null);
    if (flashMode) { runFlash(e); return; }
    if (!pending) { setPending(e); return; }
    if (endKey(pending) === endKey(e)) { setPending(null); return; }
    try {
      await api.connect(element.id, {
        a_kind: pending.kind, a_id: pending.id, a_port: pending.port,
        b_kind: e.kind, b_id: e.id, b_port: e.port,
        kind: pending.kind === 'equipment' || e.kind === 'equipment' ? 'conector' : 'fusion',
      });
      setPending(null);
      setFlash(null);
      await load();
    } catch (er) {
      setErr((er as Error).message);
      setPending(null);
    }
  };

  const toSvg = (ev: React.MouseEvent) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = ev.clientX; pt.y = ev.clientY;
    return pt.matrixTransform(svg.getScreenCTM()!.inverse());
  };
  const startDrag = (ev: React.MouseEvent, item: ItemRef, x: number, y: number) => {
    ev.stopPropagation();
    const p = toSvg(ev);
    setDrag({ ...item, dx: p.x - x, dy: p.y - y });
  };
  const onMove = (ev: React.MouseEvent) => {
    if (!drag) return;
    const p = toSvg(ev);
    setPos(s => ({ ...s, [`${drag.type}:${drag.id}`]: { x: Math.round(p.x - drag.dx), y: Math.round(p.y - drag.dy) } }));
  };
  const onUp = async () => {
    if (!drag) return;
    const p = pos[`${drag.type}:${drag.id}`];
    setDrag(null);
    if (!p) return;
    const fn = drag.type === 'spl' ? api.moveSplitter : api.moveEquipment;
    await fn(drag.id, p.x, p.y).catch(e => setErr(e.message));
  };

  const addSplitter = async () => {
    try {
      const n = d?.splitters.length ?? 0;
      await api.addSplitter(element.id, { ratio, level, allows_client: allowsClient, x: W / 2 - 60 + (level - 1) * 140, y: 30 + n * 40 });
      await load();
    } catch (e) { setErr((e as Error).message); }
  };

  const addEquipment = async () => {
    try {
      const n = d?.equipment.length ?? 0;
      const count = d?.equipment.filter(e => e.kind === eqKind).length ?? 0;
      await api.addEquipment(element.id, {
        kind: eqKind,
        name: `${EQ_LABEL[eqKind]}-${String(count + 1).padStart(2, '0')}`,
        slots: eqKind === 'OLT' ? eqSlots : 1,
        ports: isReceiver(eqKind) ? 1 : eqPorts,
        properties: eqKind === 'OLT' ? { potencia_dbm: eqPower } : {},
        x: 260 + (n % 3) * 170,
        y: 30 + Math.floor(n / 3) * 200,
      });
      await load();
    } catch (e) { setErr((e as Error).message); }
  };

  const deleteSelected = async () => {
    if (!sel) return;
    try {
      if (sel.type === 'conn') await api.disconnect(sel.id);
      else if (sel.type === 'spl') await api.deleteSplitter(sel.id);
      else await api.deleteEquipment(sel.id);
      setSel(null);
      setFlash(null);
      await load();
    } catch (e) { setErr((e as Error).message); }
  };

  const connColor = (c: Connection) => {
    const f = c.a_kind === 'fiber' ? fiberById.get(c.a_id) : c.b_kind === 'fiber' ? fiberById.get(c.b_id) : undefined;
    return f?.color ?? '#475569';
  };

  const renderEnd = (e: End, label?: string) => {
    const k = endKey(e);
    const p = layout!.points.get(k);
    if (!p) return null;
    const sk = signalKey(e);
    const power = d!.signal[sk];
    const lit = sk in d!.signal;
    const inFlash = flash && sk in flash.ends;
    const isPending = pending && endKey(pending) === k;
    const cls = ['end', connectedKeys.has(k) ? 'connected' : '', lit ? 'lit' : '', inFlash ? 'flash' : '', isPending ? 'pending' : ''].join(' ');
    return (
      <circle key={k} cx={p.x} cy={p.y} r={isPending ? 6 : 4.5} className={cls}
        onClick={ev => { ev.stopPropagation(); clickEnd(e); }}>
        <title>{label ? `${label} · ` : ''}{lit ? `Con señal${power != null ? `: ${power} dBm` : ''}` : 'Sin señal'}</title>
      </circle>
    );
  };

  const hint = flashMode
    ? `Linterna: haz clic en un puerto de OLT, un hilo o un splitter para iluminar el recorrido ${direction === 'down' ? 'hacia los clientes' : 'hacia el nodo'}.`
    : pending
      ? 'Ahora haz clic en el extremo de destino (o en el mismo para cancelar).'
      : 'Clic en un extremo y luego en otro para conectar. Arrastra splitters y equipos. Verde relleno = recibe señal.';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <header>
          <h3><span className="dot" style={{ background: TYPE_STYLE[element.type]?.color }} /> {TYPE_STYLE[element.type]?.label} · {element.name}</h3>
          <div className="row" style={{ marginTop: 0 }}>
            <button onClick={onEditData}>Datos del elemento</button>
            <button onClick={onClose}>Guardar y cerrar</button>
          </div>
        </header>
        <div className="toolbar-row">
          <div className="tool-group">
            <span className="tg-label">Equipo</span>
            <select value={eqKind} onChange={e => setEqKind(e.target.value as EquipmentKind)}>
              {(Object.keys(EQ_LABEL) as EquipmentKind[]).map(k => <option key={k} value={k}>{EQ_LABEL[k]}</option>)}
            </select>
            {eqKind === 'OLT' && (
              <>
                <label className="inline">Slots<input type="number" min={1} max={16} value={eqSlots} onChange={e => setEqSlots(Number(e.target.value))} /></label>
                <label className="inline">PON/slot<input type="number" min={1} max={64} value={eqPorts} onChange={e => setEqPorts(Number(e.target.value))} /></label>
                <label className="inline">dBm<input type="number" step={0.5} value={eqPower} onChange={e => setEqPower(Number(e.target.value))} /></label>
              </>
            )}
            {eqKind === 'ODF' && (
              <label className="inline">Puertos<input type="number" min={1} max={128} value={eqPorts} onChange={e => setEqPorts(Number(e.target.value))} /></label>
            )}
            <button onClick={addEquipment}>+ Equipo</button>
          </div>
          <div className="tool-group">
            <span className="tg-label">Splitter</span>
            <select value={ratio} onChange={e => setRatio(Number(e.target.value))}>
              {[2, 4, 8, 16, 32].map(r => <option key={r} value={r}>1:{r}</option>)}
            </select>
            <select value={level} onChange={e => setLevel(Number(e.target.value))}>
              <option value={1}>Nivel 1</option><option value={2}>Nivel 2</option>
            </select>
            <label className="inline check"><input type="checkbox" checked={allowsClient} onChange={e => setAllowsClient(e.target.checked)} />Clientes</label>
            <button onClick={addSplitter}>+ Splitter</button>
          </div>
          <div className="tool-group">
            <button className={flashMode ? 'flash-on' : ''} onClick={() => { setFlashMode(!flashMode); setPending(null); setFlash(null); }}>🔦 Linterna</button>
            {flashMode && (
              <select value={direction} onChange={e => { setDirection(e.target.value as 'down' | 'up'); setFlash(null); }}>
                <option value="down">Hacia clientes</option>
                <option value="up">Hacia el nodo</option>
              </select>
            )}
            <button className="danger" disabled={!sel} onClick={deleteSelected}>Eliminar selección</button>
          </div>
        </div>

        {err && <div className="error" onClick={() => setErr(null)}>{err}</div>}
        <p className="hint">{hint}</p>

        {d && layout && (
          <div className="diagram-wrap">
            {!d.cables.length && !d.equipment.length && (
              <p className="muted">
                {element.type === 'NODO'
                  ? 'Nodo vacío: agrega una OLT y un ODF (o splitters) con la barra de herramientas, y traza un cable desde este nodo en el mapa.'
                  : 'Este elemento no tiene cables. Traza cables hacia/desde él en el mapa.'}
              </p>
            )}
            <svg ref={svgRef} viewBox={`0 0 ${W} ${layout.height}`} className={`diagram ${flash ? 'flashing' : ''}`}
              onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} onClick={() => setSel(null)}>
              {/* Cables */}
              {layout.blocks.map(({ cable, x, y, h, side }) => (
                <g key={cable.id}>
                  <rect x={x} y={y} width={CABLE_W} height={h} rx={6} className="cable-block" />
                  <text x={x + 8} y={y + 18} className="cable-title">{side === 'in' ? '⇠ ' : ''}{cable.name}{side === 'out' ? ' ⇢' : ''}</text>
                  <text x={x + CABLE_W - 8} y={y + 18} textAnchor="end" className="cable-sub">{cable.remote_name ?? ''}</text>
                  {cable.fibers.map((f, i) => {
                    const fy = y + 28 + i * ROW + ROW / 2;
                    const x1 = x + 8;
                    const x2 = x + CABLE_W;
                    const lit = flash?.fibers.includes(f.id);
                    return (
                      <g key={f.id}>
                        <rect x={side === 'in' ? x1 : x2 - 16} y={fy - 5} width={8} height={10} fill={f.tube_color} stroke="#0003" />
                        {lit && <line x1={side === 'in' ? x1 + 10 : x} y1={fy} x2={side === 'in' ? x2 : x2 - 18} y2={fy} className="glow" />}
                        <line x1={side === 'in' ? x1 + 10 : x} y1={fy} x2={side === 'in' ? x2 : x2 - 18} y2={fy}
                          stroke={f.color} strokeWidth={4} className="fiber-line" />
                        <text x={side === 'in' ? x1 + 16 : x + 16} y={fy - 4} className="fiber-label">T{f.tube} · F{f.number}</text>
                      </g>
                    );
                  })}
                </g>
              ))}

              {/* Equipos */}
              {layout.eqs.map(e => (
                <g key={`eq-${e.id}`} className={`equipment eq-${e.kind} ${sel?.type === 'eq' && sel.id === e.id ? 'selected' : ''}`}>
                  <rect x={e.x} y={e.y} width={EQ_W} height={e.h} rx={5}
                    onMouseDown={ev => startDrag(ev, { type: 'eq', id: e.id }, e.x, e.y)}
                    onClick={ev => { ev.stopPropagation(); setSel({ type: 'eq', id: e.id }); }} />
                  <text x={e.x + EQ_W / 2} y={e.y + (isReceiver(e.kind) ? RX_H / 2 + 4 : 18)} textAnchor="middle" className="eq-title">
                    {e.name}
                  </text>
                  {!isReceiver(e.kind) && Array.from({ length: e.kind === 'OLT' ? e.slots * e.ports : e.ports }, (_, i) => {
                    const py = e.y + 30 + i * ROW + ROW / 2;
                    const label = e.kind === 'OLT' ? `S${Math.floor(i / e.ports) + 1} · PON ${(i % e.ports) + 1}` : `${i + 1}`;
                    return <text key={i} x={e.x + EQ_W / 2} y={py + 3} textAnchor="middle" className="port-label">{label}</text>;
                  })}
                </g>
              ))}

              {/* Conexiones */}
              {d.connections.map(c => {
                const a = layout.points.get(endKey({ kind: c.a_kind, id: c.a_id, port: c.a_port }));
                const b = layout.points.get(endKey({ kind: c.b_kind, id: c.b_id, port: c.b_port }));
                if (!a || !b) return null;
                const [p, q] = a.x <= b.x ? [a, b] : [b, a];
                const mx = (p.x + q.x) / 2;
                const path = `M${p.x},${p.y} C${mx},${p.y} ${mx},${q.y} ${q.x},${q.y}`;
                const isSel = sel?.type === 'conn' && sel.id === c.id;
                return (
                  <g key={c.id} className="conn" onClick={ev => { ev.stopPropagation(); setSel({ type: 'conn', id: c.id }); }}>
                    <path d={path} className="conn-hit" />
                    {litConns.has(c.id) && <path d={path} className="glow" />}
                    <path d={path} stroke={isSel ? '#f97316' : '#111'} strokeWidth={isSel ? 6 : 5} fill="none"
                      strokeDasharray={c.kind === 'conector' ? '7 3' : undefined} />
                    <path d={path} stroke={connColor(c)} strokeWidth={3} fill="none" />
                  </g>
                );
              })}

              {/* Splitters */}
              {layout.spl.map(s => (
                <g key={s.id} className={`splitter ${s.allows_client ? '' : 'network'} ${sel?.type === 'spl' && sel.id === s.id ? 'selected' : ''}`}>
                  <polygon
                    points={`${s.x},${s.y + s.h / 2} ${s.x + SPL_W},${s.y} ${s.x + SPL_W},${s.y + s.h}`}
                    onMouseDown={ev => startDrag(ev, { type: 'spl', id: s.id }, s.x, s.y)}
                    onClick={ev => { ev.stopPropagation(); setSel({ type: 'spl', id: s.id }); }}
                  />
                  <text x={s.x + SPL_W / 2} y={s.y - 6} textAnchor="middle" className="spl-label">{s.name} (N{s.level})</text>
                  {Array.from({ length: s.ratio }, (_, i) => (
                    <text key={i} x={s.x + SPL_W + 8} y={s.y + 6 + i * SPL_ROW + SPL_ROW / 2 + 3} className="port-label">{i + 1}</text>
                  ))}
                </g>
              ))}

              {/* Extremos clicables (encima de todo) */}
              {d.cables.flatMap(c => c.fibers.map(f => renderEnd({ kind: 'fiber', id: f.id, port: 0 }, `${c.name} F${f.number}`)))}
              {d.splitters.flatMap(s => [
                renderEnd({ kind: 'splitter_in', id: s.id, port: 0 }, `${s.name} entrada`),
                ...Array.from({ length: s.ratio }, (_, i) => renderEnd({ kind: 'splitter_out', id: s.id, port: i + 1 }, `${s.name} salida ${i + 1}`)),
              ])}
              {d.equipment.flatMap(e => {
                if (isReceiver(e.kind)) return [renderEnd({ kind: 'equipment', id: e.id, port: 1 }, e.name)];
                const n = e.kind === 'OLT' ? e.slots * e.ports : e.ports;
                return Array.from({ length: n }, (_, i) => [
                  renderEnd({ kind: 'equipment', id: e.id, port: i + 1 }, `${e.name} ${e.kind === 'ODF' ? 'A' : 'PON '}${i + 1}`),
                  e.kind === 'ODF' ? renderEnd({ kind: 'equipment', id: e.id, port: 1001 + i }, `${e.name} B${i + 1}`) : null,
                ]).flat();
              })}
            </svg>
          </div>
        )}

        {flash && (
          <div className="trace">
            <div className="trace-head">
              <h4>🔦 Recorrido de la luz {flash.direction === 'down' ? 'hacia los clientes' : 'hacia el nodo'}
                {flash.start.power != null && <span className="muted"> · inicio {flash.start.power} dBm</span>}</h4>
              <button className="primary" onClick={() => onShowOnMap(flash)}>Ver recorrido en el mapa</button>
            </div>
            <div className="steps">
              {flash.keyPoints.length ? flash.keyPoints.map((k, i) => (
                <span key={i} className={`step step-${k.type}`}>
                  {k.type === 'splitter' && <>Splitter 1:{k.ratio} @ {k.element}</>}
                  {k.type === 'receptor' && <>{k.name} @ {k.element}</>}
                  {k.type === 'olt' && <>OLT {k.name} PON {k.port}</>}
                  {k.power != null && <b> {k.power} dBm</b>}
                </span>
              )) : <span className="muted">La luz no llega a ningún splitter ni receptor desde aquí.</span>}
            </div>
            <p className="muted">{flash.cables.length} cables y {flash.fibers.length} hilos iluminados.</p>
          </div>
        )}
      </div>
    </div>
  );
}
