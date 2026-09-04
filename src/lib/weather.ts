import { Route } from './db';
import { getRouteCoordinates } from './routeProfile';

export interface RouteWeatherSample {
    label: string;
    distance: number;
    arrivalTime: number;
    temperature: number;
    precipitationProbability: number;
    windSpeed: number;
    weatherCode: number;
    // hourly arrays for plotting
    hourly?: {
        time: number[]; // ms timestamps
        temperature: number[];
        precipitationProbability: number[];
    };
}

export interface RouteWeatherTimeline {
    samples: RouteWeatherSample[];
    updatedAt: number;
    fromCache: boolean;
}

const CACHE_DURATION = 2 * 60 * 60 * 1000;

function cacheKey(routeId: string) {
    return `trailnav-weather-${routeId}`;
}

function readCache(routeId: string): RouteWeatherTimeline | null {
    try {
        const cached = localStorage.getItem(cacheKey(routeId));
        if (!cached) return null;
        return JSON.parse(cached) as RouteWeatherTimeline;
        } catch (e) {
            return null;
        }
}

export async function getRouteWeather(route: Route, etaMinutes: number, startTimestamp?: number, forceRefresh = false): Promise<RouteWeatherTimeline> {
    const cacheId = `${route.id}:${etaMinutes}:${startTimestamp ?? 0}`;
    const cached = readCache(cacheId);
    if (!forceRefresh && cached && Date.now() - cached.updatedAt < CACHE_DURATION) {
        return { ...cached, fromCache: true };
    }

    const coordinates = getRouteCoordinates(route);
    if (coordinates.length === 0) throw new Error('La ruta no contiene coordenadas válidas');

    const sampleDefinitions = [
        { ratio: 0, label: 'Inicio' },
        { ratio: 0.5, label: 'Mitad' },
        { ratio: 1, label: 'Meta' },
    ];

    try {
        const samples = await Promise.all(
            sampleDefinitions.map(async ({ ratio, label }) => {
                const coordinate = coordinates[Math.round((coordinates.length - 1) * ratio)];
                const arrivalTime = (startTimestamp ?? Date.now()) + etaMinutes * ratio * 60_000;
                const params = new URLSearchParams({
                    latitude: String(coordinate[1]),
                    longitude: String(coordinate[0]),
                    hourly: 'time,temperature_2m,precipitation_probability,weather_code,wind_speed_10m',
                    forecast_days: '7',
                    timezone: 'auto',
                });
                const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
                if (!response.ok) throw new Error('Open-Meteo no está disponible');
                const data = await response.json();

                const times: string[] = data.hourly.time ?? [];
                const timeMs = times.map((t) => new Date(t).getTime());

                // find nearest index to arrivalTime
                let index = 0;
                let bestDelta = Infinity;
                timeMs.forEach((t, position) => {
                    const delta = Math.abs(t - arrivalTime);
                    if (delta < bestDelta) {
                        bestDelta = delta;
                        index = position;
                    }
                });

                return {
                    label,
                    distance: route.distance * ratio,
                    arrivalTime,
                    temperature: Math.round((data.hourly.temperature_2m?.[index] ?? 0)),
                    precipitationProbability: Math.round((data.hourly.precipitation_probability?.[index] ?? 0)),
                    windSpeed: Math.round((data.hourly.wind_speed_10m?.[index] ?? 0)),
                    weatherCode: Number((data.hourly.weather_code?.[index] ?? 0)),
                    hourly: {
                        time: timeMs,
                        temperature: (data.hourly.temperature_2m ?? []).map((v: any) => Math.round(v)),
                        precipitationProbability: (data.hourly.precipitation_probability ?? []).map((v: any) => Math.round(v ?? 0)),
                    },
                } as RouteWeatherSample;
            })
        );

        const timeline = { samples, updatedAt: Date.now(), fromCache: false };
        try {
            localStorage.setItem(cacheKey(cacheId), JSON.stringify(timeline));
        } catch (e) { }
        return timeline;
    } catch (error) {
        if (cached) return { ...cached, fromCache: true };
        throw error;
    }
}
