import React, { useEffect, useState } from 'react';
import { CloudRain, RefreshCw, Thermometer, Wind, WifiOff } from 'lucide-react';
import { Route } from '../lib/db';
import { getRouteWeather, RouteWeatherTimeline } from '../lib/weather';

export function RouteWeatherPanel({ route, etaMinutes }: { route: Route; etaMinutes: number }) {
    const [timeline, setTimeline] = useState<RouteWeatherTimeline | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadWeather = (forceRefresh = false) => {
        setLoading(true);
        setError(null);
        getRouteWeather(route, etaMinutes, forceRefresh)
            .then(setTimeline)
            .catch(() => setError('No se pudo descargar la prevision. Conecta el dispositivo e intentalo de nuevo.'))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        loadWeather();
    }, [route.id, etaMinutes]);

    return (
        <section id="weather" className="border-y border-zinc-800 py-5 scroll-mt-20">
            <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                    <p className="text-xs uppercase tracking-wider text-sky-400 font-semibold">Meteo en ruta</p>
                    <h2 className="text-xl font-bold text-zinc-100 mt-1">Donde estaras, cuando llegaras</h2>
                </div>
                <button onClick={() => loadWeather(true)} disabled={loading} className="p-2.5 bg-zinc-800 text-zinc-300 rounded-lg disabled:opacity-50" aria-label="Actualizar meteorologia">
                    <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            {loading && !timeline && <div className="h-28 rounded-xl bg-zinc-900 animate-pulse" />}
            {error && !timeline && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex gap-3 text-sm text-zinc-400">
                    <WifiOff size={20} className="shrink-0 text-zinc-500" /> {error}
                </div>
            )}
            {timeline && (
                <>
                    <div className="grid grid-cols-3 gap-2">
                        {timeline.samples.map((sample) => (
                            <article key={sample.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 min-w-0">
                                <p className="text-[10px] uppercase tracking-wide text-zinc-500 truncate">{sample.label}</p>
                                <p className="text-xs text-zinc-400 mt-1">{new Date(sample.arrivalTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                <div className="flex items-center gap-1.5 mt-3 text-zinc-100 font-bold"><Thermometer size={15} className="text-amber-400" />{sample.temperature} C</div>
                                <div className="flex items-center gap-1.5 mt-2 text-xs text-sky-300"><CloudRain size={14} />{sample.precipitationProbability}%</div>
                                <div className="flex items-center gap-1.5 mt-1 text-xs text-zinc-400"><Wind size={14} />{sample.windSpeed} km/h</div>
                            </article>
                        ))}
                    </div>
                    <p className="text-[11px] text-zinc-600 mt-3">Open-Meteo · {timeline.fromCache ? 'Prevision guardada offline' : 'Actualizado ahora'}</p>
                </>
            )}
        </section>
    );
}
