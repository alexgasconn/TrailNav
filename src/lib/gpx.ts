import { gpx } from '@tmcw/togeojson';
import { DOMParser } from '@xmldom/xmldom';
import * as turf from '@turf/turf';
import { Route } from './db';

export async function parseGPX(file: File): Promise<Route> {
  const text = await file.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/xml');
  const geojson = gpx(doc);

  let distance = 0;
  let elevationGain = 0;
  let elevationLoss = 0;
  let maxElevation = -Infinity;
  let minElevation = Infinity;

  // Find the first LineString or MultiLineString
  let lineStringFeature = geojson.features.find(
    (f) => f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString'
  );

  if (!lineStringFeature) {
    throw new Error('No valid track found in GPX file');
  }

  const coordinates = lineStringFeature.geometry.type === 'LineString'
    ? (lineStringFeature.geometry as any).coordinates
    : (lineStringFeature.geometry as any).coordinates[0]; // Take first track if multi

  if (!coordinates || coordinates.length === 0) {
    throw new Error('No coordinates found in track');
  }

  // Calculate stats
  for (let i = 0; i < coordinates.length; i++) {
    const coord = coordinates[i];
    const ele = coord[2] || 0; // Elevation is usually the 3rd element

    if (ele > maxElevation) maxElevation = ele;
    if (ele < minElevation) minElevation = ele;

    if (i > 0) {
      const prevCoord = coordinates[i - 1];
      const prevEle = prevCoord[2] || 0;
      
      const eleDiff = ele - prevEle;
      if (eleDiff > 0) {
        elevationGain += eleDiff;
      } else {
        elevationLoss += Math.abs(eleDiff);
      }
    }
  }

  // Calculate distance using turf
  const line = turf.lineString(coordinates);
  distance = turf.length(line, { units: 'kilometers' }) * 1000; // Convert to meters

  const name = lineStringFeature.properties?.name || file.name.replace('.gpx', '');

  return {
    id: crypto.randomUUID(),
    name,
    distance,
    elevationGain,
    elevationLoss,
    maxElevation: maxElevation === -Infinity ? 0 : maxElevation,
    minElevation: minElevation === Infinity ? 0 : minElevation,
    gpxData: text,
    geoJson: geojson,
    createdAt: Date.now(),
  };
}
