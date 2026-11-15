# FTTx Platform

Plataforma GIS + gestión de activos para **documentar, diseñar y operar redes FTTH / PON**.
Objetivo: ser la fuente única de verdad (OSS) de la planta externa: desde el POP/OLT,
pasando por cajas de empalme (CEO) y splitters, hasta la caja terminal (CTO/NAP) y el cliente.

> Estado: **esqueleto inicial (v0.1)**. Ya funciona de punta a punta (mapa, cajas, fusiones,
> traza, presupuesto óptico, viabilidad), pero es la base sobre la que crecer. Ver [Hoja de ruta](#hoja-de-ruta).

## Qué incluye hoy

| Módulo | Estado |
|---|---|
| **Mapa SIG** (Leaflet + OpenStreetMap) con POP, OLT, CEO, CTO, postes y cámaras | ✅ alta, borrado, popup |
| **Trazado de cables** sobre el mapa (con vértices) — longitud calculada con PostGIS | ✅ |
| Generación automática de **hilos con código de colores TIA-598** por tubo | ✅ |
| **Editor esquemático de cajas** (CEO/CTO): cables entrantes/salientes, hilos por color, splitters 1:2…1:32 nivel 1/2, fusiones clic-a-clic, arrastrar splitters | ✅ |
| **Traza de hilo** aguas abajo (fusiones → splitters → puertos libres) con pérdida por rama | ✅ |
| **Presupuesto óptico** (fibra, fusiones, conectores, splitters, margen; GPON B+/C+, XGS-PON) | ✅ |
| **Viabilidad de cobertura**: CTO con puertos libres dentro de un radio de la dirección (`ST_DWithin`) | ✅ |
| **API REST** `/api/v1` (elementos, cables, hilos, splitters, conexiones, clientes, análisis) | ✅ |
| Migraciones SQL automáticas al arrancar + red de ejemplo opcional | ✅ |

## Stack

- **Backend**: Node.js 22 + Fastify 5 + `pg`
- **Base de datos**: PostgreSQL 16 + **PostGIS** (geometrías en EPSG:4326)
- **Frontend**: React 18 + TypeScript + Vite + Leaflet (diagramas en SVG)
- **Despliegue**: un solo contenedor (Dockerfile multi-etapa) que sirve API y frontend en el mismo puerto

```
fttx-platform/
├── Dockerfile              # imagen única para Easypanel
├── docker-compose.yml      # entorno local: app + PostGIS
├── server/                 # API REST
│   ├── migrations/         # SQL versionado (se aplica al arrancar)
│   └── src/
│       ├── routes/         # elements, cables, diagram, analysis, clients
│       ├── budget.js       # cálculo de presupuesto óptico
│       ├── fiber-colors.js # código TIA-598
│       └── seed.js         # red de ejemplo
└── web/                    # SPA React
    └── src/components/     # BoxEditor (diagrama de caja), BudgetPanel
```

## Despliegue en Easypanel

1. **Crear la base de datos**: en el proyecto de Easypanel → *+ Service* → *Postgres*.
   Como imagen usa **`postgis/postgis:16-3.4`** (la imagen `postgres` estándar no trae PostGIS).
   Anota usuario, contraseña, base y el *host interno* (p. ej. `miproyecto_fttx-db`).
2. **Crear la app**: *+ Service* → *App* → *Source: GitHub* → este repositorio, rama `main`.
   - *Build*: **Dockerfile** (ruta `Dockerfile`).
3. **Environment** de la app:
   ```env
   DATABASE_URL=postgres://USUARIO:CLAVE@HOST_INTERNO:5432/BASE
   PORT=3000
   SEED_DEMO=true        # opcional: carga una red de ejemplo si la base está vacía
   ```
4. **Domains**: agrega tu dominio apuntando al **puerto 3000** del contenedor (Easypanel gestiona HTTPS).
5. *Deploy*. Las migraciones se aplican solas al arrancar. Comprueba `https://tu-dominio/health` → `{"status":"ok","db":"ok"}`.

Variables disponibles (ver `.env.example`):

| Variable | Por defecto | Uso |
|---|---|---|
| `DATABASE_URL` | `postgres://fttx:fttx@localhost:5432/fttx` | Conexión a PostGIS |
| `DATABASE_SSL` | `false` | `true` para bases gestionadas que exigen SSL |
| `PORT` | `3000` | Puerto HTTP |
| `RUN_MIGRATIONS` | `true` | Aplica `server/migrations/*.sql` pendientes al arrancar |
| `SEED_DEMO` | `false` | Carga la red de ejemplo si no hay elementos |
| `LOG_LEVEL` | `info` | Nivel de log |
| `VITE_MAP_LAT`, `VITE_MAP_LNG`, `VITE_TILE_URL` | Buenos Aires / OSM | *Build args* opcionales: centro inicial del mapa y servidor de teselas |

## Desarrollo local

Con Docker (todo incluido):

```bash
docker compose up --build
# http://localhost:3000  (con red de ejemplo)
```

Sin Docker para la app (hot reload):

```bash
docker compose up -d db
cd server && npm install && DATABASE_URL=postgres://fttx:fttx@localhost:5432/fttx npm run dev
cd web && npm install && npm run dev      # http://localhost:5173 (proxy a :3000)
npm run seed   # (en server/) red de ejemplo
npm test       # (en server/) pruebas de presupuesto y colores
```

## API REST (v1)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/v1/elements?bbox=&type=` | Elementos como GeoJSON |
| POST/PATCH/DELETE | `/api/v1/elements[/:id]` | Alta / edición / baja (`type,name,lat,lng`) |
| GET | `/api/v1/cables` | Cables como GeoJSON con longitud |
| POST | `/api/v1/cables` | Crea cable + hilos (`name,fiber_count,from_element_id,to_element_id,coordinates`) |
| GET | `/api/v1/cables/:id/fibers` | Hilos con tubo y color |
| GET | `/api/v1/elements/:id/diagram` | Diagrama interno de la caja |
| POST | `/api/v1/elements/:id/splitters` | Agrega splitter (`ratio,level`) |
| POST | `/api/v1/elements/:id/connections` | Fusión/conector entre `fiber`, `splitter_in`, `splitter_out` |
| DELETE | `/api/v1/connections/:id` | Elimina fusión |
| GET | `/api/v1/trace/fiber/:id` | Traza aguas abajo + presupuesto por rama |
| POST | `/api/v1/budget` | Presupuesto óptico manual |
| GET | `/api/v1/coverage?lat=&lng=&radius=` | Viabilidad: CTO con puertos libres |
| GET/POST/DELETE | `/api/v1/clients` | Clientes / acometidas (`external_id` para CRM) |
| GET | `/health` | Healthcheck |

## Modelo de datos

`elements` (puntos) · `cables` (líneas) → `fibers` (hilos, color TIA-598) ·
`splitters` (dentro de un elemento) · `connections` (fusión/conector entre extremos dentro de una caja) ·
`clients` (acometida a CTO/puerto).

## Hoja de ruta

1. **Autenticación y roles** (ingeniería, campo, comercial) + auditoría de cambios.
2. **Bandejas de empalme** y vista matricial de fusiones; cajas con plantillas (modelo, capacidad).
3. **Ductos, postes y cámaras** como red de canalización; cables que siguen la canalización; reservas (slack).
4. **Traza aguas arriba** hasta el puerto PON de la OLT; puertos OLT y asignación de ONT.
5. **OTDR**: dada una distancia de evento, ubicar el punto en el mapa siguiendo la geometría del cable (`ST_LineInterpolatePoint`).
6. **Polígonos de cobertura** por NAP y consulta de viabilidad por dirección (geocodificación).
7. **App de campo offline** (PWA con IndexedDB + sincronización).
8. **Integraciones**: API keys, webhooks, importación KML/DXF/Shapefile, exportación.

---
Licencia: privada.
