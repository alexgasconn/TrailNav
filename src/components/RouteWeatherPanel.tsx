import React, { useEffect, useState } from 'react';
import { CloudRain, RefreshCw, Thermometer, Wind, WifiOff } from 'lucide-react';
import { Route } from '../lib/db';
import { getRouteWeather, RouteWeatherTimeline } from '../lib/weather';
import { formatInteger, formatTimeOfDay } from '../lib/format';

const ERROR_MESSAGE = 'Sin previsión disponible. Conecta el dispositivo para descargarla.';

export function RouteWeatherPanel({ route, etaMinutes }: { route: Route; etaMinutes: number }) {
    const [timeline, setTimeline] = useState<RouteWeatherTimeline | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        getRouteWeather(route, etaMinutes)
            .then((result) => {
                if (!cancelled) setTimeline(result);
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
    }, [route.id, etaMinutes]);

    const refresh = () => {
        setLoading(true);
        setError(null);
        getRouteWeather(route, etaMinutes, true)
            .then(setTimeline)
            .catch(() => setError(ERROR_MESSAGE))
            .finally(() => setLoading(false));
    };

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

            {loading && !timeline && <div className="h-24 rounded-xl bg-surface-soft animate-pulse" />}

            {error && !timeline && (
                <div className="flex gap-3 text-sm text-ink-soft">
                    <WifiOff size={18} className="shrink-0 text-ink-faint" />
                    <p>{error}</p>
                </div>
            )}

            {timeline && (
                <>
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
