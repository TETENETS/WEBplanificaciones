// ============================================================
// TETENET — Contexto Global y Estado de la Aplicación
// ============================================================
import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { apiFetch } from "./api";

const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

export function AppProvider({ children }) {
  // ── ESTADOS ──
  const [user, setUser] = useState(null);
  const [iniciando, setIniciando] = useState(true); 
  const [tickets, setTickets] = useState([]);
  const [tecnicos, setTecnicos] = useState([]);
  const [materiales, setMateriales] = useState([]);
  const [notification, setNotification] = useState(null);
  const [magicTicket, setMagicTicket] = useState(null);

  // ── NOTIFICACIONES ──
  const showNotif = useCallback((msg, type = "info", duration = 4000) => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), duration);
  }, []);

  // ── CARGA DE DATOS ──
  const cargarCatalogos = useCallback(async () => {
    try {
      const [resTecnicos, resMateriales] = await Promise.all([
        apiFetch("/catalogos/tecnicos"),
        apiFetch("/catalogos/materiales"),
      ]);
      if (resTecnicos.ok) setTecnicos(resTecnicos.tecnicos);
      if (resMateriales.ok) setMateriales(resMateriales.materiales);
    } catch (e) { 
      console.error("Error catálogos:", e); 
    }
  }, []);

  const cargarTickets = useCallback(async () => {
    try {
      const res = await apiFetch("/tickets");
      if (res.ok) setTickets(res.tickets);
    } catch (e) { 
      console.error("Error tickets:", e); 
    }
  }, []);

  // ── RESTAURAR SESIÓN ──
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
  }, [cargarCatalogos, cargarTickets]);

  // ── AUTENTICACIÓN ──
  const login = async (email, password) => {
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
  };

  const loginMagic = async (tecnicoId) => {
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
  };

  const logout = () => {
    localStorage.removeItem("tetenet_token");
    setUser(null);
    setTickets([]);
  };

  // ── GESTIÓN DE TICKETS ──
  const checkDuplicate = (tecnicoId, fecha, hora, excludeId = null) =>
    tickets.find(t => t.tecnicoId === tecnicoId && t.fecha === fecha && t.hora === hora && t.id !== excludeId) || null;

  const addTicket = async (datosTicket) => {
    const res = await apiFetch("/tickets", { 
      method: "POST", 
      body: JSON.stringify(datosTicket) 
    });
    
    if (res.ok) {
      setTickets(prev => [res.ticket, ...prev]);
      showNotif("Ticket creado ✓", "success");
      return res.ticket;
    }
    
    // Si falla (ej. error 409 de conflicto), mostramos el mensaje del backend
    showNotif(res.mensaje || "Error al crear el ticket", "danger", 6000);
    return null;
  };

  const updateTicket = async (id, datos, accion) => {
    const res = await apiFetch(`/tickets/${id}`, { 
      method: "PUT", 
      body: JSON.stringify(datos) 
    });
    if (res.ok) {
      setTickets(prev => prev.map(t => t.id === id
        ? { ...t, ...datos, historial: [...(t.historial || []), { ts: new Date().toLocaleString("es-VE"), user: user?.nombre || "Sistema", accion }] }
        : t
      ));
    } else {
      showNotif(res.mensaje || "Error modificando ticket", "danger");
    }
  };

  const deleteTicket = async (id) => {
    const res = await apiFetch(`/tickets/${id}`, { method: "DELETE" });
    if (res.ok) {
      setTickets(prev => prev.filter(t => t.id !== id));
      showNotif("Ticket eliminado", "info");
    } else {
      showNotif(res.mensaje || "Error eliminando ticket", "danger");
    }
  };

  const iniciarTicket = async (id) => {
    const res = await apiFetch(`/tickets/${id}/iniciar`, { method: "PATCH" });
    if (res.ok) {
      setTickets(prev => prev.map(t => t.id === id
        ? { ...t, estado: "encurso", historial: [...(t.historial || []), { ts: new Date().toLocaleString("es-VE"), user: user?.nombre, accion: "Soporte iniciado" }] }
        : t
      ));
      showNotif("Ticket iniciado", "info");
    } else {
      showNotif(res.mensaje || "Error iniciando ticket", "danger");
    }
  };

  const cerrarTicket = async (id, datos) => {
    const res = await apiFetch(`/tickets/${id}/cerrar`, { 
      method: "POST", 
      body: JSON.stringify(datos) 
    });
    if (res.ok) {
      const fechaCierre = res.fechaCierre || new Date().toLocaleString("es-VE");
      setTickets(prev => prev.map(t => t.id === id
        ? { ...t, ...datos, fechaCierre, historial: [...(t.historial || []), { ts: new Date().toLocaleString("es-VE"), user: user?.nombre, accion: `Ticket cerrado como ${datos.estado}` }] }
        : t
      ));
      showNotif("Ticket cerrado ✓", "success");
    } else {
      showNotif(res.mensaje || "Error cerrando ticket", "danger");
    }
  };

  const actualizarCobro = async (id, cobro) => {
    const res = await apiFetch(`/tickets/${id}/cobro`, { 
      method: "PATCH", 
      body: JSON.stringify({ cobro }) 
    });
    if (res.ok) {
      setTickets(prev => prev.map(t => t.id === id ? { ...t, cobro } : t));
      showNotif("Estado de cobro actualizado", "success");
    } else {
      showNotif(res.mensaje || "Error actualizando cobro", "danger");
    }
  };

  const addComentario = async (ticketId, texto) => {
    const res = await apiFetch(`/tickets/${ticketId}/comentarios`, { 
      method: "POST", 
      body: JSON.stringify({ texto }) 
    });
    if (res.ok && res.comentario) {
      setTickets(prev => prev.map(t => t.id === ticketId
        ? { ...t, comentarios: [...(t.comentarios || []), res.comentario] }
        : t
      ));
    } else {
      showNotif("Error agregando comentario", "danger");
    }
  };

  const removeComentario = async (ticketId, comentarioId) => {
    const res = await apiFetch(`/tickets/${ticketId}/comentarios/${comentarioId}`, { 
      method: "DELETE" 
    });
    if (res.ok) {
      setTickets(prev => prev.map(t => t.id === ticketId
        ? { ...t, comentarios: (t.comentarios || []).filter(c => c.id !== comentarioId) }
        : t
      ));
    } else {
      showNotif("Error eliminando comentario", "danger");
    }
  };

  // ── PANTALLA DE CARGA INICIAL ──
  if (iniciando) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-sidebar)', color: '#fff', fontSize: '1.2em' }}>
        🔄 Cargando sistema...
      </div>
    );
  }

  // ── PROVEEDOR DEL CONTEXTO ──
  return (
    <AppCtx.Provider value={{
      user, login, loginMagic, logout,
      tickets, addTicket, updateTicket, deleteTicket, iniciarTicket, cerrarTicket, actualizarCobro,
      notification, showNotif,
      magicTicket, setMagicTicket,
      tecnicos, materiales, checkDuplicate,
      addComentario, removeComentario,
      cargarTickets,
    }}>
      {children}
    </AppCtx.Provider>
  );
}