import * as turf from '@turf/turf';
import type { Route } from './db';
import { routeFromGeoJSON } from './gpx';
import { getRouteCoordinates, getRouteProfile, indexAtDistance } from './routeProfile';

export function duplicateRoute(route: Route): Route {
    return { ...structuredClone(route), id: crypto.randomUUID(), name: `${route.name} (copia)`, createdAt: Date.now() };
}

export function editRouteCopy(route: Route, startPercent: number, endPercent: number, toleranceMeters = 0): Route {
    if (startPercent < 0 || endPercent > 100 || endPercent <= startPercent || toleranceMeters < 0) throw new Error('El final debe estar después del inicio');
    const profile = getRouteProfile(route);
    const raw = getRouteCoordinates(route);
    const start = indexAtDistance(profile, profile.totalDistance * startPercent / 100);
    const end = indexAtDistance(profile, profile.totalDistance * endPercent / 100);
    let coordinates = raw.slice(start, end + 1);
    if (coordinates.length < 2) throw new Error('El recorte necesita al menos dos puntos');
    if (toleranceMeters > 0) {
        const simplified = turf.simplify(turf.lineString(coordinates), { tolerance: toleranceMeters / 111320, highQuality: true });
        coordinates = simplified.geometry.coordinates;
    }
    const line = turf.lineString(coordinates);
    const waypoints = (route.geoJson.features ?? []).filter((feature: any) => feature.geometry?.type === 'Point' &&
        turf.nearestPointOnLine(line, feature, { units: 'meters' }).properties.dist <= 250);
    const edited = routeFromGeoJSON(turf.featureCollection([line, ...waypoints]), `${route.name} (editada)`);
    edited.name = `${route.name} (editada)`;
    return edited;
}