// ============================================================
// TETENET — App Principal v3.0
// Reescrito: estado completo, API corregida, panel superadmin
// ============================================================

import { useState, useContext, createContext, useRef, useEffect, useCallback, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import "./tetenet-styles.css";

// ============================================================
// ROLES
// ============================================================
const ROLES = {
  VENTAS:      "ventas-soporte",
  OPERACIONES: "operaciones",
  POSVENTA:    "posventa",
  SUPERADMIN:  "superadmin",
};

const ROL_LABELS = {
  [ROLES.VENTAS]:      "Ventas-Soporte",
  [ROLES.OPERACIONES]: "Operaciones",
  [ROLES.POSVENTA]:    "Posventa",
  [ROLES.SUPERADMIN]:  "Super Admin",
};


// Logo de la empresa — cambia la ruta si usas otro nombre de archivo
const LOGO_SRC = "/logo.png";

// Componente reutilizable para el logo
function Logo({ size = 32, style = {} }) {
  return (
    <img
      src={LOGO_SRC}
      alt="TETENET"
      style={{ height: size, width: "auto", objectFit: "contain", ...style }}
      onError={e => { e.target.style.display = "none"; }} // si no carga, no rompe nada
    />
  );
}


// ============================================================
// CONFIG
// ============================================================
const ENV = {
  API_BASE:  import.meta.env.VITE_API_BASE  || "",
  APP_URL:   import.meta.env.VITE_APP_URL   || window.location.origin,
  MOCK_MODE: !import.meta.env.VITE_API_BASE,
};

// ============================================================
// COLORES (solo para Recharts)
// ============================================================
const CHART_COLORS = {
  primary: "#1a7fa3", success: "#10a37f",
  warning: "#f59e0b", danger: "#ef4444",
  white: "#ffffff", border: "#e5e7eb",
};


// ============================================================
// CONSTANTES DE DOMINIO
// ============================================================
const MOTIVOS = ["Sin Conexion","Intermitencia","Velocidad lenta","Sin señal","Reubicación equipo","Instalación nueva","ONU colgada","Antena colgada","Recableado","Sin potencia","Antena desalineada","Antena desconectada","Cambio de tecnología","Fibra Electrificada","Router desconfigurado","Fibra Fracturada","Conector Dañado","Mantenimiento preventivo","Cambio de clave/SSID presencial","Retiro de equipos","Sustitución de equipo por avería","Validación de cobertura","Otro"];

const HORAS = (() => {
  const s = [];
  for (let h = 7; h <= 16; h++)
    for (const m of [0, 30]) {
      if (h === 7 && m === 0) continue;
      s.push(`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`);
    }
  return s;
})();

const TIPO_VISITA_LABELS = {
  paga: "Paga ($10 + materiales)", pagaMateriales: "Solo materiales",
  pagaManoObra: "Solo mano de obra ($10)", garantia: "Garantía ($0)",
};
const TIPO_VISITA_OPTIONS = Object.entries(TIPO_VISITA_LABELS).map(([value, label]) => ({ value, label }));

const HOY = new Date().toISOString().split("T")[0];
const genId = () => "TK-" + Math.random().toString(36).substr(2, 6).toUpperCase();

// ============================================================
// API LAYER
// ============================================================
const getToken = () => localStorage.getItem("tetenet_token");

const apiFetch = async (path, options = {}) => {
  const token = getToken();
  const res = await fetch(`${ENV.API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const data = await res.json();
  if (!res.ok) throw { status: res.status, ...data };
  return data;
};

// ============================================================
// CONTEXTO GLOBAL
// ============================================================
const AppCtx = createContext(null);
const useApp = () => useContext(AppCtx);

function AppProvider({ children }) {
  const [user, setUser]                   = useState(null);
  const [iniciando, setIniciando]         = useState(true);
  const [tickets, setTickets]             = useState([]);
  const [tecnicos, setTecnicos]           = useState([]);
  const [materiales, setMateriales]       = useState([]);
  const [notification, setNotification]   = useState(null);

  // ── Notificaciones ──
  const showNotif = useCallback((msg, type = "info", duration = 4000) => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), duration);
  }, []);

  // ── Cargar catálogos ──
  const cargarCatalogos = useCallback(async () => {
    try {
      if (ENV.MOCK_MODE) {
        setTecnicos(MOCK_USERS.filter(u => u.rol === ROLES.OPERACIONES));
        setMateriales(MOCK_MATERIALES);
        return;
      }
      const [tecRes, matRes] = await Promise.all([
        apiFetch("/catalogos/tecnicos"),
        apiFetch("/catalogos/materiales"),
      ]);
      if (tecRes.ok) setTecnicos(tecRes.tecnicos);
      if (matRes.ok) setMateriales(matRes.materiales);
    } catch (err) {
      console.error("Error cargando catálogos:", err);
    }
  }, []);

  // ── Cargar tickets ──
  const cargarTickets = useCallback(async () => {
    try {
      if (ENV.MOCK_MODE) return; // en mock se manejan localmente
      const res = await apiFetch("/tickets");
      if (res.ok) setTickets(res.tickets);
    } catch (err) {
      console.error("Error cargando tickets:", err);
    }
  }, []);

  // ── Login ──
  const login = useCallback(async (email, password) => {
    try {
      if (ENV.MOCK_MODE) {
        // Mock superadmin
        if (email === "superadmin@web.com" && password === "superadmin2026.") {
          const u = { id: "superadmin", nombre: "Super Admin", email, rol: ROLES.SUPERADMIN };
          setUser(u);
          localStorage.setItem("tetenet_token", "mock-superadmin");
          return true;
        }
        const u = MOCK_USERS.find(x => x.email === email && x.password === password);
        if (!u) return false;
        setUser(u);
        localStorage.setItem("tetenet_token", "mock-" + u.id);
        setTecnicos(MOCK_USERS.filter(x => x.rol === ROLES.OPERACIONES));
        setMateriales(MOCK_MATERIALES);
        return true;
      }
      const res = await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        localStorage.setItem("tetenet_token", res.token);
        setUser(res.user);
        await cargarCatalogos();
        await cargarTickets();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [cargarCatalogos, cargarTickets]);

  // ── Magic login ──
  const loginMagic = useCallback(async (tecnicoId) => {
    if (ENV.MOCK_MODE) {
      const u = MOCK_USERS.find(x => x.id === tecnicoId);
      if (u) { setUser(u); localStorage.setItem("tetenet_token", "mock-" + u.id); }
      return;
    }
    try {
      const res = await apiFetch("/auth/magic", {
        method: "POST",
        body: JSON.stringify({ tecnicoId }),
      });
      if (res.ok) {
        localStorage.setItem("tetenet_token", res.token);
        setUser(res.user);
        await cargarCatalogos();
        await cargarTickets();
      }
    } catch (err) {
      console.error("Magic login error:", err);
    }
  }, [cargarCatalogos, cargarTickets]);

  // ── Logout ──
  const logout = useCallback(() => {
    setUser(null);
    setTickets([]);
    localStorage.removeItem("tetenet_token");
  }, []);

  // ── Restaurar sesión al montar ──
  useEffect(() => {
    const restaurar = async () => {
      const token = getToken();
      if (!token) { setIniciando(false); return; }
      // Mock mode
      if (ENV.MOCK_MODE) {
        if (token === "mock-superadmin") {
          setUser({ id: "superadmin", nombre: "Super Admin", email: "superadmin@web.com", rol: ROLES.SUPERADMIN });
        } else {
          const uid = token.replace("mock-", "");
          const u = MOCK_USERS.find(x => x.id === uid);
          if (u) {
            setUser(u);
            setTecnicos(MOCK_USERS.filter(x => x.rol === ROLES.OPERACIONES));
            setMateriales(MOCK_MATERIALES);
          }
        }
        setIniciando(false);
        return;
      }
      try {
        const res = await apiFetch("/auth/verify");
        if (res.ok && res.user) {
          setUser(res.user);
          await cargarCatalogos();
          await cargarTickets();
        }
      } catch {
        localStorage.removeItem("tetenet_token");
      } finally {
        setIniciando(false);
      }
    };
    restaurar();
  }, []); // eslint-disable-line

  // ── Magic link desde URL ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const magic = params.get("magic");
    if (magic && !user) {
      loginMagic(magic);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [user, loginMagic]);

  // ── Acciones sobre tickets ──
  const addTicket = useCallback(async (datos) => {
    try {
      if (ENV.MOCK_MODE) {
        const ticket = {
          ...datos, id: genId(), estado: "pendiente", cobro: "pendiente",
          total: 0, materiales: [], solucion: "", firma: null, fechaCierre: null,
          comentarios: [],
          historial: [{ ts: new Date().toISOString(), user: user?.nombre, accion: "Ticket creado" }],
        };
        setTickets(prev => [ticket, ...prev]);
        showNotif("Ticket creado ✓", "success");
        return ticket;
      }
      const res = await apiFetch("/tickets", { method: "POST", body: JSON.stringify(datos) });
      if (res.ok) {
        setTickets(prev => [res.ticket, ...prev]);
        showNotif("Ticket creado ✓", "success");
        return res.ticket;
      }
    } catch (err) {
      showNotif(err.mensaje || "Error creando ticket", "danger");
      return null;
    }
  }, [user, showNotif]);

  const iniciarTicket = useCallback(async (ticketId) => {
    try {
      if (ENV.MOCK_MODE) {
        setTickets(prev => prev.map(t => t.id === ticketId ? {
          ...t, estado: "encurso",
          historial: [...t.historial, { ts: new Date().toISOString(), user: user?.nombre, accion: "Soporte iniciado" }],
        } : t));
        showNotif("Ticket iniciado", "info");
        return;
      }
      const res = await apiFetch(`/tickets/${ticketId}/iniciar`, { method: "PATCH" });
      if (res.ok) {
        setTickets(prev => prev.map(t => t.id === ticketId ? {
          ...t, estado: "encurso",
          historial: [...t.historial, { ts: new Date().toISOString(), user: user?.nombre, accion: "Soporte iniciado" }],
        } : t));
        showNotif("Ticket iniciado", "info");
      }
    } catch (err) {
      showNotif(err.mensaje || "Error iniciando ticket", "danger");
    }
  }, [user, showNotif]);

  const cerrarTicket = useCallback(async (ticketId, datos) => {
    try {
      const fechaCierre = new Date().toLocaleString("es-VE");
      if (ENV.MOCK_MODE) {
        setTickets(prev => prev.map(t => t.id === ticketId ? {
          ...t, ...datos, fechaCierre,
          historial: [...t.historial, { ts: new Date().toISOString(), user: user?.nombre, accion: `Ticket cerrado como ${datos.estado}` }],
        } : t));
        showNotif("Ticket cerrado ✓", "success");
        return;
      }
      const res = await apiFetch(`/tickets/${ticketId}/cerrar`, {
        method: "POST", body: JSON.stringify(datos),
      });
      if (res.ok) {
        setTickets(prev => prev.map(t => t.id === ticketId ? {
          ...t, ...datos, fechaCierre: res.fechaCierre || fechaCierre,
          historial: [...t.historial, { ts: new Date().toISOString(), user: user?.nombre, accion: `Ticket cerrado como ${datos.estado}` }],
        } : t));
        showNotif("Ticket cerrado ✓", "success");
      }
    } catch (err) {
      showNotif(err.mensaje || "Error cerrando ticket", "danger");
    }
  }, [user, showNotif]);

  const updateTicket = useCallback(async (ticketId, datos, accion) => {
    try {
      if (ENV.MOCK_MODE) {
        setTickets(prev => prev.map(t => t.id === ticketId ? {
          ...t, ...datos,
          historial: [...t.historial, { ts: new Date().toISOString(), user: user?.nombre, accion }],
        } : t));
        return;
      }
      await apiFetch(`/tickets/${ticketId}`, { method: "PUT", body: JSON.stringify(datos) });
      setTickets(prev => prev.map(t => t.id === ticketId ? {
        ...t, ...datos,
        historial: [...t.historial, { ts: new Date().toISOString(), user: user?.nombre, accion }],
      } : t));
    } catch (err) {
      showNotif(err.mensaje || "Error modificando ticket", "danger");
    }
  }, [user, showNotif]);

  const deleteTicket = useCallback(async (ticketId) => {
    try {
      if (!ENV.MOCK_MODE) await apiFetch(`/tickets/${ticketId}`, { method: "DELETE" });
      setTickets(prev => prev.filter(t => t.id !== ticketId));
      showNotif("Ticket eliminado", "info");
    } catch (err) {
      showNotif(err.mensaje || "Error eliminando ticket", "danger");
    }
  }, [showNotif]);

  const actualizarCobro = useCallback(async (ticketId, cobro) => {
    try {
      if (!ENV.MOCK_MODE) {
        await apiFetch(`/tickets/${ticketId}/cobro`, {
          method: "PATCH", body: JSON.stringify({ cobro }),
        });
      }
      setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, cobro } : t));
      showNotif(`Cobro actualizado: ${cobro}`, "success");
    } catch (err) {
      showNotif(err.mensaje || "Error actualizando cobro", "danger");
    }
  }, [showNotif]);

  const addComentario = useCallback(async (ticketId, texto) => {
    const comentario = {
      id: "c" + Date.now(), userId: user?.id, userName: user?.nombre,
      userRol: user?.rol, ts: new Date().toISOString(), texto,
    };
    try {
      if (!ENV.MOCK_MODE) {
        const res = await apiFetch(`/tickets/${ticketId}/comentarios`, {
          method: "POST", body: JSON.stringify({ texto }),
        });
        if (res.ok) Object.assign(comentario, res.comentario);
      }
      setTickets(prev => prev.map(t => t.id === ticketId
        ? { ...t, comentarios: [...(t.comentarios || []), comentario] }
        : t
      ));
    } catch (err) {
      showNotif("Error agregando comentario", "danger");
    }
  }, [user, showNotif]);

  const removeComentario = useCallback(async (ticketId, comentarioId) => {
    try {
      if (!ENV.MOCK_MODE) {
        await apiFetch(`/tickets/${ticketId}/comentarios/${comentarioId}`, { method: "DELETE" });
      }
      setTickets(prev => prev.map(t => t.id === ticketId
        ? { ...t, comentarios: (t.comentarios || []).filter(c => c.id !== comentarioId) }
        : t
      ));
    } catch (err) {
      showNotif("Error eliminando comentario", "danger");
    }
  }, [showNotif]);

  const checkDuplicate = useCallback((tecnicoId, fecha, hora, excludeId = null) => {
    return tickets.find(t =>
      t.tecnicoId === tecnicoId && t.fecha === fecha && t.hora === hora && t.id !== excludeId
    ) || null;
  }, [tickets]);

  // ── Loader ──
  if (iniciando) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-sidebar)", color: "#fff", fontSize: "1.1em" }}>
        🔄 Cargando sesión...
      </div>
    );
  }

  return (
    <AppCtx.Provider value={{
      user, login, loginMagic, logout,
      tickets, addTicket, iniciarTicket, cerrarTicket, updateTicket, deleteTicket,
      actualizarCobro, addComentario, removeComentario, checkDuplicate,
      tecnicos, materiales, notification, showNotif,
    }}>
      {children}
    </AppCtx.Provider>
  );
}


// ============================================================
// COMPONENTES BASE
// ============================================================
const Badge = ({ estado }) => {
  const L = { pendiente: "PENDIENTE", encurso: "EN CURSO", resuelto: "RESUELTO", sinresolver: "SIN RESOLVER" };
  return <span className={`badge badge--${estado}`}>{L[estado] || estado}</span>;
};

const CobroBadge = ({ cobro }) => {
  const T = { pendiente: "Pendiente de cobro", cobrado: "Cobrado", nocobrado: "No cobrado" };
  return <span className={`cobro-symbol cobro-symbol--${cobro}`} title={T[cobro]}>$</span>;
};

const Btn = ({ children, onClick, variant = "primary", size = "md", disabled, className: extra, title }) => (
  <button disabled={disabled} onClick={onClick} title={title}
    className={`btn btn--${variant} btn--${size} ${extra || ""}`}>{children}</button>
);

const Input = ({ label, hint, hintType, ...props }) => (
  <div className="form-group">
    {label && <label className="form-label">{label}</label>}
    <input className={`form-input ${hintType === "error" ? "form-input--error" : ""}`} {...props} />
    {hint && <span className={`form-hint form-hint--${hintType || "muted"}`}>{hint}</span>}
  </div>
);

const Select = ({ label, options, ...props }) => (
  <div className="form-group">
    {label && <label className="form-label">{label}</label>}
    <select className="form-select" {...props}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </div>
);

const Card = ({ children, className: extra, style }) => (
  <div className={`card ${extra || ""}`} style={style}>{children}</div>
);

const SectionTitle = ({ children }) => <h2 className="section-title">{children}</h2>;

function Toast() {
  const { notification } = useApp();
  if (!notification) return null;
  return <div className={`toast toast--${notification.type}`}>{notification.msg}</div>;
}


// ============================================================
// FIRMA
// ============================================================
function SignaturePad({ onChange }) {
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
// MODALES
// ============================================================
function Modal({ title, onClose, children, size = "md" }) {
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

function HistorialModal({ ticket, onClose }) {
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

function MagicLinkModal({ ticket, onClose }) {
  const { loginMagic } = useApp();
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
      {ENV.MOCK_MODE && (
        <Btn onClick={() => { loginMagic(ticket.tecnicoId); onClose(); }} variant="primary">
          Simular apertura (entrar como {ticket.tecnicoNombre})
        </Btn>
      )}
    </Modal>
  );
}

function ModificarModal({ ticket, onClose }) {
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
        <Input label="Nombre cliente" value={form.clienteNombre} onChange={e => set("clienteNombre", e.target.value)} />
        <Input label="Teléfono" value={form.clienteTelefono} onChange={e => set("clienteTelefono", e.target.value)} />
        <Input label="Zona" value={form.clienteZona} onChange={e => set("clienteZona", e.target.value)} />
        <Input label="Caja NAP" value={form.clienteCajaNap} onChange={e => set("clienteCajaNap", e.target.value)} />
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


// ============================================================
// PLANILLA CONTENIDO
// ============================================================
function PlanillaContenido({ ticket, solucion, firma, tipoVisita, materiales, total, estadoCierre }) {
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
            TETENET
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
              <img src={firma || ticket.firma} alt="Firma" style={{ height: 80, display: "block" }} />
            </div>
          ) : <div style={{ height: 60, border: "2px dashed var(--color-border)", borderRadius: "var(--radius-md)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-light)", fontSize: "0.8em" }}>Sin firma</div>}
        </div>
      </div>
    </div>
  );
}


// ============================================================
// COMENTARIOS SECTION
// ============================================================
function ComentariosSection({ ticketId, comentarios }) {
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


// ============================================================
// CERRAR TICKET MODAL
// ============================================================
function CerrarTicketModal({ ticket, onClose }) {
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
      {/* Stepper */}
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

function VerPlanillaModal({ ticket, onClose }) {
  return (
    <Modal title={`Planilla — ${ticket.id}`} onClose={onClose} size="lg">
      <PlanillaContenido ticket={ticket} />
      <div style={{ marginTop: 20 }}><ComentariosSection ticketId={ticket.id} comentarios={ticket.comentarios || []} /></div>
    </Modal>
  );
}


// ============================================================
// TABLA DE TICKETS
// ============================================================
function TicketTable({ tickets: rawTickets, rol }) {
  const [historialTk, setHistorialTk] = useState(null);
  const [magicTk, setMagicTk] = useState(null);
  const [modTk, setModTk] = useState(null);
  const [cerrarTk, setCerrarTk] = useState(null);
  const [planillaTk, setPlanillaTk] = useState(null);
  const { deleteTicket, iniciarTicket, actualizarCobro, showNotif, tickets: allTickets, tecnicos } = useApp();

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


// ============================================================
// DASHBOARD
// ============================================================
function Dashboard({ rol }) {
  const { tickets } = useApp();
  const [fechaSel, setFechaSel] = useState(HOY);
  const hoy = tickets.filter(t => t.fecha === fechaSel);
  const estados = ["pendiente", "encurso", "resuelto", "sinresolver"];
  const pieData = estados.map(e => ({ name: e, value: hoy.filter(t => t.estado === e).length })).filter(d => d.value > 0);
  const PIE_COLORS = [CHART_COLORS.warning, CHART_COLORS.primary, CHART_COLORS.success, CHART_COLORS.danger];

  const semana = useMemo(() => {
    const dias = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const fecha = d.toISOString().split("T")[0];
      dias.push({ dia: d.toLocaleDateString("es-VE", { weekday: "short" }),
        resuelto: tickets.filter(t => t.fecha === fecha && t.estado === "resuelto").length,
        sinresolver: tickets.filter(t => t.fecha === fecha && t.estado === "sinresolver").length });
    }
    return dias;
  }, [tickets]);

  const stats = [
    { key: "pendiente", label: "Pendientes", value: hoy.filter(t => t.estado === "pendiente").length },
    { key: "encurso", label: "En Curso", value: hoy.filter(t => t.estado === "encurso").length },
    { key: "resuelto", label: "Resueltos", value: hoy.filter(t => t.estado === "resuelto").length },
    { key: "sinresolver", label: "Sin Resolver", value: hoy.filter(t => t.estado === "sinresolver").length },
  ];

  return (<div>
    <SectionTitle>Dashboard — {new Date().toLocaleDateString("es-VE", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</SectionTitle>
    <div className="stats-grid">{stats.map(s => (
      <div key={s.key} className={`stat-card stat-card--${s.key}`}>
        <div className="stat-card__number">{s.value}</div>
        <div className="stat-card__label">{s.label}</div>
      </div>
    ))}</div>
    <div className="charts-grid">
      <div className="chart-card"><div className="chart-card__title">Distribución del Día</div>
        {pieData.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}><PieChart>
            <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`} labelLine={false} fontSize={11}>
              {pieData.map((e, i) => <Cell key={i} fill={PIE_COLORS[estados.indexOf(e.name)]} />)}
            </Pie><Tooltip />
          </PieChart></ResponsiveContainer>
        ) : <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-light)" }}>Sin datos hoy</div>}
      </div>
      <div className="chart-card"><div className="chart-card__title">Volumen Semanal</div>
        <ResponsiveContainer width="100%" height={200}><BarChart data={semana}>
          <XAxis dataKey="dia" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip />
          <Bar dataKey="resuelto" fill={CHART_COLORS.success} radius={[4,4,0,0]} name="Resueltos" />
          <Bar dataKey="sinresolver" fill={CHART_COLORS.danger} radius={[4,4,0,0]} name="Sin resolver" />
        </BarChart></ResponsiveContainer>
      </div>
    </div>
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
      <h3 style={{ margin: 0, fontSize: "1em", fontWeight: 700, color: "var(--color-text)" }}>
        Tickets — {fechaSel === HOY ? "Hoy" : fechaSel}
      </h3>
      <Input label="" type="date" value={fechaSel}
        onChange={e => setFechaSel(e.target.value)} style={{ width: 160 }} />
      {fechaSel !== HOY && (
        <Btn variant="ghost" size="sm" onClick={() => setFechaSel(HOY)}>↩ Hoy</Btn>
      )}
    </div>
      <TicketTable tickets={hoy} rol={rol} />
    </Card>
  </div>);
}


// ============================================================
// NUEVO TICKET
// ============================================================
function NuevoTicket() {
  const { addTicket, showNotif, tecnicos } = useApp();
  const [cedTipo, setCedTipo] = useState("V");
  const [cedNum, setCedNum] = useState("");
  const [cliente, setCliente] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [form, setForm] = useState({ motivo: MOTIVOS[0], motivoOtro: "", fecha: HOY, hora: "07:30", tecnicoId: tecnicos[0]?.id || "", tipoVisita: "paga" });
  const [datosExtra, setDatosExtra] = useState([]);
  const [showMagic, setShowMagic] = useState("");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const buscar = async () => {
    if (!cedNum) return;
    setBuscando(true);
    const cedula = `${cedTipo}${cedNum}`;
    if (ENV.MOCK_MODE) {
      const num = cedNum.replace(/\D/g, "");
      const c = MOCK_CLIENTES[num];
      if (c) setCliente({ ...c });
      else { showNotif(`Cliente ${cedula} no encontrado`, "danger"); setCliente(null); }
    } else {
      try {
        const res = await apiFetch(`/clientes?cedula=${cedula}`);
        if (res.ok) setCliente(res.cliente);
        else { showNotif(res.mensaje || "No encontrado", "danger"); setCliente(null); }
      } catch { showNotif("Error buscando cliente", "danger"); setCliente(null); }
    }
    setBuscando(false);
  };

  const guardar = async () => {
    if (!cliente) return;
    const tec = tecnicos.find(t => t.id === form.tecnicoId);
    const motivo = form.motivo === "Otro" ? form.motivoOtro : form.motivo;
    const ticket = await addTicket({
      ...form, motivo,
      clienteCedula: cliente.cedula, clienteNombre: cliente.nombre,
      clienteTelefono: cliente.telefono, clienteZona: cliente.zona,
      clienteCajaNap: cliente.cajaNap, clienteDireccion: cliente.direccion,
      tecnicoNombre: tec?.nombre, datosAdicionales: datosExtra,
    });
    if (!ticket) return;
    setShowMagic(ticket);
    setCliente(null); setCedNum(""); setDatosExtra([]);
    setForm({ motivo: MOTIVOS[0], motivoOtro: "", fecha: HOY, hora: "07:30", tecnicoId: tecnicos[0]?.id || "", tipoVisita: "paga" });
  };

  return (<div>
    {showMagic && <MagicLinkModal ticket={showMagic} onClose={() => setShowMagic(null)} />}
    <SectionTitle>Crear Ticket de Soporte</SectionTitle>
    <Card>
      <div style={{ fontWeight: 600, marginBottom: 14, fontSize: "0.92em" }}>1. Buscar Cliente</div>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
        <Select label="Tipo" value={cedTipo} onChange={e => setCedTipo(e.target.value)} options={["V","J","E"].map(v => ({ value: v, label: v }))} />
        <div style={{ flex: 1, minWidth: 160 }}>
          <Input label="Nro. documento" value={cedNum} onChange={e => setCedNum(e.target.value)} placeholder="12345678" onKeyDown={e => e.key === "Enter" && buscar()} />
        </div>
        <Btn onClick={buscar} disabled={buscando || !cedNum} variant="primary">{buscando ? "..." : "Buscar"}</Btn>
      </div>
      {ENV.MOCK_MODE && <div style={{ fontSize: "0.75em", color: "var(--color-text-muted)", marginTop: 6 }}>Demo: 12345678 / 87654321 / 11223344</div>}
    </Card>
    {cliente && <Card style={{ marginTop: 14 }}>
      <div style={{ fontWeight: 600, marginBottom: 14, fontSize: "0.92em" }}>2. Datos del Cliente</div>
      <div className="grid-2" style={{ marginBottom: 20 }}>
        <Input label="Nombre" value={cliente.nombre} onChange={e => setCliente(c => ({ ...c, nombre: e.target.value }))} />
        <Input label="Teléfono" value={cliente.telefono} onChange={e => setCliente(c => ({ ...c, telefono: e.target.value }))} />
        <Input label="Zona" value={cliente.zona} onChange={e => setCliente(c => ({ ...c, zona: e.target.value }))} />
        <Input label="Caja NAP" value={cliente.cajaNap} onChange={e => setCliente(c => ({ ...c, cajaNap: e.target.value }))} />
      </div>
      <div style={{ fontWeight: 600, marginBottom: 14, fontSize: "0.92em" }}>3. Datos del Soporte</div>
      <div className="grid-3" style={{ marginBottom: 14 }}>
        <Input label="Fecha" type="date" value={form.fecha} onChange={e => set("fecha", e.target.value)} />
        <Select label="Hora" value={form.hora} onChange={e => set("hora", e.target.value)} options={HORAS.map(h => ({ value: h, label: h }))} />
        <Select label="Técnico" value={form.tecnicoId} onChange={e => set("tecnicoId", e.target.value)} options={tecnicos.map(t => ({ value: t.id, label: t.nombre }))} />
      </div>
      <div className="grid-2" style={{ marginBottom: 14 }}>
        <Select label="Motivo" value={form.motivo} onChange={e => set("motivo", e.target.value)} options={MOTIVOS.map(m => ({ value: m, label: m }))} />
        <Select label="Tipo visita" value={form.tipoVisita} onChange={e => set("tipoVisita", e.target.value)} options={TIPO_VISITA_OPTIONS} />
      </div>
      {form.motivo === "Otro" && <Input label="Especifique" value={form.motivoOtro} onChange={e => set("motivoOtro", e.target.value)} style={{ marginBottom: 14 }} />}
      <div style={{ fontWeight: 600, marginBottom: 10, fontSize: "0.92em" }}>4. Datos Adicionales <span style={{ color: "var(--color-text-muted)", fontWeight: 400 }}>(opcional)</span></div>
      {datosExtra.map((d, i) => (
        <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "flex-end" }}>
          <Input label="Campo" value={d.nombre} onChange={e => setDatosExtra(p => p.map((x, j) => j === i ? { ...x, nombre: e.target.value } : x))} />
          <Input label="Valor" value={d.valor} onChange={e => setDatosExtra(p => p.map((x, j) => j === i ? { ...x, valor: e.target.value } : x))} />
          <Btn variant="danger" size="sm" onClick={() => setDatosExtra(p => p.filter((_, j) => j !== i))}>×</Btn>
        </div>
      ))}
      <Btn onClick={() => setDatosExtra(p => [...p, { nombre: "", valor: "" }])} variant="ghost" size="sm">+ Dato adicional</Btn>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
        <Btn onClick={guardar} variant="success" size="lg">Guardar Ticket ✓</Btn>
      </div>
    </Card>}
  </div>);
}


// ============================================================
// PLANIFICACIÓN
// ============================================================
function Planificacion({ rol }) {
  const { tickets, tecnicos } = useApp();
  const [fechaSel, setFechaSel] = useState(HOY);
  const [subView, setSubView] = useState("kanban");
  const [tecInf, setTecInf] = useState(tecnicos[0]?.id || "");

  const ticketsDia = tickets.filter(t => t.fecha === fechaSel).sort((a, b) => a.hora.localeCompare(b.hora));
  const infTickets = tickets.filter(t => t.tecnicoId === tecInf && t.fecha === fechaSel);
  const infRows = infTickets.flatMap(t => {
    const rows = [];
    const ini = (t.historial||[]).find(h => h.accion.includes("iniciado"));
    const cie = (t.historial||[]).find(h => h.accion.includes("cerrado"));
    if (ini) rows.push({ hora: typeof ini.ts === "string" ? ini.ts.split(" ")[1] || ini.ts.split("T")[1]?.substring(0,5) || ini.ts : "", accion: `Abrió ${t.id}`, desc: "Trabajo iniciado", estado: "encurso" });
    if (cie) rows.push({ hora: typeof cie.ts === "string" ? cie.ts.split(" ")[1] || cie.ts.split("T")[1]?.substring(0,5) || cie.ts : "", accion: `Cerró ${t.id}`, desc: t.solucion || "—", estado: t.estado });
    return rows;
  }).sort((a, b) => a.hora.localeCompare(b.hora));

  return (<div>
    <SectionTitle>Planificación</SectionTitle>
    <div style={{ display: "flex", gap: 10, marginBottom: 18, alignItems: "center", flexWrap: "wrap" }}>
      <Input label="Fecha" type="date" value={fechaSel} onChange={e => setFechaSel(e.target.value)} style={{ width: 180 }} />
      <div style={{ display: "flex", marginTop: 18 }}>
        {[["kanban","📋 Tarjetas"],["informe","📊 Informe"]].map(([v,l],i) => (
          <button key={v} onClick={() => setSubView(v)}
            style={{ padding: "8px 20px", border: "1px solid var(--color-border)", background: subView === v ? "var(--color-primary)" : "var(--color-white)", color: subView === v ? "#fff" : "var(--color-text)", fontFamily: "var(--font-body)", fontWeight: 600, fontSize: "0.85em", cursor: "pointer", borderRadius: i === 0 ? "6px 0 0 6px" : "0 6px 6px 0" }}>{l}</button>
        ))}
      </div>
    </div>

    {subView === "kanban" && <div className="kanban-board">
      {tecnicos.map(tec => {
        const tks = ticketsDia.filter(t => t.tecnicoId === tec.id);
        return (<div key={tec.id} className="kanban-column">
          <div className="kanban-column__header">{tec.nombre}<span className="kanban-column__count">{tks.length}</span></div>
          <div className="kanban-column__body">
            {tks.length === 0 && <div className="kanban-empty">Sin tickets</div>}
            {tks.map(t => (<div key={t.id} className={`kanban-card kanban-card--${t.estado}`}>
              <div className="kanban-card__top"><span className="kanban-card__id">{t.id}</span><Badge estado={t.estado} /></div>
              <div className="kanban-card__nombre">{t.clienteNombre}</div>
              <div className="kanban-card__info">🕐 {t.hora} — {t.motivo}</div>
              {(t.datosAdicionales||[]).map((d, i) => <div key={i} className="kanban-card__extra">{d.nombre}: {d.valor}</div>)}
            </div>))}
          </div>
        </div>);
      })}
    </div>}

    {subView === "informe" && <Card>
      <div style={{ display: "flex", gap: 14, marginBottom: 18, alignItems: "flex-end", flexWrap: "wrap" }}>
        <Select label="Técnico" value={tecInf} onChange={e => setTecInf(e.target.value)} options={tecnicos.map(t => ({ value: t.id, label: t.nombre }))} />
      </div>
      <div className="table-wrapper"><table className="table"><thead><tr>
        {["Hora","Acción","Descripción","Estado"].map(h => <th key={h}>{h}</th>)}
      </tr></thead><tbody>
        {infRows.length === 0 && <tr className="table__empty-row"><td colSpan={4}>Sin actividad</td></tr>}
        {infRows.map((r, i) => (<tr key={i}>
          <td className="table__cell-mono">{r.hora}</td>
          <td style={{ fontWeight: 600 }}>{r.accion}</td>
          <td style={{ color: "var(--color-text-muted)", maxWidth: 200 }}>{r.desc}</td>
          <td><Badge estado={r.estado} /></td>
        </tr>))}
      </tbody></table></div>
    </Card>}
  </div>);
}


// ============================================================
// MIS TICKETS
// ============================================================
function MisTickets() {
  const { tickets, user } = useApp();
  const mis = tickets.filter(t => t.tecnicoId === user.id && t.fecha === HOY).sort((a, b) => a.hora.localeCompare(b.hora));
  return (<div>
    <SectionTitle>Mis Tickets — Hoy</SectionTitle>
    <Card><TicketTable tickets={mis} rol={ROLES.OPERACIONES} /></Card>
  </div>);
}


// ============================================================
// PANEL SUPERADMIN — Gestión de usuarios
// ============================================================
function AdminPanel() {
  const { showNotif } = useApp();
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editUser, setEditUser] = useState(null);
  const [newUser, setNewUser] = useState(false);
  const [passModal, setPassModal] = useState(null);

  const cargar = async () => {
    setLoading(true);
    try {
      if (ENV.MOCK_MODE) {
        setUsuarios(MOCK_USERS.map(u => ({ ...u, activo: true, creado_en: new Date().toISOString() })));
      } else {
        const res = await apiFetch("/admin/usuarios");
        if (res.ok) setUsuarios(res.usuarios);
      }
    } catch (err) { showNotif("Error cargando usuarios", "danger"); }
    setLoading(false);
  };

  useEffect(() => { cargar(); }, []); // eslint-disable-line

  const ROLES_OPTS = [
    { value: ROLES.VENTAS, label: "Ventas-Soporte" },
    { value: ROLES.OPERACIONES, label: "Operaciones" },
    { value: ROLES.POSVENTA, label: "Posventa" },
  ];

  // ── Form para crear/editar ──
  function UserForm({ usuario, onClose }) {
    const isNew = !usuario;
    const [f, setF] = useState(isNew
      ? { nombre: "", email: "", password: "", rol: ROLES.VENTAS, telefono: "", activo: true }
      : { nombre: usuario.nombre, email: usuario.email, rol: usuario.rol, telefono: usuario.telefono || "", activo: usuario.activo }
    );
    const [saving, setSaving] = useState(false);
    const s = (k, v) => setF(x => ({ ...x, [k]: v }));

    const guardar = async () => {
      if (!f.nombre || !f.email || !f.rol) { showNotif("Completa todos los campos", "danger"); return; }
      if (isNew && !f.password) { showNotif("Contraseña requerida", "danger"); return; }
      setSaving(true);
      try {
        if (ENV.MOCK_MODE) {
          if (isNew) setUsuarios(prev => [...prev, { id: "u" + Date.now(), ...f, activo: true, creado_en: new Date().toISOString() }]);
          else setUsuarios(prev => prev.map(u => u.id === usuario.id ? { ...u, ...f } : u));
          showNotif(isNew ? "Usuario creado ✓" : "Usuario actualizado ✓", "success");
          onClose();
        } else {
          if (isNew) {
            const res = await apiFetch("/admin/usuarios", { method: "POST", body: JSON.stringify(f) });
            if (res.ok) { await cargar(); showNotif("Usuario creado ✓", "success"); onClose(); }
          } else {
            const res = await apiFetch(`/admin/usuarios/${usuario.id}`, { method: "PUT", body: JSON.stringify(f) });
            if (res.ok) { await cargar(); showNotif("Usuario actualizado ✓", "success"); onClose(); }
          }
        }
      } catch (err) { showNotif(err.mensaje || "Error", "danger"); }
      setSaving(false);
    };

    return (
      <Modal title={isNew ? "Crear Usuario" : `Editar — ${usuario.nombre}`} onClose={onClose} size="sm">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Input label="Nombre" value={f.nombre} onChange={e => s("nombre", e.target.value)} />
          <Input label="Email" type="email" value={f.email} onChange={e => s("email", e.target.value)} />
          {isNew && <Input label="Contraseña" type="password" value={f.password} onChange={e => s("password", e.target.value)} />}
          <Select label="Rol" value={f.rol} onChange={e => s("rol", e.target.value)} options={ROLES_OPTS} />
          <Input label="Teléfono" value={f.telefono} onChange={e => s("telefono", e.target.value)} />
          {!isNew && (
            <label className="form-label" style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={f.activo} onChange={e => s("activo", e.target.checked)} /> Activo
            </label>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 10 }}>
            <Btn onClick={onClose} variant="ghost">Cancelar</Btn>
            <Btn onClick={guardar} disabled={saving}>{saving ? "Guardando..." : "Guardar"}</Btn>
          </div>
        </div>
      </Modal>
    );
  }

  // ── Modal cambiar contraseña ──
  function PassForm({ usuario, onClose }) {
    const [pass, setPass] = useState("");
    const [saving, setSaving] = useState(false);
    const guardar = async () => {
      if (pass.length < 4) { showNotif("Mínimo 4 caracteres", "danger"); return; }
      setSaving(true);
      try {
        if (ENV.MOCK_MODE) { showNotif("Contraseña cambiada (mock) ✓", "success"); onClose(); }
        else {
          const res = await apiFetch(`/admin/usuarios/${usuario.id}/password`, { method: "PATCH", body: JSON.stringify({ password: pass }) });
          if (res.ok) { showNotif("Contraseña cambiada ✓", "success"); onClose(); }
        }
      } catch (err) { showNotif(err.mensaje || "Error", "danger"); }
      setSaving(false);
    };
    return (
      <Modal title={`Cambiar clave — ${usuario.nombre}`} onClose={onClose} size="sm">
        <Input label="Nueva contraseña" type="password" value={pass} onChange={e => setPass(e.target.value)} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 16 }}>
          <Btn onClick={onClose} variant="ghost">Cancelar</Btn>
          <Btn onClick={guardar} disabled={saving}>{saving ? "..." : "Cambiar"}</Btn>
        </div>
      </Modal>
    );
  }

  const desactivar = async (id) => {
    if (!window.confirm("¿Desactivar este usuario?")) return;
    try {
      if (ENV.MOCK_MODE) {
        setUsuarios(prev => prev.map(u => u.id === id ? { ...u, activo: false } : u));
      } else {
        await apiFetch(`/admin/usuarios/${id}`, { method: "DELETE" });
        await cargar();
      }
      showNotif("Usuario desactivado", "info");
    } catch (err) { showNotif("Error", "danger"); }
  };

  return (<div>
    {editUser && <UserForm usuario={editUser} onClose={() => setEditUser(null)} />}
    {newUser && <UserForm usuario={null} onClose={() => setNewUser(false)} />}
    {passModal && <PassForm usuario={passModal} onClose={() => setPassModal(null)} />}

    <SectionTitle>Gestión de Usuarios</SectionTitle>
    <div style={{ marginBottom: 16 }}>
      <Btn onClick={() => setNewUser(true)} variant="success">+ Crear Usuario</Btn>
    </div>

    {loading ? <div style={{ padding: 40, textAlign: "center", color: "var(--color-text-muted)" }}>Cargando...</div> : (
      <Card>
        <div className="table-wrapper"><table className="table"><thead><tr>
          <th>ID</th><th>Nombre</th><th>Email</th><th>Rol</th><th>Teléfono</th><th>Activo</th><th>Acciones</th>
        </tr></thead><tbody>
          {usuarios.map(u => (
            <tr key={u.id} style={{ opacity: u.activo === false ? 0.5 : 1 }}>
              <td className="table__cell-id">{u.id}</td>
              <td style={{ fontWeight: 600 }}>{u.nombre}</td>
              <td style={{ fontSize: "0.88em" }}>{u.email}</td>
              <td><span className={`rol-badge rol-badge--${u.rol}`}>{ROL_LABELS[u.rol] || u.rol}</span></td>
              <td style={{ fontSize: "0.88em" }}>{u.telefono || "—"}</td>
              <td>{u.activo !== false ? "✅" : "❌"}</td>
              <td><div className="table__actions">
                <Btn size="sm" variant="ghost" onClick={() => setEditUser(u)} title="Editar">✏️</Btn>
                <Btn size="sm" variant="ghost" onClick={() => setPassModal(u)} title="Cambiar clave">🔑</Btn>
                {u.activo !== false && <Btn size="sm" variant="danger" onClick={() => desactivar(u.id)} title="Desactivar">🚫</Btn>}
              </div></td>
            </tr>
          ))}
        </tbody></table></div>
      </Card>
    )}
  </div>);
}


// ============================================================
// LOGIN
// ============================================================
function Login() {
  const { login } = useApp();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true); setError("");
    const ok = await login(email, pass);
    if (!ok) setError("Credenciales incorrectas.");
    setLoading(false);
  };

  return (
    <div className="login-screen">
      <div className="login-box">
        <Logo size={64} style={{ marginBottom: 8 }} />
        <h1 className="login-box__title">TETENET</h1>
        <p className="login-box__subtitle">Sistema de Gestión de Soporte</p>
        <div className="login-box__fields">
          <Input label="Correo" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="usuario@tetenet.com" />
          <Input label="Contraseña" type="password" value={pass} onChange={e => setPass(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} />
          {error && <div className="login-box__error">{error}</div>}
          <Btn onClick={handleLogin} variant="primary" size="lg" disabled={loading}>{loading ? "Ingresando..." : "Ingresar"}</Btn>
        </div>
        {ENV.MOCK_MODE && (
          <div className="login-box__demo">
            <strong>Cuentas demo:</strong><br />
            📊 analista@tetenet.com / 123<br />
            🔧 carlos@tetenet.com / 123<br />
            👁 vista@tetenet.com / 123<br />
            🔐 superadmin@web.com / superadmin2026.
          </div>
        )}
      </div>
    </div>
  );
}


// ============================================================
// LAYOUT PRINCIPAL
// ============================================================
function AppLayout() {
  const { user, logout } = useApp();
  const defaultView = user.rol === ROLES.OPERACIONES ? "mis-tickets" : user.rol === ROLES.SUPERADMIN ? "admin" : "dashboard";
  const [view, setView] = useState(defaultView);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const menuItems = {
    [ROLES.VENTAS]:      [{ id: "dashboard", icon: "📊", label: "Dashboard" }, { id: "nuevo-ticket", icon: "➕", label: "Nuevo Ticket" }, { id: "planificacion", icon: "📋", label: "Planificación" }],
    [ROLES.OPERACIONES]: [{ id: "mis-tickets", icon: "🔧", label: "Mis Tickets" }],
    [ROLES.POSVENTA]:    [{ id: "dashboard", icon: "📊", label: "Dashboard" }, { id: "planificacion", icon: "📋", label: "Planificación" }],
    [ROLES.SUPERADMIN]:  [{ id: "admin", icon: "🔐", label: "Usuarios" }, { id: "dashboard", icon: "📊", label: "Dashboard" }, { id: "planificacion", icon: "📋", label: "Planificación" }],
  };
  const items = menuItems[user.rol] || [];

  return (
    <div className="app-layout">
      <nav className={`sidebar ${sidebarOpen ? "" : "sidebar--collapsed"}`}>
        <div className="sidebar__logo">
          <Logo size={28} />
          <span className="sidebar__logo-text">TETENET</span>
        </div>
        <div className="sidebar__nav">
          {items.map(item => (
            <button key={item.id} className={`sidebar__nav-item ${view === item.id ? "sidebar__nav-item--active" : ""}`}
              onClick={() => setView(item.id)}>
              <span>{item.icon}</span><span>{item.label}</span>
            </button>
          ))}
        </div>
        <div className="sidebar__footer">
          <div className="sidebar__user-name">{user.nombre}</div>
          <span className={`rol-badge rol-badge--${user.rol}`}>{ROL_LABELS[user.rol] || user.rol}</span>
          <button className="sidebar__logout-btn" onClick={logout}>Cerrar sesión</button>
        </div>
      </nav>

      <div className="main-content">
        <div className="top-bar">
          <button className="top-bar__menu-btn" onClick={() => setSidebarOpen(s => !s)}>☰</button>
          <span className="top-bar__title">{items.find(i => i.id === view)?.label || "—"}</span>
        </div>
        <main className="page-content">
          {view === "dashboard" && <Dashboard rol={user.rol} />}
          {view === "nuevo-ticket" && user.rol === ROLES.VENTAS && <NuevoTicket />}
          {view === "planificacion" && <Planificacion rol={user.rol} />}
          {view === "mis-tickets" && <MisTickets />}
          {view === "admin" && user.rol === ROLES.SUPERADMIN && <AdminPanel />}
        </main>
      </div>
      <Toast />
    </div>
  );
}


// ============================================================
// ROOT
// ============================================================
function AppContent() {
  const { user } = useApp();
  return user ? <AppLayout /> : <Login />;
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}