import React, { useEffect, useRef, useState } from 'react';
import { CloudRain, RefreshCw, Thermometer, Wind, WifiOff } from 'lucide-react';
import { Route } from '../lib/db';
import { getRouteWeather, RouteWeatherTimeline } from '../lib/weather';
import { formatInteger, formatTimeOfDay } from '../lib/format';

const ERROR_MESSAGE = 'Sin previsión disponible. Conecta el dispositivo para descargarla.';

export function RouteWeatherPanel({ route, etaMinutes }: { route: Route; etaMinutes: number }) {
    const [timeline, setTimeline] = useState<RouteWeatherTimeline | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [startDate, setStartDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
    const [startTime, setStartTime] = useState<string>(() => new Date().toTimeString().slice(0, 5));
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [visible, setVisible] = useState<Record<string, boolean>>({});
    const [hours, setHours] = useState<number>(48);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        const startTimestamp = Date.parse(`${startDate}T${startTime}`);
        getRouteWeather(route, etaMinutes, startTimestamp)
            .then((result) => {
                if (!cancelled) {
                    setTimeline(result);
                    const vis: Record<string, boolean> = {};
                    result.samples.forEach((s) => (vis[s.label] = true));
                    setVisible(vis);
                }
            })
            .catch(() => {
                if (!cancelled) setError(ERROR_MESSAGE);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [route.id, etaMinutes, startDate, startTime]);

    const refresh = () => {
        setLoading(true);
        setError(null);
        const startTimestamp = Date.parse(`${startDate}T${startTime}`);
        getRouteWeather(route, etaMinutes, startTimestamp, true)
            .then((result) => {
                setTimeline(result);
                const vis: Record<string, boolean> = {};
                result.samples.forEach((s) => (vis[s.label] = true));
                setVisible(vis);
            })
            .catch(() => setError(ERROR_MESSAGE))
            .finally(() => setLoading(false));
    };

    const exportTimeline = () => {
        if (!timeline) return;
        const blob = new Blob([JSON.stringify(timeline, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `trailnav-weather-${route.id}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // draw simple chart of temperature and precipitation using hourly arrays
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !timeline) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // gather hourly series from samples (overlay multiple samples if available)
        const series = timeline.samples.map((s) => s.hourly).filter(Boolean) as NonNullable<typeof timeline.samples[0]['hourly']>[];
        if (series.length === 0) return;

        const width = canvas.clientWidth;
        const height = 140;
        const ratio = window.devicePixelRatio || 1;
        canvas.width = Math.floor(width * ratio);
        canvas.height = Math.floor(height * ratio);
        ctx.scale(ratio, ratio);
        ctx.clearRect(0, 0, width, height);

        // full time range across series
        let t0 = Infinity;
        let t1 = -Infinity;
        series.forEach((s) => {
            if (s.time.length > 0) {
                t0 = Math.min(t0, s.time[0]);
                t1 = Math.max(t1, s.time[s.time.length - 1]);
            }
        });

        const startTimestamp = Date.parse(`${startDate}T${startTime}`);
        const clipEnd = startTimestamp + hours * 3600000;
        // clamp to requested hours window
        t0 = Math.max(t0, startTimestamp);
        t1 = Math.min(t1, clipEnd);
        if (t0 >= t1) return;

        // temperature range
        let tmin = Infinity;
        let tmax = -Infinity;
        let pmax = 0;
        series.forEach((s) => {
            s.temperature.forEach((v) => { if (v < tmin) tmin = v; if (v > tmax) tmax = v; });
            s.precipitationProbability.forEach((v) => { if (v > pmax) pmax = v; });
        });
        if (!isFinite(tmin)) { tmin = 0; tmax = 30; }

        const padding = 28;

        const toX = (t: number) => padding + ((t - t0) / (t1 - t0)) * (width - padding * 2);
        const toYTemp = (temp: number) => padding + (1 - (temp - tmin) / Math.max(1, tmax - tmin)) * (height - padding * 2);
        const precipBarHeight = 40;

        // draw precipitation bars for visible series (overlay, light)
        const colors = ['#ef4444', '#f59e0b', '#10b981'];
        series.forEach((s, si) => {
            const label = timeline.samples[si]?.label ?? String(si);
            if (!visible[label]) return;
            ctx.fillStyle = 'rgba(59,130,246,0.12)';
            const filtered = s.time.map((t, i) => ({ t, p: s.precipitationProbability[i] })).filter(({ t }) => t >= t0 && t <= t1);
            const barW = Math.max(2, (width - padding * 2) / Math.max(1, filtered.length) - 2);
            filtered.forEach((pt) => {
                const x = toX(pt.t);
                const h = (pt.p / Math.max(1, pmax)) * precipBarHeight;
                ctx.fillRect(x - barW / 2, height - padding - h, barW, h);
            });
        });

        // draw temperature lines (one per series, first highlighted)
        series.forEach((s, si) => {
            const label = timeline.samples[si]?.label ?? String(si);
            if (!visible[label]) return;
            ctx.beginPath();
            const filtered = s.time.map((t, i) => ({ t, temp: s.temperature[i] })).filter(({ t }) => t >= t0 && t <= t1);
            filtered.forEach((pt, i) => {
                const x = toX(pt.t);
                const y = toYTemp(pt.temp);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.strokeStyle = colors[si % colors.length];
            ctx.lineWidth = si === 0 ? 2 : 1;
            ctx.stroke();
        });

        // axes labels
        ctx.fillStyle = 'rgba(17,24,39,0.8)';
        ctx.font = '11px system-ui, -apple-system, Segoe UI, Roboto';
        ctx.fillText(`${Math.round(tmin)}°C`, 6, toYTemp(tmin));
        ctx.fillText(`${Math.round(tmax)}°C`, 6, toYTemp(tmax));
        ctx.fillText(`Pluv. % (max ${Math.round(pmax)}%)`, width - 120, height - padding + 12);
    }, [timeline]);

    return (
        <section className="bg-surface border border-line rounded-2xl p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Meteorología en ruta</h2>
                <div className="flex items-center gap-2">
                    <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="h-8 px-2 rounded-xl border border-line bg-surface text-sm"
                        aria-label="Fecha de inicio"
                    />
                    <input
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="h-8 px-2 rounded-xl border border-line bg-surface text-sm"
                        aria-label="Hora de inicio"
                    />
                    <button
                        onClick={refresh}
                        disabled={loading}
                        className="touch-target grid place-items-center text-ink-soft disabled:opacity-50"
                        aria-label="Actualizar previsión"
                    >
                        <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {loading && !timeline && <div className="h-24 rounded-xl bg-surface-soft animate-pulse" />}

            {error && !timeline && (
                <div className="flex gap-3 text-sm text-ink-soft">
                    <WifiOff size={18} className="shrink-0 text-ink-faint" />
                    <p>{error}</p>
                </div>
            )}

            {timeline && (
                <>
                    <div className="mb-3">
                        <canvas ref={canvasRef} className="w-full rounded-xl bg-canvas" style={{ height: 140 }} />
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                        <div className="flex gap-1">
                            {timeline.samples.map((s) => (
                                <button
                                    key={s.label}
                                    onClick={() => setVisible((v) => ({ ...v, [s.label]: !v[s.label] }))}
                                    className={`px-2 py-1 rounded-md text-sm border ${visible[s.label] ? 'bg-moss text-white border-moss' : 'bg-surface border-line text-ink'}`}
                                >
                                    {s.label}
                                </button>
                            ))}
                        </div>

                        <div className="ml-auto flex items-center gap-2">
                            <label className="text-xs text-ink-faint">Horas</label>
                            <input type="number" value={hours} onChange={(e) => setHours(Number(e.target.value) || 1)} className="w-20 h-8 px-2 rounded-xl border border-line bg-surface text-sm" />
                            <button onClick={exportTimeline} className="h-8 px-3 rounded-xl bg-surface border border-line text-ink text-sm">Guardar</button>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                        {timeline.samples.map((sample) => (
                            <article key={sample.label} className="bg-canvas border border-line rounded-xl p-3 min-w-0">
                                <p className="text-[10px] uppercase tracking-wide text-ink-faint truncate">{sample.label}</p>
                                <p className="text-xs text-ink-soft tabular mt-0.5">{formatTimeOfDay(sample.arrivalTime)}</p>
                                <p className="flex items-center gap-1.5 mt-2 text-ink font-semibold tabular">
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
                        ))}
                    </div>
                    <p className="text-[11px] text-ink-faint mt-3">
                        Open-Meteo · {timeline.fromCache ? 'Previsión guardada en el dispositivo' : 'Actualizado ahora'}
                    </p>
                </>
            )}
        </section>
    );
}
