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
    } catch {
        return null;
    }
}

export async function getRouteWeather(route: Route, etaMinutes: number, forceRefresh = false): Promise<RouteWeatherTimeline> {
    const cached = readCache(route.id);
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
        const samples = await Promise.all(sampleDefinitions.map(async ({ ratio, label }) => {
            const coordinate = coordinates[Math.round((coordinates.length - 1) * ratio)];
            const arrivalTime = Date.now() + etaMinutes * ratio * 60_000;
            const params = new URLSearchParams({
                latitude: String(coordinate[1]),
                longitude: String(coordinate[0]),
                hourly: 'temperature_2m,precipitation_probability,weather_code,wind_speed_10m',
                forecast_days: '7',
                timezone: 'auto',
            });
            const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
            if (!response.ok) throw new Error('Open-Meteo no está disponible');
            const data = await response.json();

            // Las horas llegan en hora local del punto; se busca la más próxima a la llegada estimada.
            const times: string[] = data.hourly.time;
            let index = 0;
            let bestDelta = Infinity;
            times.forEach((time, position) => {
                const delta = Math.abs(new Date(time).getTime() - arrivalTime);
                if (delta < bestDelta) {
                    bestDelta = delta;
                    index = position;
                }
            });

            return {
                label,
                distance: route.distance * ratio,
                arrivalTime,
                temperature: Math.round(data.hourly.temperature_2m[index]),
                precipitationProbability: Math.round(data.hourly.precipitation_probability[index] ?? 0),
                windSpeed: Math.round(data.hourly.wind_speed_10m[index] ?? 0),
                weatherCode: Number(data.hourly.weather_code[index] ?? 0),
            };
        }));

        const timeline = { samples, updatedAt: Date.now(), fromCache: false };
        localStorage.setItem(cacheKey(route.id), JSON.stringify(timeline));
        return timeline;
    } catch (error) {
        if (cached) return { ...cached, fromCache: true };
        throw error;
    }
}
