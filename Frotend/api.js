// ============================================================
// TETENET — Comunicación con el Servidor (API)
// ============================================================
import { ENV } from "./constants";

/**
 * Función centralizada para hacer peticiones al backend.
 * Automáticamente inyecta el token de sesión si existe.
 */
export const apiFetch = async (path, options = {}) => {
  const token = localStorage.getItem("tetenet_token");
  
  const res = await fetch(`${ENV.API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  // Al devolver res.json() directamente, permitimos que el código que 
  // llame a esta función (ej. AppContext) pueda leer los mensajes de error
  // ({ ok: false, mensaje: "..." }) enviados por el backend y mostrarlos 
  // en las notificaciones en lugar de romper la app.
  return res.json();
};

// Si en el futuro quieres agregar funciones específicas, puedes hacerlo aquí.
// Por ejemplo:
// export const getTickets = () => apiFetch("/tickets");
// export const loginUser = (email, password) => apiFetch("/auth/login", { method: "POST", body: JSON.stringify({email, password}) });