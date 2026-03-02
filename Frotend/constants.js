// ============================================================
// TETENET — Constantes y Configuración
// ============================================================

// 1. ROLES — Fuente única de verdad
export const ROLES = {
  VENTAS:      "ventas-soporte",
  OPERACIONES: "operaciones",
  POSVENTA:    "posventa",
  SUPERADMIN:  "superadmin",
};

export const ROL_LABELS = {
  [ROLES.VENTAS]:      "Ventas-Soporte",
  [ROLES.OPERACIONES]: "Operaciones",
  [ROLES.POSVENTA]:    "Posventa",
  [ROLES.SUPERADMIN]:  "Super Admin",
};

// 2. CONFIGURACIÓN DE ENTORNO (Sin MOCK_MODE)
export const ENV = {
  API_BASE:  import.meta.env.VITE_API_BASE  || "",
  APP_URL:   import.meta.env.VITE_APP_URL   || window.location.origin,
};

// 3. ESTÉTICA Y LOGOS
export const LOGO_SRC = "/logo.png";
export const LOGO2_SRC = "/logo2.png";

export const CHART_COLORS = {
  primary: "#1a7fa3", 
  success: "#10a37f",
  warning: "#f59e0b", 
  danger: "#ef4444",
  white: "#ffffff", 
  border: "#e5e7eb",
};

// 4. DOMINIO DEL NEGOCIO (Motivos, Horas, Visitas)
export const MOTIVOS = [
  "Sin Conexion", "Intermitencia", "Velocidad lenta", "Sin señal", 
  "Reubicación equipo", "Instalación nueva", "ONU colgada", "Antena colgada", 
  "Recableado", "Sin potencia", "Antena desalineada", "Antena desconectada", 
  "Cambio de tecnología", "Fibra Electrificada", "Router desconfigurado", 
  "Fibra Fracturada", "Conector Dañado", "Mantenimiento preventivo", 
  "Cambio de clave/SSID presencial", "Retiro de equipos", 
  "Sustitución de equipo por avería", "Validación de cobertura", "Otro"
];

export const HORAS = (() => {
  const s = [];
  for (let h = 7; h <= 16; h++)
    for (const m of [0, 30]) {
      if (h === 7 && m === 0) continue;
      s.push(`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`);
    }
  return s;
})();

export const TIPO_VISITA_LABELS = {
  paga: "Paga ($10 + materiales)", 
  pagaMateriales: "Solo materiales",
  pagaManoObra: "Solo mano de obra ($10)", 
  garantia: "Garantía ($0)",
};

export const TIPO_VISITA_OPTIONS = Object.entries(TIPO_VISITA_LABELS).map(([value, label]) => ({ 
  value, 
  label 
}));