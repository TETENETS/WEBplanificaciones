/**
 * app.js - Lógica de Interfaz y Navegación
 * Optimizado para carga bajo demanda y seguridad.
 */

// Estado Global de la App
const AppState = {
    tickets: [],
    materiales: [],
    tecnicos: []
};

const AuthModule = {
    currentUser: null,
    login: async function() {
        const u = document.getElementById('login-user').value.trim();
        const p = document.getElementById('login-pass').value.trim();
        const btn = document.querySelector('#login-screen .btn');

        try {
            btn.innerText = "Validando..."; btn.disabled = true;
            const user = await API.auth.login(u, p);
            
            if (user && user.nombre) {
                this.currentUser = user;
                this.iniciarInterfaz();
            }
        } catch (e) {
            document.getElementById('login-error').style.display = 'block';
        } finally {
            btn.innerText = "Ingresar"; btn.disabled = false;
        }
    },

    iniciarInterfaz: function() {
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('app-container').classList.remove('hidden');
        document.getElementById('current-user-name').innerText = this.currentUser.nombre;

        const esAnalista = this.currentUser.tipo === 'analista';
        document.getElementById('menu-analista').classList.toggle('hidden', !esAnalista);
        document.getElementById('menu-operaciones').classList.toggle('hidden', esAnalista);

        UIModule.navigate(esAnalista ? 'dashboard-analista' : 'dashboard-operaciones');
    },

    logout: function() {
        this.currentUser = null;
        location.reload(); // Limpieza total de estado
    }
};

const TicketModule = {
    buscarCliente: async function() {
        const tipo = document.getElementById('nt-cedula-tipo').value;
        const num = document.getElementById('nt-cedula-num').value.trim();
        const btn = document.querySelector('#view-nuevo-ticket .btn-primary');

        try {
            btn.innerText = "..."; btn.disabled = true;
            const c = await API.clientes.buscar(`${tipo}-${num}`);
            
            if(c) {
                document.getElementById('nt-nombre').value = c.Cliente_nombre;
                document.getElementById('nt-zona').value = c.zona;
                document.getElementById('nt-caja-nap').value = c.caja_nap || '';
                document.getElementById('nt-datos-cliente').classList.remove('hidden');
            }
        } catch (e) { alert("Cliente no encontrado"); }
        finally { btn.innerText = "Buscar"; btn.disabled = false; }
    },

    crearTicket: async function() {
        const datos = {
            id: "TCK-" + Date.now().toString().slice(-4), // Generación temporal
            cedula: document.getElementById('nt-cedula-tipo').value + "-" + document.getElementById('nt-cedula-num').value,
            Cliente_nombre: document.getElementById('nt-nombre').value,
            zona: document.getElementById('nt-zona').value,
            caja_nap: document.getElementById('nt-caja-nap').value,
            categoria: document.getElementById('nt-motivo').value,
            asignado_a: document.getElementById('nt-tecnico').value,
            hora: document.getElementById('nt-hora').value,
            estado: 'pendiente',
            fecha: new Date().toISOString().split('T')[0]
        };

        try {
            await API.tickets.crear(datos);
            alert("Ticket Creado Exitosamente");
            UIModule.navigate('dashboard-analista');
        } catch (e) { alert("Error al guardar ticket"); }
    }
};

const UIModule = {
    navigate: async function(viewId) {
        document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
        document.getElementById(`view-${viewId}`).classList.remove('hidden');
        document.getElementById('sidebar').classList.remove('active');

        // Carga de datos específica según la vista
        if (viewId === 'dashboard-analista') {
            AppState.tickets = await API.tickets.getAnalista();
            ChartModule.render();
        } else if (viewId === 'dashboard-operaciones') {
            AppState.tickets = await API.tickets.getOperaciones(AuthModule.currentUser.nombre);
            this.renderOperaciones();
        } else if (viewId === 'nuevo-ticket') {
            AppState.tecnicos = await API.catalogos.getTecnicos();
            this.llenarSelectTecnicos();
        }
    },

    toggleSidebar: () => document.getElementById('sidebar').classList.toggle('active'),

    renderOperaciones: function() {
        const tbody = document.querySelector('#table-op-tickets tbody');
        tbody.innerHTML = AppState.tickets.map(t => `
            <tr>
                <td>${t.id}</td><td>${t.Cliente_nombre}</td><td>${t.hora}</td>
                <td><span class="badge bg-${t.estado.replace(' ', '')}">${t.estado}</span></td>
                <td><button class="btn btn-info" onclick="TicketModule.abrirResolucion('${t.id}')">Gestionar</button></td>
            </tr>
        `).join('');
    },

    llenarSelectTecnicos: function() {
        const sel = document.getElementById('nt-tecnico');
        sel.innerHTML = AppState.tecnicos.map(t => `<option value="${t.nombre}">${t.nombre}</option>`).join('');
    }
};

// Inicialización
window.onload = () => API.log('Aplicación Iniciada', { userAgent: navigator.userAgent });