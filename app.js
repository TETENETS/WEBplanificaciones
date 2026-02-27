// ==========================================
// MÓDULO 1: DATOS Y ALMACENAMIENTO (n8n + PostgreSQL)
// ==========================================
const DataModule = {
    db: null,
    init: async function() {
        try {
            if (!window.ENV || !window.ENV.WEBHOOK_CARGAR_DATOS || window.ENV.WEBHOOK_CARGAR_DATOS === "") {
                alert("⚠️ Advertencia: WEBHOOK_CARGAR_DATOS no está configurado. Verifica tu archivo .env en Easypanel.");
                return false;
            }

            const response = await fetch(window.ENV.WEBHOOK_CARGAR_DATOS);
            if (!response.ok) throw new Error("Fallo en la respuesta de n8n");
            
            this.db = await response.json(); 
            localStorage.removeItem('tetenet_db'); // Limpiar caché
            return true;

        } catch (error) {
            console.error("Error conectando a la base de datos PostgreSQL:", error);
            alert("⚠️ No se pudo cargar la base de datos desde n8n.");
            return false;
        }
    },
    save: function() {
        // Vacío intencionalmente. Los guardados se hacen vía webhooks de n8n.
    }
};

// ==========================================
// MÓDULO 2: AUTENTICACIÓN (AuthModule)
// ==========================================
const AuthModule = {
    currentUser: null,
    login: function() {
        const u = document.getElementById('login-user').value.trim().toLowerCase();
        const p = document.getElementById('login-pass').value.trim();
        const valid = DataModule.db.usuarios.find(x => x.user.toLowerCase() === u && x.password === p);
        
        if (valid) {
            this.currentUser = valid;
            document.getElementById('login-screen').classList.add('hidden');
            document.getElementById('app-container').classList.remove('hidden');
            document.getElementById('current-user-name').innerText = valid.nombre;

            if (valid.tipo === 'analista') {
                document.getElementById('menu-analista').classList.remove('hidden');
                document.getElementById('menu-operaciones').classList.add('hidden');
                UIModule.navigate('dashboard-analista');
            } else {
                document.getElementById('menu-analista').classList.add('hidden');
                document.getElementById('menu-operaciones').classList.remove('hidden');
                UIModule.navigate('dashboard-operaciones');
            }
        } else {
            document.getElementById('login-error').style.display = 'block';
        }
    },
    logout: function() {
        this.currentUser = null;
        document.getElementById('app-container').classList.add('hidden');
        document.getElementById('login-screen').classList.remove('hidden');
    }
};

// ==========================================
// MÓDULO 3: INTERFAZ Y NAVEGACIÓN (UIModule)
// ==========================================
const UIModule = {
    navigate: function(viewId) {
        document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
        document.getElementById(`view-${viewId}`).classList.remove('hidden');
        
        document.getElementById('sidebar').classList.remove('active');

        if(viewId === 'dashboard-analista') {
            document.getElementById('view-title').innerText = "Dashboard";
            ChartModule.renderAnalista();
        } else if (viewId === 'planificacion') {
            document.getElementById('view-title').innerText = "Planificación Diaria";
            PlanificacionModule.render();
        } else if (viewId === 'nuevo-ticket') {
            document.getElementById('view-title').innerText = "Nuevo Ticket";
            TicketModule.prepararFormulario();
        } else if (viewId === 'dashboard-operaciones') {
            document.getElementById('view-title').innerText = "Mis Tickets";
            TicketModule.renderOperaciones();
        }
    },
    toggleSidebar: function() {
        document.getElementById('sidebar').classList.toggle('active');
    },
    verPreview: function(id) {
        const t = DataModule.db.tickets.find(x => x.id === id);
        const c = DataModule.db.clientes[t.cedula];
        const estaCerrado = (t.estado === 'resuelto' || t.estado === 'sin resolver');

        let html = `
            <div style="border: 1px solid #ddd; padding:20px; font-family:sans-serif;">
                <h2 style="color:#288fad; text-align:center; margin-bottom: 5px;">Planilla Técnica - TETENET</h2>
                <h4 style="text-align:center; margin-top:0; color:#666;">Ticket: ${t.id}</h4>
                <hr>
                <table style="width:100%; margin-bottom:15px; font-size:14px;">
                    <tr><td><strong>Cliente:</strong> ${t.Cliente_nombre}</td><td><strong>Cédula:</strong> ${t.cedula}</td></tr>
                    <tr><td colspan="2"><strong>Dirección:</strong> ${c ? c.direccion : 'N/A'} - <strong>Zona:</strong> ${t.zona} - <strong>Caja NAP:</strong> ${t.caja_nap || 'N/A'}</td></tr>
                    <tr><td><strong>Técnico:</strong> ${t.asignado_a}</td><td><strong>Hora Asignada:</strong> ${t.hora}</td></tr>
                    <tr><td colspan="2"><strong>Motivo:</strong> ${t.categoria}</td></tr>
                </table>
        `;

        if (estaCerrado) {
            html += `
                <hr>
                <h3 style="font-size:16px;">Reporte de Operaciones</h3>
                <p><strong>Solución/Reporte:</strong> ${t.solucion || 'Sin detalles'}</p>
                <p><strong>Estado Final:</strong> ${t.estado.toUpperCase()}</p>
                <h3 style="text-align:right;">Monto a Facturar: $${(t.monto || 0).toFixed(2)}</h3>
            `;
            if(t.firma) {
                html += `
                    <div style="margin-top:20px; text-align:center;">
                        <p><strong>Firma de Conformidad del Cliente</strong></p>
                        <img src="${t.firma}" style="max-width:300px; max-height:100px; border-bottom: 1px solid #333;">
                    </div>
                `;
            }
        }
        html += `</div>`;

        document.getElementById('pdf-content').innerHTML = html;
        
        const actionsDiv = document.getElementById('pdf-actions');
        if(estaCerrado) {
            actionsDiv.innerHTML = `<button class="btn btn-primary" onclick="PDFModule.descargar('${t.id}')">Descargar PDF</button>`;
        } else {
            actionsDiv.innerHTML = `<span style="color:#888;">El PDF estará disponible cuando Operaciones cierre el ticket.</span>`;
        }

        document.getElementById('modal-preview').classList.remove('hidden');
    },
    cerrarPreview: function() {
        document.getElementById('modal-preview').classList.add('hidden');
    }
};

// ==========================================
// MÓDULO 4: GRÁFICOS Y MÉTRICAS (ChartModule)
// ==========================================
const ChartModule = {
    cDiario: null, cSemanal: null,
    
    getFechasSemana: function() {
        const hoy = new Date();
        hoy.setHours(0,0,0,0);
        const day = hoy.getDay();
        const diff = hoy.getDate() - day + (day === 0 ? -6 : 1); 
        const lunes = new Date(hoy.setDate(diff));
        return { 
            lunes, 
            domingo: new Date(new Date(lunes).setDate(lunes.getDate() + 6)) 
        };
    },

    renderAnalista: function() {
        const tbody = document.querySelector('#table-all-tickets tbody');
        tbody.innerHTML = '';
        
        const hoyStr = new Date().toISOString().split('T')[0];
        const limites = this.getFechasSemana();
        
        let estHoy = { pendientes: 0, curso: 0, resueltos: 0, sinresolver: 0 };
        let arrSemanalTotal = [0,0,0,0,0,0,0];

        DataModule.db.tickets.forEach(t => {
            let claseEstado = t.estado.replace(/\s+/g, ''); 
            let fechaSol = t.fecha_solucion ? t.fecha_solucion : '---';

            tbody.innerHTML += `
                <tr>
                    <td>${t.id}</td><td>${t.Cliente_nombre}</td>
                    <td>${t.asignado_a}</td>
                    <td><span class="badge bg-${claseEstado}">${t.estado}</span></td>
                    <td>${t.fecha}</td>
                    <td>${fechaSol}</td>
                    <td>
                        <button class="btn btn-info" style="padding:5px;" onclick="UIModule.verPreview('${t.id}')">👁️</button>
                        <button class="btn btn-danger" style="padding:5px;" onclick="TicketModule.eliminar('${t.id}')">🗑️</button>
                    </td>
                </tr>
            `;

            if (t.fecha === hoyStr) {
                if(t.estado === 'resuelto') estHoy.resueltos++;
                else if(t.estado === 'pendiente') estHoy.pendientes++;
                else if(t.estado === 'en curso') estHoy.curso++;
                else if(t.estado === 'sin resolver') estHoy.sinresolver++;
            }

            const [y, m, d] = t.fecha.split('-');
            const dateObj = new Date(y, m - 1, d);
            if (dateObj >= limites.lunes && dateObj <= limites.domingo) {
                let dayIndex = dateObj.getDay(); 
                let idx = dayIndex === 0 ? 6 : dayIndex - 1; 
                arrSemanalTotal[idx]++;
            }
        });

        if(this.cDiario) this.cDiario.destroy();
        this.cDiario = new Chart(document.getElementById('chartDiario'), {
            type: 'pie',
            data: {
                labels: ['Pendientes', 'En Curso', 'Resueltos', 'Sin Resolver'],
                datasets: [{ data: [estHoy.pendientes, estHoy.curso, estHoy.resueltos, estHoy.sinresolver], backgroundColor: ['#f8ac59', '#288fad', '#1ab394', '#ed5565'] }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });

        if(this.cSemanal) this.cSemanal.destroy();
        this.cSemanal = new Chart(document.getElementById('chartSemanalBarras'), {
            type: 'bar',
            data: {
                labels: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
                datasets: [{ label: 'Total Tickets', data: arrSemanalTotal, backgroundColor: '#2f4050' }]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: {stepSize: 1} } } }
        });
    }
};

// ==========================================
// MÓDULO 5: LÓGICA DE TICKETS Y WEBHOOKS (TicketModule)
// ==========================================
const TicketModule = {
    currentId: null,
    pad: null, drawing: false,

    prepararFormulario: function() {
        document.getElementById('nt-datos-cliente').classList.add('hidden');
        document.getElementById('nt-cedula-num').value = '';
        const sel = document.getElementById('nt-tecnico');
        sel.innerHTML = '';
        DataModule.db.tecnicos.forEach(t => sel.innerHTML += `<option value="${t.nombre}">${t.nombre}</option>`);
        this.generarHoras();
    },
    toggleMotivo: function() {
        const select = document.getElementById('nt-motivo');
        const inputOtro = document.getElementById('nt-motivo-otro');
        if(select.value === 'Otro') inputOtro.classList.remove('hidden');
        else inputOtro.classList.add('hidden');
    },
    buscarCliente: function() {
        const tipo = document.getElementById('nt-cedula-tipo').value;
        const num = document.getElementById('nt-cedula-num').value.trim();
        const cedulaFull = `${tipo}-${num}`;

        // Buscamos en el array de clientes que nos trajo PostgreSQL
        const c = DataModule.db.clientes.find(x => x.cedula === cedulaFull); 
        if(c) {
            document.getElementById('nt-nombre').value = c.Cliente_nombre;
            document.getElementById('nt-telefono').value = c.telefono;
            document.getElementById('nt-zona').value = c.zona;
            document.getElementById('nt-caja-nap').value = c.caja_nap || '';
            document.getElementById('nt-datos-cliente').classList.remove('hidden');
        } else alert(`Cliente no encontrado con cédula: ${cedulaFull}`);
    },
    generarHoras: function() {
        const tec = document.getElementById('nt-tecnico').value;
        const ocupadas = DataModule.db.tickets.filter(t => t.asignado_a === tec && t.estado !== 'resuelto').map(t => t.hora);
        const sel = document.getElementById('nt-hora');
        sel.innerHTML = '';
        let h = 7, m = 30;
        while(h < 16 || (h===16 && m===30)){
            let lbl = `${h.toString().padStart(2, '0')}:${m===0?'00':'30'}`;
            if(!ocupadas.includes(lbl)) sel.innerHTML += `<option>${lbl}</option>`;
            m += 30; if(m===60){ m=0; h++; }
        }
    },
    crearTicket: function() {
        if(!document.getElementById('nt-hora').value) return alert("Sin horas disponibles");
        
        const tipo = document.getElementById('nt-cedula-tipo').value;
        const num = document.getElementById('nt-cedula-num').value.trim();
        const cedulaFull = `${tipo}-${num}`;

        let categoriaTicket = document.getElementById('nt-motivo').value;
        if(categoriaTicket === 'Otro') categoriaTicket = "Otro: " + document.getElementById('nt-motivo-otro').value;

        const id = "TCK-" + (1000 + DataModule.db.tickets.length + 1);
        const tecnicoAsignado = document.getElementById('nt-tecnico').value;

        const nuevoTicket = {
            id: id,
            cedula: cedulaFull,
            Cliente_nombre: document.getElementById('nt-nombre').value,
            zona: document.getElementById('nt-zona').value,
            caja_nap: document.getElementById('nt-caja-nap').value,
            categoria: categoriaTicket,
            asignado_a: tecnicoAsignado,
            hora: document.getElementById('nt-hora').value,
            estado: 'pendiente', 
            fecha: new Date().toISOString().split('T')[0],
            fecha_solucion: "",
            monto: 0,
            firma: null
        };
        
        // Lo mostramos localmente para rapidez
        DataModule.db.tickets.push(nuevoTicket);

        // N8N: Enviar Webhook de Creación
        const magicLink = `${window.location.origin}${window.location.pathname}?ticket=${id}&tech=${encodeURIComponent(tecnicoAsignado)}`;
        if(window.ENV && window.ENV.WEBHOOK_NUEVO_TICKET) {
            fetch(window.ENV.WEBHOOK_NUEVO_TICKET, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...nuevoTicket, magic_link: magicLink })
            }).catch(e => console.error("Error enviando a n8n:", e));
        }

        alert(`Creado: ${id}`);
        UIModule.navigate('dashboard-analista');
    },
    eliminar: function(id) {
        if(confirm(`¿Seguro que deseas ELIMINAR permanentemente el ticket ${id}?`)) {
            DataModule.db.tickets = DataModule.db.tickets.filter(t => t.id !== id);
            // Aquí puedes agregar un Webhook para borrar en DB si lo deseas
            ChartModule.renderAnalista();
        }
    },

    renderOperaciones: function() {
        const tbody = document.querySelector('#table-op-tickets tbody');
        tbody.innerHTML = '';
        DataModule.db.tickets.filter(t => t.asignado_a === AuthModule.currentUser.nombre).forEach(t => {
            let btn = '';
            if(t.estado === 'pendiente') btn = `<button class="btn btn-primary" onclick="TicketModule.cambiarEstado('${t.id}', 'en curso')">Iniciar</button>`;
            else if(t.estado === 'en curso') btn = `<button class="btn btn-success" onclick="TicketModule.abrirResolucion('${t.id}')">Resolver</button>`;
            
            let claseE = t.estado.replace(/\s+/g, '');
            tbody.innerHTML += `<tr><td>${t.id}</td><td>${t.Cliente_nombre}</td><td>${t.hora}</td>
                <td><span class="badge bg-${claseE}">${t.estado}</span></td>
                <td>${btn} <button class="btn btn-info" onclick="UIModule.verPreview('${t.id}')">Ver</button></td></tr>`;
        });
    },
    cambiarEstado: function(id, est) {
        DataModule.db.tickets.find(t => t.id === id).estado = est;
        this.renderOperaciones();
    },
    abrirResolucion: function(id) {
        this.currentId = id;
        UIModule.navigate('resolver-ticket');
        const t = DataModule.db.tickets.find(x => x.id === id);
        
        document.getElementById('rt-id').innerText = t.id;
        document.getElementById('rt-cliente').innerText = t.Cliente_nombre;
        
        const cOriginal = DataModule.db.clientes.find(c => c.cedula === t.cedula);
        document.getElementById('rt-dir').innerText = cOriginal ? cOriginal.direccion : 'N/A';
        document.getElementById('rt-caja-nap').innerText = t.caja_nap || 'N/A';
        
        const formDiv = document.getElementById('rt-formulario-resolucion');
        const pendDiv = document.getElementById('rt-estado-pendiente');

        if (t.estado === 'pendiente') {
            formDiv.classList.add('hidden');
            pendDiv.classList.remove('hidden');
        } else {
            formDiv.classList.remove('hidden');
            pendDiv.classList.add('hidden');
            
            const canvas = document.getElementById('signature-pad');
            canvas.width = canvas.parentElement.offsetWidth || 300; 
            canvas.height = 200;
            
            this.pad = canvas.getContext('2d');
            this.pad.fillStyle = "#fafafa"; 
            this.pad.fillRect(0,0,canvas.width,canvas.height);
            
            const getPos = (e) => {
                const rect = canvas.getBoundingClientRect();
                const clientX = e.touches ? e.touches[0].clientX : e.clientX;
                const clientY = e.touches ? e.touches[0].clientY : e.clientY;
                return { x: clientX - rect.left, y: clientY - rect.top };
            };

            const start = (e) => { e.preventDefault(); this.drawing = true; const pos = getPos(e); this.pad.beginPath(); this.pad.moveTo(pos.x, pos.y); };
            const move = (e) => { e.preventDefault(); if(this.drawing) { const pos = getPos(e); this.pad.lineTo(pos.x, pos.y); this.pad.stroke(); } };
            const stop = (e) => { e.preventDefault(); this.drawing = false; };

            canvas.onmousedown = start; canvas.onmousemove = move; canvas.onmouseup = stop; canvas.onmouseout = stop;
            canvas.ontouchstart = start; canvas.ontouchmove = move; canvas.ontouchend = stop;
            
            document.getElementById('rt-descripcion').value = t.solucion || '';
            document.getElementById('rt-uso-materiales').value = 'no';
            this.toggleMateriales();
        }
    },
    iniciarSoporte: function() {
        const t = DataModule.db.tickets.find(x => x.id === this.currentId);
        t.estado = 'en curso';
        
        // N8N: Enviar Webhook de Inicio
        if(window.ENV && window.ENV.WEBHOOK_INICIAR_SOPORTE) {
            fetch(window.ENV.WEBHOOK_INICIAR_SOPORTE, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(t)
            }).catch(e => console.error("Error enviando a n8n:", e));
        }
        this.abrirResolucion(this.currentId);
    },
    toggleMateriales: function() {
        const si = document.getElementById('rt-uso-materiales').value === 'si';
        document.getElementById('rt-seccion-materiales').classList[si ? 'remove' : 'add']('hidden');
        if(!si) document.getElementById('rt-lista-materiales').innerHTML = '';
        else if(document.getElementById('rt-lista-materiales').innerHTML === '') this.agregarMaterial();
        this.calcularTotal();
    },
    agregarMaterial: function() {
        let opc = DataModule.db.materiales.map(m => `<option value="${m.precio}">${m.nombre}</option>`).join('');
        const div = document.createElement('div');
        div.className = 'form-row';
        div.innerHTML = `<select class="mat-select" onchange="TicketModule.calcularTotal()">${opc}</select>
                         <input type="number" class="mat-qty" value="1" onchange="TicketModule.calcularTotal()" style="width:70px">
                         <button class="btn btn-danger" onclick="this.parentElement.remove(); TicketModule.calcularTotal()">X</button>`;
        document.getElementById('rt-lista-materiales').appendChild(div);
        this.calcularTotal();
    },
    calcularTotal: function() {
        let t = document.getElementById('rt-tipo-visita').value === 'paga' ? 10 : 0;
        if(document.getElementById('rt-uso-materiales').value === 'si') {
            document.querySelectorAll('#rt-lista-materiales .form-row').forEach(row => {
                t += parseFloat(row.querySelector('.mat-select').value) * parseInt(row.querySelector('.mat-qty').value);
            });
        }
        document.getElementById('rt-total-monto').innerText = t.toFixed(2);
    },
    cerrarTicket: function(estado) {
        const t = DataModule.db.tickets.find(x => x.id === this.currentId);
        t.estado = estado;
        t.solucion = document.getElementById('rt-descripcion').value;
        t.monto = parseFloat(document.getElementById('rt-total-monto').innerText);
        
        if(estado === 'resuelto' || estado === 'sin resolver'){
            t.fecha_solucion = new Date().toISOString().split('T')[0];
            const canvas = document.getElementById('signature-pad');
            t.firma = canvas.toDataURL('image/png'); 
        }

        // N8N: Enviar Webhook de Cierre
        if(window.ENV && window.ENV.WEBHOOK_CERRAR_TICKET) {
            fetch(window.ENV.WEBHOOK_CERRAR_TICKET, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(t)
            }).catch(e => console.error("Error enviando a n8n:", e));
        }

        alert("Ticket actualizado a: " + estado.toUpperCase());
        UIModule.navigate('dashboard-operaciones');
    }
};

// ==========================================
// MÓDULO 6: EXPORTACIÓN PDF (PDFModule)
// ==========================================
const PDFModule = {
    descargar: function(id) {
        const element = document.getElementById('pdf-content');
        html2pdf().set({
            margin: 0.5,
            filename: `Planilla_${id}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2 },
            jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
        }).from(element).save();
    }
};

// ==========================================
// MÓDULO 7: PLANIFICACIÓN (PlanificacionModule)
// ==========================================
const PlanificacionModule = {
    render: function() {
        const board = document.getElementById('kanban-board');
        board.innerHTML = '';

        const hoyStr = new Date().toISOString().split('T')[0];
        const ticketsActivos = DataModule.db.tickets.filter(t => 
            t.fecha === hoyStr && (t.estado === 'pendiente' || t.estado === 'en curso')
        );

        DataModule.db.tecnicos.forEach(tecnico => {
            const ticketsTecnico = ticketsActivos.filter(t => t.asignado_a === tecnico.nombre);
            ticketsTecnico.sort((a, b) => a.hora.localeCompare(b.hora));

            let cardsHtml = '';
            ticketsTecnico.forEach(t => {
                const c = DataModule.db.clientes.find(x => x.cedula === t.cedula) || {};
                let colorClass = t.prioridad === 'Alta' || t.prioridad === 'Crítica' ? 'alta' : 'normal';
                let claseEstado = t.estado.replace(/\s+/g, '');

                cardsHtml += `
                    <div class="kanban-card ${colorClass}">
                        <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                            <strong>🕒 ${t.hora}</strong>
                            <span class="badge bg-${claseEstado}">${t.estado}</span>
                        </div>
                        <h5>${t.Cliente_nombre}</h5>
                        <p><strong>📍 Dir:</strong> ${c.direccion || 'N/A'}</p>
                        <p><strong>📞 Tel:</strong> ${c.telefono || 'N/A'}</p>
                        <p><strong>🔧 Actividad:</strong> ${t.categoria}</p>
                        <p><strong>📦 NAP:</strong> ${t.caja_nap || 'N/A'}</p>
                        <p><strong>👨‍🔧 Técnico:</strong> ${t.asignado_a}</p>
                    </div>
                `;
            });

            if(ticketsTecnico.length === 0) {
                cardsHtml = `<p style="text-align:center; color:#999; font-size:0.9em;">Sin asignaciones</p>`;
            }

            board.innerHTML += `
                <div class="kanban-column">
                    <div class="kanban-header">
                        <span>👨‍🔧 ${tecnico.nombre}</span>
                        <span style="background:var(--primary); color:white; padding:2px 8px; border-radius:10px; font-size:0.8em;">${ticketsTecnico.length}</span>
                    </div>
                    <div class="kanban-body">
                        ${cardsHtml}
                    </div>
                </div>
            `;
        });
    }
};

// ==========================================
// INICIALIZACIÓN Y LECTOR DE ENLACES MÁGICOS (Async)
// ==========================================
window.onload = async () => {
    // 1. Esperamos a que la base de datos se cargue desde n8n
    const dbCargada = await DataModule.init();
    if (!dbCargada || !DataModule.db) return;

    // 2. Revisamos si viene de un Magic Link
    const urlParams = new URLSearchParams(window.location.search);
    const magicTicket = urlParams.get('ticket');
    const magicTech = urlParams.get('tech');

    if (magicTicket && magicTech) {
        const user = DataModule.db.usuarios.find(u => u.nombre === magicTech && u.tipo === 'operaciones');
        if (user) {
            document.getElementById('login-user').value = user.user;
            document.getElementById('login-pass').value = user.password;
            AuthModule.login();

            const t = DataModule.db.tickets.find(x => x.id === magicTicket);
            if (t) TicketModule.abrirResolucion(magicTicket);
        } else {
            alert("⚠️ El enlace es inválido o el técnico no existe.");
        }
    }
};