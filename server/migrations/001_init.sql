-- Esquema base FTTx sobre PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- Elementos de red georreferenciados (puntos)
-- type: POP | OLT | CEO (caja de empalme) | CTO (caja terminal / NAP) | POSTE | CAMARA
CREATE TABLE IF NOT EXISTS elements (
  id          SERIAL PRIMARY KEY,
  type        TEXT NOT NULL,
  name        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'proyectado', -- proyectado | construido | en_servicio
  properties  JSONB NOT NULL DEFAULT '{}'::jsonb,
  geom        geometry(Point, 4326) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS elements_geom_idx ON elements USING GIST (geom);
CREATE INDEX IF NOT EXISTS elements_type_idx ON elements (type);

-- Cables de fibra (líneas)
CREATE TABLE IF NOT EXISTS cables (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  fiber_count     INT  NOT NULL CHECK (fiber_count > 0),
  fibers_per_tube INT  NOT NULL DEFAULT 12,
  from_element_id INT REFERENCES elements(id) ON DELETE SET NULL,
  to_element_id   INT REFERENCES elements(id) ON DELETE SET NULL,
  attenuation_db_km NUMERIC(6,3) NOT NULL DEFAULT 0.35,
  slack_m         NUMERIC(10,2) NOT NULL DEFAULT 0,
  properties      JSONB NOT NULL DEFAULT '{}'::jsonb,
  geom            geometry(LineString, 4326) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cables_geom_idx ON cables USING GIST (geom);

-- Hilos de fibra de cada cable (se generan automáticamente)
CREATE TABLE IF NOT EXISTS fibers (
  id       SERIAL PRIMARY KEY,
  cable_id INT NOT NULL REFERENCES cables(id) ON DELETE CASCADE,
  number   INT NOT NULL,          -- 1..fiber_count
  tube     INT NOT NULL,          -- 1..n
  color    TEXT NOT NULL,         -- color del hilo (TIA-598)
  tube_color TEXT NOT NULL,       -- color del tubo
  status   TEXT NOT NULL DEFAULT 'libre',
  UNIQUE (cable_id, number)
);

-- Splitters instalados dentro de un elemento (CEO/CTO)
CREATE TABLE IF NOT EXISTS splitters (
  id         SERIAL PRIMARY KEY,
  element_id INT NOT NULL REFERENCES elements(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  ratio      INT  NOT NULL CHECK (ratio IN (2,4,8,16,32,64)), -- 1:N
  level      INT  NOT NULL DEFAULT 1,  -- nivel 1 / nivel 2
  connectorized BOOLEAN NOT NULL DEFAULT false,
  diagram_x  NUMERIC NOT NULL DEFAULT 0,
  diagram_y  NUMERIC NOT NULL DEFAULT 0
);

-- Conexiones lógicas dentro de un elemento (fusión o conector)
-- Un extremo es "fiber" (fibers.id) o "splitter_in"/"splitter_out" (splitters.id + port)
CREATE TABLE IF NOT EXISTS connections (
  id         SERIAL PRIMARY KEY,
  element_id INT NOT NULL REFERENCES elements(id) ON DELETE CASCADE,
  a_kind     TEXT NOT NULL CHECK (a_kind IN ('fiber','splitter_in','splitter_out')),
  a_id       INT  NOT NULL,
  a_port     INT  NOT NULL DEFAULT 0,
  b_kind     TEXT NOT NULL CHECK (b_kind IN ('fiber','splitter_in','splitter_out')),
  b_id       INT  NOT NULL,
  b_port     INT  NOT NULL DEFAULT 0,
  kind       TEXT NOT NULL DEFAULT 'fusion' CHECK (kind IN ('fusion','conector')),
  tray       INT,                         -- bandeja de empalme
  loss_db    NUMERIC(5,3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS connections_element_idx ON connections (element_id);

-- Clientes / acometidas
CREATE TABLE IF NOT EXISTS clients (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  address     TEXT,
  external_id TEXT,                 -- id en CRM / facturación
  element_id  INT REFERENCES elements(id) ON DELETE SET NULL, -- CTO/NAP
  splitter_id INT REFERENCES splitters(id) ON DELETE SET NULL,
  port        INT,
  status      TEXT NOT NULL DEFAULT 'activo',
  geom        geometry(Point, 4326) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clients_geom_idx ON clients USING GIST (geom);
