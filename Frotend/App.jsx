// ============================================================
// TETENET — App Principal
// Versión: 2.0 — CSS separado + variables de entorno
//
// ARCHIVOS QUE NECESITA ESTE ARCHIVO:
//   tetenet-styles.css  → todos los estilos
//   .env                → variables de entorno (ver sección CONFIG)
// ============================================================

import { useState, useContext, createContext, useRef, useEffect, useCallback, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import "./tetenet-styles.css";

// ============================================================
// ROLES — Fuente única de verdad para los nombres de roles
//
// El nombre del rol aparece en comparaciones, menús, badges,
// clases CSS y en la base de datos. Si lo escribes como string
// directo en cada lugar ("analista") y lo quieres cambiar,
// tienes que buscarlo en 50 sitios y seguro se te escapa uno.
//
// Con este objeto, cambias el valor aquí y se propaga a TODO.
// Ej: si "posventa" pasa a "cobranza" → una línea, listo.
// ============================================================
const ROLES = {
  VENTAS:      "ventas-soporte",  // antes: "analista"
  OPERACIONES: "operaciones",     // sin cambio
  POSVENTA:    "posventa",        // antes: "vista"
};

// Etiquetas legibles para mostrar al usuario en pantalla
const ROL_LABELS = {
  [ROLES.VENTAS]:      "Ventas-Soporte",
  [ROLES.OPERACIONES]: "Operaciones",
  [ROLES.POSVENTA]:    "Posventa",
};



// ============================================================
// CONFIG — Variables de entorno
//
// En Easypanel: pestaña "Environment" de tu servicio.
// En desarrollo local: crea un archivo ".env.local" en la raíz.
//
// Variables disponibles:
//   VITE_API_BASE   → URL base de los webhooks de n8n
//                     Ej: https://n8n.tudominio.com/webhook/tetenet
//   VITE_APP_URL    → URL pública de la app (para links mágicos)
//                     Ej: https://app.tetenet.com
//
// Si VITE_API_BASE está vacío → la app corre en modo MOCK
// (datos locales, sin llamadas reales). Útil para desarrollo.
// ============================================================
const ENV = {
  API_BASE:  import.meta.env.VITE_API_BASE  || "",
  APP_URL:   import.meta.env.VITE_APP_URL   || "https://app.tetenet.com",
  MOCK_MODE: !import.meta.env.VITE_API_BASE,  // true si no hay API configurada
};


// ============================================================
// COLORES — Solo para componentes de Recharts
// Los gráficos no pueden usar clases CSS, necesitan colores inline.
// Todo lo demás usa clases del archivo tetenet-styles.css.
// ============================================================
const CHART_COLORS = {
  primary:     "#1a7fa3",
  success:     "#10a37f",
  warning:     "#f59e0b",
  danger:      "#ef4444",
  pendiente:   "#f59e0b",
  encurso:     "#1a7fa3",
  resuelto:    "#10a37f",
  sinresolver: "#ef4444",
  white:       "#ffffff",
  border:      "#e5e7eb",
};


// ============================================================
// DATOS MOCK — Solo se usan cuando MOCK_MODE = true
// (cuando no hay VITE_API_BASE configurado en el .env)
// En producción estos datos vienen de los webhooks de n8n.
// ============================================================
const MOCK_USERS = [
  { id: "u1", nombre: "Laura Mendez",  email: "analista@tetenet.com", password: "123", rol: ROLES.VENTAS    },
  { id: "u2", nombre: "Carlos Ruiz",   email: "carlos@tetenet.com",   password: "123", rol: ROLES.OPERACIONES },
  { id: "u3", nombre: "Miguel Torres", email: "miguel@tetenet.com",   password: "123", rol: ROLES.OPERACIONES },
  { id: "u4", nombre: "Sofia Castillo",email: "vista@tetenet.com",    password: "123", rol: ROLES.POSVENTA       },
];

const MOCK_CLIENTES = {
  "12345678": { cedula: "V-12345678", nombre: "Roberto Jiménez",    telefono: "04141234567", zona: "Zona Norte", cajaNap: "NAP-045", direccion: "Av. Principal, Casa 12, Urb. Los Pinos"         },
  "87654321": { cedula: "V-87654321", nombre: "Ana García",         telefono: "04167654321", zona: "Zona Sur",   cajaNap: "NAP-089", direccion: "Calle 5, Edificio Torre Azul, Piso 3"            },
  "11223344": { cedula: "J-11223344", nombre: "Empresa XYZ C.A.",   telefono: "02121122334", zona: "Zona Este",  cajaNap: "NAP-012", direccion: "Centro Empresarial Plaza, Oficina 201"            },
};

const MOCK_MATERIALES = [
  { id: "m1", nombre: "Cable Fibra 10m",  precio: 8.50  },
  { id: "m2", nombre: "Conector SC/APC",  precio: 2.00  },
  { id: "m3", nombre: "Patch Cord 3m",    precio: 5.00  },
  { id: "m4", nombre: "Splitter 1x4",     precio: 12.00 },
  { id: "m5", nombre: "ONU GPON",         precio: 45.00 },
];

const HOY = new Date().toISOString().split("T")[0];

const genId = () => "TK-" + Math.random().toString(36).substr(2, 6).toUpperCase();

// Tickets de demostración (solo en modo mock)
const INITIAL_TICKETS = [
  {
    id: "TK-A1B2C3", clienteCedula: "V-12345678", clienteNombre: "Roberto Jiménez",
    clienteTelefono: "04141234567", clienteZona: "Zona Norte", clienteCajaNap: "NAP-045",
    clienteDireccion: "Av. Principal, Casa 12, Urb. Los Pinos",
    tecnicoId: "u2", tecnicoNombre: "Carlos Ruiz",
    fecha: HOY, hora: "09:00", motivo: "Sin navegación", estado: "pendiente",
    tipoVisita: "paga", materiales: [], solucion: "", firma: null, total: 10,
    cobro: "pendiente", fechaCierre: null,
    historial: [{ ts: HOY + " 08:00", user: "Laura Mendez", accion: "Ticket creado" }],
    datosAdicionales: [], comentarios: [],
  },
  {
    id: "TK-D4E5F6", clienteCedula: "V-87654321", clienteNombre: "Ana García",
    clienteTelefono: "04167654321", clienteZona: "Zona Sur", clienteCajaNap: "NAP-089",
    clienteDireccion: "Calle 5, Edificio Torre Azul, Piso 3",
    tecnicoId: "u2", tecnicoNombre: "Carlos Ruiz",
    fecha: HOY, hora: "11:00", motivo: "Intermitencia", estado: "encurso",
    tipoVisita: "paga", materiales: [], solucion: "", firma: null, total: 10,
    cobro: "pendiente", fechaCierre: null,
    historial: [
      { ts: HOY + " 10:00", user: "Laura Mendez", accion: "Ticket creado" },
      { ts: HOY + " 11:05", user: "Carlos Ruiz",  accion: "Soporte iniciado" },
    ],
    datosAdicionales: [], comentarios: [],
  },
  {
    id: "TK-G7H8I9", clienteCedula: "J-11223344", clienteNombre: "Empresa XYZ C.A.",
    clienteTelefono: "02121122334", clienteZona: "Zona Este", clienteCajaNap: "NAP-012",
    clienteDireccion: "Centro Empresarial Plaza, Oficina 201",
    tecnicoId: "u3", tecnicoNombre: "Miguel Torres",
    fecha: HOY, hora: "10:00", motivo: "Velocidad lenta", estado: "resuelto",
    tipoVisita: "pagaMateriales",
    materiales: [{ id: "m1", nombre: "Cable Fibra 10m", precio: 8.50, qty: 1 }],
    solucion: "Se reemplazó tramo de fibra dañado. Velocidades restauradas al 100%.",
    firma: "data:image/png;base64,iVBORw0KGgo=", total: 8.50,
    cobro: "cobrado", fechaCierre: HOY + " 10:48",
    historial: [
      { ts: HOY + " 09:00", user: "Laura Mendez",  accion: "Ticket creado"               },
      { ts: HOY + " 10:05", user: "Miguel Torres", accion: "Soporte iniciado"             },
      { ts: HOY + " 10:48", user: "Miguel Torres", accion: "Ticket cerrado como resuelto" },
    ],
    datosAdicionales: [{ nombre: "Puerto ONU", valor: "4" }],
    comentarios: [{
      id: "c1", userId: "u1", userName: "Laura Mendez", userRol: ROLES.VENTAS,
      ts: HOY + " 10:50", texto: "Cliente reportó el mismo problema el mes pasado. Hacer seguimiento.",
    }],
  },
];


// ============================================================
// CONSTANTES DE DOMINIO
// ============================================================
const MOTIVOS = ["Sin Conexion", "Intermitencia", "Velocidad lenta", "Sin señal", "Reubicación equipo", "Instalación nueva", "ONU colgada", "Antena colgada", "Recableado", "Sin potencia", "Antena desalineada", "Antena desconectada", "Cambio de tecnología", "Fibra Electrificada", "Router desconfigurado", "Fibra Fracturada", "Conector Dañado", "Mantenimiento preventivo", "Cambio de clave/SSID presencial", "Retiro de equipos", "Sustitución de equipo por avería", "Validación de cobertura", "Otro"];

// Horarios en bloques de 30 minutos: 7:30 → 16:30
const HORAS = (() => {
  const slots = [];
  for (let h = 7; h <= 16; h++) {
    for (const m of [0, 30]) {
      if (h === 7 && m === 0) continue;  // empieza en 7:30
      slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return slots;
})();

const TIPO_VISITA_LABELS = {
  paga:          "Paga ($10 + materiales)",
  pagaMateriales:"Solo materiales",
  pagaManoObra:  "Solo mano de obra ($10)",
  garantia:      "Garantía ($0)",
};

const TIPO_VISITA_OPTIONS = Object.entries(TIPO_VISITA_LABELS).map(([value, label]) => ({ value, label }));


// ============================================================
// CAPA DE API
//
// Cada función primero verifica si estamos en MOCK_MODE.
// Si estamos en mock → devuelve datos locales.
// Si hay API → llama al webhook real de n8n.
//
// El token se guarda en localStorage con la clave "tetenet_token".
// Cada llamada lo incluye automáticamente en el header Authorization.
// ============================================================
const getToken = () => localStorage.getItem("tetenet_token");

// apiFetch: wrapper sobre fetch que agrega el token automáticamente
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
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

const API = {
  // POST /auth/login — valida credenciales, devuelve token + user
  login: async (email, password) => {
    if (ENV.MOCK_MODE) {
      const user = MOCK_USERS.find(u => u.email === email && u.password === password);
      if (!user) return { ok: false };
      return { ok: true, token: "mock-token-" + user.id, user };
    }
    return apiFetch("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  },

  // GET /clientes?cedula=... — busca un cliente por número de documento
  buscarCliente: async (cedula) => {
    if (ENV.MOCK_MODE) {
      const num = cedula.replace(/\D/g, "");
      const cliente = MOCK_CLIENTES[num];
      return cliente ? { ok: true, cliente } : { ok: false, mensaje: "Cliente no encontrado" };
    }
    return apiFetch(`/clientes?cedula=${cedula}`);
  },

  // GET /catalogos/tecnicos — lista de técnicos disponibles
  getTecnicos: async () => {
    if (ENV.MOCK_MODE) {
      return { ok: true, tecnicos: MOCK_USERS.filter(u => u.rol === ROLES.OPERACIONES) };
    }
    return apiFetch("/catalogos/tecnicos");
  },

  // GET /catalogos/materiales — catálogo de materiales y precios
  getMateriales: async () => {
    if (ENV.MOCK_MODE) return { ok: true, materiales: MOCK_MATERIALES };
    return apiFetch("/catalogos/materiales");
  },

  // GET /tickets — todos los tickets (con filtros opcionales por query param)
  getTickets: async (params = {}) => {
    if (ENV.MOCK_MODE) return { ok: true, tickets: INITIAL_TICKETS };
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/tickets${query ? "?" + query : ""}`);
  },

  // POST /tickets/crear — crea un nuevo ticket
  crearTicket: async (datos) => {
    if (ENV.MOCK_MODE) return { ok: true, ticket: { ...datos, id: genId(), estado: "pendiente", cobro: "pendiente" } };
    return apiFetch("/tickets", { method: "POST", body: JSON.stringify(datos) });
  },

  // POST /tickets/iniciar — cambia estado a "encurso"
  iniciarTicket: async (ticketId, tecnicoId) => {
    if (ENV.MOCK_MODE) return { ok: true, estado: "encurso" };
    return apiFetch("/tickets/iniciar", { method: "POST", body: JSON.stringify({ ticketId, tecnicoId }) });
  },

  // POST /tickets/cerrar — cierra el ticket con planilla completa
  cerrarTicket: async (ticketId, datos) => {
    if (ENV.MOCK_MODE) return { ok: true, fechaCierre: new Date().toLocaleString("es-VE") };
    return apiFetch("/tickets/cerrar", { method: "POST", body: JSON.stringify({ ticketId, ...datos }) });
  },

  // POST /tickets/cobro — actualiza el estado de cobro (solo rol vista)
  actualizarCobro: async (ticketId, cobro) => {
    if (ENV.MOCK_MODE) return { ok: true };
    return apiFetch("/tickets/cobro", { method: "POST", body: JSON.stringify({ ticketId, cobro }) });
  },

  // POST /tickets/comentario — agrega o elimina un comentario interno
  comentario: async (accion, datos) => {
    if (ENV.MOCK_MODE) return { ok: true };
    return apiFetch("/tickets/comentario", { method: "POST", body: JSON.stringify({ accion, ...datos }) });
  },
};


// ============================================================
// CONTEXTO GLOBAL
// Estado compartido entre todos los componentes de la app.
// ============================================================
const AppCtx = createContext(null);


const useApp = () => useContext(AppCtx);


// ============================================================
// COMPONENTES BASE — Usan clases CSS del archivo .css
// ============================================================

// Badge de estado del ticket: pendiente / encurso / resuelto / sinresolver
const Badge = ({ estado }) => {
  const labels = { pendiente: "PENDIENTE", encurso: "EN CURSO", resuelto: "RESUELTO", sinresolver: "SIN RESOLVER" };
  return <span className={`badge badge--${estado}`}>{labels[estado] || estado}</span>;
};

// Símbolo de cobro con color según estado
const CobroBadge = ({ cobro }) => {
  const titles = { pendiente: "Pendiente de cobro", cobrado: "Cobrado", nocobrado: "No cobrado" };
  return <span className={`cobro-symbol cobro-symbol--${cobro}`} title={titles[cobro]}>$</span>;
};

// Botón reutilizable — el hover lo maneja el CSS, no useState
const Btn = ({ children, onClick, variant = "primary", size = "md", disabled, className: extra, title }) => (
  <button
    disabled={disabled}
    onClick={onClick}
    title={title}
    className={`btn btn--${variant} btn--${size} ${extra || ""}`}
  >
    {children}
  </button>
);

// Input con label opcional
const Input = ({ label, hint, hintType, ...props }) => (
  <div className="form-group">
    {label && <label className="form-label">{label}</label>}
    <input className={`form-input ${hintType === "error" ? "form-input--error" : ""}`} {...props} />
    {hint && <span className={`form-hint form-hint--${hintType || "muted"}`}>{hint}</span>}
  </div>
);

// Select con label y opciones como array [{ value, label }]
const Select = ({ label, options, ...props }) => (
  <div className="form-group">
    {label && <label className="form-label">{label}</label>}
    <select className="form-select" {...props}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </div>
);

// Card contenedor
const Card = ({ children, className: extra }) => (
  <div className={`card ${extra || ""}`}>{children}</div>
);

// Título de sección con borde izquierdo
const SectionTitle = ({ children }) => (
  <h2 className="section-title">{children}</h2>
);


// ============================================================
// TOAST — Notificación emergente
// Se muestra en la esquina inferior derecha, desaparece solo.
// ============================================================
function Toast() {
  const { notification } = useApp();
  if (!notification) return null;
  return (
    <div className={`toast toast--${notification.type}`}>
      {notification.msg}
    </div>
  );
}


// ============================================================
// FIRMA — Canvas táctil para que el cliente firme
// Funciona con mouse (desktop) y touch (móvil/tablet).
// ============================================================
function SignaturePad({ onChange }) {
  const canvasRef = useRef(null);
  const drawing   = useRef(false);
  const hasDrawn  = useRef(false);

// ✅ CÓDIGO NUEVO (CORREGIDO)
  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const src  = e.touches ? e.touches[0] : e;
    
    // Coordenadas relativas al canvas
    const x = src.clientX - rect.left;
    const y = src.clientY - rect.top;
    
    // Escalar según la proporción entre tamaño CSS y canvas real
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    return { 
      x: x * scaleX, 
      y: y * scaleY 
    };
  };

  const start = (e) => {
    e.preventDefault();
    drawing.current = true;
    const c = canvasRef.current;
    const p = getPos(e, c);
    c.getContext("2d").beginPath();
    c.getContext("2d").moveTo(p.x, p.y);
  };

  const draw = (e) => {
    e.preventDefault();
    if (!drawing.current) return;
    const c   = canvasRef.current;
    const ctx = c.getContext("2d");
    const p   = getPos(e, c);
    ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = "#1a2332";
    ctx.lineWidth   = 2;
    ctx.lineCap     = "round";
    ctx.stroke();
    hasDrawn.current = true;
  };

  const end = () => {
    drawing.current = false;
    if (hasDrawn.current) onChange(canvasRef.current.toDataURL());
  };

  const clear = () => {
    const c = canvasRef.current;
    c.getContext("2d").clearRect(0, 0, c.width, c.height);
    hasDrawn.current = false;
    onChange(null);
  };

  return (
    <div className="signature-pad-wrapper">
      <label className="form-label">Firma del Cliente</label>
      <canvas
        ref={canvasRef}
        width={500} height={160}
        className="signature-pad"
        onMouseDown={start} onMouseMove={draw} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={draw} onTouchEnd={end}
      />
      <Btn onClick={clear} variant="ghost" size="sm">Limpiar firma</Btn>
    </div>
  );
}


// ============================================================
// MODAL BASE — Contenedor para todos los modales de la app
// ============================================================
function Modal({ title, onClose, children, size = "md" }) {
  return (
    <div className="modal-overlay">
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


// ============================================================
// MODAL — HISTORIAL DE CAMBIOS
// ============================================================
function HistorialModal({ ticket, onClose }) {
  return (
    <Modal title={`Historial — ${ticket.id}`} onClose={onClose} size="sm">
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {ticket.historial.map((h, i) => (
          <div key={i} style={{ padding: "10px 14px", background: "var(--color-bg)", borderRadius: "var(--radius-md)", borderLeft: "3px solid var(--color-primary)" }}>
            <div style={{ fontSize: "0.78em", color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>{h.ts}</div>
            <div style={{ fontSize: "0.9em",  fontWeight: 600, marginTop: 2 }}>{h.accion}</div>
            <div style={{ fontSize: "0.82em", color: "var(--color-text-muted)" }}>{h.user}</div>
          </div>
        ))}
      </div>
    </Modal>
  );
}


// ============================================================
// MODAL — LINK MÁGICO PARA EL TÉCNICO
// Muestra el link generado y simula el mensaje de WhatsApp.
// ============================================================
function MagicLinkModal({ ticket, onClose }) {
  const { loginMagic } = useApp();
  // En producción el token real viene del backend. Aquí usamos el ID como demo.
  const magicUrl = `${ENV.APP_URL}?magic=${ticket.tecnicoId}&ticket=${ticket.id}`;

  return (
    <Modal title="🔗 Link Mágico Generado" onClose={onClose} size="sm">
      <p style={{ color: "var(--color-text-muted)", fontSize: "0.9em", marginTop: 0 }}>
        Este link fue enviado al técnico por WhatsApp. Al abrirlo, entrará directamente al ticket sin necesidad de login.
      </p>

      {/* URL del link */}
      <div style={{ background: "var(--color-bg)", padding: 12, borderRadius: "var(--radius-md)", fontFamily: "var(--font-mono)", fontSize: "0.8em", wordBreak: "break-all", color: "var(--color-primary)", marginBottom: 16 }}>
        {magicUrl}
      </div>

      {/* Simulación del mensaje WhatsApp */}
      <div className="info-box info-box--info" style={{ flexDirection: "column", marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>📱 Mensaje WhatsApp simulado:</div>
        <div style={{ fontSize: "0.88em", lineHeight: 1.7 }}>
          Hola <strong>{ticket.tecnicoNombre}</strong>, tienes un nuevo ticket:<br />
          👤 Cliente: <strong>{ticket.clienteNombre}</strong><br />
          🕐 Hora: <strong>{ticket.hora}</strong><br />
          📋 Motivo: <strong>{ticket.motivo}</strong><br />
          🔗 <span style={{ color: "var(--color-primary)" }}>{magicUrl}</span>
        </div>
      </div>

      <Btn onClick={() => { loginMagic(ticket.tecnicoId); onClose(); }} variant="primary">
        Simular apertura del link (entrar como {ticket.tecnicoNombre})
      </Btn>
    </Modal>
  );
}


// ============================================================
// MODAL — MODIFICAR TICKET
// Solo accesible para el rol analista.
// ============================================================
function ModificarModal({ ticket, onClose }) {
  const { updateTicket, showNotif, tecnicos, checkDuplicate } = useApp();
  const [form, setForm] = useState({
    motivo:          ticket.motivo,
    hora:            ticket.hora,
    fecha:           ticket.fecha,
    tecnicoId:       ticket.tecnicoId,
    tipoVisita:      ticket.tipoVisita,
    clienteNombre:   ticket.clienteNombre,
    clienteTelefono: ticket.clienteTelefono,
    clienteZona:     ticket.clienteZona,
    clienteCajaNap:  ticket.clienteCajaNap,
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const guardar = () => {
    const dup = checkDuplicate(form.tecnicoId, form.fecha, form.hora, ticket.id);
    if (dup) {
      showNotif(`⛔ Conflicto: ese técnico ya tiene el ticket ${dup.id} a las ${dup.hora} ese día`, "danger", 7000);
      return;
    }
    const tec = tecnicos.find(t => t.id === form.tecnicoId);
    updateTicket(ticket.id, { ...form, tecnicoNombre: tec?.nombre }, "Ticket modificado");
    showNotif("Ticket modificado correctamente", "success");
    onClose();
  };

  return (
    <Modal title={`Modificar Ticket — ${ticket.id}`} onClose={onClose} size="md">
      <div className="grid-2">
        <Input label="Nombre cliente"  value={form.clienteNombre}   onChange={e => set("clienteNombre",   e.target.value)} />
        <Input label="Teléfono"        value={form.clienteTelefono} onChange={e => set("clienteTelefono", e.target.value)} />
        <Input label="Zona"            value={form.clienteZona}     onChange={e => set("clienteZona",     e.target.value)} />
        <Input label="Caja NAP"        value={form.clienteCajaNap}  onChange={e => set("clienteCajaNap",  e.target.value)} />
        <Input label="Fecha" type="date" value={form.fecha}         onChange={e => set("fecha",           e.target.value)} />
        <Select label="Hora"      value={form.hora}      onChange={e => set("hora",      e.target.value)} options={HORAS.map(h => ({ value: h, label: h }))} />
        <Select label="Técnico"   value={form.tecnicoId} onChange={e => set("tecnicoId", e.target.value)} options={tecnicos.map(t => ({ value: t.id, label: t.nombre }))} />
        <Select label="Motivo"    value={form.motivo}    onChange={e => set("motivo",    e.target.value)} options={MOTIVOS.map(m => ({ value: m, label: m }))} />
        <Select label="Tipo Visita" value={form.tipoVisita} onChange={e => set("tipoVisita", e.target.value)} options={TIPO_VISITA_OPTIONS} />
      </div>
      <div className="modal__footer" style={{ padding: "20px 0 0" }}>
        <Btn onClick={onClose}   variant="ghost">Cancelar</Btn>
        <Btn onClick={guardar} variant="primary">Guardar cambios</Btn>
      </div>
    </Modal>
  );
}


// ============================================================
// PLANILLA — Componente compartido de vista previa
// Usado tanto en CerrarTicketModal (paso 2) como en VerPlanillaModal.
// ============================================================
function PlanillaContenido({ ticket, solucion, firma, tipoVisita, materiales, total, estadoCierre }) {
  const now = new Date().toLocaleString("es-VE");
  const estadoLabel = estadoCierre === "resuelto" ? "✓ RESUELTO" : estadoCierre === "sinresolver" ? "✗ SIN RESOLVER" : (estadoCierre || ticket.estado || "").toUpperCase();

  const Campo = ({ label, value, minWidth = 70 }) => (
    <div className="planilla-field">
      <span className="planilla-field__label" style={{ minWidth }}>{label}:</span>
      <span className="planilla-field__value">{value || "—"}</span>
    </div>
  );

  return (
    <div className="planilla-wrapper">
      {/* Encabezado */}
      <div className="planilla-header">
        <div>
          <div className="planilla-header__brand">📡 TETENET</div>
          <div className="planilla-header__sub">Planilla de Visita Técnica</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className={`planilla-header__estado-${estadoCierre || ticket.estado}`}>{estadoLabel}</div>
          <div className="planilla-header__id">{ticket.id}</div>
        </div>
      </div>

      <div className="planilla-body">
        {/* Cliente */}
        <div className="planilla-section">
          <div className="planilla-section__title">Datos del Cliente</div>
          <div className="planilla-grid">
            <Campo label="Nombre"    value={ticket.clienteNombre}   />
            <Campo label="Cédula"    value={ticket.clienteCedula}   />
            <Campo label="Teléfono"  value={ticket.clienteTelefono} />
            <Campo label="Zona"      value={ticket.clienteZona}     />
            <Campo label="Caja NAP"  value={ticket.clienteCajaNap}  />
            <Campo label="Dirección" value={ticket.clienteDireccion}/>
          </div>
        </div>

        {/* Soporte */}
        <div className="planilla-section">
          <div className="planilla-section__title">Datos del Soporte</div>
          <div className="planilla-grid">
            <Campo label="Técnico"     value={ticket.tecnicoNombre}              minWidth={80} />
            <Campo label="Fecha"       value={ticket.fecha}                      minWidth={80} />
            <Campo label="Hora"        value={ticket.hora}                       minWidth={80} />
            <Campo label="Motivo"      value={ticket.motivo}                     minWidth={80} />
            <Campo label="Tipo visita" value={TIPO_VISITA_LABELS[tipoVisita || ticket.tipoVisita]} minWidth={80} />
          </div>
        </div>

        {/* Datos adicionales (campo libre al crear ticket) */}
        {ticket.datosAdicionales?.length > 0 && (
          <div className="planilla-section">
            <div className="planilla-section__title">Datos Adicionales</div>
            <div className="planilla-grid">
              {ticket.datosAdicionales.map((d, i) => (
                <Campo key={i} label={d.nombre} value={d.valor} minWidth={80} />
              ))}
            </div>
          </div>
        )}

        {/* Trabajo realizado */}
        {solucion && (
          <div className="planilla-section">
            <div className="planilla-section__title">Trabajo Realizado</div>
            <div style={{ fontSize: "0.85em", background: "var(--color-bg)", padding: "10px 14px", borderRadius: "var(--radius-md)", lineHeight: 1.6 }}>
              {solucion}
            </div>
          </div>
        )}

        {/* Materiales utilizados */}
        {(materiales || ticket.materiales)?.length > 0 && (
          <div className="planilla-section">
            <div className="planilla-section__title">Materiales Utilizados</div>
            <table className="table" style={{ fontSize: "0.82em" }}>
              <thead>
                <tr>
                  {["Material", "Cant.", "Precio unit.", "Subtotal"].map(h => (
                    <th key={h} style={{ background: "var(--color-bg)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(materiales || ticket.materiales).map((m, i) => (
                  <tr key={i}>
                    <td>{m.nombre}</td>
                    <td>{m.qty || 1}</td>
                    <td>${m.precio.toFixed(2)}</td>
                    <td style={{ fontWeight: 600 }}>${(m.precio * (m.qty || 1)).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Total */}
        <div className="planilla-total">
          <span className="planilla-total__label">TOTAL A COBRAR</span>
          <span className="planilla-total__amount">${(total ?? ticket.total ?? 0).toFixed(2)}</span>
        </div>

        {/* Firma */}
        <div className="planilla-section" style={{ borderBottom: "none" }}>
          <div className="planilla-section__title">Firma del Cliente</div>
          {(firma || ticket.firma) ? (
            <div style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: 4, display: "inline-block", background: "#fafbfc" }}>
              <img src={firma || ticket.firma} alt="Firma" style={{ height: 80, display: "block" }} />
            </div>
          ) : (
            <div style={{ height: 60, border: "2px dashed var(--color-border)", borderRadius: "var(--radius-md)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-light)", fontSize: "0.8em" }}>
              Sin firma
            </div>
          )}
        </div>

        {/* Pie */}
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--color-border)", fontSize: "0.72em", color: "var(--color-text-light)", display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)" }}>
          <span>Generado: {now}</span>
          <span>TETENET — Sistema de Gestión</span>
        </div>
      </div>
    </div>
  );
}


// ============================================================
// MODAL — CERRAR TICKET (Operaciones) — Flujo en 2 pasos
// Paso 1: Completar formulario + firma
// Paso 2: Revisar planilla → confirmar cierre
// ============================================================
function CerrarTicketModal({ ticket, onClose }) {
  const { cerrarTicket, showNotif, materiales: catalogoMateriales } = useApp();
  const [paso,         setPaso]         = useState("formulario");  // "formulario" | "preview"
  const [solucion,     setSolucion]     = useState(ticket.solucion || "");
  const [firma,        setFirma]        = useState(ticket.firma || null);     // preserva firma si ya existe
  const [firmaExiste]                   = useState(!!ticket.firma);           // ¿ya tenía firma guardada?
  const [tipoVisita,   setTipoVisita]   = useState(ticket.tipoVisita);
  const [usaMateriales,setUsaMateriales]= useState(ticket.materiales.length > 0);
  const [materiales,   setMateriales]   = useState(ticket.materiales.length ? ticket.materiales : []);
  const [estadoCierre, setEstadoCierre] = useState(["resuelto","sinresolver"].includes(ticket.estado) ? ticket.estado : "resuelto");

  // Calcula el total según tipo de visita y materiales
  const calcTotal = () => {
    const matTotal = materiales.reduce((s, m) => s + (m.precio * (m.qty || 1)), 0);
    if (tipoVisita === "garantia")       return 0;
    if (tipoVisita === "pagaManoObra")   return 10;
    if (tipoVisita === "pagaMateriales") return matTotal;
    return 10 + matTotal;  // "paga": mano de obra + materiales
  };

  const agregarMaterial = () => {
    const primero = catalogoMateriales[0] || { id: "m1", nombre: "Material", precio: 0 };
    setMateriales(prev => [...prev, { ...primero, qty: 1 }]);
  };
  const updateMat = (i, field, val) => setMateriales(prev => prev.map((m, idx) => idx === i ? { ...m, [field]: val } : m));
  const removeMat = (i) => setMateriales(prev => prev.filter((_, idx) => idx !== i));

  const irAPreview = () => {
    if (solucion.length < 10) { showNotif("La descripción debe tener al menos 10 caracteres", "danger"); return; }
    if (!firma)                { showNotif("El cliente debe firmar antes de continuar",        "danger"); return; }
    setPaso("preview");
  };

  const confirmarCierre = async () => {
    await cerrarTicket(ticket.id, {
      solucion, firma, tipoVisita, materiales, total: calcTotal(),
      estado: estadoCierre,
      cobro: tipoVisita === "garantia" ? "nocobrado" : "pendiente",
    });
    onClose();
  };

  // Indicador visual de pasos (1 → 2)
  const Stepper = () => (
    <div className="stepper">
      {[["1", "Completar formulario"], ["2", "Revisar planilla"]].map(([num, label], i) => {
        const activo    = (i === 0 && paso === "formulario") || (i === 1 && paso === "preview");
        const completado = i === 0 && paso === "preview";
        return (
          <div key={num} className="stepper__step">
            <div className={`stepper__circle stepper__circle--${completado ? "done" : activo ? "active" : "inactive"}`}>
              {completado ? "✓" : num}
            </div>
            <span className={`stepper__label stepper__label--${completado ? "done" : activo ? "active" : "inactive"}`}>{label}</span>
            {i === 0 && <div className={`stepper__line stepper__line--${paso === "preview" ? "done" : "inactive"}`} />}
          </div>
        );
      })}
    </div>
  );

  return (
    <Modal title={`Cerrar Ticket — ${ticket.id}`} onClose={onClose} size="lg">
      <Stepper />

      {/* ── PASO 1: FORMULARIO ── */}
      {paso === "formulario" && (
        <>
          {/* Datos del cliente (referencia) */}
          <div style={{ background: "var(--color-bg)", borderRadius: "var(--radius-md)", padding: 14, marginBottom: 16, fontSize: "0.88em" }}>
            <strong>{ticket.clienteNombre}</strong> — {ticket.clienteDireccion} — NAP: {ticket.clienteCajaNap}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Descripción del trabajo */}
            <div className="form-group">
              <label className="form-label">Descripción del trabajo realizado *</label>
              <textarea
                value={solucion}
                onChange={e => setSolucion(e.target.value)}
                rows={3}
                placeholder="Describe el trabajo realizado (mínimo 10 caracteres)..."
                className={`form-textarea ${solucion.length > 0 && solucion.length < 10 ? "form-input--error" : ""}`}
              />
              <span className={`form-hint form-hint--${solucion.length < 10 ? "error" : "success"}`}>
                {solucion.length}/10 caracteres mínimos
              </span>
            </div>

            <div className="grid-2">
              <Select label="Tipo de visita"   value={tipoVisita}   onChange={e => setTipoVisita(e.target.value)}   options={TIPO_VISITA_OPTIONS} />
              <Select label="Estado de cierre" value={estadoCierre} onChange={e => setEstadoCierre(e.target.value)} options={[{ value: "resuelto", label: "Resuelto ✓" }, { value: "sinresolver", label: "Sin Resolver ✗" }]} />
            </div>

            {/* Materiales */}
            <div className="form-group">
              <label className="form-label" style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={usaMateriales} onChange={e => setUsaMateriales(e.target.checked)} />
                ¿Se usaron materiales?
              </label>
              {usaMateriales && (
                <div style={{ marginTop: 10, background: "var(--color-bg)", borderRadius: "var(--radius-md)", padding: 12 }}>
                  {materiales.map((mat, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                      <select
                        className="form-select"
                        style={{ flex: 2 }}
                        value={mat.id}
                        onChange={e => {
                          const m = catalogoMateriales.find(x => x.id === e.target.value);
                          if (m) { updateMat(i, "id", m.id); updateMat(i, "nombre", m.nombre); updateMat(i, "precio", m.precio); }
                        }}
                      >
                        {catalogoMateriales.map(m => <option key={m.id} value={m.id}>{m.nombre} (${m.precio})</option>)}
                      </select>
                      <input type="number" min="1" value={mat.qty || 1} onChange={e => updateMat(i, "qty", +e.target.value)}
                        className="form-input" style={{ width: 60 }} />
                      <button onClick={() => removeMat(i)} style={{ background: "none", border: "none", color: "var(--color-danger)", cursor: "pointer", fontSize: "1.2em" }}>×</button>
                    </div>
                  ))}
                  <Btn onClick={agregarMaterial} variant="ghost" size="sm">+ Agregar material</Btn>
                </div>
              )}
            </div>

            {/* Firma — si ya existe, se preserva sin pedir de nuevo */}
            {firmaExiste ? (
              <div className="signature-saved">
                <div className="signature-saved__header">
                  <span style={{ color: "var(--color-success)", fontSize: "1.1em" }}>✓</span>
                  <div>
                    <div className="signature-saved__title">Firma del cliente ya registrada</div>
                    <div className="signature-saved__subtitle">No es necesario que el cliente firme de nuevo al editar.</div>
                  </div>
                </div>
                <img src={firma} alt="Firma guardada" />
                <div style={{ marginTop: 8 }}>
                  <Btn onClick={() => setFirma(null)} variant="ghost" size="sm">🔄 Reemplazar firma</Btn>
                </div>
              </div>
            ) : (
              <>
                <SignaturePad onChange={setFirma} />
                <div className={`signature-status signature-status--${firma ? "ok" : "pending"}`}>
                  {firma ? "✓ Firma registrada" : "⚠ Pendiente firma del cliente"}
                </div>
              </>
            )}

            {/* Total calculado */}
            <div className="info-box info-box--info" style={{ justifyContent: "space-between" }}>
              <span style={{ fontWeight: 600 }}>Total a cobrar:</span>
              <span style={{ fontSize: "1.4em", fontWeight: 700, fontFamily: "var(--font-mono)" }}>
                ${calcTotal().toFixed(2)}
              </span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <Btn onClick={onClose}    variant="ghost">Cancelar</Btn>
              <Btn onClick={irAPreview} variant="primary" size="lg">Ver planilla →</Btn>
            </div>
          </div>
        </>
      )}

      {/* ── PASO 2: PREVIEW ── */}
      {paso === "preview" && (
        <>
          <div className="info-box info-box--warning" style={{ marginBottom: 18 }}>
            <span style={{ fontSize: "1.2em" }}>👁</span>
            <div>
              <div style={{ fontWeight: 700 }}>Vista previa de la planilla</div>
              <div style={{ fontSize: "0.85em" }}>Revisa todos los datos antes de confirmar el cierre.</div>
            </div>
          </div>

          <PlanillaContenido
            ticket={ticket} solucion={solucion} firma={firma}
            tipoVisita={tipoVisita} materiales={materiales}
            total={calcTotal()} estadoCierre={estadoCierre}
          />

          <ComentariosSection ticketId={ticket.id} comentarios={ticket.comentarios || []} />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 20 }}>
            <Btn onClick={() => setPaso("formulario")} variant="ghost">← Editar datos</Btn>
            <Btn onClick={confirmarCierre} variant={estadoCierre === "resuelto" ? "success" : "danger"} size="lg">
              {estadoCierre === "resuelto" ? "✓ Confirmar y Cerrar Resuelto" : "✗ Confirmar y Cerrar Sin Resolver"}
            </Btn>
          </div>
        </>
      )}
    </Modal>
  );
}


// ============================================================
// COMENTARIOS INTERNOS — Sección reutilizable
// Aparece en VerPlanillaModal y en el paso 2 de CerrarTicketModal.
// Cualquier rol puede leer y escribir. Solo el autor puede borrar el suyo.
// ============================================================
function ComentariosSection({ ticketId, comentarios }) {
  const { user, addComentario, removeComentario } = useApp();
  const [texto, setTexto] = useState("");

  const enviar = () => {
    if (texto.trim().length < 3) return;
    addComentario(ticketId, texto.trim());
    setTexto("");
  };

  return (
    <div className="comments-section">
      <div className="comments-section__header">
        <span>🔒</span>
        <div>
          <div className="comments-section__title">Comentarios internos</div>
          <div className="comments-section__subtitle">Solo visibles para el equipo. No aparecen en el PDF del cliente.</div>
        </div>
      </div>

      {(comentarios || []).length === 0 && (
        <div className="comments-section__empty">Sin comentarios aún.</div>
      )}

      {(comentarios || []).map(c => (
        <div key={c.id} className="comment-item">
          <div className="comment-item__body">
            <div className="comment-item__meta">
              <span className={`comment-item__rol comment-item__rol--${c.userRol}`}>{c.userRol}</span>
              <span className="comment-item__user">{c.userName}</span>
              <span className="comment-item__ts">{c.ts}</span>
            </div>
            <div className="comment-item__text">{c.texto}</div>
          </div>
          {c.userId === user.id && (
            <button className="comment-item__delete" onClick={() => removeComentario(ticketId, c.id)} title="Eliminar mi comentario">×</button>
          )}
        </div>
      ))}

      <div className="comments-section__input-row">
        <input
          value={texto}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={e => e.key === "Enter" && enviar()}
          placeholder="Agregar comentario interno..."
          className="comments-section__input"
        />
        <Btn onClick={enviar} variant="warning" size="sm" disabled={texto.trim().length < 3}>Agregar</Btn>
      </div>
    </div>
  );
}


// ============================================================
// MODAL — VER PLANILLA (todos los roles)
// Vista de solo lectura con planilla completa y comentarios.
// ============================================================
function VerPlanillaModal({ ticket, onClose }) {
  return (
    <Modal title={`Planilla — ${ticket.id}`} onClose={onClose} size="lg">
      <PlanillaContenido ticket={ticket} />
      <div style={{ marginTop: 20 }}>
        <ComentariosSection ticketId={ticket.id} comentarios={ticket.comentarios || []} />
      </div>
    </Modal>
  );
}


// ============================================================
// TABLA DE TICKETS — Con filtros y ordenado por columnas
// Usada en Dashboard (analista/vista), Planificación y MisTickets.
// ============================================================
function TicketTable({ tickets: rawTickets, rol }) {
  const [historialTicket, setHistorialTicket] = useState(null);
  const [magicTicket,     setMagicTicket]     = useState(null);
  const [modTicket,       setModTicket]       = useState(null);
  const [cerrarTk,        setCerrarTk]        = useState(null);
  const [planillaTicket,  setPlanillaTicket]  = useState(null);
  const { deleteTicket, iniciarTicket, actualizarCobro, showNotif, tickets: allTickets, tecnicos } = useApp();

  // ── Estado de filtros ─────────────────────────────────────
  const [filtro,  setFiltro]  = useState({ busqueda: "", estado: "", tecnico: "", cobro: "" });
  const setF = (k, v) => setFiltro(f => ({ ...f, [k]: v }));

  // ── Estado de ordenado ────────────────────────────────────
  const [sortCol, setSortCol] = useState("hora");
  const [sortDir, setSortDir] = useState("asc");
  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };

  // Ícono de ordenado en el encabezado de columna
  const SortIcon = ({ col }) => (
    sortCol === col
      ? <span className="sort-icon sort-icon--active">{sortDir === "asc" ? "↑" : "↓"}</span>
      : <span className="sort-icon">↕</span>
  );

  // ── Tickets filtrados y ordenados ─────────────────────────
  const tickets = useMemo(() => {
    let list = [...rawTickets];
    const q = filtro.busqueda.toLowerCase();
    if (q) list = list.filter(t =>
      t.id.toLowerCase().includes(q) ||
      t.clienteNombre.toLowerCase().includes(q) ||
      t.clienteCedula.toLowerCase().includes(q) ||
      t.motivo.toLowerCase().includes(q)
    );
    if (filtro.estado)  list = list.filter(t => t.estado    === filtro.estado);
    if (filtro.tecnico) list = list.filter(t => t.tecnicoId === filtro.tecnico);
    if (filtro.cobro)   list = list.filter(t => t.cobro     === filtro.cobro);

    const getters = {
      id:     t => t.id,
      hora:   t => t.hora,
      fecha:  t => t.fecha,
      cliente:t => t.clienteNombre,
      estado: t => t.estado,
      total:  t => t.total || 0,
    };
    const fn = getters[sortCol] || (t => t.hora);
    list.sort((a, b) => {
      const va = fn(a), vb = fn(b);
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [rawTickets, filtro, sortCol, sortDir]);

  const hayFiltros = filtro.busqueda || filtro.estado || filtro.tecnico || filtro.cobro;

  // Clase CSS del th según si es la columna activa
  const thClass = (col, sortable = true) =>
    `${sortable ? "sortable" : ""} ${sortCol === col ? "sort-active" : ""}`;

  return (
    <>
      {/* Modales secundarios */}
      {historialTicket && <HistorialModal ticket={historialTicket} onClose={() => setHistorialTicket(null)} />}
      {magicTicket     && <MagicLinkModal ticket={magicTicket}     onClose={() => setMagicTicket(null)}     />}
      {modTicket       && <ModificarModal ticket={modTicket}       onClose={() => setModTicket(null)}       />}
      {cerrarTk        && <CerrarTicketModal ticket={cerrarTk}     onClose={() => setCerrarTk(null)}        />}
      {planillaTicket  && (
        <VerPlanillaModal
          ticket={allTickets.find(t => t.id === planillaTicket.id) || planillaTicket}
          onClose={() => setPlanillaTicket(null)}
        />
      )}

      {/* ── Barra de filtros ── */}
      <div className="filters-bar">
        <div className="filters-bar__group" style={{ flex: 1, minWidth: 160 }}>
          <label className="filters-bar__label">Buscar</label>
          <input
            value={filtro.busqueda}
            onChange={e => setF("busqueda", e.target.value)}
            placeholder="ID, cliente, cédula, motivo..."
            className="filters-bar__input"
          />
        </div>

        <div className="filters-bar__group">
          <label className="filters-bar__label">Estado</label>
          <select value={filtro.estado} onChange={e => setF("estado", e.target.value)} className="filters-bar__select">
            <option value="">Todos</option>
            <option value="pendiente">Pendiente</option>
            <option value="encurso">En Curso</option>
            <option value="resuelto">Resuelto</option>
            <option value="sinresolver">Sin Resolver</option>
          </select>
        </div>

        {rol !== ROLES.OPERACIONES && (
          <div className="filters-bar__group">
            <label className="filters-bar__label">Técnico</label>
            <select value={filtro.tecnico} onChange={e => setF("tecnico", e.target.value)} className="filters-bar__select">
              <option value="">Todos</option>
              {tecnicos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          </div>
        )}

        {rol === ROLES.POSVENTA && (
          <div className="filters-bar__group">
            <label className="filters-bar__label">Cobro</label>
            <select value={filtro.cobro} onChange={e => setF("cobro", e.target.value)} className="filters-bar__select">
              <option value="">Todos</option>
              <option value="pendiente">Pendiente</option>
              <option value="cobrado">Cobrado</option>
              <option value="nocobrado">No cobrado</option>
            </select>
          </div>
        )}

        {hayFiltros && (
          <Btn variant="ghost" size="sm" onClick={() => setFiltro({ busqueda: "", estado: "", tecnico: "", cobro: "" })}>
            ✕ Limpiar
          </Btn>
        )}

        <div className="filters-bar__count">
          {tickets.length} resultado{tickets.length !== 1 ? "s" : ""}
          {hayFiltros ? ` de ${rawTickets.length}` : ""}
        </div>
      </div>

      {/* ── Tabla ── */}
      <div className="table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th className={thClass("id")}      onClick={() => toggleSort("id")}>ID <SortIcon col="id" /></th>
              <th className={thClass("cliente")} onClick={() => toggleSort("cliente")}>Cliente <SortIcon col="cliente" /></th>
              <th className={thClass(null, false)}>Técnico</th>
              <th className={thClass("fecha")}   onClick={() => toggleSort("fecha")}>Fecha <SortIcon col="fecha" /></th>
              <th className={thClass("hora")}    onClick={() => toggleSort("hora")}>Hora <SortIcon col="hora" /></th>
              <th className={thClass(null, false)}>Motivo</th>
              <th className={thClass("estado")}  onClick={() => toggleSort("estado")}>Estado <SortIcon col="estado" /></th>
              {rol === ROLES.POSVENTA && <>
                <th className={thClass(null, false)}>Cierre</th>
                <th className={thClass("total")} onClick={() => toggleSort("total")}>Cobro <SortIcon col="total" /></th>
              </>}
              <th className={thClass(null, false)}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {tickets.length === 0 && (
              <tr className="table__empty-row">
                <td colSpan={rol === ROLES.POSVENTA ? 10 : 8}>
                  {hayFiltros ? "Ningún ticket coincide con los filtros aplicados" : "No hay tickets"}
                </td>
              </tr>
            )}
            {tickets.map(t => (
              <tr key={t.id}>
                <td className="table__cell-id">{t.id}</td>
                <td>
                  <div className="table__cell-nombre">{t.clienteNombre}</div>
                  <div className="table__cell-cedula">{t.clienteCedula}</div>
                </td>
                <td style={{ fontSize: "0.88em", color: "var(--color-text-muted)" }}>{t.tecnicoNombre}</td>
                <td className="table__cell-mono">{t.fecha}</td>
                <td className="table__cell-mono">{t.hora}</td>
                <td style={{ maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "0.88em" }}>{t.motivo}</td>
                <td><Badge estado={t.estado} /></td>

                {/* ── Columnas exclusivas del rol Posventa ── */}
                {rol === ROLES.POSVENTA && <>
                  {/* Fecha y hora de cierre */}
                  <td className="table__cell-mono" style={{ fontSize: "0.82em" }}>
                    {t.fechaCierre ? (
                      <>
                        <div style={{ fontWeight: 600 }}>{t.fechaCierre.split(" ")[1] || "—"}</div>
                        <div style={{ color: "var(--color-text-muted)", fontSize: "0.85em" }}>{t.fechaCierre.split(" ")[0]}</div>
                      </>
                    ) : <span style={{ color: "var(--color-text-light)", fontStyle: "italic" }}>—</span>}
                  </td>

                  {/* Estado de cobro + monto */}
                  <td>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                        <CobroBadge cobro={t.cobro} />
                        <select
                          value={t.cobro}
                          onChange={e => actualizarCobro(t.id, e.target.value)}
                          className="filters-bar__select"
                          style={{ fontSize: "0.75em", padding: "2px 4px" }}
                        >
                          <option value="pendiente">Pendiente</option>
                          <option value="cobrado">Cobrado</option>
                          <option value="nocobrado">No cobrado</option>
                        </select>
                      </div>
                      {t.total > 0 && (
                        <span className={`cobro-monto cobro-monto--${t.cobro}`}>${(t.total || 0).toFixed(2)}</span>
                      )}
                    </div>
                  </td>
                </>}

                {/* ── Acciones ── */}
                <td>
                  <div className="table__actions">
                    <Btn size="sm" variant="ghost" onClick={() => setPlanillaTicket(t)} title="Ver planilla y comentarios">👁</Btn>

                    {rol === ROLES.VENTAS && <>
                      <Btn size="sm" variant="ghost"  onClick={() => setModTicket(t)}                                                     title="Modificar">✏️</Btn>
                      <Btn size="sm" variant="ghost"  onClick={() => setMagicTicket(t)}                                                   title="Link mágico">🔗</Btn>
                      <Btn size="sm" variant="ghost"  onClick={() => setHistorialTicket(t)}                                               title="Historial">📋</Btn>
                      <Btn size="sm" variant="danger" onClick={() => { if (window.confirm(`¿Eliminar ${t.id}?`)) deleteTicket(t.id); }}   title="Eliminar">🗑</Btn>
                    </>}

                    {rol === ROLES.OPERACIONES && <>
                      {t.estado === "pendiente" && <Btn size="sm" variant="primary" onClick={() => iniciarTicket(t.id)}>▶ Iniciar</Btn>}
                      {t.estado === "encurso"   && <Btn size="sm" variant="success" onClick={() => setCerrarTk(t)}>✓ Cerrar</Btn>}
                    </>}

                    {rol === ROLES.POSVENTA && (t.estado === "resuelto" || t.estado === "sinresolver") && (
                      <Btn size="sm" variant="ghost" onClick={() => showNotif(`PDF generado: Planilla_${t.id}.pdf`, "success")} title="Descargar PDF">⬇</Btn>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}


// ============================================================
// DASHBOARD — Gráficos y resumen del día
// Accesible para analista y vista.
// ============================================================
function Dashboard({ rol }) {
  const { tickets } = useApp();
  const hoy    = tickets.filter(t => t.fecha === HOY);
  const estados = ["pendiente", "encurso", "resuelto", "sinresolver"];

  // Pie chart: distribución de estados hoy
  const pieData = estados
    .map(e => ({ name: e, value: hoy.filter(t => t.estado === e).length }))
    .filter(d => d.value > 0);
  const PIE_COLORS = [CHART_COLORS.warning, CHART_COLORS.primary, CHART_COLORS.success, CHART_COLORS.danger];

  // Bar chart: tickets cerrados por día (últimos 7 días)
  // useMemo evita recalcular en cada render y evita que los valores
  // salten cuando se actualiza cualquier estado de la app.
  const semana = useMemo(() => {
    const dias = [];
    for (let i = 6; i >= 0; i--) {
      const d    = new Date();
      d.setDate(d.getDate() - i);
      const fecha = d.toISOString().split("T")[0];
      const label = d.toLocaleDateString("es-VE", { weekday: "short" });
      dias.push({
        dia:         label,
        resuelto:    tickets.filter(t => t.fecha === fecha && t.estado === "resuelto").length,
        sinresolver: tickets.filter(t => t.fecha === fecha && t.estado === "sinresolver").length,
      });
    }
    return dias;
  }, [tickets]);

  const stats = [
    { key: "pendiente",   label: "Pendientes",   value: hoy.filter(t => t.estado === "pendiente").length   },
    { key: "encurso",     label: "En Curso",      value: hoy.filter(t => t.estado === "encurso").length     },
    { key: "resuelto",    label: "Resueltos",     value: hoy.filter(t => t.estado === "resuelto").length    },
    { key: "sinresolver", label: "Sin Resolver",  value: hoy.filter(t => t.estado === "sinresolver").length },
  ];

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background: CHART_COLORS.white, border: `1px solid ${CHART_COLORS.border}`, borderRadius: 8, padding: "10px 14px", fontSize: "0.82em", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
        <div style={{ color: CHART_COLORS.success }}>✓ Resueltos: {payload[0]?.value}</div>
        <div style={{ color: CHART_COLORS.danger  }}>✗ Sin resolver: {payload[1]?.value}</div>
      </div>
    );
  };

  return (
    <div>
      <SectionTitle>
        Dashboard — {new Date().toLocaleDateString("es-VE", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
      </SectionTitle>

      {/* Tarjetas de estadísticas */}
      <div className="stats-grid">
        {stats.map(s => (
          <div key={s.key} className={`stat-card stat-card--${s.key}`}>
            <div className="stat-card__number">{s.value}</div>
            <div className="stat-card__label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Gráficos */}
      <div className="charts-grid">
        <div className="chart-card">
          <div className="chart-card__title">Distribución del Día</div>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`} labelLine={false} fontSize={11}>
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={PIE_COLORS[estados.indexOf(entry.name)]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-light)" }}>
              Sin datos hoy
            </div>
          )}
        </div>

        <div className="chart-card">
          <div className="chart-card__title">Volumen Semanal</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={semana}>
              <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="resuelto"    fill={CHART_COLORS.success} radius={[4, 4, 0, 0]} name="Resueltos"     />
              <Bar dataKey="sinresolver" fill={CHART_COLORS.danger}  radius={[4, 4, 0, 0]} name="Sin resolver"  />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tabla de tickets del día */}
      <Card>
        <div style={{ fontWeight: 700, marginBottom: 14, fontSize: "0.9em" }}>Gestión de Tickets — Hoy</div>
        <TicketTable tickets={hoy} rol={rol} />
      </Card>
    </div>
  );
}


// ============================================================
// NUEVO TICKET — Formulario de creación (solo analista)
// ============================================================
function NuevoTicket() {
  const { addTicket, showNotif, tecnicos } = useApp();
  const [cedTipo,    setCedTipo]   = useState("V");
  const [cedNum,     setCedNum]    = useState("");
  const [cliente,    setCliente]   = useState(null);
  const [buscando,   setBuscando]  = useState(false);
  const [form,       setForm]      = useState({ motivo: MOTIVOS[0], motivoOtro: "", fecha: HOY, hora: "07:30", tecnicoId: tecnicos[0]?.id || "", tipoVisita: "paga" });
  const [datosExtra, setDatosExtra]= useState([]);
  const [showMagic,  setShowMagic] = useState(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Busca el cliente por cédula en n8n (o en mock)
  const buscar = async () => {
    if (!cedNum) return;
    setBuscando(true);
    const cedula = `${cedTipo}${cedNum}`;
    const res = await API.buscarCliente(`${cedula}`);
    if (res.ok) setCliente({ ...res.cliente });
    else { showNotif(`Cliente ${cedula} no encontrado`, "danger"); setCliente(null); }
    setBuscando(false);
  };

  const guardar = async () => {
    if (!cliente) return;
    const tec    = tecnicos.find(t => t.id === form.tecnicoId);
    const motivo = form.motivo === "Otro" ? form.motivoOtro : form.motivo;
    const ticket = await addTicket({
      ...form, motivo,
      clienteCedula:    cliente.cedula,
      clienteNombre:    cliente.nombre,
      clienteTelefono:  cliente.telefono,
      clienteZona:      cliente.zona,
      clienteCajaNap:   cliente.cajaNap,
      clienteDireccion: cliente.direccion,
      tecnicoNombre:    tec?.nombre,
      datosAdicionales: datosExtra,
    });
    if (!ticket) return;
    
    // Mostrar modal de link mágico
    setShowMagic(ticket);
    
    // Resetear COMPLETAMENTE el formulario
    setCliente(null);       // Oculta el formulario
    setCedNum("");          // Limpia búsqueda
    setDatosExtra([]);      // Limpia datos adicionales
    setForm({               // Resetea valores iniciales
      motivo: MOTIVOS[0], 
      motivoOtro: "", 
      fecha: HOY, 
      hora: "07:30", 
      tecnicoId: tecnicos[0]?.id || "", 
      tipoVisita: "paga" 
    });
  };

  return (
    <div>
      {showMagic && <MagicLinkModal ticket={showMagic} onClose={() => setShowMagic(null)} />}
      <SectionTitle>Crear Ticket de Soporte</SectionTitle>

      {/* ── Paso 1: Buscar cliente ── */}
      <Card>
        <div style={{ fontWeight: 600, marginBottom: 14, fontSize: "0.92em" }}>1. Buscar Cliente</div>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <Select label="Tipo" value={cedTipo} onChange={e => setCedTipo(e.target.value)} style={{ width: 70 }}
            options={["V", "J", "E"].map(v => ({ value: v, label: v }))} />
          <div style={{ flex: 1, minWidth: 160 }}>
            <Input label="Número de documento" value={cedNum} onChange={e => setCedNum(e.target.value)}
              placeholder="12345678" onKeyDown={e => e.key === "Enter" && buscar()} />
          </div>
          <Btn onClick={buscar} disabled={buscando || !cedNum} variant="primary">
            {buscando ? "Buscando..." : "Buscar"}
          </Btn>
        </div>
        {ENV.MOCK_MODE && (
          <div style={{ fontSize: "0.75em", color: "var(--color-text-muted)", marginTop: 6 }}>
            Modo demo — prueba con: 12345678 / 87654321 / 11223344
          </div>
        )}
      </Card>

      {/* ── Pasos 2, 3, 4: Datos del ticket ── */}
      {cliente && (
        <Card style={{ marginTop: 14 }}>
          {/* Datos del cliente (editables) */}
          <div style={{ fontWeight: 600, marginBottom: 14, fontSize: "0.92em" }}>
            2. Datos del Cliente <span style={{ color: "var(--color-text-muted)", fontWeight: 400 }}>(editable)</span>
          </div>
          <div className="grid-2" style={{ marginBottom: 20 }}>
            <Input label="Nombre"    value={cliente.nombre}   onChange={e => setCliente(c => ({ ...c, nombre:   e.target.value }))} />
            <Input label="Teléfono"  value={cliente.telefono} onChange={e => setCliente(c => ({ ...c, telefono: e.target.value }))} />
            <Input label="Zona"      value={cliente.zona}     onChange={e => setCliente(c => ({ ...c, zona:     e.target.value }))} />
            <Input label="Caja NAP"  value={cliente.cajaNap}  onChange={e => setCliente(c => ({ ...c, cajaNap:  e.target.value }))} />
          </div>

          {/* Datos del soporte */}
          <div style={{ fontWeight: 600, marginBottom: 14, fontSize: "0.92em" }}>3. Datos del Soporte</div>
          <div className="grid-3" style={{ marginBottom: 14 }}>
            <Input  label="Fecha"    type="date" value={form.fecha} onChange={e => set("fecha", e.target.value)} />
            <Select label="Hora"     value={form.hora}      onChange={e => set("hora",      e.target.value)} options={HORAS.map(h => ({ value: h, label: h }))} />
            <Select label="Técnico"  value={form.tecnicoId} onChange={e => set("tecnicoId", e.target.value)} options={tecnicos.map(t => ({ value: t.id, label: t.nombre }))} />
          </div>
          <div className="grid-2" style={{ marginBottom: 14 }}>
            <Select label="Motivo de visita" value={form.motivo}     onChange={e => set("motivo",     e.target.value)} options={MOTIVOS.map(m => ({ value: m, label: m }))} />
            <Select label="Tipo de visita"   value={form.tipoVisita} onChange={e => set("tipoVisita", e.target.value)} options={TIPO_VISITA_OPTIONS} />
          </div>
          {form.motivo === "Otro" && (
            <Input label="Especifique el motivo" value={form.motivoOtro} onChange={e => set("motivoOtro", e.target.value)} style={{ marginBottom: 14 }} />
          )}

          {/* Datos adicionales (campos libres opcionales) */}
          <div style={{ fontWeight: 600, marginBottom: 10, fontSize: "0.92em" }}>
            4. Datos Adicionales <span style={{ color: "var(--color-text-muted)", fontWeight: 400 }}>(opcional)</span>
          </div>
          {datosExtra.map((d, i) => (
            <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "flex-end" }}>
              <Input label="Campo" value={d.nombre} onChange={e => setDatosExtra(prev => prev.map((x, j) => j === i ? { ...x, nombre: e.target.value } : x))} />
              <Input label="Valor" value={d.valor}  onChange={e => setDatosExtra(prev => prev.map((x, j) => j === i ? { ...x, valor:  e.target.value } : x))} />
              <Btn variant="danger" size="sm" onClick={() => setDatosExtra(prev => prev.filter((_, j) => j !== i))}>×</Btn>
            </div>
          ))}
          <Btn onClick={() => setDatosExtra(prev => [...prev, { nombre: "", valor: "" }])} variant="ghost" size="sm">
            + Agregar dato adicional
          </Btn>

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
            <Btn onClick={guardar} variant="success" size="lg">Guardar Ticket ✓</Btn>
          </div>
        </Card>
      )}
    </div>
  );
}


// ============================================================
// PLANIFICACIÓN — Kanban por técnico + Informe de actividad
// ============================================================
function Planificacion({ rol }) {
  const { tickets, tecnicos } = useApp();
  const [fechaSel,       setFechaSel]       = useState(HOY);
  const [subView,        setSubView]        = useState("kanban");
  const [tecnicoInforme, setTecnicoInforme] = useState(tecnicos[0]?.id || "");

  const ticketsDia     = tickets.filter(t => t.fecha === fechaSel).sort((a, b) => a.hora.localeCompare(b.hora));
  const informeTickets = tickets.filter(t => t.tecnicoId === tecnicoInforme && t.fecha === fechaSel);

  // Filas del informe: una fila por evento (inicio y cierre de cada ticket)
  const informeRows = informeTickets.flatMap(t => {
    const rows = [];
    const ini  = t.historial.find(h => h.accion.includes("iniciado"));
    const cie  = t.historial.find(h => h.accion.includes("cerrado"));
    if (ini) rows.push({ hora: ini.ts.split(" ")[1] || ini.ts, accion: `Se abrió ticket ${t.id}`,  descripcion: "Se inició el trabajo", estado: "encurso"  });
    if (cie) rows.push({ hora: cie.ts.split(" ")[1] || cie.ts, accion: `Se cerró ticket ${t.id}`,  descripcion: t.solucion || "—",      estado: t.estado   });
    return rows;
  }).sort((a, b) => a.hora.localeCompare(b.hora));

  return (
    <div>
      <SectionTitle>Planificación</SectionTitle>

      {/* Controles de fecha y vista */}
      <div style={{ display: "flex", gap: 10, marginBottom: 18, alignItems: "center", flexWrap: "wrap" }}>
        <Input label="Fecha" type="date" value={fechaSel} onChange={e => setFechaSel(e.target.value)} style={{ width: 180 }} />
        <div style={{ display: "flex", marginTop: 18 }}>
          {[["kanban", "📋 Tarjetas"], ["informe", "📊 Informe"]].map(([v, label], i) => (
            <button key={v} onClick={() => setSubView(v)}
              style={{ padding: "8px 20px", border: "1px solid var(--color-border)", background: subView === v ? "var(--color-primary)" : "var(--color-white)", color: subView === v ? "#fff" : "var(--color-text)", fontFamily: "var(--font-body)", fontWeight: 600, fontSize: "0.85em", cursor: "pointer", borderRadius: i === 0 ? "6px 0 0 6px" : "0 6px 6px 0" }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Vista Kanban ── */}
      {subView === "kanban" && (
        <div className="kanban-board">
          {tecnicos.map(tec => {
            const tks = ticketsDia.filter(t => t.tecnicoId === tec.id);
            return (
              <div key={tec.id} className="kanban-column">
                <div className="kanban-column__header">
                  {tec.nombre}
                  <span className="kanban-column__count">{tks.length}</span>
                </div>
                <div className="kanban-column__body">
                  {tks.length === 0 && <div className="kanban-empty">Sin tickets</div>}
                  {tks.map(t => (
                    <div key={t.id} className={`kanban-card kanban-card--${t.estado}`}>
                      <div className="kanban-card__top">
                        <span className="kanban-card__id">{t.id}</span>
                        <Badge estado={t.estado} />
                      </div>
                      <div className="kanban-card__nombre">{t.clienteNombre}</div>
                      <div className="kanban-card__info">🕐 {t.hora} — {t.motivo}</div>
                      {t.datosAdicionales?.map((d, i) => (
                        <div key={i} className="kanban-card__extra">{d.nombre}: {d.valor}</div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Vista Informe ── */}
      {subView === "informe" && (
        <Card>
          <div style={{ display: "flex", gap: 14, marginBottom: 18, alignItems: "flex-end", flexWrap: "wrap" }}>
            <Select label="Técnico" value={tecnicoInforme} onChange={e => setTecnicoInforme(e.target.value)}
              options={tecnicos.map(t => ({ value: t.id, label: t.nombre }))} style={{ minWidth: 200 }} />
            {fechaSel === HOY && (
              <div className="info-box info-box--success" style={{ padding: "8px 14px", marginBottom: 0, fontSize: "0.82em" }}>
                🔴 En vivo — actualización automática
              </div>
            )}
          </div>
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  {["Hora", "Acción", "Descripción", "Estado"].map(h => <th key={h}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {informeRows.length === 0 && (
                  <tr className="table__empty-row"><td colSpan={4}>Sin actividad registrada</td></tr>
                )}
                {informeRows.map((r, i) => (
                  <tr key={i}>
                    <td className="table__cell-mono">{r.hora}</td>
                    <td style={{ fontWeight: 600 }}>{r.accion}</td>
                    <td style={{ color: "var(--color-text-muted)", maxWidth: 200 }}>{r.descripcion}</td>
                    <td><Badge estado={r.estado} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}


// ============================================================
// MIS TICKETS — Vista del técnico (rol operaciones / en campo)
// Muestra solo los tickets del técnico logueado, del día de hoy.
// ============================================================
function MisTickets() {
  const { tickets, user } = useApp();
  const misTickets = tickets
    .filter(t => t.tecnicoId === user.id && t.fecha === HOY)
    .sort((a, b) => a.hora.localeCompare(b.hora));

  return (
    <div>
      <SectionTitle>Mis Tickets — Hoy</SectionTitle>
      <Card>
        <TicketTable tickets={misTickets} rol={ROLES.OPERACIONES} />
      </Card>
    </div>
  );
}


// ============================================================
// LOGIN — Pantalla de acceso
// ============================================================
function Login() {
  const { login } = useApp();
  const [email,   setEmail]   = useState("");
  const [pass,    setPass]    = useState("");
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    setError("");
    const ok = await login(email, pass);
    if (!ok) setError("Credenciales incorrectas. Intenta de nuevo.");
    setLoading(false);
  };

  return (
    <div className="login-screen">
      <div className="login-box">
        <div className="login-box__icon">📡</div>
        <h1 className="login-box__title">TETENET</h1>
        <p className="login-box__subtitle">Sistema de Gestión de Soporte</p>

        <div className="login-box__fields">
          <Input label="Correo electrónico" type="email"    value={email} onChange={e => setEmail(e.target.value)} placeholder="usuario@tetenet.com" />
          <Input label="Contraseña"         type="password" value={pass}  onChange={e => setPass(e.target.value)}  onKeyDown={e => e.key === "Enter" && handleLogin()} />
          {error && <div className="login-box__error">{error}</div>}
          <Btn onClick={handleLogin} variant="primary" size="lg" disabled={loading}>
            {loading ? "Ingresando..." : "Ingresar"}
          </Btn>
        </div>

        {/* Cuentas demo — solo visibles en modo mock */}
        {ENV.MOCK_MODE && (
          <div className="login-box__demo">
            <strong style={{ color: "var(--color-text)" }}>Cuentas demo:</strong><br />
            📊 <strong>analista@tetenet.com</strong> / 123 (Ventas-Soporte)<br />
            🔧 <strong>carlos@tetenet.com</strong> / 123 (Operaciones)<br />
            👁 <strong>vista@tetenet.com</strong> / 123 (Posventa)
          </div>
        )}
      </div>
    </div>
  );
}


// ============================================================
// LAYOUT PRINCIPAL — Sidebar + topbar + contenido
// ============================================================
function AppLayout() {
  const { user, logout } = useApp();
  const [view,        setView]        = useState(user.rol === ROLES.OPERACIONES ? "mis-tickets" : "dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Claves con [ROLES.X] para que coincidan con user.rol exactamente
  const menuItems = {
    [ROLES.VENTAS]:      [{ id: "dashboard",    icon: "📊", label: "Dashboard"    },
                          { id: "nuevo-ticket", icon: "➕", label: "Nuevo Ticket"  },
                          { id: "planificacion",icon: "📋", label: "Planificación" }],
    [ROLES.OPERACIONES]: [{ id: "mis-tickets",  icon: "🔧", label: "Mis Tickets"   }],
    [ROLES.POSVENTA]:    [{ id: "dashboard",    icon: "📊", label: "Dashboard"     },
                          { id: "planificacion",icon: "📋", label: "Planificación"  }],
  };
  const items = menuItems[user.rol] || [];

  return (
    <div className="app-layout">

      {/* ── Sidebar ── */}
      <nav className={`sidebar ${sidebarOpen ? "" : "sidebar--collapsed"}`}>
        <div className="sidebar__logo">
          <div className="sidebar__logo-icon">📡</div>
          <span className="sidebar__logo-text">TETENET</span>
        </div>

        <div className="sidebar__nav">
          {items.map(item => (
            <button
              key={item.id}
              className={`sidebar__nav-item ${view === item.id ? "sidebar__nav-item--active" : ""}`}
              onClick={() => setView(item.id)}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        <div className="sidebar__footer">
          <div className="sidebar__user-name">{user.nombre}</div>
          <span className={`rol-badge rol-badge--${user.rol}`}>{ROL_LABELS[user.rol] || user.rol}</span>
          <button className="sidebar__logout-btn" onClick={logout}>Cerrar sesión</button>
        </div>
      </nav>

      {/* ── Contenido ── */}
      <div className="main-content">
        <div className="top-bar">
          <button className="top-bar__menu-btn" onClick={() => setSidebarOpen(s => !s)}>☰</button>
          <span className="top-bar__title">{items.find(i => i.id === view)?.label || "—"}</span>
        </div>

        <main className="page-content">
          {view === "dashboard"    &&                             <Dashboard   rol={user.rol} />}
          {view === "nuevo-ticket" && user.rol === ROLES.VENTAS &&  <NuevoTicket />              }
          {view === "planificacion"&&                             <Planificacion rol={user.rol}/>}
          {view === "mis-tickets"  &&                             <MisTickets  />              }
        </main>
      </div>

      <Toast />
    </div>
  );
}


// ============================================================
// ROOT — Punto de entrada de la app
// AppProvider envuelve todo para que useApp() funcione en cualquier componente.
// AppContent decide si mostrar Login o AppLayout según si hay sesión activa.
// ============================================================
function AppContent() {
  const { user } = useApp();
  return user ? <AppLayout /> : <Login />;
}

function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [iniciando, setIniciando] = useState(true); // Estado para el loader
  const [tickets, setTickets] = useState([]);
  // ... resto de los estados (tecnicos, materiales, etc.)

  useEffect(() => {
    const restaurarSesion = async () => {
      const token = localStorage.getItem("tetenet_token");
      if (!token) {
        setIniciando(false);
        return;
      }
      try {
        const res = await apiFetch("/auth/verify");
        if (res.ok && res.user) {
          setUser(res.user);
          await cargarCatalogos();
          await cargarTickets();
        } else {
          localStorage.removeItem("tetenet_token");
        }
      } catch (error) {
        console.error("Error restaurando sesión:", error);
        localStorage.removeItem("tetenet_token");
      } finally {
        setIniciando(false);
      }
    };
    restaurarSesion();
  }, []);

  // ✅ Agrega el loader aquí mismo dentro del Provider
  if (iniciando) {
    return (
      <div style={{
        height: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: 'var(--color-sidebar)',
        color: '#fff',
        fontSize: '1.2em'
      }}>
        🔄 Cargando sesión...
      </div>
    );
  }

  return (
    <AppCtx.Provider value={{
      user, login, loginMagic, logout,
      tickets, addTicket, updateTicket, deleteTicket, iniciarTicket, cerrarTicket, actualizarCobro,
      notification, showNotif,
      magicTicket, setMagicTicket,
      tecnicos, materiales, checkDuplicate,
      addComentario, removeComentario,
      cargando, cargarTickets,
    }}>
      {children}
    </AppCtx.Provider>
  );
}