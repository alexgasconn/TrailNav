import { gpx, kml } from '@tmcw/togeojson';
import { DOMParser, DOMImplementation, XMLSerializer } from '@xmldom/xmldom';
import { Route } from './db';
import { buildRouteProfile } from './routeProfile';

export async function parseGPX(file: File): Promise<Route> {
  return parseRouteFile(file);
}

export async function parseRouteFile(file: File): Promise<Route> {
  if (file.size > 20 * 1024 * 1024) throw new Error('El archivo supera el límite de 20 MB');
  const text = await file.text();
  const extension = file.name.split('.').pop()?.toLowerCase();
  let geojson: any;
  if (extension === 'geojson' || extension === 'json') {
    const data = JSON.parse(text);
    geojson = data.type === 'FeatureCollection' ? data : { type: 'FeatureCollection', features: [data.type === 'Feature' ? data : { type: 'Feature', properties: {}, geometry: data }] };
  } else if (extension === 'gpx' || extension === 'kml') {
    const doc = new DOMParser().parseFromString(text, 'text/xml');
    if (doc.documentElement?.localName !== extension) throw new Error('El contenido no corresponde al formato del archivo');
    geojson = extension === 'kml' ? kml(doc as any) : gpx(doc as any);
  } else {
    throw new Error('Selecciona un archivo GPX, KML o GeoJSON');
  }
  return routeFromGeoJSON(geojson, file.name.replace(/\.(gpx|kml|geojson|json)$/i, ''), text);
}

export function routeFromGeoJSON(geojson: any, fallbackName: string, original = ''): Route {
  const validCoordinate = (coordinate: unknown) => Array.isArray(coordinate) && coordinate.length >= 2 &&
    typeof coordinate[0] === 'number' && Number.isFinite(coordinate[0]) && Math.abs(coordinate[0]) <= 180 &&
    typeof coordinate[1] === 'number' && Number.isFinite(coordinate[1]) && Math.abs(coordinate[1]) <= 90 &&
    (coordinate.length < 3 || (typeof coordinate[2] === 'number' && Number.isFinite(coordinate[2])));
  if (geojson?.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) throw new Error('GeoJSON no válido');
  geojson = { ...geojson, features: geojson.features.filter((feature: any) => ['Point', 'LineString', 'MultiLineString'].includes(feature?.geometry?.type)) };
  for (const feature of geojson.features) {
    const geometry = feature.geometry;
    const lines = geometry.type === 'Point' ? [[geometry.coordinates]] : geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
    if (!Array.isArray(lines) || !lines.length || lines.some((line: unknown) => !Array.isArray(line) || line.length < (geometry.type === 'Point' ? 1 : 2) || !line.every(validCoordinate))) {
      throw new Error('La ruta contiene coordenadas no válidas');
    }
  }

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

  const name = String(trackFeature.properties?.name ?? '').trim() || fallbackName;

  return {
    id: crypto.randomUUID(),
    name,
    distance: profile.totalDistance,
    elevationGain: profile.totalAscent,
    elevationLoss: profile.totalDescent,
    maxElevation: profile.maxElevation,
    minElevation: profile.minElevation,
    gpxData: original,
    geoJson: geojson,
    createdAt: Date.now(),
  };
}

export function exportRouteGPX(route: Pick<Route, 'name' | 'geoJson'>): string {
  const namespace = 'http://www.topografix.com/GPX/1/1';
  const doc = new DOMImplementation().createDocument(namespace, 'gpx', null);
  doc.documentElement.setAttribute('version', '1.1');
  doc.documentElement.setAttribute('creator', 'TrailNav');
  const append = (parent: any, name: string, text?: string) => {
    const element = doc.createElementNS(namespace, name);
    if (text != null) element.appendChild(doc.createTextNode(text));
    parent.appendChild(element);
    return element;
  };
  const addPoint = (parent: any, tag: string, coordinate: number[]) => {
    const point = append(parent, tag);
    point.setAttribute('lat', String(coordinate[1]));
    point.setAttribute('lon', String(coordinate[0]));
    if (Number.isFinite(coordinate[2])) append(point, 'ele', String(coordinate[2]));
    return point;
  };
  const features = route.geoJson?.features ?? [];
  for (const feature of features.filter((item: any) => item.geometry?.type === 'Point')) {
    const point = addPoint(doc.documentElement, 'wpt', feature.geometry.coordinates);
    append(point, 'name', String(feature.properties?.name ?? 'Punto'));
    if (feature.properties?.desc) append(point, 'desc', String(feature.properties.desc));
    if (feature.properties?.sym) append(point, 'sym', String(feature.properties.sym));
  }
  for (const feature of features) {
    const geometry = feature.geometry;
    if (!['LineString', 'MultiLineString'].includes(geometry?.type)) continue;
    const track = append(doc.documentElement, 'trk');
    append(track, 'name', route.name);
    const lines = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
    for (const line of lines) {
      const segment = append(track, 'trkseg');
      for (const coordinate of line) addPoint(segment, 'trkpt', coordinate);
    }
  }
  return new XMLSerializer().serializeToString(doc);
}

export function downloadGPX(route: Pick<Route, 'name' | 'geoJson'>) {
  const url = URL.createObjectURL(new Blob([exportRouteGPX(route)], { type: 'application/gpx+xml' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${route.name.replace(/[^\p{L}\p{N}_-]+/gu, '_') || 'ruta'}.gpx`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
