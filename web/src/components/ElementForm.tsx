import { useState } from 'react';
import type { ElementType } from '../api';
import { FIELDS, STATUSES, TYPE_STYLE } from '../elementTypes';

export interface ElementFormValue {
  name: string;
  status: string;
  properties: Record<string, string>;
}

/**
 * Modal que pide los datos del elemento al crearlo o editarlo.
 * "Guardar sin datos" crea el elemento igual, pero se verá en gris en el mapa.
 */
export default function ElementForm({
  type, initial, title, note, creating = false, onSave, onCancel,
}: {
  type: ElementType;
  initial: ElementFormValue;
  title: string;
  note?: string;
  creating?: boolean;
  onSave: (v: ElementFormValue) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [v, setV] = useState<ElementFormValue>(initial);
  const [busy, setBusy] = useState(false);
  const set = (k: string, val: string) => setV(s => ({ ...s, properties: { ...s.properties, [k]: val } }));

  const save = async (withData: boolean) => {
    setBusy(true);
    try {
      await onSave(withData ? v : { ...v, properties: {} });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <form className="modal form-modal" onClick={e => e.stopPropagation()}
        onSubmit={e => { e.preventDefault(); save(true); }}>
        <header>
          <h3><span className="dot" style={{ background: TYPE_STYLE[type].color }} /> {title}</h3>
        </header>
        <div className="form-body">
          {note && <p className="hint-inline">{note}</p>}
          <div className="form-grid">
            <label>Nombre<input required value={v.name} onChange={e => setV({ ...v, name: e.target.value })} /></label>
            <label>Estado
              <select value={v.status} onChange={e => setV({ ...v, status: e.target.value })}>
                {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>
            {FIELDS[type].map(f => (
              <label key={f.key} className={f.type === 'textarea' ? 'wide' : ''}>{f.label}
                {f.type === 'select' ? (
                  <select value={v.properties[f.key] ?? ''} onChange={e => set(f.key, e.target.value)}>
                    <option value="">—</option>
                    {f.options!.map(o => <option key={o}>{o}</option>)}
                  </select>
                ) : f.type === 'textarea' ? (
                  <textarea rows={2} value={v.properties[f.key] ?? ''} onChange={e => set(f.key, e.target.value)} />
                ) : (
                  <input type={f.type === 'number' ? 'number' : 'text'} step="any" placeholder={f.placeholder}
                    value={v.properties[f.key] ?? ''} onChange={e => set(f.key, e.target.value)} />
                )}
              </label>
            ))}
          </div>
        </div>
        <footer>
          <button type="button" onClick={onCancel} disabled={busy}>Cancelar</button>
          {creating && (
            <button type="button" onClick={() => save(false)} disabled={busy}
              title="El elemento se crea igual pero aparece en gris hasta completar sus datos">Guardar sin datos</button>
          )}
          <button type="submit" className="primary" disabled={busy}>Guardar</button>
        </footer>
      </form>
    </div>
  );
}
