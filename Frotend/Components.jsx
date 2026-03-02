// ============================================================
// TETENET — Componentes Visuales y Modales
// ============================================================
import { useState, useRef, useMemo } from "react";
import { useApp } from "./AppContext";
import { 
  LOGO_SRC, ROL_LABELS, ROLES, MOTIVOS, HORAS,LOGO2_SRC, 
  TIPO_VISITA_OPTIONS, TIPO_VISITA_LABELS, ENV 
} from "./constants";

// ============================================================
// COMPONENTES BASE
// ============================================================
export function Logo({ size = 32, style = {} }) {
  return (
    <img
      src={LOGO_SRC}
      alt="TETENET"
      style={{ height: size, width: "auto", objectFit: "contain", ...style }}
      onError={e => { e.target.style.display = "none"; }} 
    />
  );
}

export function Logo2({ size = 32, style = {} }) {
  return (
    <img
      src={LOGO2_SRC}
      alt="TETENET"
      style={{ height: size, width: "auto", objectFit: "contain", ...style }}
      onError={e => { e.target.style.display = "none"; }} 
    />
  );
}

export const Badge = ({ estado }) => {
  const L = { pendiente: "PENDIENTE", encurso: "EN CURSO", resuelto: "RESUELTO", sinresolver: "SIN RESOLVER" };
  return <span className={`badge badge--${estado}`}>{L[estado] || estado}</span>;
};

export const CobroBadge = ({ cobro }) => {
  const T = { pendiente: "Pendiente de cobro", cobrado: "Cobrado", nocobrado: "No cobrado" };
  return <span className={`cobro-symbol cobro-symbol--${cobro}`} title={T[cobro]}>$</span>;
};

export const Btn = ({ children, onClick, variant = "primary", size = "md", disabled, className: extra, title }) => (
  <button disabled={disabled} onClick={onClick} title={title} className={`btn btn--${variant} btn--${size} ${extra || ""}`}>
    {children}
  </button>
);

export const Input = ({ label, hint, hintType, ...props }) => (
  <div className="form-group">
    {label && <label className="form-label">{label}</label>}
    <input className={`form-input ${hintType === "error" ? "form-input--error" : ""}`} {...props} />
    {hint && <span className={`form-hint form-hint--${hintType || "muted"}`}>{hint}</span>}
  </div>
);

export const Select = ({ label, options, ...props }) => (
  <div className="form-group">
    {label && <label className="form-label">{label}</label>}
    <select className="form-select" {...props}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </div>
);

export const Card = ({ children, className: extra, style }) => (
  <div className={`card ${extra || ""}`} style={style}>{children}</div>
);

export const SectionTitle = ({ children }) => <h2 className="section-title">{children}</h2>;

export function Toast() {
  const { notification } = useApp();
  if (!notification) return null;
  return <div className={`toast toast--${notification.type}`}>{notification.msg}</div>;
}

// ============================================================
// FIRMA DIGITAL
// ============================================================
export function SignaturePad({ onChange }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const hasDrawn = useRef(false);

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (src.clientX - rect.left) * scaleX, y: (src.clientY - rect.top) * scaleY };
  };

  const start = (e) => { e.preventDefault(); drawing.current = true; const c = canvasRef.current; const p = getPos(e, c); const ctx = c.getContext("2d"); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
  const draw = (e) => { e.preventDefault(); if (!drawing.current) return; const c = canvasRef.current; const ctx = c.getContext("2d"); const p = getPos(e, c); ctx.lineTo(p.x, p.y); ctx.strokeStyle = "#1a2332"; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.stroke(); hasDrawn.current = true; };
  const end = () => { drawing.current = false; if (hasDrawn.current) onChange(canvasRef.current.toDataURL()); };
  const clear = () => { const c = canvasRef.current; c.getContext("2d").clearRect(0, 0, c.width, c.height); hasDrawn.current = false; onChange(null); };

  return (
    <div className="signature-pad-wrapper">
      <label className="form-label">Firma del Cliente</label>
      <canvas ref={canvasRef} width={500} height={160} className="signature-pad"
        onMouseDown={start} onMouseMove={draw} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={draw} onTouchEnd={end} />
      <Btn onClick={clear} variant="ghost" size="sm">Limpiar firma</Btn>
    </div>
  );
}

// ============================================================
// MODALES Y COMPLEJOS
// ============================================================
export function Modal({ title, onClose, children, size = "md" }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={`modal modal--${size}`}>
        <div className="modal__header">
          <h3 className="modal__title">{title}</h3>
          <button className="modal__close" onClick={onClose}>×</button>
        </div>
        <div className="modal__body">{children}</div>
      </div>
    </div>
  );
}

export function HistorialModal({ ticket, onClose }) {
  return (
    <Modal title={`Historial — ${ticket.id}`} onClose={onClose} size="sm">
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {(ticket.historial || []).map((h, i) => (
          <div key={i} style={{ padding: "10px 14px", background: "var(--color-bg)", borderRadius: "var(--radius-md)", borderLeft: "3px solid var(--color-primary)" }}>
            <div style={{ fontSize: "0.78em", color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>{typeof h.ts === "string" ? h.ts : new Date(h.ts).toLocaleString("es-VE")}</div>
            <div style={{ fontSize: "0.9em", fontWeight: 600, marginTop: 2 }}>{h.accion}</div>
            <div style={{ fontSize: "0.82em", color: "var(--color-text-muted)" }}>{h.user}</div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

export function MagicLinkModal({ ticket, onClose }) {
  const magicUrl = `${ENV.APP_URL}?magic=${ticket.tecnicoId}&ticket=${ticket.id}`;

  return (
    <Modal title="🔗 Link Mágico Generado" onClose={onClose} size="sm">
      <p style={{ color: "var(--color-text-muted)", fontSize: "0.9em", marginTop: 0 }}>
        Este link permite al técnico entrar directamente al ticket.
      </p>
      <div style={{ background: "var(--color-bg)", padding: 12, borderRadius: "var(--radius-md)", fontFamily: "var(--font-mono)", fontSize: "0.8em", wordBreak: "break-all", color: "var(--color-primary)", marginBottom: 16 }}>
        {magicUrl}
      </div>
      <div className="info-box info-box--info" style={{ flexDirection: "column", marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>📱 Mensaje WhatsApp:</div>
        <div style={{ fontSize: "0.88em", lineHeight: 1.7 }}>
          Hola <strong>{ticket.tecnicoNombre}</strong>, nuevo ticket:<br />
          👤 {ticket.clienteNombre}<br />
          🕐 {ticket.hora} — 📋 {ticket.motivo}<br />
          🔗 <span style={{ color: "var(--color-primary)" }}>{magicUrl}</span>
        </div>
      </div>
    </Modal>
  );
}

export function ModificarModal({ ticket, onClose }) {
  const { updateTicket, showNotif, tecnicos, checkDuplicate } = useApp();
  const [form, setForm] = useState({
    motivo: ticket.motivo, hora: ticket.hora, fecha: ticket.fecha,
    tecnicoId: ticket.tecnicoId, tipoVisita: ticket.tipoVisita,
    clienteNombre: ticket.clienteNombre, clienteTelefono: ticket.clienteTelefono,
    clienteZona: ticket.clienteZona, clienteCajaNap: ticket.clienteCajaNap,
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const guardar = async () => {
    const dup = checkDuplicate(form.tecnicoId, form.fecha, form.hora, ticket.id);
    if (dup) { showNotif(`Conflicto con ticket ${dup.id}`, "danger", 7000); return; }
    const tec = tecnicos.find(t => t.id === form.tecnicoId);
    await updateTicket(ticket.id, { ...form, tecnicoNombre: tec?.nombre }, "Ticket modificado");
    showNotif("Ticket modificado ✓", "success");
    onClose();
  };

  return (
    <Modal title={`Modificar — ${ticket.id}`} onClose={onClose}>
      <div className="grid-2">
        <Input label="Nombre cliente" value={form.clienteNombre || ""} onChange={e => set("clienteNombre", e.target.value)} />
        <Input label="Teléfono" value={form.clienteTelefono || ""} onChange={e => set("clienteTelefono", e.target.value)} />
        <Input label="Zona" value={form.clienteZona || ""} onChange={e => set("clienteZona", e.target.value)} />
        <Input label="Caja NAP" value={form.clienteCajaNap || ""} onChange={e => set("clienteCajaNap", e.target.value)} />
        <Input label="Fecha" type="date" value={form.fecha} onChange={e => set("fecha", e.target.value)} />
        <Select label="Hora" value={form.hora} onChange={e => set("hora", e.target.value)} options={HORAS.map(h => ({ value: h, label: h }))} />
        <Select label="Técnico" value={form.tecnicoId} onChange={e => set("tecnicoId", e.target.value)} options={tecnicos.map(t => ({ value: t.id, label: t.nombre }))} />
        <Select label="Motivo" value={form.motivo} onChange={e => set("motivo", e.target.value)} options={MOTIVOS.map(m => ({ value: m, label: m }))} />
        <Select label="Tipo Visita" value={form.tipoVisita} onChange={e => set("tipoVisita", e.target.value)} options={TIPO_VISITA_OPTIONS} />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 20 }}>
        <Btn onClick={onClose} variant="ghost">Cancelar</Btn>
        <Btn onClick={guardar} variant="primary">Guardar</Btn>
      </div>
    </Modal>
  );
}

export function PlanillaContenido({ ticket, solucion, firma, tipoVisita, materiales, total, estadoCierre }) {
  const Campo = ({ label, value }) => (
    <div className="planilla-field">
      <span className="planilla-field__label">{label}:</span>
      <span className="planilla-field__value">{value || "—"}</span>
    </div>
  );
  const eLabel = estadoCierre === "resuelto" ? "✓ RESUELTO" : estadoCierre === "sinresolver" ? "✗ SIN RESOLVER" : (ticket.estado || "").toUpperCase();

  return (
    <div className="planilla-wrapper">
      <div className="planilla-header">
        <div>
          <div className="planilla-header__brand" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Logo size={24} />
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className={`planilla-header__estado-${estadoCierre || ticket.estado}`}>{eLabel}</div>
          <div className="planilla-header__id">{ticket.id}</div>
        </div>
      </div>
      <div className="planilla-body">
        <div className="planilla-section"><div className="planilla-section__title">Datos del Cliente</div>
          <div className="planilla-grid">
            <Campo label="Nombre" value={ticket.clienteNombre} /><Campo label="Cédula" value={ticket.clienteCedula} />
            <Campo label="Teléfono" value={ticket.clienteTelefono} /><Campo label="Zona" value={ticket.clienteZona} />
            <Campo label="Caja NAP" value={ticket.clienteCajaNap} /><Campo label="Dirección" value={ticket.clienteDireccion} />
          </div>
        </div>
        <div className="planilla-section"><div className="planilla-section__title">Datos del Soporte</div>
          <div className="planilla-grid">
            <Campo label="Técnico" value={ticket.tecnicoNombre} /><Campo label="Fecha" value={ticket.fecha} />
            <Campo label="Hora" value={ticket.hora} /><Campo label="Motivo" value={ticket.motivo} />
            <Campo label="Tipo visita" value={TIPO_VISITA_LABELS[tipoVisita || ticket.tipoVisita]} />
          </div>
        </div>
        {ticket.datosAdicionales?.length > 0 && (
          <div className="planilla-section"><div className="planilla-section__title">Datos Adicionales</div>
            <div className="planilla-grid">{ticket.datosAdicionales.map((d, i) => <Campo key={i} label={d.nombre} value={d.valor} />)}</div>
          </div>
        )}
        {(solucion || ticket.solucion) && (
          <div className="planilla-section"><div className="planilla-section__title">Trabajo Realizado</div>
            <div style={{ fontSize: "0.85em", background: "var(--color-bg)", padding: "10px 14px", borderRadius: "var(--radius-md)" }}>{solucion || ticket.solucion}</div>
          </div>
        )}
        {(materiales || ticket.materiales)?.length > 0 && (
          <div className="planilla-section"><div className="planilla-section__title">Materiales</div>
            <table className="table" style={{ fontSize: "0.82em" }}>
              <thead><tr>{["Material","Cant.","P.Unit","Subtotal"].map(h => <th key={h} style={{ background: "var(--color-bg)" }}>{h}</th>)}</tr></thead>
              <tbody>{(materiales || ticket.materiales).map((m, i) => (
                <tr key={i}><td>{m.nombre}</td><td>{m.qty||1}</td><td>${Number(m.precio).toFixed(2)}</td><td style={{ fontWeight: 600 }}>${(m.precio*(m.qty||1)).toFixed(2)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <div className="planilla-total">
          <span className="planilla-total__label">TOTAL A COBRAR</span>
          <span className="planilla-total__amount">${(total ?? ticket.total ?? 0).toFixed(2)}</span>
        </div>
        <div className="planilla-section" style={{ borderBottom: "none" }}>
          <div className="planilla-section__title">Firma del Cliente</div>
          {(firma || ticket.firma) ? (
            <div style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: 4, display: "inline-block", background: "#fafbfc" }}>
              <img src={firma || ticket.firma} alt="Firma" style={{ height: 80, width: 250, objectFit: "contain", display: "block" }} />
            </div>
          ) : <div style={{ height: 60, border: "2px dashed var(--color-border)", borderRadius: "var(--radius-md)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-light)", fontSize: "0.8em" }}>Sin firma</div>}
        </div>
      </div>
    </div>
  );
}

export function ComentariosSection({ ticketId, comentarios }) {
  const { user, addComentario, removeComentario } = useApp();
  const [texto, setTexto] = useState("");
  const enviar = () => { if (texto.trim().length < 3) return; addComentario(ticketId, texto.trim()); setTexto(""); };

  return (
    <div className="comments-section">
      <div className="comments-section__header">
        <span>🔒</span>
        <div>
          <div className="comments-section__title">Comentarios internos</div>
          <div className="comments-section__subtitle">Solo visibles para el equipo.</div>
        </div>
      </div>
      {(!comentarios || comentarios.length === 0) && <div className="comments-section__empty">Sin comentarios aún.</div>}
      {(comentarios || []).map(c => (
        <div key={c.id} className="comment-item">
          <div className="comment-item__body">
            <div className="comment-item__meta">
              <span className={`comment-item__rol comment-item__rol--${c.userRol}`}>{ROL_LABELS[c.userRol] || c.userRol}</span>
              <span className="comment-item__user">{c.userName}</span>
              <span className="comment-item__ts">{typeof c.ts === "string" ? c.ts : new Date(c.ts).toLocaleString("es-VE")}</span>
            </div>
            <div className="comment-item__text">{c.texto}</div>
          </div>
          {c.userId === user?.id && <button className="comment-item__delete" onClick={() => removeComentario(ticketId, c.id)} title="Eliminar">×</button>}
        </div>
      ))}
      <div className="comments-section__input-row">
        <input value={texto} onChange={e => setTexto(e.target.value)} onKeyDown={e => e.key === "Enter" && enviar()}
          placeholder="Agregar comentario..." className="comments-section__input" />
        <Btn onClick={enviar} variant="warning" size="sm" disabled={texto.trim().length < 3}>Agregar</Btn>
      </div>
    </div>
  );
}

export function CerrarTicketModal({ ticket, onClose }) {
  const { cerrarTicket, showNotif, materiales: catMat } = useApp();
  const [paso, setPaso] = useState("formulario");
  const [solucion, setSolucion] = useState(ticket.solucion || "");
  const [firma, setFirma] = useState(ticket.firma || null);
  const [firmaExiste] = useState(!!ticket.firma);
  const [tipoVisita, setTipoVisita] = useState(ticket.tipoVisita || "paga");
  const [usaMat, setUsaMat] = useState((ticket.materiales || []).length > 0);
  const [materiales, setMateriales] = useState(ticket.materiales?.length ? ticket.materiales : []);
  const [estadoCierre, setEstadoCierre] = useState("resuelto");

  const calcTotal = () => {
    const matT = materiales.reduce((s, m) => s + (m.precio * (m.qty || 1)), 0);
    if (tipoVisita === "garantia") return 0;
    if (tipoVisita === "pagaManoObra") return 10;
    if (tipoVisita === "pagaMateriales") return matT;
    return 10 + matT;
  };

  const agregarMat = () => { const p = catMat[0] || { id: "m1", nombre: "Material", precio: 0 }; setMateriales(prev => [...prev, { ...p, qty: 1 }]); };
  const updateMat = (i, f, v) => setMateriales(prev => prev.map((m, idx) => idx === i ? { ...m, [f]: v } : m));
  const removeMat = (i) => setMateriales(prev => prev.filter((_, idx) => idx !== i));

  const irPreview = () => {
    if (solucion.length < 10) { showNotif("Mínimo 10 caracteres en descripción", "danger"); return; }
    if (!firma) { showNotif("Falta firma del cliente", "danger"); return; }
    setPaso("preview");
  };

  const confirmar = async () => {
    await cerrarTicket(ticket.id, {
      solucion, firma, tipoVisita, materiales, total: calcTotal(),
      estado: estadoCierre, cobro: tipoVisita === "garantia" ? "nocobrado" : "pendiente",
    });
    onClose();
  };

  return (
    <Modal title={`Cerrar — ${ticket.id}`} onClose={onClose} size="lg">
      <div className="stepper">
        {[["1","Formulario"],["2","Revisar"]].map(([n,l],i) => {
          const act = (i===0 && paso==="formulario")||(i===1 && paso==="preview");
          const done = i===0 && paso==="preview";
          return (<div key={n} className="stepper__step">
            <div className={`stepper__circle stepper__circle--${done?"done":act?"active":"inactive"}`}>{done?"✓":n}</div>
            <span className={`stepper__label stepper__label--${done?"done":act?"active":"inactive"}`}>{l}</span>
            {i===0 && <div className={`stepper__line stepper__line--${paso==="preview"?"done":"inactive"}`}/>}
          </div>);
        })}
      </div>

      {paso === "formulario" && <>
        <div style={{ background: "var(--color-bg)", borderRadius: "var(--radius-md)", padding: 14, marginBottom: 16, fontSize: "0.88em" }}>
          <strong>{ticket.clienteNombre}</strong> — {ticket.clienteDireccion} — NAP: {ticket.clienteCajaNap}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="form-group">
            <label className="form-label">Descripción del trabajo *</label>
            <textarea value={solucion} onChange={e => setSolucion(e.target.value)} rows={3}
              placeholder="Mínimo 10 caracteres..."
              className={`form-textarea ${solucion.length > 0 && solucion.length < 10 ? "form-input--error" : ""}`} />
            <span className={`form-hint form-hint--${solucion.length < 10 ? "error" : "success"}`}>{solucion.length}/10</span>
          </div>
          <div className="grid-2">
            <Select label="Tipo de visita" value={tipoVisita} onChange={e => setTipoVisita(e.target.value)} options={TIPO_VISITA_OPTIONS} />
            <Select label="Estado de cierre" value={estadoCierre} onChange={e => setEstadoCierre(e.target.value)}
              options={[{ value: "resuelto", label: "Resuelto ✓" }, { value: "sinresolver", label: "Sin Resolver ✗" }]} />
          </div>
          <div className="form-group">
            <label className="form-label" style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={usaMat} onChange={e => setUsaMat(e.target.checked)} /> ¿Se usaron materiales?
            </label>
            {usaMat && (
              <div style={{ marginTop: 10, background: "var(--color-bg)", borderRadius: "var(--radius-md)", padding: 12 }}>
                {materiales.map((mat, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                    <select className="form-select" style={{ flex: 2 }} value={mat.id}
                      onChange={e => { const m = catMat.find(x => x.id === e.target.value); if (m) { updateMat(i, "id", m.id); updateMat(i, "nombre", m.nombre); updateMat(i, "precio", m.precio); } }}>
                      {catMat.map(m => <option key={m.id} value={m.id}>{m.nombre} (${m.precio})</option>)}
                    </select>
                    <input type="number" min="1" value={mat.qty || 1} onChange={e => updateMat(i, "qty", +e.target.value)} className="form-input" style={{ width: 60 }} />
                    <button onClick={() => removeMat(i)} style={{ background: "none", border: "none", color: "var(--color-danger)", cursor: "pointer", fontSize: "1.2em" }}>×</button>
                  </div>
                ))}
                <Btn onClick={agregarMat} variant="ghost" size="sm">+ Agregar material</Btn>
              </div>
            )}
          </div>
          {firmaExiste ? (
            <div className="signature-saved">
              <div className="signature-saved__header"><span style={{ color: "var(--color-success)" }}>✓</span><div><div className="signature-saved__title">Firma ya registrada</div></div></div>
              <img src={firma} alt="Firma" />
              <Btn onClick={() => setFirma(null)} variant="ghost" size="sm" style={{ marginTop: 8 }}>🔄 Reemplazar</Btn>
            </div>
          ) : (<>
            <SignaturePad onChange={setFirma} />
            <div className={`signature-status signature-status--${firma ? "ok" : "pending"}`}>{firma ? "✓ Firma registrada" : "⚠ Pendiente firma"}</div>
          </>)}
          <div className="info-box info-box--info" style={{ justifyContent: "space-between" }}>
            <span style={{ fontWeight: 600 }}>Total:</span>
            <span style={{ fontSize: "1.4em", fontWeight: 700, fontFamily: "var(--font-mono)" }}>${calcTotal().toFixed(2)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <Btn onClick={onClose} variant="ghost">Cancelar</Btn>
            <Btn onClick={irPreview} variant="primary" size="lg">Ver planilla →</Btn>
          </div>
        </div>
      </>}

      {paso === "preview" && <>
        <div className="info-box info-box--warning" style={{ marginBottom: 18 }}>
          <span style={{ fontSize: "1.2em" }}>👁</span>
          <div><div style={{ fontWeight: 700 }}>Vista previa</div><div style={{ fontSize: "0.85em" }}>Revisa antes de confirmar.</div></div>
        </div>
        <PlanillaContenido ticket={ticket} solucion={solucion} firma={firma} tipoVisita={tipoVisita} materiales={materiales} total={calcTotal()} estadoCierre={estadoCierre} />
        <ComentariosSection ticketId={ticket.id} comentarios={ticket.comentarios || []} />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20 }}>
          <Btn onClick={() => setPaso("formulario")} variant="ghost">← Editar</Btn>
          <Btn onClick={confirmar} variant={estadoCierre === "resuelto" ? "success" : "danger"} size="lg">
            {estadoCierre === "resuelto" ? "✓ Cerrar Resuelto" : "✗ Cerrar Sin Resolver"}
          </Btn>
        </div>
      </>}
    </Modal>
  );
}

export function VerPlanillaModal({ ticket, onClose }) {
  return (
    <Modal title={`Planilla — ${ticket.id}`} onClose={onClose} size="lg">
      <PlanillaContenido ticket={ticket} />
      <div style={{ marginTop: 20 }}><ComentariosSection ticketId={ticket.id} comentarios={ticket.comentarios || []} /></div>
    </Modal>
  );
}

export function TicketTable({ tickets: rawTickets, rol }) {
  const [historialTk, setHistorialTk] = useState(null);
  const [magicTk, setMagicTk] = useState(null);
  const [modTk, setModTk] = useState(null);
  const [cerrarTk, setCerrarTk] = useState(null);
  const [planillaTk, setPlanillaTk] = useState(null);
  const { deleteTicket, iniciarTicket, actualizarCobro, tickets: allTickets, tecnicos } = useApp();

  const [filtro, setFiltro] = useState({ busqueda: "", estado: "", tecnico: "", cobro: "" });
  const setF = (k, v) => setFiltro(f => ({ ...f, [k]: v }));
  const [sortCol, setSortCol] = useState("hora");
  const [sortDir, setSortDir] = useState("asc");
  const toggleSort = (col) => { if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortCol(col); setSortDir("asc"); } };
  const SortIcon = ({ col }) => sortCol === col ? <span className="sort-icon sort-icon--active">{sortDir === "asc" ? "↑" : "↓"}</span> : <span className="sort-icon">↕</span>;

  const tickets = useMemo(() => {
    let list = [...rawTickets];
    const q = filtro.busqueda.toLowerCase();
    if (q) list = list.filter(t => t.id.toLowerCase().includes(q) || t.clienteNombre.toLowerCase().includes(q) || (t.clienteCedula||"").toLowerCase().includes(q) || t.motivo.toLowerCase().includes(q));
    if (filtro.estado) list = list.filter(t => t.estado === filtro.estado);
    if (filtro.tecnico) list = list.filter(t => t.tecnicoId === filtro.tecnico);
    if (filtro.cobro) list = list.filter(t => t.cobro === filtro.cobro);
    const fns = { id: t => t.id, hora: t => t.hora, fecha: t => t.fecha, cliente: t => t.clienteNombre, estado: t => t.estado, total: t => t.total || 0 };
    const fn = fns[sortCol] || (t => t.hora);
    list.sort((a, b) => { const va = fn(a), vb = fn(b); const c = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb)); return sortDir === "asc" ? c : -c; });
    return list;
  }, [rawTickets, filtro, sortCol, sortDir]);

  const hayFiltros = filtro.busqueda || filtro.estado || filtro.tecnico || filtro.cobro;
  const thCl = (col, s = true) => `${s ? "sortable" : ""} ${sortCol === col ? "sort-active" : ""}`;

  return (<>
    {historialTk && <HistorialModal ticket={historialTk} onClose={() => setHistorialTk(null)} />}
    {magicTk && <MagicLinkModal ticket={magicTk} onClose={() => setMagicTk(null)} />}
    {modTk && <ModificarModal ticket={modTk} onClose={() => setModTk(null)} />}
    {cerrarTk && <CerrarTicketModal ticket={cerrarTk} onClose={() => setCerrarTk(null)} />}
    {planillaTk && <VerPlanillaModal ticket={allTickets.find(t => t.id === planillaTk.id) || planillaTk} onClose={() => setPlanillaTk(null)} />}

    <div className="filters-bar">
      <div className="filters-bar__group" style={{ flex: 1, minWidth: 160 }}>
        <label className="filters-bar__label">Buscar</label>
        <input value={filtro.busqueda} onChange={e => setF("busqueda", e.target.value)} placeholder="ID, cliente, motivo..." className="filters-bar__input" />
      </div>
      <div className="filters-bar__group"><label className="filters-bar__label">Estado</label>
        <select value={filtro.estado} onChange={e => setF("estado", e.target.value)} className="filters-bar__select">
          <option value="">Todos</option><option value="pendiente">Pendiente</option><option value="encurso">En Curso</option>
          <option value="resuelto">Resuelto</option><option value="sinresolver">Sin Resolver</option>
        </select>
      </div>
      {rol !== ROLES.OPERACIONES && <div className="filters-bar__group"><label className="filters-bar__label">Técnico</label>
        <select value={filtro.tecnico} onChange={e => setF("tecnico", e.target.value)} className="filters-bar__select">
          <option value="">Todos</option>{tecnicos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
        </select>
      </div>}
      {rol === ROLES.POSVENTA && <div className="filters-bar__group"><label className="filters-bar__label">Cobro</label>
        <select value={filtro.cobro} onChange={e => setF("cobro", e.target.value)} className="filters-bar__select">
          <option value="">Todos</option><option value="pendiente">Pendiente</option><option value="cobrado">Cobrado</option><option value="nocobrado">No cobrado</option>
        </select>
      </div>}
      {hayFiltros && <Btn variant="ghost" size="sm" onClick={() => setFiltro({ busqueda: "", estado: "", tecnico: "", cobro: "" })}>✕ Limpiar</Btn>}
      <div className="filters-bar__count">{tickets.length} resultado{tickets.length !== 1 ? "s" : ""}{hayFiltros ? ` de ${rawTickets.length}` : ""}</div>
    </div>

    <div className="table-wrapper"><table className="table"><thead><tr>
      <th className={thCl("id")} onClick={() => toggleSort("id")}>ID <SortIcon col="id" /></th>
      <th className={thCl("cliente")} onClick={() => toggleSort("cliente")}>Cliente <SortIcon col="cliente" /></th>
      <th>Técnico</th>
      <th className={thCl("fecha")} onClick={() => toggleSort("fecha")}>Fecha <SortIcon col="fecha" /></th>
      <th className={thCl("hora")} onClick={() => toggleSort("hora")}>Hora <SortIcon col="hora" /></th>
      <th>Motivo</th>
      <th className={thCl("estado")} onClick={() => toggleSort("estado")}>Estado <SortIcon col="estado" /></th>
      {rol === ROLES.POSVENTA && <><th>Cierre</th><th className={thCl("total")} onClick={() => toggleSort("total")}>Cobro <SortIcon col="total" /></th></>}
      <th>Acciones</th>
    </tr></thead><tbody>
      {tickets.length === 0 && <tr className="table__empty-row"><td colSpan={rol === ROLES.POSVENTA ? 10 : 8}>{hayFiltros ? "Sin coincidencias" : "No hay tickets"}</td></tr>}
      {tickets.map(t => (
        <tr key={t.id}>
          <td className="table__cell-id">{t.id}</td>
          <td><div className="table__cell-nombre">{t.clienteNombre}</div><div className="table__cell-cedula">{t.clienteCedula}</div></td>
          <td style={{ fontSize: "0.88em", color: "var(--color-text-muted)" }}>{t.tecnicoNombre}</td>
          <td className="table__cell-mono">{t.fecha}</td>
          <td className="table__cell-mono">{t.hora}</td>
          <td style={{ maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "0.88em" }}>{t.motivo}</td>
          <td><Badge estado={t.estado} /></td>
          {rol === ROLES.POSVENTA && <>
            <td className="table__cell-mono" style={{ fontSize: "0.82em" }}>{t.fechaCierre || "—"}</td>
            <td><div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <CobroBadge cobro={t.cobro} />
                <select value={t.cobro} onChange={e => actualizarCobro(t.id, e.target.value)} className="filters-bar__select" style={{ fontSize: "0.75em", padding: "2px 4px" }}>
                  <option value="pendiente">Pendiente</option><option value="cobrado">Cobrado</option><option value="nocobrado">No cobrado</option>
                </select>
              </div>
              {t.total > 0 && <span className={`cobro-monto cobro-monto--${t.cobro}`}>${(t.total || 0).toFixed(2)}</span>}
            </div></td>
          </>}
          <td><div className="table__actions">
            <Btn size="sm" variant="ghost" onClick={() => setPlanillaTk(t)} title="Ver planilla">👁</Btn>
            {rol === ROLES.VENTAS && <>
              <Btn size="sm" variant="ghost" onClick={() => setModTk(t)} title="Modificar">✏️</Btn>
              <Btn size="sm" variant="ghost" onClick={() => setMagicTk(t)} title="Link mágico">🔗</Btn>
              <Btn size="sm" variant="ghost" onClick={() => setHistorialTk(t)} title="Historial">📋</Btn>
              <Btn size="sm" variant="danger" onClick={() => { if (window.confirm(`¿Eliminar ${t.id}?`)) deleteTicket(t.id); }} title="Eliminar">🗑</Btn>
            </>}
            {rol === ROLES.OPERACIONES && <>
              {t.estado === "pendiente" && <Btn size="sm" variant="primary" onClick={() => iniciarTicket(t.id)}>▶ Iniciar</Btn>}
              {t.estado === "encurso" && <Btn size="sm" variant="success" onClick={() => setCerrarTk(t)}>✓ Cerrar</Btn>}
            </>}
          </div></td>
        </tr>
      ))}
    </tbody></table></div>
  </>);
}