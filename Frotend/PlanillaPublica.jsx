import { useState, useEffect, useRef } from "react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { ENV } from "./constants";
import { PlanillaContenido } from "./Components";

export default function PlanillaPublicaPage({ ticketId }) {
  const [ticket, setTicket] = useState(null);
  const [error, setError] = useState("");
  const [descargando, setDescargando] = useState(false);
  const planillaRef = useRef();

  useEffect(() => {
    // Petición al backend SIN TOKEN
    fetch(`${ENV.API_BASE}/planilla-publica/${ticketId}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => {
        if (data.ok) {
          // Adaptamos los datos de la base de datos (snake_case) a lo que usa React (camelCase)
          const t = data.ticket;
          setTicket({
            ...t,
            clienteNombre:    t.cliente_nombre    || t.clienteNombre    || "",
            clienteCedula:    t.cliente_cedula    || t.clienteCedula    || "",
            clienteTelefono:  t.cliente_telefono  || t.clienteTelefono  || "",
            clienteZona:      t.cliente_zona      || t.clienteZona      || "",
            clienteCajaNap:   t.cliente_caja_nap  || t.clienteCajaNap   || "",
            clienteDireccion: t.cliente_direccion || t.clienteDireccion || "",
            tecnicoNombre:    t.tecnico_nombre    || t.tecnicoNombre    || "",
            tipoVisita:       t.tipo_visita       || t.tipoVisita       || "paga",
            fechaCierre:      t.fecha_cierre      || t.fechaCierre      || null,
            materiales:       typeof t.materiales === "string" ? JSON.parse(t.materiales || "[]") : (t.materiales || []),
            datosAdicionales: typeof t.datos_adicionales === "string" ? JSON.parse(t.datos_adicionales || "[]") : (t.datos_adicionales || t.datosAdicionales || []),
            total:            Number(t.total || 0),
            historial:        t.historial   || [],
            comentarios:      t.comentarios || [],
          });
        } else {
          setError(data.mensaje || "Link inválido o ticket no encontrado");
        }
      })
      .catch(err => {
        console.error("Error cargando planilla pública:", err);
        setError("No se pudo cargar la planilla. Verifica que el link sea correcto.");
      });
  }, [ticketId]);

const descargarPDF = async () => {
    if (!planillaRef.current) return;
    setDescargando(true);
    try {
      const canvas = await html2canvas(planillaRef.current, {
        scale: 2,           
        useCORS: true,      
        logging: false,
        backgroundColor: "#ffffff",
      });
      // ... (el resto del código sigue igual)

      const img = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgH  = (canvas.height * pageW) / canvas.width;

      let posY = 0;
      let remaining = imgH;
      let firstPage = true;

      while (remaining > 0) {
        if (!firstPage) pdf.addPage();
        pdf.addImage(img, "PNG", 0, -posY, pageW, imgH);
        posY      += pageH;
        remaining -= pageH;
        firstPage  = false;
      }

      pdf.save(`Planilla_${ticketId}.pdf`);
    } catch (err) {
      console.error("Error generando PDF:", err);
      alert("No se pudo generar el PDF. Intenta de nuevo.");
    } finally {
      setDescargando(false);
    }
  };

  // ── Estados de carga y error ────────────────────────────────
  if (error) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc", padding: 20 }}>
        <div style={{ background: "#fff", borderRadius: 12, padding: "40px 32px", textAlign: "center", maxWidth: 400, boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
          <div style={{ fontSize: "2.5em", marginBottom: 12 }}>⚠️</div>
          <div style={{ fontWeight: 700, color: "#dc2626", marginBottom: 8 }}>Ticket no encontrado</div>
          <div style={{ color: "#64748b", fontSize: "0.9em" }}>{error}</div>
        </div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc" }}>
        <div style={{ textAlign: "center", color: "#64748b" }}>
          <div style={{ fontSize: "2em", marginBottom: 12 }}>⏳</div>
          <div>Cargando planilla...</div>
        </div>
      </div>
    );
  }

  // ── Vista principal ─────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9", padding: "24px 16px" }}>
      <div style={{ maxWidth: 700, margin: "0 auto 16px auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{ color: "#64748b", fontSize: "0.85em" }}>
          📄 Planilla de visita técnica — <strong>{ticketId}</strong>
        </div>
        <button
          onClick={descargarPDF}
          disabled={descargando}
          style={{
            background: descargando ? "#94a3b8" : "#1a7fa3",
            color: "#fff", border: "none",
            padding: "10px 28px", borderRadius: 8,
            fontSize: "0.95em", cursor: descargando ? "not-allowed" : "pointer",
            fontWeight: 700, display: "flex", alignItems: "center", gap: 8,
            transition: "background 0.15s",
          }}
        >
          {descargando ? "⏳ Generando..." : "⬇ Descargar PDF"}
        </button>
      </div>

      <div ref={planillaRef} style={{ maxWidth: 700, margin: "0 auto", background: "#fff", borderRadius: 12, boxShadow: "0 4px 24px rgba(0,0,0,0.08)", overflow: "hidden" }}>
        <PlanillaContenido ticket={ticket} />
      </div>

      <div style={{ maxWidth: 700, margin: "16px auto 0 auto", textAlign: "center", color: "#94a3b8", fontSize: "0.78em" }}>
        Este documento fue generado automáticamente por el sistema TETENET.
      </div>
    </div>
  );
}