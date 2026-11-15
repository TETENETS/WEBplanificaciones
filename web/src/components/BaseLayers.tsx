import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

/**
 * Capas base del mapa.
 * Por defecto: "Satélite con calles" de Google (imágenes híbridas, teselas mt0-mt3.google.com/vt).
 * Esas teselas no usan API key ni la API oficial: no tienen costo, pero no están cubiertas por los
 * términos de Google y podrían bloquearse. Por eso, si las primeras teselas fallan, el mapa cambia
 * solo a Esri World Imagery. Con GOOGLE_MAPS_API_KEY se agrega además la capa oficial (Map Tiles API).
 */

const STORAGE_KEY = 'fttx.baseLayer';
const google = (lyrs: string) =>
  L.tileLayer(`https://mt{s}.google.com/vt/lyrs=${lyrs}&hl=es&x={x}&y={y}&z={z}`, {
    subdomains: '0123', maxZoom: 22, maxNativeZoom: 20, attribution: 'Imágenes &copy; Google',
  });

function readStored(): string | null {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}
function store(name: string) {
  try { localStorage.setItem(STORAGE_KEY, name); } catch { /* sin almacenamiento */ }
}

export default function BaseLayers({ googleKey, onFallback }: {
  googleKey: string | null;
  onFallback?: (msg: string) => void;
}) {
  const map = useMap();

  useEffect(() => {
    const hybrid = google('y');
    const esri = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 22, maxNativeZoom: 19, attribution: 'Imágenes &copy; Esri, Maxar, Earthstar Geographics' },
    );
    const bases: Record<string, L.TileLayer> = {
      'Satélite con calles (Google)': hybrid,
      'Solo satélite (Google)': google('s'),
      'Mapa (Google)': google('m'),
      'Terreno (Google)': google('p'),
      'Satélite Esri': esri,
      'Calles (OpenStreetMap)': L.tileLayer(
        import.meta.env.VITE_TILE_URL ?? 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        { maxZoom: 22, maxNativeZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' },
      ),
    };
    const overlays: Record<string, L.TileLayer> = {
      'Nombres de calles (Esri)': L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 22, maxNativeZoom: 19 },
      ),
    };

    const control = L.control.layers(bases, overlays, { position: 'topright' }).addTo(map);
    const stored = readStored();
    const initial = stored && bases[stored] ? stored : 'Satélite con calles (Google)';
    bases[initial].addTo(map);

    // Respaldo: si las primeras teselas de Google fallan (y ninguna carga), pasar a Esri
    const watchFallback = (layer: L.TileLayer, name: string) => {
      let errors = 0;
      let loaded = 0;
      const onError = () => {
        errors++;
        if (errors >= 3 && loaded === 0 && map.hasLayer(layer)) {
          map.removeLayer(layer);
          esri.addTo(map);
          onFallback?.(`No se pudieron cargar las imágenes de ${name}; se cambió a Satélite Esri.`);
          cleanup();
        }
      };
      const onLoad = () => { loaded++; if (loaded > 2) cleanup(); };
      const cleanup = () => { layer.off('tileerror', onError); layer.off('tileload', onLoad); };
      layer.on('tileerror', onError);
      layer.on('tileload', onLoad);
      return cleanup;
    };
    const stopWatching = Object.entries(bases)
      .filter(([n]) => n.includes('(Google)'))
      .map(([n, l]) => watchFallback(l, n));

    const onBaseChange = (e: L.LayersControlEvent) => store(e.name);
    map.on('baselayerchange', onBaseChange);

    // Capa oficial de Google (Map Tiles API) si hay clave
    let official: L.TileLayer | null = null;
    if (googleKey) {
      fetch(`https://tile.googleapis.com/v1/createSession?key=${googleKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mapType: 'satellite', language: 'es-419', region: 'VE', layerTypes: ['layerRoadmap'] }),
      })
        .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
        .then(d => {
          official = L.tileLayer(`https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=${d.session}&key=${googleKey}`,
            { maxZoom: 22, maxNativeZoom: 21, attribution: '&copy; Google' });
          control.addBaseLayer(official, 'Satélite Google (API oficial)');
        })
        .catch(() => {});
    }

    return () => {
      stopWatching.forEach(f => f());
      map.off('baselayerchange', onBaseChange);
      control.remove();
      Object.values(bases).forEach(l => map.removeLayer(l));
      Object.values(overlays).forEach(l => map.removeLayer(l));
      if (official) map.removeLayer(official);
    };
  }, [map, googleKey, onFallback]);

  return null;
}
