// ============================================================
// TETENET — Backend (servidor)
// Archivo: server.js — v3.0 Reescrito y optimizado
// ============================================================

import express    from "express";
import pg         from "pg";
import bcrypt     from "bcryptjs";
import jwt        from "jsonwebtoken";
import cors       from "cors";
import { config } from "dotenv";

config();

// ============================================================
// ROLES
// ============================================================
const ROLES = {
  VENTAS:      "ventas-soporte",
  OPERACIONES: "operaciones",
  POSVENTA:    "posventa",
  SUPERADMIN:  "superadmin",
};

// ============================================================
// SUPERADMIN — credenciales desde .env
// ============================================================
const SUPER_ADMIN = {
  email:    process.env.SUPER_ADMIN_EMAIL    || "superadmin@web.com",
  password: process.env.SUPER_ADMIN_PASSWORD || "superadmin2026.",
  nombre:   "Super Administrador",
};

// ============================================================
// BASE DE DATOS
// ============================================================
const { Pool } = pg;
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : false,
});

db.connect()
  .then(() => console.log("✅ PostgreSQL conectado"))
  .catch(err => {
    console.error("❌ Error conectando a PostgreSQL:", err.message);
    process.exit(1);
  });

// ============================================================
// N8N
// ============================================================
const N8N_BASE = process.env.N8N_BASE_URL;

const llamarN8n = async (path, body = {}) => {
  if (!N8N_BASE) return null;
  try {
    const res = await fetch(`${N8N_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`n8n ${path}: ${res.status}`);
    return res.json();
  } catch (err) {
    console.error("n8n error:", err.message);
    return null;
  }
};

// ============================================================
// EXPRESS
// ============================================================
const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || "*",
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
}));

app.use(express.json({ limit: "10mb" }));

// ============================================================
// MIDDLEWARE — JWT
// ============================================================

// GET /planilla-publica/:ticketId?token=XXX
// Ruta pública — solo valida el token firmado, no requiere login
app.get("/planilla-publica/:ticketId", async (req, res) => {
  const { ticketId } = req.params;
  const { token }    = req.query;

  try {
    // Verifica el token con el mismo JWT_SECRET
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // El token debe haber sido creado para ESTE ticket
    if (payload.ticketId !== ticketId) {
      return res.status(403).json({ ok: false, mensaje: "Token inválido para este ticket" });
    }

    const result = await db.query("SELECT * FROM tickets WHERE id = $1", [ticketId]);
    if (result.rows.length === 0) return res.status(404).json({ ok: false });

    res.json({ ok: true, ticket: result.rows[0] });
  } catch {
    res.status(403).json({ ok: false, mensaje: "Token expirado o inválido" });
  }
});


const verificarToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ ok: false, mensaje: "Token requerido" });
  }
  try {
    const token = authHeader.split(" ")[1];
    req.usuario = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ ok: false, mensaje: "Token inválido o expirado" });
  }
};

const soloRol = (...roles) => (req, res, next) => {
  // superadmin siempre pasa
  if (req.usuario.rol === ROLES.SUPERADMIN) return next();
  if (!roles.includes(req.usuario.rol)) {
    return res.status(403).json({ ok: false, mensaje: "No tienes permiso" });
  }
  next();
};

const soloSuperAdmin = (req, res, next) => {
  if (req.usuario.rol !== ROLES.SUPERADMIN) {
    return res.status(403).json({ ok: false, mensaje: "Acceso denegado: solo superadmin" });
  }
  next();
};

// Helper: generar ID de ticket
const generarIdTicket = () => "TK-" + Math.random().toString(36).substr(2, 6).toUpperCase();

// ============================================================
// AUTH
// ============================================================

// POST /auth/login
app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ ok: false, mensaje: "Email y contraseña requeridos" });
  }

  try {
    const emailLower = email.toLowerCase().trim();

    // --- Verificar si es superadmin ---
    if (emailLower === SUPER_ADMIN.email.toLowerCase() && password === SUPER_ADMIN.password) {
      const token = jwt.sign(
        { userId: "superadmin", rol: ROLES.SUPERADMIN, nombre: SUPER_ADMIN.nombre },
        process.env.JWT_SECRET,
        { expiresIn: "8h" }
      );
      return res.json({
        ok: true,
        token,
        user: {
          id: "superadmin",
          nombre: SUPER_ADMIN.nombre,
          email: SUPER_ADMIN.email,
          rol: ROLES.SUPERADMIN,
        },
      });
    }

    // --- Usuario normal ---
    const result = await db.query(
      "SELECT * FROM usuarios WHERE email = $1 AND activo = true",
      [emailLower]
    );
    const usuario = result.rows[0];

    if (!usuario || !(await bcrypt.compare(password, usuario.password_hash))) {
      return res.status(401).json({ ok: false, mensaje: "Credenciales incorrectas" });
    }

    const token = jwt.sign(
      { userId: usuario.id, rol: usuario.rol, nombre: usuario.nombre },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    const { password_hash, ...userSafe } = usuario;
    res.json({ ok: true, token, user: userSafe });
  } catch (err) {
    console.error("Error en login:", err);
    res.status(500).json({ ok: false, mensaje: "Error interno" });
  }
});

// GET /auth/verify
app.get("/auth/verify", verificarToken, async (req, res) => {
  try {
    // Superadmin no está en BD
    if (req.usuario.rol === ROLES.SUPERADMIN) {
      return res.json({
        ok: true,
        user: {
          id: "superadmin",
          nombre: SUPER_ADMIN.nombre,
          email: SUPER_ADMIN.email,
          rol: ROLES.SUPERADMIN,
        },
      });
    }

    const result = await db.query(
      "SELECT * FROM usuarios WHERE id = $1 AND activo = true",
      [req.usuario.userId]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ ok: false, mensaje: "Usuario no encontrado" });
    }
    const { password_hash, ...userSafe } = result.rows[0];
    res.json({ ok: true, user: userSafe });
  } catch (err) {
    console.error("Error verify:", err);
    res.status(500).json({ ok: false, mensaje: "Error interno" });
  }
});

// POST /auth/magic — Login por magic link (técnico)
app.post("/auth/magic", async (req, res) => {
  const { tecnicoId, ticketId } = req.body;
  if (!tecnicoId) {
    return res.status(400).json({ ok: false, mensaje: "tecnicoId requerido" });
  }
  try {
    const result = await db.query(
      "SELECT * FROM usuarios WHERE id = $1 AND activo = true AND rol = $1",
      [tecnicoId]
    );
    // Intentar buscar por id
    const result2 = await db.query(
      "SELECT * FROM usuarios WHERE id = $1 AND activo = true",
      [tecnicoId]
    );
    const usuario = result2.rows[0];
    if (!usuario || usuario.rol !== ROLES.OPERACIONES) {
      return res.status(404).json({ ok: false, mensaje: "Técnico no encontrado" });
    }

    const token = jwt.sign(
      { userId: usuario.id, rol: usuario.rol, nombre: usuario.nombre },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );
    const { password_hash, ...userSafe } = usuario;
    res.json({ ok: true, token, user: userSafe, ticketId });
  } catch (err) {
    console.error("Error magic login:", err);
    res.status(500).json({ ok: false, mensaje: "Error interno" });
  }
});

// ============================================================
// SUPERADMIN — Gestión de usuarios
// ============================================================

// GET /admin/usuarios
app.get("/admin/usuarios", verificarToken, soloSuperAdmin, async (req, res) => {
  try {
    const result = await db.query(
      "SELECT id, nombre, email, rol, telefono, activo, creado_en FROM usuarios ORDER BY creado_en DESC"
    );
    res.json({ ok: true, usuarios: result.rows });
  } catch (err) {
    console.error("Error listando usuarios:", err);
    res.status(500).json({ ok: false, mensaje: "Error obteniendo usuarios" });
  }
});

// POST /admin/usuarios — Crear usuario
app.post("/admin/usuarios", verificarToken, soloSuperAdmin, async (req, res) => {
  const { nombre, email, password, rol, telefono } = req.body;

  if (!nombre || !email || !password || !rol) {
    return res.status(400).json({ ok: false, mensaje: "Nombre, email, password y rol son requeridos" });
  }

  const rolesValidos = [ROLES.VENTAS, ROLES.OPERACIONES, ROLES.POSVENTA];
  if (!rolesValidos.includes(rol)) {
    return res.status(400).json({ ok: false, mensaje: "Rol inválido" });
  }

  try {
    // Verificar email único
    const existe = await db.query("SELECT id FROM usuarios WHERE email = $1", [email.toLowerCase().trim()]);
    if (existe.rows.length > 0) {
      return res.status(409).json({ ok: false, mensaje: "Ya existe un usuario con ese email" });
    }

    const hash = await bcrypt.hash(password, 10);
    const id = "u" + Date.now();

    const result = await db.query(`
      INSERT INTO usuarios (id, nombre, email, password_hash, rol, telefono)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, nombre, email, rol, telefono, activo, creado_en
    `, [id, nombre.trim(), email.toLowerCase().trim(), hash, rol, telefono || null]);

    res.status(201).json({ ok: true, usuario: result.rows[0] });
  } catch (err) {
    console.error("Error creando usuario:", err);
    res.status(500).json({ ok: false, mensaje: "Error creando usuario" });
  }
});

// PUT /admin/usuarios/:id — Modificar usuario
app.put("/admin/usuarios/:id", verificarToken, soloSuperAdmin, async (req, res) => {
  const { id } = req.params;
  const { nombre, email, rol, telefono, activo } = req.body;

  if (!nombre || !email || !rol) {
    return res.status(400).json({ ok: false, mensaje: "Nombre, email y rol son requeridos" });
  }

  try {
    // Verificar email único (excluyendo este usuario)
    const existe = await db.query(
      "SELECT id FROM usuarios WHERE email = $1 AND id != $2",
      [email.toLowerCase().trim(), id]
    );
    if (existe.rows.length > 0) {
      return res.status(409).json({ ok: false, mensaje: "Otro usuario ya tiene ese email" });
    }

    const result = await db.query(`
      UPDATE usuarios SET nombre = $1, email = $2, rol = $3, telefono = $4, activo = $5
      WHERE id = $6
      RETURNING id, nombre, email, rol, telefono, activo, creado_en
    `, [nombre.trim(), email.toLowerCase().trim(), rol, telefono || null, activo !== false, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, mensaje: "Usuario no encontrado" });
    }

    res.json({ ok: true, usuario: result.rows[0] });
  } catch (err) {
    console.error("Error modificando usuario:", err);
    res.status(500).json({ ok: false, mensaje: "Error modificando usuario" });
  }
});

// PATCH /admin/usuarios/:id/password — Cambiar contraseña
app.patch("/admin/usuarios/:id/password", verificarToken, soloSuperAdmin, async (req, res) => {
  const { id } = req.params;
  const { password } = req.body;

  if (!password || password.length < 4) {
    return res.status(400).json({ ok: false, mensaje: "La contraseña debe tener al menos 4 caracteres" });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await db.query(
      "UPDATE usuarios SET password_hash = $1 WHERE id = $2 RETURNING id",
      [hash, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, mensaje: "Usuario no encontrado" });
    }
    res.json({ ok: true, mensaje: "Contraseña actualizada" });
  } catch (err) {
    console.error("Error cambiando contraseña:", err);
    res.status(500).json({ ok: false, mensaje: "Error cambiando contraseña" });
  }
});

// DELETE /admin/usuarios/:id
app.delete("/admin/usuarios/:id", verificarToken, soloSuperAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    // No eliminar, solo desactivar
    const result = await db.query(
      "UPDATE usuarios SET activo = false WHERE id = $1 RETURNING id",
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, mensaje: "Usuario no encontrado" });
    }
    res.json({ ok: true, mensaje: "Usuario desactivado" });
  } catch (err) {
    console.error("Error eliminando usuario:", err);
    res.status(500).json({ ok: false, mensaje: "Error eliminando usuario" });
  }
});

// ============================================================
// CLIENTES
// ============================================================
app.get("/clientes", verificarToken, async (req, res) => {
  const { cedula } = req.query;
  if (!cedula) return res.status(400).json({ ok: false, mensaje: "Cédula requerida" });

  try {
    const data = await llamarN8n("/consultar-cliente", { cedula });
    if (data) return res.json(data);
    return res.status(404).json({ ok: false, mensaje: "Cliente no encontrado" });
  } catch (err) {
    console.error("Error consultando cliente:", err.message);
    res.status(500).json({ ok: false, mensaje: "No se pudo consultar el cliente" });
  }
});

// ============================================================
// CATÁLOGOS
// ============================================================
app.get("/catalogos/tecnicos", verificarToken, async (req, res) => {
  try {
    const result = await db.query(
      "SELECT id, nombre, telefono FROM usuarios WHERE rol = $1 AND activo = true ORDER BY nombre",
      [ROLES.OPERACIONES]
    );
    res.json({ ok: true, tecnicos: result.rows });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: "Error obteniendo técnicos" });
  }
});

app.get("/catalogos/materiales", verificarToken, async (req, res) => {
  try {
    const result = await db.query(
      "SELECT id, nombre, precio FROM materiales WHERE activo = true ORDER BY nombre"
    );
    res.json({ ok: true, materiales: result.rows });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: "Error obteniendo materiales" });
  }
});

// ============================================================
// TICKETS
// ============================================================

// GET /tickets
app.get("/tickets", verificarToken, async (req, res) => {
  const { fecha, tecnicoId, estado } = req.query;
  const conditions = [];
  const params = [];

  if (fecha) {
    params.push(fecha);
    conditions.push(`t.fecha = $${params.length}`);
  }
  if (tecnicoId) {
    params.push(tecnicoId);
    conditions.push(`t.tecnico_id = $${params.length}`);
  }
  if (estado) {
    params.push(estado);
    conditions.push(`t.estado = $${params.length}`);
  }

  // Operaciones solo ve sus tickets
  if (req.usuario.rol === ROLES.OPERACIONES) {
    params.push(req.usuario.userId);
    conditions.push(`t.tecnico_id = $${params.length}`);
  }

  const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

  try {
    const [ticketsRes, comentariosRes, historialRes] = await Promise.all([
      db.query(`
        SELECT t.*, u.nombre AS tecnico_nombre_join
        FROM tickets t
        LEFT JOIN usuarios u ON u.id = t.tecnico_id
        ${where}
        ORDER BY t.fecha DESC, t.hora ASC
      `, params),
      db.query("SELECT * FROM comentarios_ticket ORDER BY creado_en ASC"),
      db.query("SELECT * FROM historial_ticket ORDER BY creado_en ASC"),
    ]);

    const tickets = ticketsRes.rows.map(t => ({
      id:               t.id,
      clienteCedula:    t.cliente_cedula,
      clienteNombre:    t.cliente_nombre,
      clienteTelefono:  t.cliente_telefono,
      clienteZona:      t.cliente_zona,
      clienteCajaNap:   t.cliente_caja_nap,
      clienteDireccion: t.cliente_direccion,
      tecnicoId:        t.tecnico_id,
      tecnicoNombre:    t.tecnico_nombre || t.tecnico_nombre_join,
      fecha:            t.fecha instanceof Date ? t.fecha.toISOString().split("T")[0] : t.fecha,
      hora:             t.hora,
      motivo:           t.motivo,
      tipoVisita:       t.tipo_visita,
      solucion:         t.solucion,
      firma:            t.firma,
      materiales:       t.materiales || [],
      datosAdicionales: t.datos_adicionales || [],
      total:            parseFloat(t.total) || 0,
      estado:           t.estado,
      cobro:            t.cobro,
      fechaCierre:      t.fecha_cierre,
      comentarios:      comentariosRes.rows
        .filter(c => c.ticket_id === t.id)
        .map(c => ({
          id:       c.id,
          userId:   c.user_id,
          userName: c.user_nombre,
          userRol:  c.user_rol,
          ts:       c.creado_en,
          texto:    c.texto,
        })),
      historial:        historialRes.rows
        .filter(h => h.ticket_id === t.id)
        .map(h => ({
          ts:     h.creado_en,
          user:   h.usuario_nombre,
          accion: h.accion,
        })),
    }));

    res.json({ ok: true, tickets });
  } catch (err) {
    console.error("Error obteniendo tickets:", err);
    res.status(500).json({ ok: false, mensaje: "Error obteniendo tickets" });
  }
});

// POST /tickets
app.post("/tickets", verificarToken, soloRol(ROLES.VENTAS), async (req, res) => {
  const {
    clienteCedula, clienteNombre, clienteTelefono, clienteZona,
    clienteCajaNap, clienteDireccion, tecnicoId, tecnicoNombre,
    fecha, hora, motivo, tipoVisita, datosAdicionales,
  } = req.body;

  if (!clienteCedula || !tecnicoId || !fecha || !hora || !motivo) {
    return res.status(400).json({ ok: false, mensaje: "Faltan campos obligatorios" });
  }

  try {
    // Verificar duplicado
    const dup = await db.query(
      "SELECT id FROM tickets WHERE tecnico_id = $1 AND fecha = $2 AND hora = $3",
      [tecnicoId, fecha, hora]
    );
    if (dup.rows.length > 0) {
      return res.status(409).json({
        ok: false,
        mensaje: `Conflicto: ya existe ticket ${dup.rows[0].id} a las ${hora} el ${fecha}`,
      });
    }

    const id = generarIdTicket();

    await db.query(`
      INSERT INTO tickets (
        id, cliente_cedula, cliente_nombre, cliente_telefono,
        cliente_zona, cliente_caja_nap, cliente_direccion,
        tecnico_id, tecnico_nombre, fecha, hora, motivo,
        tipo_visita, datos_adicionales, estado, cobro
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'pendiente','pendiente')
    `, [
      id, clienteCedula, clienteNombre, clienteTelefono,
      clienteZona, clienteCajaNap, clienteDireccion,
      tecnicoId, tecnicoNombre, fecha, hora, motivo,
      tipoVisita || "paga", JSON.stringify(datosAdicionales || []),
    ]);

    await db.query(
      "INSERT INTO historial_ticket (ticket_id, usuario_nombre, accion) VALUES ($1, $2, $3)",
      [id, req.usuario.nombre, "Ticket creado"]
    );

    const planillaToken = jwt.sign(
      { ticketId: id, tipo: "planilla-publica" },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );

    const planillaUrl = `${process.env.FRONTEND_URL}/planilla/${id}?token=${planillaToken}`;

    // Notificar por WhatsApp (background)
    llamarN8n("/notificar-whatsapp", {
      evento: "ticket_creado", ticketId: id,
      tecnicoNombre, tecnicoId, clienteNombre, hora, fecha, motivo,
      appUrl: process.env.FRONTEND_URL,planillaUrl
    }).catch(() => {});

    // Devolver ticket completo
    const ticketNuevo = {
      id, clienteCedula, clienteNombre, clienteTelefono,
      clienteZona, clienteCajaNap, clienteDireccion,
      tecnicoId, tecnicoNombre, fecha, hora, motivo,
      tipoVisita: tipoVisita || "paga",
      datosAdicionales: datosAdicionales || [],
      estado: "pendiente", cobro: "pendiente", total: 0,
      materiales: [], solucion: "", firma: null, fechaCierre: null,
      comentarios: [],
      historial: [{ ts: new Date().toISOString(), user: req.usuario.nombre, accion: "Ticket creado" }],
    };

    res.status(201).json({ ok: true, ticket: ticketNuevo });
  } catch (err) {
    console.error("Error creando ticket:", err);
    res.status(500).json({ ok: false, mensaje: "Error creando el ticket" });
  }
});

// PATCH /tickets/:id/iniciar
app.patch("/tickets/:id/iniciar", verificarToken, soloRol(ROLES.OPERACIONES), async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query(
      "UPDATE tickets SET estado = 'encurso' WHERE id = $1 AND estado = 'pendiente' RETURNING id",
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(400).json({ ok: false, mensaje: "Ticket no encontrado o ya iniciado" });
    }
    await db.query(
      "INSERT INTO historial_ticket (ticket_id, usuario_nombre, accion) VALUES ($1, $2, $3)",
      [id, req.usuario.nombre, "Soporte iniciado"]
    );
    llamarN8n("/notificar-whatsapp", { evento: "ticket_iniciado", ticketId: id }).catch(() => {});
    res.json({ ok: true, estado: "encurso" });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: "Error iniciando ticket" });
  }
});

// POST /tickets/:id/cerrar
app.post("/tickets/:id/cerrar", verificarToken, soloRol(ROLES.OPERACIONES), async (req, res) => {
  const { id } = req.params;
  const { solucion, firma, tipoVisita, materiales, total, estado, cobro } = req.body;

  if (!["resuelto", "sinresolver"].includes(estado)) {
    return res.status(400).json({ ok: false, mensaje: "Estado de cierre inválido" });
  }

  const fechaCierre = new Date().toLocaleString("es-VE");

  try {
    const result = await db.query(`
      UPDATE tickets SET
        estado = $1, solucion = $2, firma = $3, tipo_visita = $4,
        materiales = $5, total = $6, cobro = $7, fecha_cierre = $8
      WHERE id = $9 AND estado = 'encurso'
      RETURNING *
    `, [
      estado, solucion, firma, tipoVisita,
      JSON.stringify(materiales || []), total || 0,
      cobro || "pendiente", fechaCierre, id,
    ]);

    if (result.rows.length === 0) {
      return res.status(400).json({ ok: false, mensaje: "Ticket no encontrado o no está en curso" });
    }

    await db.query(
      "INSERT INTO historial_ticket (ticket_id, usuario_nombre, accion) VALUES ($1, $2, $3)",
      [id, req.usuario.nombre, `Ticket cerrado como ${estado}`]
    );

    const planillaToken = jwt.sign(
      { ticketId: id, tipo: "planilla-publica" },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );

    const ticket = result.rows[0];
    llamarN8n("/notificar-whatsapp", {
      evento: "ticket_cerrado", ticketId: id, estado,
      clienteNombre: ticket.cliente_nombre,
      tecnicoNombre: ticket.tecnico_nombre, total,solucion: ticket.solucion,
      planillaUrl:   `${process.env.FRONTEND_URL}/planilla/${id}?token=${planillaToken}`,
    }).catch(() => {});

    res.json({ ok: true, fechaCierre, estado });
  } catch (err) {
    console.error("Error cerrando ticket:", err);
    res.status(500).json({ ok: false, mensaje: "Error cerrando ticket" });
  }
});

// PATCH /tickets/:id/cobro
app.patch("/tickets/:id/cobro", verificarToken, soloRol(ROLES.POSVENTA), async (req, res) => {
  const { id } = req.params;
  const { cobro } = req.body;

  if (!["pendiente", "cobrado", "nocobrado"].includes(cobro)) {
    return res.status(400).json({ ok: false, mensaje: "Estado de cobro inválido" });
  }

  try {
    await db.query("UPDATE tickets SET cobro = $1 WHERE id = $2", [cobro, id]);
    await db.query(
      "INSERT INTO historial_ticket (ticket_id, usuario_nombre, accion) VALUES ($1, $2, $3)",
      [id, req.usuario.nombre, `Estado cobro → ${cobro}`]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: "Error actualizando cobro" });
  }
});

// PUT /tickets/:id
app.put("/tickets/:id", verificarToken, soloRol(ROLES.VENTAS), async (req, res) => {
  const { id } = req.params;
  const {
    motivo, hora, fecha, tecnicoId, tecnicoNombre, tipoVisita,
    clienteNombre, clienteTelefono, clienteZona, clienteCajaNap,
  } = req.body;

  try {
    // Verificar duplicado excluyendo el ticket actual
    const dup = await db.query(
      "SELECT id FROM tickets WHERE tecnico_id = $1 AND fecha = $2 AND hora = $3 AND id != $4",
      [tecnicoId, fecha, hora, id]
    );
    if (dup.rows.length > 0) {
      return res.status(409).json({ ok: false, mensaje: `Conflicto con ticket ${dup.rows[0].id}` });
    }

    await db.query(`
      UPDATE tickets SET
        motivo = $1, hora = $2, fecha = $3, tecnico_id = $4, tecnico_nombre = $5,
        tipo_visita = $6, cliente_nombre = $7, cliente_telefono = $8,
        cliente_zona = $9, cliente_caja_nap = $10
      WHERE id = $11
    `, [motivo, hora, fecha, tecnicoId, tecnicoNombre, tipoVisita,
        clienteNombre, clienteTelefono, clienteZona, clienteCajaNap, id]);

    await db.query(
      "INSERT INTO historial_ticket (ticket_id, usuario_nombre, accion) VALUES ($1, $2, $3)",
      [id, req.usuario.nombre, "Ticket modificado"]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: "Error modificando el ticket" });
  }
});

// DELETE /tickets/:id
app.delete("/tickets/:id", verificarToken, soloRol(ROLES.VENTAS), async (req, res) => {
  const { id } = req.params;
  try {
    await db.query("DELETE FROM tickets WHERE id = $1", [id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: "Error eliminando el ticket" });
  }
});

// ============================================================
// COMENTARIOS
// ============================================================
app.post("/tickets/:id/comentarios", verificarToken, async (req, res) => {
  const { id } = req.params;
  const { texto } = req.body;

  if (!texto || texto.trim().length < 3) {
    return res.status(400).json({ ok: false, mensaje: "Mínimo 3 caracteres" });
  }

  try {
    const result = await db.query(`
      INSERT INTO comentarios_ticket (ticket_id, user_id, user_nombre, user_rol, texto)
      VALUES ($1, $2, $3, $4, $5) RETURNING *
    `, [id, req.usuario.userId, req.usuario.nombre, req.usuario.rol, texto.trim()]);

    const c = result.rows[0];
    res.status(201).json({
      ok: true,
      comentario: {
        id: c.id, userId: c.user_id, userName: c.user_nombre,
        userRol: c.user_rol, ts: c.creado_en, texto: c.texto,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: "Error agregando comentario" });
  }
});

app.delete("/tickets/:id/comentarios/:comentarioId", verificarToken, async (req, res) => {
  const { comentarioId } = req.params;
  try {
    const result = await db.query(
      "DELETE FROM comentarios_ticket WHERE id = $1 AND user_id = $2 RETURNING id",
      [comentarioId, req.usuario.userId]
    );
    if (result.rows.length === 0) {
      return res.status(403).json({ ok: false, mensaje: "No puedes eliminar este comentario" });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: "Error eliminando comentario" });
  }
});

// ============================================================
// HEALTH
// ============================================================
app.get("/health", async (req, res) => {
  try {
    await db.query("SELECT 1");
    res.json({ ok: true, servicio: "TETENET API", bd: "conectada" });
  } catch {
    res.status(503).json({ ok: false, bd: "desconectada" });
  }
});

// ============================================================
// INICIO
// ============================================================
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 TETENET API en puerto ${PORT}`);
  console.log(`   Modo: ${process.env.NODE_ENV || "development"}`);
  console.log(`   n8n: ${N8N_BASE || "⚠️  no configurado"}`);
  console.log(`   SuperAdmin: ${SUPER_ADMIN.email}`);
});