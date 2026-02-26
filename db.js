// ==========================================
// BASE DE DATOS MOCK (Datos externos)
// ==========================================
window.TetenetDB = {
  "usuarios": [
    { "user": "operaciones@econet.com", "password": "123", "tipo": "operaciones", "nombre": "Técnico 1" },
    { "user": "operaciones2@econet.com", "password": "123", "tipo": "operaciones", "nombre": "Técnico 2" },
    { "user": "analista@econet.com", "password": "123", "tipo": "analista", "nombre": "Sebastian" }
  ],
  "clientes": {
    "V-12345678": { "Cliente_nombre": "Juan Pérez", "telefono": "0412-1234567", "plan": "50 Mbps", "zona": "BNA", "caja_nap": "NAP-01-BNA", "direccion": "Av. Principal BNA, Casa 4" },
    "V-87654321": { "Cliente_nombre": "María Gómez", "telefono": "0424-7654321", "plan": "100 Mbps", "zona": "PZO", "caja_nap": "NAP-14-PZO", "direccion": "Sector Alta Vista" },
    "J-99887766": { "Cliente_nombre": "Empresa C.A.", "telefono": "0281-2223344", "plan": "200 Mbps", "zona": "TRG", "caja_nap": "NAP-05-TRG", "direccion": "Centro Comercial Principal" }
  },
  "materiales": [
    { "id": "mat_1", "nombre": "Fibra óptica (metros)", "precio": 1.0 },
    { "id": "mat_2", "nombre": "Puntas/Conectores", "precio": 1.7 },
    { "id": "mat_3", "nombre": "Router ONT", "precio": 45.0 }
  ],
  "zonas": ["BNA", "PZO", "PGN", "TRG"],
  "tecnicos": ["Técnico 1", "Técnico 2", "Técnico Guardia"],
  "tickets": [] 
};