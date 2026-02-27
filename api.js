/**
 * api.js - Capa de Servicio y Sistema de Logs
 * Centraliza la comunicación con n8n y monitorea la salud del sistema.
 */
const API = {
    // Sistema de Logging Integral
    log: async function(accion, detalles, tipo = 'INFO') {
        const timestamp = new Date().toLocaleString();
        const logEntry = { timestamp, accion, tipo, detalles, usuario: AuthModule.currentUser?.nombre || 'Anónimo' };
        
        console.log(`[${tipo}] ${accion}:`, detalles);

        // Envío opcional a un Webhook de logs para auditoría en tiempo real
        if (window.ENV?.WEBHOOK_LOGS) {
            fetch(window.ENV.WEBHOOK_LOGS, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(logEntry)
            }).catch(() => {}); // Fallo silencioso del log para no interrumpir la app
        }
    },

    // Motor Genérico de Peticiones con Manejo de Errores
    request: async function(url, actionName, options = {}) {
        try {
            if (!url) throw new Error(`URL para ${actionName} no definida en .env`);
            
            this.log(`Iniciando ${actionName}`, { url });
            const response = await fetch(url, {
                ...options,
                headers: { 'Content-Type': 'application/json', ...options.headers }
            });

            if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
            
            const data = await response.json();
            this.log(`${actionName} Completado`, { status: 'OK' });
            return data;
        } catch (error) {
            this.log(`${actionName} FALLIDO`, { error: error.message }, 'ERROR');
            throw error;
        }
    },

    // Endpoints Específicos
    auth: {
        login: (user, pass) => API.request(window.ENV.WEBHOOK_LOGIN, 'Login', {
            method: 'POST', body: JSON.stringify({ user, pass }) // El pass no se guarda en logs por API.log
        })
    },

    clientes: {
        buscar: (cedula) => API.request(`${window.ENV.WEBHOOK_BUSCAR_CLIENTE}?cedula=${cedula}`, 'Busqueda Cliente')
    },

    tickets: {
        getAnalista: () => API.request(window.ENV.WEBHOOK_TICKETS_ANALISTA, 'Carga Tickets Analista'),
        getOperaciones: (nombre) => API.request(`${window.ENV.WEBHOOK_TICKETS_OPERACIONES}?tecnico=${encodeURIComponent(nombre)}`, 'Carga Tickets Tecnico'),
        crear: (datos) => API.request(window.ENV.WEBHOOK_NUEVO_TICKET, 'Creacion Ticket', { method: 'POST', body: JSON.stringify(datos) }),
        iniciar: (datos) => API.request(window.ENV.WEBHOOK_INICIAR_SOPORTE, 'Inicio Soporte', { method: 'POST', body: JSON.stringify(datos) }),
        cerrar: (datos) => API.request(window.ENV.WEBHOOK_CERRAR_TICKET, 'Cierre Ticket', { method: 'POST', body: JSON.stringify(datos) })
    },

    catalogos: {
        getMateriales: () => API.request(window.ENV.WEBHOOK_CARGAR_MATERIALES, 'Carga Materiales'),
        getTecnicos: () => API.request(window.ENV.WEBHOOK_CARGAR_TECNICOS, 'Carga Tecnicos')
    }
};