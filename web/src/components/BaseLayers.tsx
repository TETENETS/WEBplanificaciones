import { useEffect, useState } from 'react';
import { LayersControl, TileLayer } from 'react-leaflet';

/**
 * Capas base del mapa: calles (OpenStreetMap), satélite (Esri World Imagery, sin clave)
 * y satélite de Google (Map Tiles API oficial, sólo si hay GOOGLE_MAPS_API_KEY).
 */
export default function BaseLayers({ googleKey }: { googleKey: string | null }) {
  const [googleSession, setGoogleSession] = useState<string | null>(null);

  useEffect(() => {
    if (!googleKey) return;
    // https://developers.google.com/maps/documentation/tile/session_tokens
    fetch(`https://tile.googleapis.com/v1/createSession?key=${googleKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mapType: 'satellite', language: 'es-419', region: 'VE', layerTypes: ['layerRoadmap'] }),
    })
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(d => setGoogleSession(d.session))
      .catch(() => setGoogleSession(null));
  }, [googleKey]);

  return (
    <LayersControl position="topright">
      <LayersControl.BaseLayer checked name="Calles">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url={import.meta.env.VITE_TILE_URL ?? 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'}
          maxZoom={21} maxNativeZoom={19}
        />
      </LayersControl.BaseLayer>
      <LayersControl.BaseLayer name="Satélite">
        <TileLayer
          attribution="Imágenes &copy; Esri, Maxar, Earthstar Geographics"
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          maxZoom={21} maxNativeZoom={19}
        />
      </LayersControl.BaseLayer>
      {googleKey && googleSession && (
        <LayersControl.BaseLayer name="Satélite Google">
          <TileLayer
            attribution="&copy; Google"
            url={`https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=${googleSession}&key=${googleKey}`}
            maxZoom={22} maxNativeZoom={21}
          />
        </LayersControl.BaseLayer>
      )}
      <LayersControl.Overlay name="Nombres de calles (sobre satélite)">
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}"
          maxZoom={21} maxNativeZoom={19}
        />
      </LayersControl.Overlay>
    </LayersControl>
  );
}
