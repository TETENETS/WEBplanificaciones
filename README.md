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

6. **(Opcional) Rutas por calles (OSRM)**: *+ Service → App* desde este mismo repositorio, build **Dockerfile** con
   ruta **`osrm/Dockerfile`**, puerto 5000, sin dominio. Al construirse descarga el mapa de Venezuela de OpenStreetMap
   (Geofabrik) y lo procesa **una sola vez**; necesita ~4 GB de RAM libres durante esa primera construcción.
   Desactiva el *auto-deploy* de ese servicio para que no se reconstruya con cada cambio de código.
   Luego, en la app principal: `OSRM_URL=http://NOMBRE_DEL_SERVICIO_OSRM:5000`.
   Para otra región cambia el *build arg* `OSM_PBF_URL`.

> **Mapa base**: por defecto se usa **"Satélite con calles" de Google** (imágenes híbridas) pedidas directamente a
> `mt0-mt3.google.com/vt` (sin API key ni costo). Esas teselas no forman parte de la API oficial y Google puede
> bloquearlas; si fallan, el mapa cambia solo a **Esri World Imagery**. El selector de capas (arriba a la derecha)
> ofrece Solo satélite, Mapa y Terreno de Google, Satélite Esri y Calles (OpenStreetMap), y recuerda la última elegida.
> Opcional: con `GOOGLE_MAPS_API_KEY` (Map Tiles API) se agrega la capa oficial de Google.

| Variable | Por defecto | Uso |
|---|---|---|
| `DATABASE_URL` | `postgres://fttx:fttx@localhost:5432/fttx` | Conexión a PostGIS |
| `DATABASE_SSL` | `false` | `true` si la base exige SSL |
| `PORT` | `3000` | Puerto HTTP |
| `RUN_MIGRATIONS` | `true` | Aplica `server/migrations/*.sql` al arrancar |
| `SEED_DEMO` | `false` | Carga la red de ejemplo si no hay elementos |
| `GOOGLE_MAPS_API_KEY` | — | Capa satelital de Google (Map Tiles API) |
| `MAP_CENTER` | — | Centro inicial `lat,lng` si la base está vacía |
| `OSRM_URL` | — | Motor de rutas por calles; sin él, la ruta teórica es la línea recta |

## Funciones

- **Mapa** con Google satélite con calles por defecto (respaldo automático a Esri) y selector de capas.
- **Elementos**: nodo principal, CEO, NAP (CTO), poste, cámara, cliente. Al agregar un nodo, caja o cliente se abre
  **directamente su diagrama lógico** para rellenarlo. Mientras el diagrama esté **vacío** (sin equipos, splitters ni
  conexiones) el elemento se ve **en gris**. Los datos de ficha (IP de la OLT, dirección, serial ONU…) se editan con
  *Datos del elemento*. Borde punteado = en proyecto / no implantado. Las cajas se ubican sobre el poste más cercano (a menos de 15 m).
- **Doble clic** en un elemento abre su **diagrama**.
- **Nodo principal**: dentro del diagrama se agregan **OLT** (slots × puertos PON, potencia en dBm), **ODF**
  (lado A / lado B) y **splitters**; desde ahí sale el cable troncal.
- **Diagrama de cajas**: hilos por color (TIA-598), splitters 1:2…1:32 (blancos = permiten clientes, grises = de red),
  fusiones y conectores con clic-a-clic, equipos receptores (ONU, router, transceptor). Los hilos que **reciben señal**
  de una OLT se ven con el punto verde y su potencia estimada.
- **🔦 Linterna**: desde un puerto de OLT, un hilo o un splitter, ilumina todo el recorrido de la luz (hacia los clientes
  o hacia el nodo), con paradas en los **splitters** y en los **receptores**, y la potencia estimada en cada parada.
  *Ver recorrido en el mapa* resalta los cables iluminados.
- **Trazado automático por postes**: eliges el punto A y el punto B y el sistema busca la ruta más corta por los postes
  registrados (vano máximo configurable).
  - Si **no hay postes** entre A y B, avisa y no crea el cable: lo trazas **a mano** o agregas los postes.
  - Si la ruta por postes es **mucho más larga que la ruta más corta por calles** (OSRM sobre OpenStreetMap; sin OSRM,
    la línea recta) — por defecto 1,4×, configurable — avisa de un posible rodeo y te deja elegir: **trazar por postes igualmente**, **cancelar y agregar postes** (queda la ruta por calles
    como guía punteada) o **trazar a mano**.
  - Los postes se agregan siempre a mano o importándolos desde CSV.
- **Importar postes, clientes o NAPs desde CSV**: coordenadas en columnas `lat`/`lng` o en una columna `ubicacion`; acepta **decimales**, **enlaces de Google Maps** y **grados/minutos/segundos** (`10°28'50"N 66°54'13"W`).
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
