// ============================================================
// TETENET — App Principal (Vistas y Layout)
// ============================================================
import { useState, useEffect, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import "./tetenet-styles.css";

// ── IMPORTACIONES DE NUESTROS ARCHIVOS ──
import { ROLES, ROL_LABELS, MOTIVOS, HORAS, TIPO_VISITA_OPTIONS, CHART_COLORS, ENV } from "./constants";
import { apiFetch } from "./api";
import { AppProvider, useApp } from "./AppContext";
import { Logo, Logo2, Badge, Btn, Input, Select, Card, SectionTitle, Toast, TicketTable, MagicLinkModal, Modal } from "./Components";
import PlanillaPublicaPage from "./PlanillaPublica";

const HOY = new Date().toISOString().split("T")[0];

// ============================================================
// VISTA: DASHBOARD
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
        <h3 style={{ margin: 0, fontSize: "1em", fontWeight: 700, color: "var(--color-text)" }}>Tickets — {fechaSel === HOY ? "Hoy" : fechaSel}</h3>
        <Input label="" type="date" value={fechaSel} onChange={e => setFechaSel(e.target.value)} style={{ width: 160 }} />
        {fechaSel !== HOY && <Btn variant="ghost" size="sm" onClick={() => setFechaSel(HOY)}>↩ Hoy</Btn>}
      </div>
      <TicketTable tickets={hoy} rol={rol} />
    </Card>
  </div>);
}

// ============================================================
// VISTA: NUEVO TICKET
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
    try {
      const res = await apiFetch(`/clientes?cedula=${cedula}`);
      if (res.ok && res.cliente) setCliente(res.cliente);
      else { showNotif(res.mensaje || "Cliente no encontrado", "danger"); setCliente(null); }
    } catch { 
      showNotif("Error buscando cliente", "danger"); setCliente(null); 
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
    </Card>
    {cliente && <Card style={{ marginTop: 14 }}>
      <div style={{ fontWeight: 600, marginBottom: 14, fontSize: "0.92em" }}>2. Datos del Cliente</div>
      <div className="grid-2" style={{ marginBottom: 20 }}>
        <Input label="Nombre" value={cliente.nombre || ""} onChange={e => setCliente(c => ({ ...c, nombre: e.target.value }))} />
        <Input label="Teléfono" value={cliente.telefono || ""} onChange={e => setCliente(c => ({ ...c, telefono: e.target.value }))} />
        <Input label="Zona" value={cliente.zona || ""} onChange={e => setCliente(c => ({ ...c, zona: e.target.value }))} />
        <Input label="Caja NAP" value={cliente.cajaNap || ""} onChange={e => setCliente(c => ({ ...c, cajaNap: e.target.value }))} />
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
// VISTA: PLANIFICACIÓN
// ============================================================
function Planificacion() {
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
// VISTA: MIS TICKETS
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
// VISTA: PANEL SUPERADMIN
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
      const res = await apiFetch("/admin/usuarios");
      if (res.ok) setUsuarios(res.usuarios);
    } catch (err) { 
      showNotif("Error cargando usuarios", "danger"); 
    }
    setLoading(false);
  };

  useEffect(() => { cargar(); }, []); 

  const ROLES_OPTS = [
    { value: ROLES.VENTAS, label: "Ventas-Soporte" },
    { value: ROLES.OPERACIONES, label: "Operaciones" },
    { value: ROLES.POSVENTA, label: "Posventa" },
    { value: ROLES.SUPERADMIN, label: "Super Admin" },
  ];

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
        if (isNew) {
          const res = await apiFetch("/admin/usuarios", { method: "POST", body: JSON.stringify(f) });
          if (res.ok) { await cargar(); showNotif("Usuario creado ✓", "success"); onClose(); }
          else showNotif(res.mensaje || "Error creando usuario", "danger");
        } else {
          const res = await apiFetch(`/admin/usuarios/${usuario.id}`, { method: "PUT", body: JSON.stringify(f) });
          if (res.ok) { await cargar(); showNotif("Usuario actualizado ✓", "success"); onClose(); }
          else showNotif(res.mensaje || "Error actualizando usuario", "danger");
        }
      } catch (err) { showNotif("Error de conexión", "danger"); }
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

  function PassForm({ usuario, onClose }) {
    const [pass, setPass] = useState("");
    const [saving, setSaving] = useState(false);
    const guardar = async () => {
      if (pass.length < 4) { showNotif("Mínimo 4 caracteres", "danger"); return; }
      setSaving(true);
      try {
        const res = await apiFetch(`/admin/usuarios/${usuario.id}/password`, { method: "PATCH", body: JSON.stringify({ password: pass }) });
        if (res.ok) { showNotif("Contraseña cambiada ✓", "success"); onClose(); }
        else showNotif(res.mensaje || "Error", "danger");
      } catch (err) { showNotif("Error de conexión", "danger"); }
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
      await apiFetch(`/admin/usuarios/${id}`, { method: "DELETE" });
      await cargar();
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
// VISTA: LOGIN
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
        <Logo2 size={64} style={{ display: "block", margin: "0 auto 8px auto" }} />
        <p className="login-box__subtitle">Sistema de Gestión de Soporte</p>
        <div className="login-box__fields">
          <Input label="Correo" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="usuario@tetenet.com" />
          <Input label="Contraseña" type="password" value={pass} onChange={e => setPass(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} />
          {error && <div className="login-box__error">{error}</div>}
          <Btn onClick={handleLogin} variant="primary" size="lg" disabled={loading}>{loading ? "Ingresando..." : "Ingresar"}</Btn>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// LAYOUT Y NAVEGACIÓN PRINCIPAL
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
          {view === "planificacion" && <Planificacion />}
          {view === "mis-tickets" && <MisTickets />}
          {view === "admin" && user.rol === ROLES.SUPERADMIN && <AdminPanel />}
        </main>
      </div>
      <Toast />
    </div>
  );
}

// ============================================================
// ROOT: PUNTO DE ENTRADA
// ============================================================
function AppContent() {
  const { user } = useApp();

  // ── Detección de ruta pública de planilla ──────────────────
  const urlPath = window.location.pathname;
  
  const ticketIdPublico = urlPath.startsWith("/planilla/")
    ? urlPath.replace("/planilla/", "").split("?")[0]
    : null;

  // Si hay un ticket ID en la URL, mostramos la planilla directamente
  if (ticketIdPublico) {
    return <PlanillaPublicaPage ticketId={ticketIdPublico} />;
  }

  // Si no es un link de planilla, carga la app normal
  return user ? <AppLayout /> : <Login />;
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}