import { useState } from 'react';
import { api, BudgetResult } from '../api';

const LABELS: Record<string, string> = {
  fiber: 'Fibra', fusions: 'Fusiones', connectors: 'Conectores', splitters: 'Splitters', margin: 'Margen',
};

export default function BudgetPanel() {
  const [f, setF] = useState({
    lengthKm: 5, attenuationDbKm: 0.35, fusions: 6, connectors: 4, splitters: '8,8', marginDb: 3, ponClass: 'GPON B+',
  });
  const [res, setRes] = useState<BudgetResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const calc = async () => {
    try {
      setErr(null);
      setRes(await api.budget({
        ...f,
        splitters: f.splitters.split(',').map(s => Number(s.trim())).filter(Boolean),
      }));
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const num = (k: keyof typeof f, step = '0.01') => (
    <input type="number" step={step} value={f[k] as number} onChange={e => setF({ ...f, [k]: Number(e.target.value) })} />
  );

  return (
    <div className="budget">
      <label>Longitud (km){num('lengthKm')}</label>
      <label>Atenuación (dB/km){num('attenuationDbKm')}</label>
      <label>Fusiones{num('fusions', '1')}</label>
      <label>Conectores{num('connectors', '1')}</label>
      <label>Splitters (ej. 8,8)<input value={f.splitters} onChange={e => setF({ ...f, splitters: e.target.value })} /></label>
      <label>Margen (dB){num('marginDb')}</label>
      <label>Clase PON
        <select value={f.ponClass} onChange={e => setF({ ...f, ponClass: e.target.value })}>
          <option>GPON B+</option><option>GPON C+</option><option>XGS-PON N1</option>
        </select>
      </label>
      <button className="primary" onClick={calc}>Calcular</button>
      {err && <div className="error">{err}</div>}
      {res && (
        <div className={`result ${res.ok ? 'ok' : 'bad'}`}>
          <table>
            <tbody>
              {Object.entries(res.breakdown).map(([k, v]) => <tr key={k}><td>{LABELS[k] ?? k}</td><td>{v} dB</td></tr>)}
              <tr className="total"><td>Pérdida total</td><td>{res.totalLossDb} dB</td></tr>
              <tr><td>Presupuesto disponible</td><td>{res.availableBudgetDb} dB</td></tr>
              <tr><td>Potencia Rx estimada</td><td>{res.estimatedRxDbm} dBm</td></tr>
            </tbody>
          </table>
          {res.ok ? `✔ Enlace OK (sobran ${res.remainingDb} dB)` : `✘ Excede el presupuesto por ${-res.remainingDb} dB`}
        </div>
      )}
    </div>
  );
}
