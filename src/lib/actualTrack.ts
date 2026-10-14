import * as turf from '@turf/turf';

/** Traza realmente recorrida por el usuario, independiente de la ruta GPX. */
export interface ActualTrack {
    /** [lng, lat, altitud|NaN] */
    points: [number, number, number][];
    distance: number;
    ascent: number;
    descent: number;
    hasAltitude: boolean;
    altWindow: number[];
    reference: number | null;
    direction: 0 | 1 | -1;
}

const MIN_STEP = 5;
const MAX_ACCURACY = 30;
const ALT_THRESHOLD = 4;
const ALT_WINDOW = 5;

export function createActualTrack(): ActualTrack {
    return { points: [], distance: 0, ascent: 0, descent: 0, hasAltitude: false, altWindow: [], reference: null, direction: 0 };
}

export function addTrackPoint(
    track: ActualTrack,
    lng: number,
    lat: number,
    altitude: number | null,
    accuracy: number | null
): boolean {
    if (accuracy != null && accuracy > MAX_ACCURACY) return false;

    const last = track.points[track.points.length - 1];
    if (last) {
        const step = turf.distance([last[0], last[1]], [lng, lat], { units: 'meters' });
        if (step < Math.max(MIN_STEP, (accuracy ?? 0) * 0.5)) return false;
        track.distance += step;
    }

    let smoothed = NaN;
    if (altitude != null && Number.isFinite(altitude)) {
        track.hasAltitude = true;
        track.altWindow.push(altitude);
        if (track.altWindow.length > ALT_WINDOW) track.altWindow.shift();
        smoothed = track.altWindow.reduce((sum, value) => sum + value, 0) / track.altWindow.length;

        if (track.reference == null) {
            track.reference = smoothed;
        } else {
            const delta = smoothed - track.reference;
            if (track.direction === 1) {
                if (delta > 0) {
                    track.ascent += delta;
                    track.reference = smoothed;
                } else if (-delta >= ALT_THRESHOLD) {
                    track.direction = -1;
                    track.descent += -delta;
                    track.reference = smoothed;
                }
            } else if (track.direction === -1) {
                if (delta < 0) {
                    track.descent += -delta;
                    track.reference = smoothed;
                } else if (delta >= ALT_THRESHOLD) {
                    track.direction = 1;
                    track.ascent += delta;
                    track.reference = smoothed;
                }
            } else if (delta >= ALT_THRESHOLD) {
                track.direction = 1;
                track.ascent += delta;
                track.reference = smoothed;
            } else if (-delta >= ALT_THRESHOLD) {
                track.direction = -1;
                track.descent += -delta;
                track.reference = smoothed;
            }
        }
    }

    track.points.push([lng, lat, smoothed]);
    return true;
}

/** Reconstruye distancias y desniveles a partir de puntos persistidos. */
export function replayTrack(points: [number, number, number][]): ActualTrack {
    const track = createActualTrack();
    for (const [lng, lat, alt] of points) {
        addTrackPoint(track, lng, lat, Number.isFinite(alt) ? alt : null, null);
    }
    return track;
}
