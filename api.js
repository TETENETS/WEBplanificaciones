/**
 * api.js - Capa de Servicio, Conexiones HTTP y Logs
 */

const API = {
    // ==========================================
    // SISTEMA DE AUDITORÍA (LOGS)
    // ==========================================
    log: async function(accion, detalles, tipo = 'INFO') {
        const logEntry = { 
            timestamp: new Date().toISOString(), 
            accion, 
            tipo, 
            detalles, 
            usuario: AuthModule.currentUser?.nombre || 'Anónimo' 
        };
        
        console.log(`[TETENET-LOG][${tipo}] ${accion}`, detalles);

        if (window.ENV?.WEBHOOK_LOGS) {
            fetch(window.ENV.WEBHOOK_LOGS, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(logEntry)
            }).catch(() => {});
        }
    },

    // ==========================================
    // MANEJADOR DE PETICIONES BASE
    // ==========================================
    request: async function(url, actionName, options = {}) {
        try {
            if (!url) throw new Error(`URL para ${actionName} no definida en variables de entorno.`);
            
            const response = await fetch(url, {
                ...options,
                headers: { 'Content-Type': 'application/json', ...options.headers }
            });
            
            if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
            
            // Verificamos que el servidor devuelva JSON y no una página web de error (Ej: <!DOCTYPE html>)
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
                return await response.json();
            } else {
                const text = await response.text();
                this.log(`Error de formato JSON en ${actionName}`, text.substring(0, 100), 'ERROR');
                throw new Error("El servidor devolvió un formato no válido. Verifique que el Webhook en n8n esté activo.");
            }
        } catch (error) {
            this.log(actionName, error.message, 'ERROR');
            throw error;
        }
    },

    // ==========================================
    // ENDPOINTS DE LA APLICACIÓN
    // ==========================================
    auth: {
        login: (user, pass) => API.request(window.ENV.WEBHOOK_LOGIN, 'Login', {
            method: 'POST', body: JSON.stringify({ user, pass })
        })
    },

    clientes: {
        buscar: (cedula) => API.request(`${window.ENV.WEBHOOK_BUSCAR_CLIENTE}?cedula=${cedula}`, 'Busqueda Cliente')
    },

    tickets: {
        getAnalista: () => API.request(window.ENV.WEBHOOK_TICKETS_ANALISTA, 'Tickets Analista'),
        getDisponibilidad: (tecnico, fecha) => API.request(`${window.ENV.WEBHOOK_TICKETS_OPERACIONES}?tecnico=${encodeURIComponent(tecnico)}&fecha=${fecha}`, 'Consulta Horas'),
        crear: (datos) => API.request(window.ENV.WEBHOOK_NUEVO_TICKET, 'Creacion Ticket', { method: 'POST', body: JSON.stringify(datos) }),
        iniciar: (datos) => API.request(window.ENV.WEBHOOK_INICIAR_SOPORTE, 'Inicio Soporte', { method: 'POST', body: JSON.stringify(datos) }),
        cerrar: (datos) => API.request(window.ENV.WEBHOOK_CERRAR_TICKET, 'Cierre Ticket', { method: 'POST', body: JSON.stringify(datos) })
    },

    catalogos: {
        getMateriales: () => API.request(window.ENV.WEBHOOK_CARGAR_MATERIALES, 'Carga Materiales'),
        getTecnicos: () => API.request(window.ENV.WEBHOOK_CARGAR_TECNICOS, 'Carga Tecnicos')
    }
};