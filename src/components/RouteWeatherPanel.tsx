import React, { useEffect, useRef, useState } from 'react';
import { CloudRain, RefreshCw, Thermometer, Wind, WifiOff } from 'lucide-react';
import { Route } from '../lib/db';
import {
    RouteWeatherTimeline,
    defaultStartTimestamp,
    describeWeather,
    getRouteWeather,
    getStoredStart,
    maxStartTimestamp,
    weatherStartKey,
} from '../lib/routeWeather';
import { formatDate, formatDuration, formatInteger, formatTimeOfDay } from '../lib/format';

function pad(value: number) {
    return String(value).padStart(2, '0');
}

function toLocalInput(timestamp: number) {
    const d = new Date(timestamp);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function RouteWeatherPanel({ route, etaMinutes }: { route: Route; etaMinutes: number }) {
    const [start, setStart] = useState(() => getStoredStart(route.id));
    const [timeline, setTimeline] = useState<RouteWeatherTimeline | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [reloadKey, setReloadKey] = useState(0);
    const forceRef = useRef(false);
    const chartRef = useRef<HTMLDivElement | null>(null);
    const [chartContainerWidth, setChartContainerWidth] = useState(320);

    useEffect(() => {
        const container = chartRef.current;
        if (!container) return;
        const observer = new ResizeObserver(() => setChartContainerWidth(container.clientWidth));
        observer.observe(container);
        return () => observer.disconnect();
    }, [timeline]);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        const force = forceRef.current;
        forceRef.current = false;
        getRouteWeather(route, etaMinutes, start, force)
            .then((result) => {
                if (!cancelled) setTimeline(result);
            })
            .catch((e: unknown) => {
                if (cancelled) return;
                const reason = e instanceof Error ? e.message : String(e);
                setError(`No se pudo obtener la previsión (${reason}). Comprueba la conexión e inténtalo de nuevo.`);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [route, etaMinutes, start, reloadKey]);

    const changeStart = (value: string) => {
        const timestamp = new Date(value).getTime();
        if (!Number.isFinite(timestamp)) return;
        const clamped = Math.min(Math.max(timestamp, Date.now() - 3_600_000), maxStartTimestamp());
        try {
            localStorage.setItem(weatherStartKey(route.id), String(clamped));
        } catch { /* no crítico */ }
        setStart(clamped);
    };

    const refresh = () => {
        forceRef.current = true;
        setReloadKey((value) => value + 1);
    };

    const hours = (timeline?.samples[0]?.hourly.time ?? []).map((time, index) => ({
        time,
        temperature: timeline!.samples.reduce((sum, sample) => sum + sample.hourly.temperature[index], 0) / timeline!.samples.length,
        rain: Math.max(...timeline!.samples.map((sample) => sample.hourly.precipitationProbability[index] ?? 0)),
    }));
    const chartWidth = Math.max(320, chartContainerWidth, hours.length * 64 + 80);
    const minimum = Math.floor(Math.min(...hours.map((hour) => hour.temperature), 0) / 5) * 5;
    const maximum = Math.max(minimum + 5, Math.ceil(Math.max(...hours.map((hour) => hour.temperature), 5) / 5) * 5);
    const hourX = (index: number) => 44 + ((index + 0.5) / Math.max(1, hours.length)) * (chartWidth - 88);
    const temperatureY = (value: number) => 32 + (1 - (value - minimum) / (maximum - minimum)) * 144;
    const minInput = toLocalInput(defaultStartTimestamp() - 3_600_000);
    const maxInput = toLocalInput(maxStartTimestamp());
    const end = start + etaMinutes * 60_000;

    return (
        <section className="bg-surface border border-line rounded-2xl p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Meteorología en ruta</h2>
                <button
                    onClick={refresh}
                    disabled={loading}
                    className="touch-target grid place-items-center text-ink-soft disabled:opacity-50"
                    aria-label="Actualizar previsión"
                >
                    <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-1">
                <label className="text-xs text-ink-faint" htmlFor="weather-start">Salida</label>
                <input
                    id="weather-start"
                    type="datetime-local"
                    step={3600}
                    min={minInput}
                    max={maxInput}
                    value={toLocalInput(start)}
                    onChange={(e) => changeStart(e.target.value)}
                    className="h-10 px-2 rounded-xl border border-line bg-surface text-sm"
                />
                <button
                    onClick={() => {
                        try { localStorage.removeItem(weatherStartKey(route.id)); } catch { /* no crítico */ }
                        setStart(defaultStartTimestamp());
                    }}
                    className="h-10 px-3 rounded-xl border border-line text-sm text-ink"
                >
                    Ahora
                </button>
            </div>
            <p className="text-xs text-ink-soft mb-3">
                Próximas {formatDuration(etaMinutes)} (duración estimada): {formatDate(start)} {formatTimeOfDay(start)} → {formatTimeOfDay(end)}
            </p>

            {loading && !timeline && <div className="h-24 rounded-xl bg-surface-soft animate-pulse" />}

            {error && (
                <div className="flex gap-3 text-sm text-ink-soft mb-3">
                    <WifiOff size={18} className="shrink-0 text-ink-faint" />
                    <p>{error}</p>
                </div>
            )}

            {timeline && (
                <>
                    <div ref={chartRef} className="overflow-x-auto bg-canvas rounded-lg mb-3" tabIndex={0} role="region" aria-label="Previsión meteorológica por horas">
                        <svg width={chartWidth} height={230} className="block max-w-none" role="img" aria-label="Temperatura media en grados Celsius y probabilidad máxima de lluvia en porcentaje por hora">
                            <text x={12} y={18} fontSize={11} fill="#b45309">°C</text>
                            <text x={chartWidth - 12} y={18} textAnchor="end" fontSize={11} fill="#2563eb">%</text>
                            {[0, 1, 2, 3, 4].map((tick) => {
                                const y = 32 + tick * 36;
                                return (
                                    <g key={tick} fontSize={10} fill="currentColor" className="text-ink-faint">
                                        <line x1={44} x2={chartWidth - 44} y1={y} y2={y} stroke="currentColor" opacity={0.15} />
                                        <text x={36} y={y + 4} textAnchor="end">{formatInteger(maximum - tick * (maximum - minimum) / 4)}</text>
                                        <text x={chartWidth - 36} y={y + 4}>{100 - tick * 25}</text>
                                    </g>
                                );
                            })}
                            {hours.map((hour, index) => (
                                <g key={hour.time} fontSize={10} textAnchor="middle">
                                    <rect x={hourX(index) - 12} y={176 - hour.rain / 100 * 144} width={24} height={hour.rain / 100 * 144} fill="#3b82f6" opacity={0.4} rx={2}>
                                        <title>{formatDate(hour.time)} {formatTimeOfDay(hour.time)}: {formatInteger(hour.rain)} %</title>
                                    </rect>
                                    <text x={hourX(index)} y={193} fill="#2563eb">{formatInteger(hour.rain)} %</text>
                                    <text x={hourX(index)} y={211} fill="currentColor">{formatTimeOfDay(hour.time)}</text>
                                    {(index === 0 || new Date(hour.time).getDate() !== new Date(hours[index - 1].time).getDate()) && (
                                        <text x={hourX(index)} y={225} fontSize={9} fill="currentColor">{formatDate(hour.time)}</text>
                                    )}
                                </g>
                            ))}
                            <polyline points={hours.map((hour, index) => `${hourX(index)},${temperatureY(hour.temperature)}`).join(' ')} fill="none" stroke="#b45309" strokeWidth={2.5} strokeLinejoin="round" />
                            {hours.map((hour, index) => (
                                <g key={hour.time}>
                                    <circle cx={hourX(index)} cy={temperatureY(hour.temperature)} r={3} fill="#b45309" />
                                    <text x={hourX(index)} y={temperatureY(hour.temperature) - 10} textAnchor="middle" fontSize={11} fill="#b45309">{formatInteger(hour.temperature)}°</text>
                                </g>
                            ))}
                        </svg>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mb-3 text-[11px] text-ink-soft">
                        <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-amber-700" /> Temperatura media (°C)</span>
                        <span className="flex items-center gap-1">
                            <span className="inline-block w-3 h-2 bg-blue-500/40" /> Prob. máxima de lluvia (%)
                        </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        {timeline.samples.map((sample) => {
                            const weather = describeWeather(sample.weatherCode);
                            return (
                                <article key={sample.label} className="bg-canvas border border-line rounded-xl p-3 min-w-0">
                                    <p className="text-[10px] uppercase tracking-wide text-ink-faint truncate">{sample.label}</p>
                                    <p className="text-xs text-ink-soft tabular mt-0.5">{formatTimeOfDay(sample.arrivalTime)}</p>
                                    <p className="text-sm mt-1.5">{weather.icon} <span className="text-xs text-ink-soft">{weather.text}</span></p>
                                    <p className="flex items-center gap-1.5 mt-1.5 text-ink font-semibold tabular">
                                        <Thermometer size={15} className="text-clay" />
                                        {formatInteger(sample.temperature)} °C
                                    </p>
                                    <p className="flex items-center gap-1.5 mt-1.5 text-xs text-ink-soft tabular">
                                        <CloudRain size={14} />
                                        {formatInteger(sample.precipitationProbability)} %
                                    </p>
                                    <p className="flex items-center gap-1.5 mt-1 text-xs text-ink-soft tabular">
                                        <Wind size={14} />
                                        {formatInteger(sample.windSpeed)} km/h
                                    </p>
                                </article>
                            );
                        })}
                    </div>
                    <p className="text-[11px] text-ink-faint mt-3">
                        Open-Meteo · {timeline.fromCache ? 'Previsión guardada en el dispositivo' : 'Actualizado ahora'}
                    </p>
                </>
            )}
        </section>
    );
}
