import * as turf from '@turf/turf';
import { RouteProfile, getRouteProfile, indexAtDistance } from './routeProfile';

export type RoutePointKind =
    | 'start'
    | 'finish'
    | 'waypoint'
    | 'summit'
    | 'water'
    | 'aid'
    | 'junction'
    | 'turn'
    | 'pass';

export interface RoutePoint {
    id: string;
    kind: RoutePointKind;
    name: string;
    coordinate: [number, number];
    /** Distancia desde el inicio de la ruta, en metros. */
    distance: number;
    elevation: number | null;
    detail?: string;
    source: 'gpx' | 'derived';
}

const KIND_KEYWORDS: { kind: RoutePointKind; patterns: RegExp }[] = [
    { kind: 'water', patterns: /(fuente|font|agua|water|spring|manantial)/i },
    { kind: 'aid', patterns: /(avitualla|refugi|refugio|hut|aid|abastec|control)/i },
    { kind: 'summit', patterns: /(cima|cim|pico|pic|peak|summit|cumbre|tossal|puig)/i },
    { kind: 'pass', patterns: /(coll|collado|puerto|port|pass)/i },
    { kind: 'junction', patterns: /(cruce|creu|cruilla|junction|desvio|desvío|bifurca)/i },
];

function classifyWaypoint(name: string): RoutePointKind {
    for (const entry of KIND_KEYWORDS) {
        if (entry.patterns.test(name)) return entry.kind;
    }
    return 'waypoint';
}

function angleDifference(from: number, to: number): number {
    return ((to - from + 540) % 360) - 180;
}

/** Waypoints declarados en el propio archivo GPX. */
function extractGpxWaypoints(route: { geoJson?: any }, profile: RouteProfile): RoutePoint[] {
    const features: any[] = route?.geoJson?.features ?? [];
    const points: RoutePoint[] = [];
    if (profile.coordinates.length < 2) return points;

    const line = turf.lineString(profile.coordinates);

    features.forEach((feature, index) => {
        if (feature?.geometry?.type !== 'Point') return;
        const coordinate = feature.geometry.coordinates as number[];
        if (!Number.isFinite(coordinate?.[0]) || !Number.isFinite(coordinate?.[1])) return;

        const position: [number, number] = [coordinate[0], coordinate[1]];
        const snapped = turf.nearestPointOnLine(line, turf.point(position), { units: 'meters' });
        // Un waypoint a más de 250 m del track no pertenece a esta ruta.
        if (Number(snapped.properties?.dist ?? Infinity) > 250) return;

        const name = String(feature.properties?.name ?? '').trim() || `Punto ${index + 1}`;

        points.push({
            id: `gpx-${index}`,
            kind: classifyWaypoint(name),
            name,
            coordinate: position,
            distance: Number(snapped.properties?.location ?? 0),
            elevation: Number.isFinite(coordinate[2]) ? Number(coordinate[2]) : null,
            detail: feature.properties?.desc ? String(feature.properties.desc) : undefined,
            source: 'gpx',
        });
    });

    return points;
}

const MIN_PROMINENCE = 60;
const MIN_SUMMIT_SEPARATION = 1200;

/** Cimas reales del track detectadas por prominencia local del perfil. */
function extractSummits(profile: RouteProfile): RoutePoint[] {
    if (!profile.hasElevation || profile.coordinates.length < 10) return [];

    const { elevation, cumulativeDistance } = profile;
    const candidates: { index: number; prominence: number }[] = [];

    for (let i = 1; i < elevation.length - 1; i += 1) {
        if (elevation[i] < elevation[i - 1] || elevation[i] <= elevation[i + 1]) continue;

        let leftDrop = 0;
        for (let j = i - 1; j >= 0; j -= 1) {
            if (elevation[j] > elevation[i]) break;
            leftDrop = Math.max(leftDrop, elevation[i] - elevation[j]);
            if (leftDrop >= MIN_PROMINENCE) break;
        }
        if (leftDrop < MIN_PROMINENCE) continue;

        let rightDrop = 0;
        for (let j = i + 1; j < elevation.length; j += 1) {
            if (elevation[j] > elevation[i]) break;
            rightDrop = Math.max(rightDrop, elevation[i] - elevation[j]);
            if (rightDrop >= MIN_PROMINENCE) break;
        }
        if (rightDrop < MIN_PROMINENCE) continue;

        candidates.push({ index: i, prominence: Math.min(leftDrop, rightDrop) });
    }

    const selected: { index: number; prominence: number }[] = [];
    candidates
        .sort((a, b) => b.prominence - a.prominence)
        .forEach((candidate) => {
            const tooClose = selected.some(
                (item) => Math.abs(cumulativeDistance[item.index] - cumulativeDistance[candidate.index]) < MIN_SUMMIT_SEPARATION
            );
            if (!tooClose) selected.push(candidate);
        });

    return selected.slice(0, 8).map((candidate) => ({
        id: `summit-${candidate.index}`,
        kind: 'summit' as const,
        name: 'Punto alto',
        coordinate: profile.coordinates[candidate.index],
        distance: cumulativeDistance[candidate.index],
        elevation: elevation[candidate.index],
        detail: `Prominencia ${Math.round(candidate.prominence)} m`,
        source: 'derived' as const,
    }));
}

const TURN_WINDOW = 120;
const MIN_TURN_ANGLE = 65;
const MIN_TURN_SEPARATION = 600;

/** Cambios de dirección relevantes medidos con ventanas de 120 m. */
function extractTurns(profile: RouteProfile): RoutePoint[] {
    if (profile.coordinates.length < 5) return [];

    const { coordinates, cumulativeDistance } = profile;
    const turns: { index: number; angle: number }[] = [];

    for (let i = 1; i < coordinates.length - 1; i += 1) {
        const distance = cumulativeDistance[i];
        if (distance < TURN_WINDOW || distance > profile.totalDistance - TURN_WINDOW) continue;

        const beforeIndex = indexAtDistance(profile, distance - TURN_WINDOW);
        const afterIndex = indexAtDistance(profile, distance + TURN_WINDOW);
        if (beforeIndex === i || afterIndex === i) continue;

        const incoming = turf.bearing(coordinates[beforeIndex], coordinates[i]);
        const outgoing = turf.bearing(coordinates[i], coordinates[afterIndex]);
        const angle = angleDifference(incoming, outgoing);
        if (Math.abs(angle) < MIN_TURN_ANGLE) continue;

        turns.push({ index: i, angle });
    }

    const selected: { index: number; angle: number }[] = [];
    turns
        .sort((a, b) => Math.abs(b.angle) - Math.abs(a.angle))
        .forEach((turn) => {
            const tooClose = selected.some(
                (item) => Math.abs(cumulativeDistance[item.index] - cumulativeDistance[turn.index]) < MIN_TURN_SEPARATION
            );
            if (!tooClose) selected.push(turn);
        });

    return selected.slice(0, 12).map((turn) => ({
        id: `turn-${turn.index}`,
        kind: 'turn' as const,
        name: turn.angle > 0 ? 'Giro a la derecha' : 'Giro a la izquierda',
        coordinate: coordinates[turn.index],
        distance: cumulativeDistance[turn.index],
        elevation: profile.hasElevation ? profile.elevation[turn.index] : null,
        detail: `${Math.round(Math.abs(turn.angle))}°`,
        source: 'derived' as const,
    }));
}

const cache = new Map<string, { signature: number; points: RoutePoint[] }>();

export function getRoutePoints(route: { id: string; geoJson?: any }): RoutePoint[] {
    const profile = getRouteProfile(route);
    const signature = profile.coordinates.length;
    const cached = cache.get(route.id);
    if (cached && cached.signature === signature) return cached.points;

    const points: RoutePoint[] = [];

    if (profile.coordinates.length >= 2) {
        const lastIndex = profile.coordinates.length - 1;
        points.push({
            id: 'start',
            kind: 'start',
            name: 'Inicio',
            coordinate: profile.coordinates[0],
            distance: 0,
            elevation: profile.hasElevation ? profile.elevation[0] : null,
            source: 'derived',
        });
        points.push({
            id: 'finish',
            kind: 'finish',
            name: 'Meta',
            coordinate: profile.coordinates[lastIndex],
            distance: profile.totalDistance,
            elevation: profile.hasElevation ? profile.elevation[lastIndex] : null,
            source: 'derived',
        });
    }

    const gpxWaypoints = extractGpxWaypoints(route, profile);
    points.push(...gpxWaypoints);
    points.push(...extractSummits(profile));

    const result = points
        .filter((point) => Number.isFinite(point.distance))
        .sort((a, b) => a.distance - b.distance);

    cache.set(route.id, { signature, points: result });
    return result;
}

export function invalidateRoutePoints(routeId: string) {
    cache.delete(routeId);
}
