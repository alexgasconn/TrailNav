import { FitnessLevel, PackWeight, PaceType } from './db';
import { RouteProfile } from './routeProfile';

export interface HikerProfile {
    fitness: FitnessLevel;
    pace: PaceType;
    packWeight: PackWeight;
    includeBreaks: boolean;
}

export const DEFAULT_HIKER: HikerProfile = { fitness: 'average', pace: 'steady', packWeight: 'light', includeBreaks: true };

export const FITNESS_LABELS: Record<FitnessLevel, string> = {
    sedentary: 'Sedentario',
    beginner: 'Principiante',
    average: 'Medio',
    athletic: 'Atlético',
    endurance: 'Resistencia',
    elite: 'Élite',
    superhuman: 'Superhumano',
};

export const PACE_LABELS: Record<PaceType, string> = {
    photography: 'Fotografía',
    relaxed: 'Relajado',
    steady: 'Constante',
    nordic: 'Nórdico',
    power: 'Rápido',
    fast: 'Muy rápido',
    trail_run: 'Trail running',
    sky_run: 'Sky running',
};

export const PACK_LABELS: Record<PackWeight, string> = { light: 'Ligera', medium: 'Media', heavy: 'Pesada' };

export interface EtaEstimate {
    name: string;
    minutes: number;
}

export interface EtaConsensus {
    estimates: EtaEstimate[];
    accepted: EtaEstimate[];
    minutes: number;
    range: [number, number];
    /** 'mean' si los métodos coinciden; 'median' si hay valores atípicos. */
    aggregate: 'mean' | 'median';
}

const BASE_SPEED: Record<FitnessLevel, number> = {
    sedentary: 2.5,
    beginner: 3.2,
    average: 4.0,
    athletic: 5.0,
    endurance: 5.5,
    elite: 6.0,
    superhuman: 7.0,
};

const PACE_FACTOR: Record<PaceType, number> = {
    photography: 0.6,
    relaxed: 0.8,
    steady: 1.0,
    nordic: 1.1,
    power: 1.3,
    fast: 1.4,
    trail_run: 2.0,
    sky_run: 2.4,
};

/** Velocidad base en km/h según forma física, ritmo y peso de la mochila (corrección de Langmuir). */
function speedFor(hiker: HikerProfile): number {
    let speed = BASE_SPEED[hiker.fitness] * PACE_FACTOR[hiker.pace];
    if (hiker.packWeight === 'medium') speed *= 0.95;
    if (hiker.packWeight === 'heavy') speed *= 0.85;
    return speed;
}

/** Diez minutos de descanso por hora completa, salvo al correr. */
function withBreaks(minutes: number, hiker: HikerProfile): number {
    const running = hiker.pace === 'trail_run' || hiker.pace === 'sky_run';
    if (!hiker.includeBreaks || running) return minutes;
    return minutes + Math.floor(minutes / 60) * 10;
}

/** Tobler integrado punto a punto (muestreo cada ~30 m para no acumular ruido GPS). */
function toblerHours(profile: RouteProfile, speed: number): number {
    const { cumulativeDistance: d, elevation: e } = profile;
    let hours = 0;
    let last = 0;
    for (let i = 1; i < d.length; i += 1) {
        const dist = d[i] - d[last];
        if (dist < 30 && i < d.length - 1) continue;
        if (dist <= 0) continue;
        const slope = profile.hasElevation ? (e[i] - e[last]) / dist : 0;
        const velocity = Math.max(0.5, 6 * Math.exp(-3.5 * Math.abs(slope + 0.05)));
        hours += dist / 1000 / velocity;
        last = i;
    }
    return hours * (6 / speed);
}

export function estimateRouteTime(profile: RouteProfile, hiker: HikerProfile = DEFAULT_HIKER): EtaConsensus {
    const distance = profile.totalDistance / 1000;
    const gain = profile.totalAscent;
    const loss = profile.totalDescent;
    const speed = speedFor(hiker);

    const climbFactor = hiker.fitness === 'elite' || hiker.fitness === 'superhuman' ? 800 : 600;
    const naismith = (distance / speed + gain / climbFactor) * 60;

    const tobler = toblerHours(profile, speed) * 60;

    let munterHours = (distance + gain / 100) / speed;
    if (hiker.packWeight === 'heavy') munterHours += loss / 1000;
    const munter = munterHours * 60;

    const speedFactor = speed / 4;
    const horizontal = distance / (4 * speedFactor);
    const vertical = gain / (400 * speedFactor) + loss / (800 * speedFactor);
    const swiss = (Math.max(horizontal, vertical) + Math.min(horizontal, vertical) * 0.5) * 60;

    const petzoldt = ((distance + gain / 152.4) / speed) * 60;

    const estimates: EtaEstimate[] = [
        { name: 'Naismith', minutes: naismith },
        { name: 'Tobler', minutes: tobler },
        { name: 'Munter', minutes: munter },
        { name: 'Suizo (DIN 33466)', minutes: swiss },
        { name: 'Petzoldt', minutes: petzoldt },
    ].map((estimate) => ({ name: estimate.name, minutes: Math.max(1, Math.round(withBreaks(estimate.minutes, hiker))) }));

    const values = estimates.map((estimate) => estimate.minutes).sort((a, b) => a - b);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const mid = Math.floor(values.length / 2);
    const median = values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
    const useMedian = Math.abs(mean - median) / median > 0.1;

    return {
        estimates,
        accepted: estimates,
        minutes: Math.round(useMedian ? median : mean),
        range: [values[0], values[values.length - 1]],
        aggregate: useMedian ? 'median' : 'mean',
    };
}
