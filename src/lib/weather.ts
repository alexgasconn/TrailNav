import { Route } from './db';
import { getRouteCoordinates } from './routeAnalysis';

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
    if (coordinates.length === 0) throw new Error('La ruta no contiene coordenadas validas');

    const sampleDefinitions = [
        { ratio: 0, label: 'Inicio' },
        { ratio: 0.5, label: 'Mitad de ruta' },
        { ratio: 1, label: 'Final' },
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
            if (!response.ok) throw new Error('Open-Meteo no esta disponible');
            const data = await response.json();
            const targetHour = new Date(arrivalTime).getHours();
            const targetDay = new Date(arrivalTime).toISOString().slice(0, 10);
            let index = data.hourly.time.findIndex((time: string) => time.startsWith(targetDay) && new Date(time).getHours() === targetHour);
            if (index < 0) index = 0;

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
