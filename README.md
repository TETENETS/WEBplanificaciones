# FTTx Platform

Sistema web para **documentar y diseñar redes FTTH / PON** sobre un mapa: nodo principal con OLT y ODF,
postes, cajas de empalme (CEO), cajas NAP (CTO), clientes, cables con sus hilos, splitters y fusiones,
con linterna para seguir la luz desde la OLT hasta la ONU.

## Desplegar en Easypanel

1. **Base de datos**: *+ Service → Postgres*, con la imagen **`postgis/postgis:16-3.4`**
   (la imagen `postgres` normal no trae PostGIS). Anota usuario, contraseña, base y host interno.
2. **App**: *+ Service → App → GitHub* → este repositorio, rama `main`, build **Dockerfile**.
3. **Environment** de la App:
   ```env
   DATABASE_URL=postgres://USUARIO:CLAVE@HOST_INTERNO:5432/BASE
   PORT=3000
   SEED_DEMO=true                 # opcional: red de ejemplo si la base está vacía
   GOOGLE_MAPS_API_KEY=           # opcional: capa "Satélite Google"
   ```
4. **Domains**: apunta tu dominio al **puerto 3000**.
5. **Deploy**. Las migraciones se aplican solas. Comprueba `https://tu-dominio/health` → `{"status":"ok","db":"ok"}`.

> **Satélite**: la capa *Satélite* (Esri World Imagery) funciona sin clave. Para *Satélite Google* activa la
> **Map Tiles API** en Google Cloud, crea una API key restringida por *HTTP referrer* a tu dominio y ponla en
> `GOOGLE_MAPS_API_KEY`.

| Variable | Por defecto | Uso |
|---|---|---|
| `DATABASE_URL` | `postgres://fttx:fttx@localhost:5432/fttx` | Conexión a PostGIS |
| `DATABASE_SSL` | `false` | `true` si la base exige SSL |
| `PORT` | `3000` | Puerto HTTP |
| `RUN_MIGRATIONS` | `true` | Aplica `server/migrations/*.sql` al arrancar |
| `SEED_DEMO` | `false` | Carga la red de ejemplo si no hay elementos |
| `GOOGLE_MAPS_API_KEY` | — | Capa satelital de Google (Map Tiles API) |
| `MAP_CENTER` | — | Centro inicial `lat,lng` si la base está vacía |

## Funciones

- **Mapa** con capas Calles / Satélite / Satélite Google y nombres de calles superpuestos.
- **Elementos**: nodo principal, CEO, NAP (CTO), poste, cámara, cliente. Al agregar uno se abre un **formulario
  con sus datos** (IP de la OLT, puertos, splitter, serial ONU…). Si se guarda **sin datos aparece en gris**.
  Los elementos en proyecto o no implantados tienen el borde punteado. Las cajas se ubican sobre el poste más cercano (a menos de 15 m).
- **Doble clic** en un elemento abre su **diagrama**.
- **Nodo principal**: dentro del diagrama se agregan **OLT** (slots × puertos PON, potencia en dBm), **ODF**
  (lado A / lado B) y **splitters**; desde ahí sale el cable troncal.
- **Diagrama de cajas**: hilos por color (TIA-598), splitters 1:2…1:32 (blancos = permiten clientes, grises = de red),
  fusiones y conectores con clic-a-clic, equipos receptores (ONU, router, transceptor). Los hilos que **reciben señal**
  de una OLT se ven con el punto verde y su potencia estimada.
- **🔦 Linterna**: desde un puerto de OLT, un hilo o un splitter, ilumina todo el recorrido de la luz (hacia los clientes
  o hacia el nodo), con paradas en los **splitters** y en los **receptores**, y la potencia estimada en cada parada.
  *Ver recorrido en el mapa* resalta los cables iluminados.
- **Trazado automático por postes**: eliges origen y destino y el cable se traza por los postes (ruta más corta con
  un vano máximo configurable). **Si no hay postes en la ruta, no se traza.**
- **Importar postes desde CSV** (`nombre;lat;lng;…`, separador `,` o `;`, admite coma decimal; las demás columnas se guardan como datos).
- **Exportar el mapa a KML / KMZ** (carpetas por tipo de elemento y cables, con sus datos).
- **Viabilidad** (NAP con puertos libres en un radio) y **presupuesto óptico** (GPON B+/C+, XGS-PON).

## Desarrollo local

```bash
docker compose up --build          # app + PostGIS con red de ejemplo en http://localhost:3000
```

Sin Docker para la app: `docker compose up -d db`, luego `cd server && npm i && npm run dev`
y `cd web && npm i && npm run dev` (http://localhost:5173). Pruebas: `cd server && npm test`.

## Stack

Node.js 22 + Fastify · PostgreSQL 16 + PostGIS · React + TypeScript + Vite + Leaflet. Un solo contenedor sirve la API
(`/api/v1`) y la web en el mismo puerto.

Rutas principales de la API: `elements`, `cables`, `elements/:id/diagram`, `elements/:id/equipment`,
`elements/:id/splitters`, `elements/:id/connections`, `flashlight`, `routes/auto`, `poles/import`,
`export/map.kml`, `export/map.kmz`, `coverage`, `budget`.
