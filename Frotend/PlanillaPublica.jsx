// Al inicio de AppContent(), antes del return normal:
const urlPath = window.location.pathname;
const urlParams = new URLSearchParams(window.location.search);
const planillaToken = urlParams.get("token");
const ticketIdPublico = urlPath.split("/planilla/")[1];

if (ticketIdPublico && planillaToken) {
  return <PlanillaPublicaPage ticketId={ticketIdPublico} token={planillaToken} />;
}


function PlanillaPublicaPage({ ticketId, token }) {
  const [ticket, setTicket] = useState(null);
  const [error,  setError]  = useState("");
  const planillaRef = useRef();

  useEffect(() => {
    fetch(`${ENV.API_BASE}/planilla-publica/${ticketId}?token=${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.ok) setTicket(data.ticket);
        else setError(data.mensaje || "Link inválido o expirado");
      })
      .catch(() => setError("No se pudo cargar la planilla"));
  }, []);

  const descargarPDF = async () => {
    const { default: html2canvas } = await import("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js");
    const { jsPDF } = await import("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
    
    const canvas = await html2canvas(planillaRef.current, { scale: 2 });
    const img    = canvas.toDataURL("image/png");
    const pdf    = new jsPDF("p", "mm", "a4");
    const w      = pdf.internal.pageSize.getWidth();
    const h      = (canvas.height * w) / canvas.width;
    pdf.addImage(img, "PNG", 0, 0, w, h);
    pdf.save(`Planilla_${ticketId}.pdf`);
  };

  if (error)  return <div style={{padding:40, textAlign:"center", color:"red"}}>⚠️ {error}</div>;
  if (!ticket) return <div style={{padding:40, textAlign:"center"}}>Cargando planilla...</div>;

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: 20 }}>
      <div ref={planillaRef}>
        <PlanillaContenido ticket={ticket} />
      </div>
      <div style={{ textAlign: "center", marginTop: 24 }}>
        <button onClick={descargarPDF} style={{
          background: "#1a7fa3", color: "#fff", border: "none",
          padding: "12px 32px", borderRadius: 8, fontSize: "1em",
          cursor: "pointer", fontWeight: 700
        }}>
          ⬇ Descargar PDF
        </button>
      </div>
    </div>
  );
}
