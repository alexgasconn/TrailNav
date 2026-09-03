import * as turf from '@turf/turf';

export interface MatchedPosition {
    distanceAlongRoute: number;
    distanceFromRoute: number;
    point: [number, number];
}

export function matchPosition(route: { geoJson?: any }, position: [number, number]): MatchedPosition | null {
    const feature = route.geoJson?.features?.find(
        (item: any) => item.geometry?.type === 'LineString' || item.geometry?.type === 'MultiLineString'
    );
    if (!feature) return null;

    const coordinates = feature.geometry.type === 'LineString'
        ? feature.geometry.coordinates
        : feature.geometry.coordinates[0] || [];
    if (coordinates.length < 2) return null;

    const line = turf.lineString(coordinates.map((coordinate: number[]) => coordinate.slice(0, 2)));
    const nearest = turf.nearestPointOnLine(line, turf.point(position), { units: 'meters' });
    const location = Number(nearest.properties?.location);
    const distanceFromRoute = turf.distance(turf.point(position), nearest, { units: 'meters' });

    return {
        distanceAlongRoute: Number.isFinite(location) ? location : 0,
        distanceFromRoute,
        point: nearest.geometry.coordinates as [number, number],
    };
}
