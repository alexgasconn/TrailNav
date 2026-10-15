import * as turf from '@turf/turf';
import { getRouteCoordinates } from './routeProfile';

export { getRouteCoordinates };

export type RouteTrend = 'ascent' | 'descent';

export interface RoutePointAnalysis {
    distance: number;
    elevation: number;
    slope: number;
}

export interface TerrainSegment {
    trend: RouteTrend;
    startDistance: number;
    endDistance: number;
    distance: number;
    elevationDelta: number;
    averageSlope: number;
    maxSlope: number;
    startElevation: number;
    endElevation: number;
}

export interface RouteAnalysis {
    points: RoutePointAnalysis[];
    segments: TerrainSegment[];
    totalAscent: number;
    totalDescent: number;
    highestPoint: RoutePointAnalysis;
    lowestPoint: RoutePointAnalysis;
}

const MIN_SEGMENT_DISTANCE = 200;
const MIN_ELEVATION_CHANGE = 25;
const SLOPE_THRESHOLD = 1;
const SMOOTHING_RADIUS = 2;

export function getCurrentRamp(analysis: RouteAnalysis, distance: number) {
    const points = analysis.points;
    if (points.length < 2) return null;
    const direction = (slope: number) => slope > 0.5 ? 'ascent' : slope < -0.5 ? 'descent' : 'flat';
    let low = 1;
    let high = points.length - 1;
    while (low < high) {
        const middle = (low + high) >> 1;
        if (points[middle].distance <= distance) low = middle + 1;
        else high = middle;
    }
    const index = low;
    const trend = direction(points[index].slope);
    let startIndex = index;
    let endIndex = index;
    while (startIndex > 1 && direction(points[startIndex - 1].slope) === trend) startIndex -= 1;
    while (endIndex < points.length - 1 && direction(points[endIndex + 1].slope) === trend) endIndex += 1;
    const start = points[startIndex - 1];
    const end = points[endIndex];
    const length = end.distance - start.distance;
    return {
        trend,
        startDistance: start.distance,
        endDistance: end.distance,
        length,
        averageSlope: length > 0 ? (end.elevation - start.elevation) / length * 100 : 0,
    };
}

function smoothElevations(elevations: number[]): number[] {
    return elevations.map((_, index) => {
        const start = Math.max(0, index - SMOOTHING_RADIUS);
        const end = Math.min(elevations.length, index + SMOOTHING_RADIUS + 1);
        const window = elevations.slice(start, end);
        return window.reduce((sum, value) => sum + value, 0) / window.length;
    });
}

export function analyzeRoute(route: { geoJson?: any; distance: number }): RouteAnalysis {
    const coordinates = getRouteCoordinates(route);
    if (coordinates.length === 0) {
        return { points: [], segments: [], totalAscent: 0, totalDescent: 0, highestPoint: { distance: 0, elevation: 0, slope: 0 }, lowestPoint: { distance: 0, elevation: 0, slope: 0 } };
    }

    const elevations = smoothElevations(coordinates.map((coordinate) => Number(coordinate[2]) || 0));
    const points: RoutePointAnalysis[] = [{ distance: 0, elevation: elevations[0], slope: 0 }];
    let cumulativeDistance = 0;

    for (let index = 1; index < coordinates.length; index += 1) {
        const previous = turf.point(coordinates[index - 1].slice(0, 2));
        const current = turf.point(coordinates[index].slice(0, 2));
        const horizontalDistance = turf.distance(previous, current, { units: 'kilometers' }) * 1000;
        cumulativeDistance += horizontalDistance;
        const elevationDelta = elevations[index] - elevations[index - 1];
        const slope = horizontalDistance > 0 ? (elevationDelta / horizontalDistance) * 100 : 0;
        points.push({ distance: cumulativeDistance, elevation: elevations[index], slope });
    }

    const segments: TerrainSegment[] = [];
    let startIndex: number | null = null;
    let trend: RouteTrend | null = null;
    let interruptionCount = 0;

    const finishSegment = (endIndex: number) => {
        if (startIndex === null || !trend) return;
        const start = points[startIndex];
        const end = points[endIndex];
        const distance = end.distance - start.distance;
        const elevationDelta = end.elevation - start.elevation;
        const relevantChange = trend === 'ascent' ? elevationDelta : -elevationDelta;

        if (distance >= MIN_SEGMENT_DISTANCE && relevantChange >= MIN_ELEVATION_CHANGE) {
            const range = points.slice(startIndex, endIndex + 1);
            const slopes = range.map((point) => point.slope);
            segments.push({
                trend,
                startDistance: start.distance,
                endDistance: end.distance,
                distance,
                elevationDelta,
                averageSlope: distance > 0 ? (elevationDelta / distance) * 100 : 0,
                maxSlope: trend === 'ascent' ? Math.max(...slopes) : Math.min(...slopes),
                startElevation: start.elevation,
                endElevation: end.elevation,
            });
        }
        startIndex = null;
        trend = null;
        interruptionCount = 0;
    };

    for (let index = 1; index < points.length; index += 1) {
        const pointTrend = points[index].slope >= SLOPE_THRESHOLD
            ? 'ascent'
            : points[index].slope <= -SLOPE_THRESHOLD
                ? 'descent'
                : null;

        if (!pointTrend) {
            if (startIndex !== null) interruptionCount += 1;
            if (interruptionCount > 2) finishSegment(index - interruptionCount);
            continue;
        }

        if (startIndex === null) {
            startIndex = Math.max(0, index - 1);
            trend = pointTrend;
            interruptionCount = 0;
        } else if (pointTrend !== trend && interruptionCount > 0) {
            finishSegment(index - interruptionCount);
            startIndex = Math.max(0, index - 1);
            trend = pointTrend;
        } else {
            interruptionCount = 0;
        }
    }

    if (startIndex !== null) finishSegment(points.length - 1);

    const highestPoint = points.reduce((highest, point) => point.elevation > highest.elevation ? point : highest, points[0]);
    const lowestPoint = points.reduce((lowest, point) => point.elevation < lowest.elevation ? point : lowest, points[0]);
    const totalAscent = segments.filter((segment) => segment.trend === 'ascent').reduce((sum, segment) => sum + Math.max(0, segment.elevationDelta), 0);
    const totalDescent = segments.filter((segment) => segment.trend === 'descent').reduce((sum, segment) => sum + Math.abs(Math.min(0, segment.elevationDelta)), 0);

    return { points, segments, totalAscent, totalDescent, highestPoint, lowestPoint };
}
