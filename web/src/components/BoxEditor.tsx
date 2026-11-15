import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, Connection, Diagram, EndKind, Fiber, NetElement, Splitter, TraceResult } from '../api';

/**
 * Editor esquemático de una caja (CEO / CTO): cables de entrada a la izquierda,
 * cables de salida a la derecha, splitters en el centro y fusiones como curvas.
 * Clic en un extremo y luego en otro = crear fusión. Clic en una fusión = seleccionarla.
 */

const W = 1100;
const ROW = 18;          // separación entre hilos
const CABLE_W = 190;     // ancho del bloque de cable
const SPL_ROW = 16;      // separación entre salidas de splitter
const SPL_W = 60;

type End = { kind: EndKind; id: number; port: number };
const endKey = (e: End) => `${e.kind}:${e.id}:${e.port}`;

interface Point { x: number; y: number; color: string }

export default function BoxEditor({ element, onClose }: { element: NetElement; onClose: () => void }) {
  const [d, setD] = useState<Diagram | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState<End | null>(null);
  const [selectedConn, setSelectedConn] = useState<number | null>(null);
  const [selectedSpl, setSelectedSpl] = useState<number | null>(null);
  const [ratio, setRatio] = useState(8);
  const [level, setLevel] = useState(1);
  const [drag, setDrag] = useState<{ id: number; dx: number; dy: number } | null>(null);
  const [splPos, setSplPos] = useState<Record<number, { x: number; y: number }>>({});
  const [trace, setTrace] = useState<TraceResult | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const load = useCallback(async () => {
    try {
      const diag = await api.diagram(element.id);
      setD(diag);
      setSplPos({});
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
          const py = y + 28 + i * ROW + ROW / 2;
          points.set(endKey({ kind: 'fiber', id: f.id, port: 0 }), {
            x: side === 'in' ? x + CABLE_W : x, y: py, color: f.color,
          });
        });
        y += h + 24;
      }
      return y;
    };
    const hIn = place('in');
    const hOut = place('out');

    const spl: (Splitter & { h: number })[] = d.splitters.map((s, i) => {
      const h = s.ratio * SPL_ROW + 12;
      const override = splPos[s.id];
      let { x, y } = override ?? s;
      if (!override && x === 0 && y === 0) {
        x = W / 2 - 140 + (s.level - 1) * 160;
        y = 30 + i * 40;
      }
      points.set(endKey({ kind: 'splitter_in', id: s.id, port: 0 }), { x, y: y + h / 2, color: '#334155' });
      for (let p = 1; p <= s.ratio; p++) {
        points.set(endKey({ kind: 'splitter_out', id: s.id, port: p }), {
          x: x + SPL_W, y: y + 6 + (p - 1) * SPL_ROW + SPL_ROW / 2, color: '#334155',
        });
      }
      return { ...s, x, y, h };
    });
    const hSpl = Math.max(0, ...spl.map(s => s.y + s.h));
    return { points, blocks, spl, height: Math.max(hIn, hOut, hSpl + 30, 300) };
  }, [d, splPos]);

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

  const clickEnd = async (e: End) => {
    setSelectedConn(null);
    setTrace(null);
    if (!pending) { setPending(e); return; }
    if (endKey(pending) === endKey(e)) { setPending(null); return; }
    try {
      await api.connect(element.id, {
        a_kind: pending.kind, a_id: pending.id, a_port: pending.port,
        b_kind: e.kind, b_id: e.id, b_port: e.port,
      });
      setPending(null);
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

  const onMove = (ev: React.MouseEvent) => {
    if (!drag) return;
    const p = toSvg(ev);
    setSplPos(s => ({ ...s, [drag.id]: { x: Math.round(p.x - drag.dx), y: Math.round(p.y - drag.dy) } }));
  };
  const onUp = async () => {
    if (!drag) return;
    const pos = splPos[drag.id];
    setDrag(null);
    if (pos) await api.moveSplitter(drag.id, pos.x, pos.y).catch(e => setErr(e.message));
  };

  const addSplitter = async () => {
    try {
      const n = d?.splitters.length ?? 0;
      await api.addSplitter(element.id, { ratio, level, x: W / 2 - 140 + (level - 1) * 160, y: 30 + n * 40 });
      await load();
    } catch (e) { setErr((e as Error).message); }
  };

  const deleteSelected = async () => {
    try {
      if (selectedConn) await api.disconnect(selectedConn);
      else if (selectedSpl) await api.deleteSplitter(selectedSpl);
      setSelectedConn(null);
      setSelectedSpl(null);
      await load();
    } catch (e) { setErr((e as Error).message); }
  };

  const runTrace = async () => {
    if (pending?.kind !== 'fiber') return;
    try { setTrace(await api.trace(pending.id)); } catch (e) { setErr((e as Error).message); }
  };

  const connColor = (c: Connection) => {
    const f = c.a_kind === 'fiber' ? fiberById.get(c.a_id) : c.b_kind === 'fiber' ? fiberById.get(c.b_id) : undefined;
    return f?.color ?? '#475569';
  };

  const renderEnd = (e: End) => {
    const k = endKey(e);
    const p = layout!.points.get(k)!;
    const isPending = pending && endKey(pending) === k;
    return (
      <circle key={k} cx={p.x} cy={p.y} r={isPending ? 6 : 4.5}
        className={`end ${connectedKeys.has(k) ? 'connected' : ''} ${isPending ? 'pending' : ''}`}
        onClick={ev => { ev.stopPropagation(); clickEnd(e); }} />
    );
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <header>
          <h3>{element.type} · {element.name}</h3>
          <div className="toolbar">
            <select value={ratio} onChange={e => setRatio(Number(e.target.value))}>
              {[2, 4, 8, 16, 32].map(r => <option key={r} value={r}>1:{r}</option>)}
            </select>
            <select value={level} onChange={e => setLevel(Number(e.target.value))}>
              <option value={1}>Nivel 1</option><option value={2}>Nivel 2</option>
            </select>
            <button onClick={addSplitter}>+ Splitter</button>
            <button disabled={pending?.kind !== 'fiber'} onClick={runTrace}>Trazar hilo</button>
            <button className="danger" disabled={!selectedConn && !selectedSpl} onClick={deleteSelected}>Eliminar selección</button>
            <button onClick={onClose}>Cerrar</button>
          </div>
        </header>

        {err && <div className="error" onClick={() => setErr(null)}>{err}</div>}
        <p className="hint">
          {pending ? 'Ahora haz clic en el extremo de destino (o en el mismo para cancelar).'
            : 'Clic en un extremo de hilo o puerto de splitter y luego en otro para fusionar. Arrastra los splitters para ordenarlos.'}
        </p>

        {d && layout && (
          <div className="diagram-wrap">
            {!d.cables.length && <p className="muted">Esta caja no tiene cables. Traza cables hacia/desde ella en el mapa.</p>}
            <svg ref={svgRef} viewBox={`0 0 ${W} ${layout.height}`} className="diagram"
              onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
              onClick={() => { setSelectedConn(null); setSelectedSpl(null); }}>
              {/* Cables */}
              {layout.blocks.map(({ cable, x, y, h, side }) => (
                <g key={cable.id}>
                  <rect x={x} y={y} width={CABLE_W} height={h} rx={6} className="cable-block" />
                  <text x={x + 8} y={y + 18} className="cable-title">
                    {side === 'in' ? '⇠ ' : ''}{cable.name}{side === 'out' ? ' ⇢' : ''}
                  </text>
                  <text x={x + CABLE_W - 8} y={y + 18} textAnchor="end" className="cable-sub">
                    {cable.remote_name ?? ''}
                  </text>
                  {cable.fibers.map((f, i) => {
                    const fy = y + 28 + i * ROW + ROW / 2;
                    const x1 = x + 8;
                    const x2 = x + CABLE_W;
                    return (
                      <g key={f.id}>
                        <rect x={side === 'in' ? x1 : x2 - 16} y={fy - 5} width={8} height={10} fill={f.tube_color} stroke="#0003" />
                        <line x1={side === 'in' ? x1 + 10 : x} y1={fy} x2={side === 'in' ? x2 : x2 - 18} y2={fy}
                          stroke={f.color} strokeWidth={4} className="fiber-line" />
                        <text x={side === 'in' ? x1 + 16 : x + 16} y={fy - 4} className="fiber-label">
                          T{f.tube} · F{f.number}
                        </text>
                      </g>
                    );
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
                const sel = selectedConn === c.id;
                return (
                  <g key={c.id} className="conn" onClick={ev => { ev.stopPropagation(); setSelectedConn(c.id); setSelectedSpl(null); }}>
                    <path d={path} className="conn-hit" />
                    <path d={path} stroke={sel ? '#f97316' : '#111'} strokeWidth={sel ? 6 : 5} fill="none" />
                    <path d={path} stroke={connColor(c)} strokeWidth={3} fill="none" />
                  </g>
                );
              })}

              {/* Splitters */}
              {layout.spl.map(s => (
                <g key={s.id} className={`splitter ${selectedSpl === s.id ? 'selected' : ''}`}>
                  <polygon
                    points={`${s.x},${s.y + s.h / 2} ${s.x + SPL_W},${s.y} ${s.x + SPL_W},${s.y + s.h}`}
                    onMouseDown={ev => {
                      ev.stopPropagation();
                      const p = toSvg(ev);
                      setDrag({ id: s.id, dx: p.x - s.x, dy: p.y - s.y });
                    }}
                    onClick={ev => { ev.stopPropagation(); setSelectedSpl(s.id); setSelectedConn(null); }}
                  />
                  <text x={s.x + SPL_W / 2} y={s.y - 6} textAnchor="middle" className="spl-label">
                    {s.name} (N{s.level})
                  </text>
                  {Array.from({ length: s.ratio }, (_, i) => (
                    <text key={i} x={s.x + SPL_W + 8} y={s.y + 6 + i * SPL_ROW + SPL_ROW / 2 + 3} className="port-label">{i + 1}</text>
                  ))}
                </g>
              ))}

              {/* Extremos clicables (encima de todo) */}
              {d.cables.flatMap(c => c.fibers.map(f => renderEnd({ kind: 'fiber', id: f.id, port: 0 })))}
              {d.splitters.flatMap(s => [
                renderEnd({ kind: 'splitter_in', id: s.id, port: 0 }),
                ...Array.from({ length: s.ratio }, (_, i) => renderEnd({ kind: 'splitter_out', id: s.id, port: i + 1 })),
              ])}
            </svg>
          </div>
        )}

        {trace && (
          <div className="trace">
            <h4>Traza desde el hilo seleccionado ({trace.paths.length} ramas)</h4>
            {trace.paths.map((p, i) => (
              <div key={i} className="trace-path">
                <div className="steps">
                  {p.steps.map((s, j) => (
                    <span key={j} className={`step step-${s.type}`}>
                      {s.type === 'cable' && <><i style={{ background: s.color }} />{s.cable} F{s.fiber} ({s.length_m} m)</>}
                      {(s.type === 'fusion' || s.type === 'conector') && <>{s.type} @ {s.element}</>}
                      {s.type === 'splitter' && <>{s.name} p{s.port}</>}
                      {s.type === 'libre' && <>puerto libre</>}
                    </span>
                  ))}
                </div>
                {p.budget && (
                  <div className={`budget-line ${p.budget.ok ? 'ok' : 'bad'}`}>
                    {p.lengthKm} km · pérdida {p.budget.totalLossDb} dB · Rx ≈ {p.budget.estimatedRxDbm} dBm
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
