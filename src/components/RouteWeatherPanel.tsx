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

const COLORS = ['#b91c1c', '#c2410c', '#a16207', '#15803d', '#1d4ed8'];

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
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

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
    }, [route.id, etaMinutes, start, reloadKey]);

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

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !timeline) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const width = canvas.clientWidth;
        const height = 150;
        const ratio = window.devicePixelRatio || 1;
        canvas.width = Math.floor(width * ratio);
        canvas.height = Math.floor(height * ratio);
        ctx.scale(ratio, ratio);
        ctx.clearRect(0, 0, width, height);

        const t0 = timeline.startTimestamp;
        const t1 = Math.max(timeline.endTimestamp, t0 + 3_600_000);
        const all = timeline.samples.flatMap((s) => s.hourly.temperature);
        const tmin = Math.floor(Math.min(...all));
        const tmax = Math.ceil(Math.max(...all));
        const left = 30;
        const bottom = 20;
        const top = 8;
        const plotW = width - left - 8;
        const plotH = height - bottom - top;
        const toX = (t: number) => left + ((t - t0) / (t1 - t0)) * plotW;
        const toY = (v: number) => top + (1 - (v - tmin) / Math.max(1, tmax - tmin)) * plotH;

        // Probabilidad de lluvia máxima entre puntos, como barras de fondo.
        const first = timeline.samples[0].hourly;
        const barW = Math.max(3, plotW / Math.max(1, first.time.length) - 3);
        first.time.forEach((t, i) => {
            const p = Math.max(...timeline.samples.map((s) => s.hourly.precipitationProbability[i] ?? 0));
            const h = (p / 100) * plotH;
            ctx.fillStyle = 'rgba(59,130,246,0.22)';
            ctx.fillRect(toX(t) - barW / 2, top + plotH - h, barW, h);
        });

        timeline.samples.forEach((sample, si) => {
            ctx.beginPath();
            sample.hourly.time.forEach((t, i) => {
                const x = toX(t);
                const y = toY(sample.hourly.temperature[i]);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.strokeStyle = COLORS[si % COLORS.length];
            ctx.lineWidth = 2;
            ctx.stroke();
        });

        ctx.fillStyle = 'rgba(87,83,78,0.9)';
        ctx.font = '10px system-ui, -apple-system, Segoe UI, Roboto';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'right';
        ctx.fillText(`${tmax}°`, left - 4, toY(tmax));
        ctx.fillText(`${tmin}°`, left - 4, toY(tmin));
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        ctx.fillText(formatTimeOfDay(t0), left, height - bottom + 5);
        ctx.textAlign = 'right';
        ctx.fillText(formatTimeOfDay(t1), width - 8, height - bottom + 5);
    }, [timeline]);

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
                    <canvas ref={canvasRef} className="w-full rounded-xl bg-canvas mb-3" style={{ height: 150 }} />
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mb-3 text-[11px] text-ink-soft">
                        {timeline.samples.map((s, i) => (
                            <span key={s.label} className="flex items-center gap-1">
                                <span className="inline-block w-3 h-0.5" style={{ background: COLORS[i % COLORS.length] }} />
                                {s.label}
                            </span>
                        ))}
                        <span className="flex items-center gap-1">
                            <span className="inline-block w-3 h-2 bg-blue-500/30" /> Prob. lluvia
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
