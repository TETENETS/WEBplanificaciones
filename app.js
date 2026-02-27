/**
 * app.js - Lógica Principal del Frontend (TETENET)
 */

// ============================================================================
// 1. ESTADO GLOBAL Y AUTENTICACIÓN
// ============================================================================

const AppState = { 
    tickets: [], 
    materiales: [], 
    tecnicos: [], 
    currentTicket: null 
};

const AuthModule = {
    currentUser: null,
    
    login: async function() {
        const u = document.getElementById('login-user').value.trim();
        const p = document.getElementById('login-pass').value.trim();
        try {
            const user = await API.auth.login(u, p);
            if (user && user.nombre) {
                this.currentUser = user;
                this.iniciarInterfaz();
            }
        } catch (e) { 
            document.getElementById('login-error').style.display = 'block'; 
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
    
    logout: () => location.reload()
};

// ============================================================================
// 2. MÓDULO DE GESTIÓN DE TICKETS
// ============================================================================

const TicketModule = {
    drawing: false,

    // --- CREACIÓN DE TICKETS ---
    prepararFormulario: async function() {
        document.getElementById('nt-datos-cliente').classList.add('hidden');
        document.getElementById('nt-fecha').value = new Date().toISOString().split('T')[0];
        try {
            const lista = await API.catalogos.getTecnicos();
            const sel = document.getElementById('nt-tecnico');
            sel.innerHTML = lista.map(t => `<option value="${t.nombre}">${t.nombre}</option>`).join('');
            this.generarHoras();
        } catch (e) { 
            API.log('Carga técnicos fallida', e.message, 'ERROR'); 
        }
    },

    buscarCliente: async function() {
        const tipo = document.getElementById('nt-cedula-tipo').value;
        const num = document.getElementById('nt-cedula-num').value.trim();
        try {
            const c = await API.clientes.buscar(`${tipo}-${num}`);
            if(c) {
                document.getElementById('nt-nombre').value = c.Cliente_nombre || c.cliente_nombre || '';
                document.getElementById('nt-zona').value = c.zona || '';
                document.getElementById('nt-caja-nap').value = c.caja_nap || '';
                document.getElementById('nt-datos-cliente').classList.remove('hidden');
            }
        } catch (e) { alert("Cliente no encontrado en la base de datos."); }
    },

    generarHoras: async function() {
        const tec = document.getElementById('nt-tecnico').value;
        const fecha = document.getElementById('nt-fecha').value;
        const selHora = document.getElementById('nt-hora');
        if (!tec || !fecha) return;

        try {
            const ocupadasData = await API.tickets.getDisponibilidad(tec, fecha);
            const horasOcupadas = Array.isArray(ocupadasData) ? ocupadasData.map(t => t.hora) : [];

            selHora.innerHTML = '';
            let h = 7, m = 30;
            while(h < 17) {
                let lbl = `${h.toString().padStart(2, '0')}:${m === 0 ? '00' : '30'}`;
                if (!horasOcupadas.includes(lbl)) {
                    selHora.innerHTML += `<option>${lbl}</option>`;
                }
                m += 30; if(m === 60) { m = 0; h++; }
            }
        } catch (e) { console.error("Error disponibilidad:", e); }
    },

    toggleMotivo: function() {
        const select = document.getElementById('nt-motivo');
        const inputOtro = document.getElementById('nt-motivo-otro');
        inputOtro.classList.toggle('hidden', select.value !== 'Otro');
    },

    crearTicket: async function() {
        let cat = document.getElementById('nt-motivo').value;
        if(cat === 'Otro') cat = document.getElementById('nt-motivo-otro').value;
        
        const datos = {
            id: "TCK-" + Date.now().toString().slice(-4),
            cedula: document.getElementById('nt-cedula-tipo').value + "-" + document.getElementById('nt-cedula-num').value,
            Cliente_nombre: document.getElementById('nt-nombre').value,
            zona: document.getElementById('nt-zona').value,
            caja_nap: document.getElementById('nt-caja-nap').value,
            categoria: cat,
            asignado_a: document.getElementById('nt-tecnico').value,
            hora: document.getElementById('nt-hora').value,
            fecha: document.getElementById('nt-fecha').value,
            estado: 'pendiente'
        };

        try {
            await API.tickets.crear(datos);
            alert("Ticket Creado con Éxito");
            UIModule.navigate('dashboard-analista');
        } catch (e) { alert("Error al guardar el ticket"); }
    },

    // --- RESOLUCIÓN Y CIERRE DE TICKETS (OPERACIONES) ---
    abrirResolucion: async function(id) {
        UIModule.navigate('resolver-ticket');
        const t = AppState.tickets.find(x => (x.id || x.ID) === id);
        if (!t) return;
        
        AppState.currentTicket = t;
        
        // Mapeo dinámico de datos del cliente
        document.getElementById('rt-id').innerText = t.id || t.ID || 'N/A';
        document.getElementById('rt-cliente').innerText = t.Cliente_nombre || t.cliente_nombre || 'N/A';
        document.getElementById('rt-dir').innerText = t.zona || t.direccion || 'Consultar en sitio';
        document.getElementById('rt-caja-nap').innerText = t.caja_nap || 'N/A';

        const formDiv = document.getElementById('rt-formulario-resolucion');
        const pendDiv = document.getElementById('rt-estado-pendiente');

        if (t.estado === 'pendiente') {
            formDiv.classList.add('hidden');
            pendDiv.classList.remove('hidden');
        } else {
            formDiv.classList.remove('hidden');
            pendDiv.classList.add('hidden');
            
            // Retraso para asegurar que el canvas tenga su tamaño real antes de iniciar
            setTimeout(() => { this.iniciarCanvas(); }, 200);

            // Cargar materiales si no están en memoria
            if (AppState.materiales.length === 0) {
                try {
                    AppState.materiales = await API.catalogos.getMateriales();
                } catch(e) { console.error("Fallo al cargar materiales"); }
            }
        }
    },

    iniciarSoporte: async function() {
        try {
            await API.tickets.iniciar({ id: AppState.currentTicket.id || AppState.currentTicket.ID });
            AppState.currentTicket.estado = 'en curso';
            this.abrirResolucion(AppState.currentTicket.id || AppState.currentTicket.ID);
        } catch (e) { alert("Error al iniciar el soporte en la base de datos."); }
    },

    cerrarTicket: async function(est) {
        const datos = {
            id: AppState.currentTicket.id || AppState.currentTicket.ID,
            estado: est,
            solucion: document.getElementById('rt-descripcion').value,
            monto: parseFloat(document.getElementById('rt-total-monto').innerText),
            firma: est === 'resuelto' ? document.getElementById('signature-pad').toDataURL() : null,
            fecha_solucion: new Date().toISOString().split('T')[0]
        };
        try {
            await API.tickets.cerrar(datos);
            alert(`Ticket marcado como: ${est}`);
            UIModule.navigate('dashboard-operaciones');
        } catch (e) { alert("Error al cerrar el ticket."); }
    },

    // --- MANEJO DEL CANVAS (FIRMA) ---
    iniciarCanvas: function() {
        const canvas = document.getElementById('signature-pad');
        if (!canvas) return;
        
        canvas.width = canvas.parentElement.offsetWidth || 300; 
        canvas.height = 200;
        const ctx = canvas.getContext('2d');
        ctx.strokeStyle = "#000000"; 
        ctx.lineWidth = 2; 
        ctx.lineCap = "round";
        
        const getPos = (e) => {
            const r = canvas.getBoundingClientRect();
            return { 
                x: (e.touches ? e.touches[0].clientX : e.clientX) - r.left, 
                y: (e.touches ? e.touches[0].clientY : e.clientY) - r.top 
            };
        };

        canvas.onmousedown = canvas.ontouchstart = (e) => { 
            e.preventDefault(); 
            this.drawing = true; 
            const p = getPos(e); 
            ctx.beginPath(); 
            ctx.moveTo(p.x, p.y); 
        };
        canvas.onmousemove = canvas.ontouchmove = (e) => { 
            if(this.drawing) { 
                const p = getPos(e); 
                ctx.lineTo(p.x, p.y); 
                ctx.stroke(); 
            } 
        };
        canvas.onmouseup = canvas.ontouchend = () => this.drawing = false;
    },

    // --- MATERIALES Y COBROS ---
    toggleMateriales: function() {
        const si = document.getElementById('rt-uso-materiales').value === 'si';
        document.getElementById('rt-seccion-materiales').classList.toggle('hidden', !si);
        this.calcularTotal();
    },

    agregarMaterial: function() {
        const lista = Array.isArray(AppState.materiales) ? AppState.materiales : [];
        const options = lista.map(m => `<option value="${m.precio}">${m.nombre} ($${m.precio})</option>`).join('');
        
        if (options === "") return alert("No hay materiales cargados desde la base de datos.");

        const div = document.createElement('div');
        div.className = 'form-row';
        div.innerHTML = `
            <select class="mat-select" onchange="TicketModule.calcularTotal()" style="flex:2">${options}</select>
            <input type="number" class="mat-qty" value="1" min="1" onchange="TicketModule.calcularTotal()" style="width:70px">
            <button class="btn btn-danger" onclick="this.parentElement.remove(); TicketModule.calcularTotal()">X</button>`;
        document.getElementById('rt-lista-materiales').appendChild(div);
        this.calcularTotal();
    },

    calcularTotal: function() {
        let total = document.getElementById('rt-tipo-visita').value === 'paga' ? 10 : 0;
        document.querySelectorAll('#rt-lista-materiales .form-row').forEach(row => {
            const precio = parseFloat(row.querySelector('.mat-select').value) || 0;
            const cant = parseInt(row.querySelector('.mat-qty').value) || 0;
            total += (precio * cant);
        });
        document.getElementById('rt-total-monto').innerText = total.toFixed(2);
    }
};

// ============================================================================
// 3. MÓDULO DE PLANIFICACIÓN (KANBAN)
// ============================================================================

const PlanificacionModule = {
    render: function() {
        const board = document.getElementById('kanban-board');
        if (!board) return;

        board.innerHTML = AppState.tecnicos.map(tec => {
            const tks = AppState.tickets.filter(t => t.asignado_a === tec.nombre && t.estado === 'pendiente');
            return `
                <div class="kanban-column">
                    <div class="kanban-header">${tec.nombre} (${tks.length})</div>
                    <div class="kanban-body">
                        ${tks.map(t => `
                            <div class="kanban-card normal">
                                <strong>${t.hora}</strong> - ${t.Cliente_nombre || t.cliente_nombre}<br>
                                <small>ID: ${t.id || t.ID} | Zona: ${t.zona}</small>
                            </div>
                        `).join('') || '<p style="text-align:center; color:#999; padding:10px;">Sin pendientes</p>'}
                    </div>
                </div>`;
        }).join('');
    }
};

// ============================================================================
// 4. MÓDULO DE INTERFAZ Y RENDERIZADO (UI)
// ============================================================================

const UIModule = {
    navigate: async function(id) {
        document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
        document.getElementById(`view-${id}`).classList.remove('hidden');
        
        if(id === 'nuevo-ticket') {
            TicketModule.prepararFormulario();
        }
        else if(id === 'dashboard-analista') {
            AppState.tickets = await API.tickets.getAnalista();
            this.renderTablaAnalista();
        }
        else if(id === 'planificacion') {
            if (AppState.tecnicos.length === 0) AppState.tecnicos = await API.catalogos.getTecnicos();
            if (AppState.tickets.length === 0) AppState.tickets = await API.tickets.getAnalista();
            PlanificacionModule.render();
        }
        else if(id === 'dashboard-operaciones') {
            // Pasamos fecha vacía ('') para traer también los tickets atrasados
            AppState.tickets = await API.tickets.getDisponibilidad(AuthModule.currentUser.nombre, '');
            this.renderOperaciones();
        }
    },

    renderTablaAnalista: function() {
        const tbody = document.querySelector('#table-all-tickets tbody');
        if (!tbody) return;

        tbody.innerHTML = AppState.tickets.map(t => {
            const tkId = t.id || t.ID;
            const magicLink = `${window.location.origin}${window.location.pathname}?ticket=${tkId}`;
            return `
            <tr>
                <td>${tkId}</td>
                <td>${t.Cliente_nombre || t.cliente_nombre || 'N/A'}</td>
                <td>${t.asignado_a || 'N/A'}</td>
                <td><span class="badge bg-${(t.estado || 'pendiente').replace(' ', '')}">${t.estado || 'N/A'}</span></td>
                <td>${t.fecha || 'N/A'}</td>
                <td>
                    <div style="display:flex; gap:5px;">
                        <button class="btn btn-info" onclick="UIModule.verPreview('${tkId}')" title="Generar PDF">👁️</button>
                        <button class="btn btn-warning" onclick="UIModule.copiarLink('${magicLink}')" title="Copiar Acceso">🔗</button>
                        <button class="btn btn-danger" onclick="UIModule.eliminarTicket('${tkId}')" title="Eliminar">🗑️</button>
                    </div>
                </td>
            </tr>`;
        }).join('');
    },

    renderOperaciones: function() {
        const tbody = document.querySelector('#table-op-tickets tbody');
        if (!tbody) return;

        tbody.innerHTML = AppState.tickets.map(t => {
            const tkId = t.id || t.ID;
            return `
            <tr>
                <td>${tkId || 'N/A'}</td>
                <td>${t.Cliente_nombre || t.cliente_nombre || 'N/A'}</td>
                <td>${t.hora || 'N/A'}</td>
                <td>${t.estado || 'N/A'}</td>
                <td>
                    <button class="btn btn-primary" onclick="TicketModule.abrirResolucion('${tkId}')">Gestionar</button>
                </td>
            </tr>`;
        }).join('');
    },

    // --- ACCIONES DEL ANALISTA ---
    copiarLink: function(link) {
        navigator.clipboard.writeText(link).then(() => alert("¡Magic Link copiado al portapapeles!"));
    },

    eliminarTicket: async function(id) {
        if(confirm(`ATENCIÓN: ¿Desea eliminar definitivamente el ticket ${id}?`)) {
            // NOTA: Para que esto sea persistente, necesitas conectar un webhook DELETE en n8n
            alert("El ticket ha sido eliminado de la vista local.");
            AppState.tickets = AppState.tickets.filter(t => (t.id || t.ID) !== id);
            this.renderTablaAnalista();
        }
    },

    verPreview: function(id) {
        const t = AppState.tickets.find(x => (x.id || x.ID) === id);
        
        // Creamos dinámicamente el modal de preview si no existe en el HTML
        let modal = document.getElementById('modal-preview');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'modal-preview';
            modal.className = 'modal hidden';
            modal.innerHTML = `
                <div class="modal-content">
                    <span class="close-modal" onclick="UIModule.cerrarPreview()">&times;</span>
                    <div id="pdf-content"></div>
                </div>`;
            document.body.appendChild(modal);
        }

        const content = document.getElementById('pdf-content');
        content.innerHTML = `
            <div id="ticket-pdf" style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ccc; background: white;">
                <h2 style="color:#288fad; text-align:center; margin-bottom: 5px;">TETENET</h2>
                <h4 style="text-align:center; margin-top: 0; color: #555;">Comprobante de Soporte Técnico</h4>
                <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
                
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                    <tr><td style="padding: 5px 0;"><strong>Ticket ID:</strong></td><td>${t.id || t.ID}</td></tr>
                    <tr><td style="padding: 5px 0;"><strong>Cliente:</strong></td><td>${t.Cliente_nombre || t.cliente_nombre}</td></tr>
                    <tr><td style="padding: 5px 0;"><strong>Zona:</strong></td><td>${t.zona || 'N/A'}</td></tr>
                    <tr><td style="padding: 5px 0;"><strong>Técnico:</strong></td><td>${t.asignado_a || 'N/A'}</td></tr>
                    <tr><td style="padding: 5px 0;"><strong>Fecha Visita:</strong></td><td>${t.fecha || 'N/A'}</td></tr>
                    <tr><td style="padding: 5px 0;"><strong>Estado:</strong></td><td>${(t.estado || 'N/A').toUpperCase()}</td></tr>
                </table>
                
                <div style="background: #f9f9f9; padding: 15px; border-radius: 4px; margin-bottom: 20px;">
                    <p style="margin-top: 0;"><strong>Trabajo Realizado:</strong></p>
                    <p style="color: #444;">${t.solucion || 'Sin detalles de resolución registrados.'}</p>
                </div>
                
                <h3 style="text-align:right; color: #333;">Total Servicio: $${t.monto || '0.00'}</h3>
                
                ${t.firma ? `
                    <div style="margin-top: 40px; text-align: center;">
                        <img src="${t.firma}" style="width:250px; border-bottom:1px solid #000; display:block; margin: 0 auto;">
                        <p style="margin-top: 5px; color: #666;">Firma de Conformidad del Cliente</p>
                    </div>
                ` : '<p style="text-align:center; color:#999; margin-top:40px;">(Sin firma registrada)</p>'}
            </div>
            <div style="display:flex; gap:10px; margin-top:20px;">
                <button class="btn btn-success" style="flex:1;" onclick="UIModule.descargarPDF('${t.id || t.ID}')">Descargar Documento PDF</button>
            </div>
        `;
        modal.classList.remove('hidden');
    },

    descargarPDF: function(id) {
        const element = document.getElementById('ticket-pdf');
        html2pdf().from(element).set({
            margin: 10,
            filename: `Soporte_TETENET_${id}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2 },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        }).save();
    },

    cerrarPreview: () => document.getElementById('modal-preview').classList.add('hidden'),
    
    toggleSidebar: () => document.getElementById('sidebar').classList.toggle('active')
};