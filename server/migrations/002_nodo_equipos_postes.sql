-- Nodo principal (antes POP/OLT), equipos internos (OLT, ODF, ONU...), estados de implantación

-- 1) Tipos de elemento: POP y OLT pasan a ser "NODO" (nodo principal)
UPDATE elements SET type = 'NODO' WHERE type IN ('POP', 'OLT');

-- 2) Estados de implantación
UPDATE elements SET status = CASE status
  WHEN 'proyectado' THEN 'proyecto'
  WHEN 'construido' THEN 'implantado'
  WHEN 'en_servicio' THEN 'implantado'
  ELSE status END;
ALTER TABLE elements ALTER COLUMN status SET DEFAULT 'proyecto';

-- 3) Equipos dentro de un elemento (nodo, caja o cliente)
--    OLT: slots x puertos PON (fuente de luz)
--    ODF: puertos con lado A (n) y lado B (1000+n), pasante
--    ONU / ROUTER / TRANSCEPTOR: receptores (1 puerto de entrada)
CREATE TABLE IF NOT EXISTS equipment (
  id         SERIAL PRIMARY KEY,
  element_id INT NOT NULL REFERENCES elements(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('OLT', 'ODF', 'ONU', 'ROUTER', 'TRANSCEPTOR')),
  name       TEXT NOT NULL,
  slots      INT NOT NULL DEFAULT 1 CHECK (slots BETWEEN 1 AND 16),
  ports      INT NOT NULL DEFAULT 1 CHECK (ports BETWEEN 1 AND 128),
  properties JSONB NOT NULL DEFAULT '{}'::jsonb, -- ip, usuario, potencia_dbm, marca, modelo...
  diagram_x  NUMERIC NOT NULL DEFAULT 0,
  diagram_y  NUMERIC NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS equipment_element_idx ON equipment (element_id);

-- 4) Conexiones hacia puertos de equipos
ALTER TABLE connections DROP CONSTRAINT IF EXISTS connections_a_kind_check;
ALTER TABLE connections DROP CONSTRAINT IF EXISTS connections_b_kind_check;
ALTER TABLE connections ADD CONSTRAINT connections_a_kind_check
  CHECK (a_kind IN ('fiber', 'splitter_in', 'splitter_out', 'equipment'));
ALTER TABLE connections ADD CONSTRAINT connections_b_kind_check
  CHECK (b_kind IN ('fiber', 'splitter_in', 'splitter_out', 'equipment'));

-- 5) Splitter que permite (o no) conexión de clientes
ALTER TABLE splitters ADD COLUMN IF NOT EXISTS allows_client BOOLEAN NOT NULL DEFAULT true;
