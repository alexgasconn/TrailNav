import * as turf from '@turf/turf';

export interface RouteProfile {
    /** Coordenadas [lng, lat] de la traza principal. */
    coordinates: [number, number][];
    /** Distancia acumulada en metros para cada coordenada. */
    cumulativeDistance: Float64Array;
    /** Elevación suavizada en metros para cada coordenada. */
    elevation: Float64Array;
    /** Desnivel positivo acumulado hasta cada coordenada. */
    cumulativeAscent: Float64Array;
    /** Desnivel negativo acumulado hasta cada coordenada. */
    cumulativeDescent: Float64Array;
    totalDistance: number;
    totalAscent: number;
    totalDescent: number;
    minElevation: number;
    maxElevation: number;
    hasElevation: boolean;
}

/** Umbral de histéresis para no contabilizar ruido barométrico como desnivel. */
const ELEVATION_THRESHOLD = 3;
const SMOOTHING_RADIUS = 2;

export function getRouteCoordinates(route: { geoJson?: any }): number[][] {
    const feature = route?.geoJson?.features?.find(
        (item: any) => item?.geometry?.type === 'LineString' || item?.geometry?.type === 'MultiLineString'
    );
    if (!feature) return [];
    if (feature.geometry.type === 'LineString') return feature.geometry.coordinates ?? [];
    return (feature.geometry.coordinates ?? []).flat();
}

function smooth(values: number[]): Float64Array {
    const result = new Float64Array(values.length);
    for (let i = 0; i < values.length; i += 1) {
        const start = Math.max(0, i - SMOOTHING_RADIUS);
        const end = Math.min(values.length, i + SMOOTHING_RADIUS + 1);
        let sum = 0;
        for (let j = start; j < end; j += 1) sum += values[j];
        result[i] = sum / (end - start);
    }
    return result;
}

const EMPTY_PROFILE: RouteProfile = {
    coordinates: [],
    cumulativeDistance: new Float64Array(0),
    elevation: new Float64Array(0),
    cumulativeAscent: new Float64Array(0),
    cumulativeDescent: new Float64Array(0),
    totalDistance: 0,
    totalAscent: 0,
    totalDescent: 0,
    minElevation: 0,
    maxElevation: 0,
    hasElevation: false,
};

export function buildRouteProfile(route: { geoJson?: any }): RouteProfile {
    const rawCoordinates = getRouteCoordinates(route);
    if (rawCoordinates.length < 2) return EMPTY_PROFILE;

    const coordinates = rawCoordinates.map((coordinate) => [coordinate[0], coordinate[1]] as [number, number]);
    const rawElevations = rawCoordinates.map((coordinate) => Number(coordinate[2]));
    const hasElevation = rawElevations.some((value) => Number.isFinite(value) && value !== 0);
    const elevation = smooth(rawElevations.map((value) => (Number.isFinite(value) ? value : 0)));

    const cumulativeDistance = new Float64Array(coordinates.length);
    const cumulativeAscent = new Float64Array(coordinates.length);
    const cumulativeDescent = new Float64Array(coordinates.length);

    let distance = 0;
    let ascent = 0;
    let descent = 0;
    let reference = elevation[0];
    let direction: 0 | 1 | -1 = 0;
    let minElevation = elevation[0];
    let maxElevation = elevation[0];

    for (let i = 1; i < coordinates.length; i += 1) {
        distance += turf.distance(coordinates[i - 1], coordinates[i], { units: 'meters' });
        cumulativeDistance[i] = distance;

        if (hasElevation) {
            const value = elevation[i];
            const delta = value - reference;
            if (direction === 1) {
                if (delta > 0) {
                    ascent += delta;
                    reference = value;
                } else if (-delta >= ELEVATION_THRESHOLD) {
                    direction = -1;
                    descent += -delta;
                    reference = value;
                }
            } else if (direction === -1) {
                if (delta < 0) {
                    descent += -delta;
                    reference = value;
                } else if (delta >= ELEVATION_THRESHOLD) {
                    direction = 1;
                    ascent += delta;
                    reference = value;
                }
            } else if (delta >= ELEVATION_THRESHOLD) {
                direction = 1;
                ascent += delta;
                reference = value;
            } else if (-delta >= ELEVATION_THRESHOLD) {
                direction = -1;
                descent += -delta;
                reference = value;
            }
            if (value < minElevation) minElevation = value;
            if (value > maxElevation) maxElevation = value;
        }

        cumulativeAscent[i] = ascent;
        cumulativeDescent[i] = descent;
    }

    return {
        coordinates,
        cumulativeDistance,
        elevation,
        cumulativeAscent,
        cumulativeDescent,
        totalDistance: distance,
        totalAscent: ascent,
        totalDescent: descent,
        minElevation: hasElevation ? minElevation : 0,
        maxElevation: hasElevation ? maxElevation : 0,
        hasElevation,
    };
}

const cache = new Map<string, { signature: number; profile: RouteProfile }>();

/** Perfil memorizado por ruta: el cálculo recorre decenas de miles de puntos. */
export function getRouteProfile(route: { id: string; geoJson?: any }): RouteProfile {
    const signature = getRouteCoordinates(route).length;
    const cached = cache.get(route.id);
    if (cached && cached.signature === signature) return cached.profile;
    const profile = buildRouteProfile(route);
    cache.set(route.id, { signature, profile });
    return profile;
}

export function invalidateRouteProfile(routeId: string) {
    cache.delete(routeId);
}

/** Índice de la coordenada inmediatamente anterior a una distancia dada. */
export function indexAtDistance(profile: RouteProfile, distance: number): number {
    const { cumulativeDistance } = profile;
    if (cumulativeDistance.length === 0) return 0;
    if (distance <= 0) return 0;
    if (distance >= profile.totalDistance) return cumulativeDistance.length - 1;

    let low = 0;
    let high = cumulativeDistance.length - 1;
    while (low < high - 1) {
        const mid = (low + high) >> 1;
        if (cumulativeDistance[mid] <= distance) low = mid;
        else high = mid;
    }
    return low;
}

export interface ProfileSample {
    elevation: number;
    ascent: number;
    descent: number;
    remainingAscent: number;
    remainingDescent: number;
}

/** Interpola elevación y desniveles acumulados en una distancia concreta de la ruta. */
export function sampleProfile(profile: RouteProfile, distance: number): ProfileSample | null {
    if (!profile.hasElevation || profile.coordinates.length < 2) return null;

    const clamped = Math.min(Math.max(distance, 0), profile.totalDistance);
    const index = indexAtDistance(profile, clamped);
    const next = Math.min(index + 1, profile.coordinates.length - 1);
    const span = profile.cumulativeDistance[next] - profile.cumulativeDistance[index];
    const ratio = span > 0 ? (clamped - profile.cumulativeDistance[index]) / span : 0;

    const lerp = (values: Float64Array) => values[index] + (values[next] - values[index]) * ratio;
    const ascent = lerp(profile.cumulativeAscent);
    const descent = lerp(profile.cumulativeDescent);

    return {
        elevation: lerp(profile.elevation),
        ascent,
        descent,
        remainingAscent: Math.max(0, profile.totalAscent - ascent),
        remainingDescent: Math.max(0, profile.totalDescent - descent),
    };
}
