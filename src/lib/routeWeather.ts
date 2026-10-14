import { Route } from './db';
import { getRouteProfile } from './routeProfile';

export interface RouteWeatherSample {
    label: string;
    coordinate: [number, number];
    /** Metros desde el inicio de la ruta. */
    distance: number;
    arrivalTime: number;
    temperature: number;
    precipitationProbability: number;
    windSpeed: number;
    weatherCode: number;
    /** Serie horaria entre la salida y el final estimado. */
    hourly: {
        time: number[];
        temperature: number[];
        precipitationProbability: number[];
        windSpeed: number[];
        weatherCode: number[];
    };
}

export interface RouteWeatherTimeline {
    samples: RouteWeatherSample[];
    startTimestamp: number;
    endTimestamp: number;
    updatedAt: number;
    fromCache: boolean;
}

export const WEATHER_POINTS = 5;
export const FORECAST_DAYS = 7;
const CACHE_DURATION = 60 * 60 * 1000;
const HOUR = 3_600_000;

const cacheKey = (id: string) => `trailnav-weather-v2-${id}`;

function readCache(id: string): RouteWeatherTimeline | null {
    try {
        const raw = localStorage.getItem(cacheKey(id));
        return raw ? (JSON.parse(raw) as RouteWeatherTimeline) : null;
    } catch {
        return null;
    }
}

/** Hora de salida por defecto: la próxima hora en punto. */
export function defaultStartTimestamp(): number {
    return Math.ceil(Date.now() / HOUR) * HOUR;
}

export function maxStartTimestamp(): number {
    const end = new Date();
    end.setDate(end.getDate() + FORECAST_DAYS - 1);
    end.setHours(23, 0, 0, 0);
    return end.getTime();
}

export function weatherStartKey(routeId: string) {
    return `trailnav-weather-start-${routeId}`;
}

/** Salida elegida por el usuario para esta ruta, si sigue siendo válida. */
export function getStoredStart(routeId: string): number {
    const stored = Number(localStorage.getItem(weatherStartKey(routeId)));
    return Number.isFinite(stored) && stored >= Date.now() - HOUR && stored <= maxStartTimestamp() ? stored : defaultStartTimestamp();
}

export function describeWeather(code: number): { icon: string; text: string } {
    if (code === 0) return { icon: '☀️', text: 'Despejado' };
    if (code <= 2) return { icon: '🌤️', text: 'Poco nuboso' };
    if (code === 3) return { icon: '☁️', text: 'Nublado' };
    if (code === 45 || code === 48) return { icon: '🌫️', text: 'Niebla' };
    if (code >= 51 && code <= 57) return { icon: '🌦️', text: 'Llovizna' };
    if (code >= 61 && code <= 67) return { icon: '🌧️', text: 'Lluvia' };
    if (code >= 71 && code <= 77) return { icon: '🌨️', text: 'Nieve' };
    if (code >= 80 && code <= 82) return { icon: '🌦️', text: 'Chubascos' };
    if (code === 85 || code === 86) return { icon: '🌨️', text: 'Chubascos de nieve' };
    if (code >= 95) return { icon: '⛈️', text: 'Tormenta' };
    return { icon: '🌡️', text: '—' };
}

function nearestIndex(times: number[], target: number) {
    let index = 0;
    let best = Infinity;
    times.forEach((time, position) => {
        const delta = Math.abs(time - target);
        if (delta < best) {
            best = delta;
            index = position;
        }
    });
    return index;
}

async function fetchForecast(coordinates: [number, number][]) {
    const params = new URLSearchParams({
        latitude: coordinates.map((c) => c[1].toFixed(4)).join(','),
        longitude: coordinates.map((c) => c[0].toFixed(4)).join(','),
        hourly: 'temperature_2m,precipitation_probability,weather_code,wind_speed_10m',
        forecast_days: String(FORECAST_DAYS + 1),
        timezone: 'GMT',
        timeformat: 'unixtime',
        wind_speed_unit: 'kmh',
    });

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 15000);
    try {
        const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`Open-Meteo respondió ${response.status}`);
        const data = await response.json();
        return (Array.isArray(data) ? data : [data]) as any[];
    } finally {
        window.clearTimeout(timer);
    }
}

export async function getRouteWeather(
    route: Route,
    etaMinutes: number,
    startTimestamp: number,
    forceRefresh = false
): Promise<RouteWeatherTimeline> {
    const start = Math.round(startTimestamp / HOUR) * HOUR;
    const duration = Math.max(1, etaMinutes) * 60_000;
    const cacheId = `${route.id}:${Math.round(etaMinutes)}:${start}`;

    const cached = readCache(cacheId);
    if (!forceRefresh && cached && Date.now() - cached.updatedAt < CACHE_DURATION) {
        return { ...cached, fromCache: true };
    }

    const profile = getRouteProfile(route);
    if (profile.coordinates.length < 2) throw new Error('La ruta no contiene coordenadas válidas');

    const ratios = Array.from({ length: WEATHER_POINTS }, (_, i) => i / (WEATHER_POINTS - 1));
    const points = ratios.map((ratio) => {
        const index = Math.round((profile.coordinates.length - 1) * ratio);
        return { ratio, coordinate: profile.coordinates[index], distance: profile.cumulativeDistance[index] };
    });

    try {
        const results = await fetchForecast(points.map((p) => p.coordinate));
        const end = start + duration;

        const samples = points.map((point, i): RouteWeatherSample => {
            const hourly = results[i]?.hourly;
            if (!hourly?.time?.length) throw new Error('Open-Meteo no devolvió datos horarios');

            const times: number[] = hourly.time.map((t: number) => t * 1000);
            const arrivalTime = start + duration * point.ratio;
            const at = nearestIndex(times, arrivalTime);

            const from = Math.max(0, nearestIndex(times, start));
            const to = Math.max(from, Math.min(times.length - 1, nearestIndex(times, end)));
            const slice = (values: number[] | undefined) =>
                times.slice(from, to + 1).map((_, k) => Number(values?.[from + k] ?? 0));

            const label = i === 0 ? 'Inicio' : i === ratios.length - 1 ? 'Meta' : `km ${(point.distance / 1000).toFixed(1)}`;

            return {
                label,
                coordinate: point.coordinate,
                distance: point.distance,
                arrivalTime,
                temperature: Math.round(hourly.temperature_2m?.[at] ?? 0),
                precipitationProbability: Math.round(hourly.precipitation_probability?.[at] ?? 0),
                windSpeed: Math.round(hourly.wind_speed_10m?.[at] ?? 0),
                weatherCode: Number(hourly.weather_code?.[at] ?? 0),
                hourly: {
                    time: times.slice(from, to + 1),
                    temperature: slice(hourly.temperature_2m).map(Math.round),
                    precipitationProbability: slice(hourly.precipitation_probability).map(Math.round),
                    windSpeed: slice(hourly.wind_speed_10m).map(Math.round),
                    weatherCode: slice(hourly.weather_code),
                },
            };
        });

        const timeline: RouteWeatherTimeline = { samples, startTimestamp: start, endTimestamp: end, updatedAt: Date.now(), fromCache: false };
        try {
            localStorage.setItem(cacheKey(cacheId), JSON.stringify(timeline));
        } catch {
            /* sin espacio: se ignora la caché */
        }
        return timeline;
    } catch (error) {
        if (cached) return { ...cached, fromCache: true };
        throw error;
    }
}
