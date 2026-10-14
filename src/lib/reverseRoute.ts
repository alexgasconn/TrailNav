import { Route } from './db';
import { buildRouteProfile, invalidateRouteProfile } from './routeProfile';
import { invalidateRoutePoints } from './routePoints';

/** Devuelve la ruta recorrida en sentido contrario (inicio ⇄ final), con métricas recalculadas. */
export function reverseRoute(route: Route): Route {
    const features = (route.geoJson?.features ?? []).map((feature: any) => {
        const type = feature?.geometry?.type;
        if (type === 'LineString') {
            return { ...feature, geometry: { ...feature.geometry, coordinates: [...feature.geometry.coordinates].reverse() } };
        }
        if (type === 'MultiLineString') {
            const lines = feature.geometry.coordinates.map((line: number[][]) => [...line].reverse()).reverse();
            return { ...feature, geometry: { ...feature.geometry, coordinates: lines } };
        }
        return feature;
    });

    const geoJson = { ...route.geoJson, features };
    const profile = buildRouteProfile({ geoJson });

    invalidateRouteProfile(route.id);
    invalidateRoutePoints(route.id);

    return {
        ...route,
        geoJson,
        distance: profile.totalDistance || route.distance,
        elevationGain: profile.totalAscent,
        elevationLoss: profile.totalDescent,
        reversed: !route.reversed,
    };
}
