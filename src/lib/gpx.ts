import { gpx } from '@tmcw/togeojson';
import { DOMParser } from '@xmldom/xmldom';
import { Route } from './db';
import { buildRouteProfile } from './routeProfile';

export async function parseGPX(file: File): Promise<Route> {
  const text = await file.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/xml');
  const geojson = gpx(doc as any);

  const trackFeature = geojson.features.find(
    (feature: any) => feature.geometry?.type === 'LineString' || feature.geometry?.type === 'MultiLineString'
  );

  if (!trackFeature) {
    throw new Error('El archivo no contiene ningún track válido');
  }

  // Los desniveles se calculan con el mismo filtro que usa el resto de la aplicación.
  const profile = buildRouteProfile({ geoJson: geojson });
  if (profile.coordinates.length < 2) {
    throw new Error('El track no contiene suficientes puntos');
  }

  const name = String(trackFeature.properties?.name ?? '').trim() || file.name.replace(/\.gpx$/i, '');

  return {
    id: crypto.randomUUID(),
    name,
    distance: profile.totalDistance,
    elevationGain: profile.totalAscent,
    elevationLoss: profile.totalDescent,
    maxElevation: profile.maxElevation,
    minElevation: profile.minElevation,
    gpxData: text,
    geoJson: geojson,
    createdAt: Date.now(),
  };
}
