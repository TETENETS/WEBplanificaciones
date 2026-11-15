# Motor de rutas OSRM con las calles de OpenStreetMap.
# El mapa se descarga y procesa UNA sola vez, al construir la imagen.
# Easypanel: App desde este repo, build "Dockerfile" con ruta osrm/Dockerfile, puerto 5000, sin dominio público.
# Requiere ~4 GB de RAM libres durante la construcción (Venezuela).
FROM ghcr.io/project-osrm/osrm-backend:v5.27.1

# Cambiar la región si hace falta: https://download.geofabrik.de/
ARG OSM_PBF_URL=https://download.geofabrik.de/south-america/venezuela-latest.osm.pbf

WORKDIR /data
ADD ${OSM_PBF_URL} /data/map.osm.pbf

# Perfil "foot": recorre todas las calles y veredas en ambos sentidos (útil para planta externa)
RUN osrm-extract -p /opt/foot.lua /data/map.osm.pbf \
 && osrm-partition /data/map.osrm \
 && osrm-customize /data/map.osrm \
 && rm -f /data/map.osm.pbf

EXPOSE 5000
CMD ["osrm-routed", "--algorithm", "mld", "--max-table-size", "1000", "/data/map.osrm"]
