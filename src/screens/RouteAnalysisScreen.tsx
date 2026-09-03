import React, { useEffect, useMemo, useRef } from 'react';
import { ArrowLeft, Map as MapIcon, Navigation2, TrendingDown, TrendingUp } from 'lucide-react';
import { Route } from '../lib/db';
import { Screen } from '../App';
import { TerrainSegment, analyzeRoute } from '../lib/routeAnalysis';
import { getRouteProfile } from '../lib/routeProfile';
import { getRoutePoints } from '../lib/routePoints';
import { estimateRouteTime } from '../lib/eta';
import { RouteWeatherPanel } from '../components/RouteWeatherPanel';
import { formatDistance, formatDuration, formatElevation, formatSlope } from '../lib/format';
import { useNavigationSession } from '../state/navigationSession';

export function RouteAnalysisScreen({ route, onNavigate }: { route: Route; onNavigate: (s: Screen, r?: Route) => void }) {
    const session = useNavigationSession();
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const profile = useMemo(() => getRouteProfile(route), [route]);
    const analysis = useMemo(() => analyzeRoute(route), [route]);
    const points = useMemo(() => getRoutePoints(route), [route]);
    const eta = useMemo(
        () => estimateRouteTime(profile.totalDistance || route.distance, analysis),
        [profile, analysis, route.distance]
    );

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !profile.hasElevation) return;

        const ratio = window.devicePixelRatio || 1;
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        canvas.width = width * ratio;
        canvas.height = height * ratio;

        const context = canvas.getContext('2d');
        if (!context) return;
        context.scale(ratio, ratio);
        context.clearRect(0, 0, width, height);

        const range = profile.maxElevation - profile.minElevation || 1;
        const padding = 10;
        const usableHeight = height - padding * 2;

        const toX = (distance: number) => (distance / (profile.totalDistance || 1)) * width;
        const toY = (elevation: number) => height - padding - ((elevation - profile.minElevation) / range) * usableHeight;

        // Un punto por píxel evita recorrer decenas de miles de vértices.
        const step = Math.max(1, Math.floor(profile.coordinates.length / width));

        context.beginPath();
        context.moveTo(0, height);
        for (let i = 0; i < profile.coordinates.length; i += step) {
            context.lineTo(toX(profile.cumulativeDistance[i]), toY(profile.elevation[i]));
        }
        context.lineTo(width, height);
        context.closePath();

        const gradient = context.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, 'rgba(63, 107, 82, 0.35)');
        gradient.addColorStop(1, 'rgba(63, 107, 82, 0.03)');
        context.fillStyle = gradient;
        context.fill();

        context.beginPath();
        for (let i = 0; i < profile.coordinates.length; i += step) {
            const x = toX(profile.cumulativeDistance[i]);
            const y = toY(profile.elevation[i]);
            if (i === 0) context.moveTo(x, y);
            else context.lineTo(x, y);
        }
        context.strokeStyle = '#3f6b52';
        context.lineWidth = 1.75;
        context.stroke();
    }, [profile]);

    const isActiveRoute = session.status !== 'idle' && session.route?.id === route.id;

    return (
        <div className="flex flex-col min-h-full bg-canvas">
            <header className="pt-safe sticky top-0 z-10 bg-canvas/95 backdrop-blur border-b border-line">
                <div className="flex items-center gap-2 px-2 py-3">
                    <button onClick={() => onNavigate('home')} className="touch-target grid place-items-center text-ink" aria-label="Volver">
                        <ArrowLeft size={22} />
                    </button>
                    <h1 className="text-base font-semibold text-ink truncate flex-1">{route.name}</h1>
                </div>
            </header>

            <div className="px-4 py-4 space-y-5">
                <section className="grid grid-cols-2 gap-3">
                    <StatCard label="Distancia" value={formatDistance(profile.totalDistance || route.distance)} />
                    <StatCard
                        label="Tiempo estimado"
                        value={formatDuration(eta.minutes)}
                        hint={`${formatDuration(eta.range[0])} – ${formatDuration(eta.range[1])}`}
                    />
                    <StatCard label="Desnivel positivo" value={formatElevation(profile.totalAscent)} tone="accent" />
                    <StatCard label="Desnivel negativo" value={formatElevation(profile.totalDescent)} />
                    <StatCard label="Altitud máxima" value={profile.hasElevation ? formatElevation(profile.maxElevation) : 'Sin datos'} />
                    <StatCard label="Altitud mínima" value={profile.hasElevation ? formatElevation(profile.minElevation) : 'Sin datos'} />
                </section>

                <section className="bg-surface border border-line rounded-2xl p-4">
                    <div className="flex items-baseline justify-between mb-3">
                        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Perfil de elevación</h2>
                        {profile.hasElevation && (
                            <span className="text-xs text-ink-faint tabular">
                                {formatElevation(profile.minElevation)} – {formatElevation(profile.maxElevation)}
                            </span>
                        )}
                    </div>
                    {profile.hasElevation ? (
                        <canvas ref={canvasRef} className="w-full h-40 block" />
                    ) : (
                        <p className="text-sm text-ink-soft py-6 text-center">
                            Este archivo GPX no incluye datos de altitud, por lo que no se puede calcular el desnivel.
                        </p>
                    )}
                </section>

                <section>
                    <div className="flex items-baseline justify-between mb-2">
                        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Subidas y bajadas</h2>
                        <span className="text-xs text-ink-faint tabular">{analysis.segments.length}</span>
                    </div>

                    {analysis.segments.length === 0 ? (
                        <p className="bg-surface border border-line rounded-2xl p-4 text-sm text-ink-soft">
                            No se han detectado tramos con desnivel significativo en esta traza.
                        </p>
                    ) : (
                        <ul className="space-y-2">
                            {analysis.segments.map((segment, index) => (
                                <SegmentRow key={`${segment.trend}-${Math.round(segment.startDistance)}`} segment={segment} index={index} />
                            ))}
                        </ul>
                    )}
                </section>

                <section>
                    <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint mb-2">Puntos de la ruta</h2>
                    <ul className="bg-surface border border-line rounded-2xl divide-y divide-line">
                        {points.map((point) => (
                            <li key={point.id} className="flex items-center gap-3 px-4 py-3">
                                <span className="w-16 shrink-0 text-xs text-ink-faint tabular">{formatDistance(point.distance)}</span>
                                <span className="flex-1 min-w-0">
                                    <span className="block text-sm text-ink truncate">{point.name}</span>
                                    {point.detail && <span className="block text-xs text-ink-faint truncate">{point.detail}</span>}
                                </span>
                                {point.elevation != null && (
                                    <span className="text-xs text-ink-soft tabular shrink-0">{formatElevation(point.elevation)}</span>
                                )}
                            </li>
                        ))}
                    </ul>
                </section>

                <RouteWeatherPanel route={route} etaMinutes={eta.minutes} />
            </div>

            <div className="sticky bottom-0 mt-auto bg-surface border-t border-line px-4 py-3 flex gap-2">
                <button
                    onClick={() => onNavigate('map', route)}
                    className="flex-1 h-14 rounded-xl border border-line text-ink font-semibold flex items-center justify-center gap-2"
                >
                    <MapIcon size={20} />
                    Mapa
                </button>
                <button
                    onClick={() => onNavigate('navigation', route)}
                    className="flex-1 h-14 rounded-xl bg-moss text-white font-semibold flex items-center justify-center gap-2"
                >
                    <Navigation2 size={20} />
                    {isActiveRoute ? 'Continuar' : 'Navegar'}
                </button>
            </div>
        </div>
    );
}

function StatCard({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'accent' }) {
    return (
        <div className="bg-surface border border-line rounded-2xl p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{label}</p>
            <p className={`text-xl font-semibold tabular mt-1 ${tone === 'accent' ? 'text-moss' : 'text-ink'}`}>{value}</p>
            {hint && <p className="text-xs text-ink-faint mt-1 tabular">{hint}</p>}
        </div>
    );
}

function SegmentRow({ segment, index }: { segment: TerrainSegment; index: number }) {
    const isAscent = segment.trend === 'ascent';
    return (
        <li className="bg-surface border border-line rounded-2xl p-4 flex items-start gap-3">
            <span
                className={`grid place-items-center w-10 h-10 rounded-xl shrink-0 ${isAscent ? 'bg-moss-soft text-moss-strong' : 'bg-clay-soft text-clay'}`}
            >
                {isAscent ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
            </span>
            <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                    <p className="font-medium text-ink">
                        {isAscent ? 'Subida' : 'Bajada'} {index + 1}
                    </p>
                    <span className={`text-sm font-semibold tabular ${isAscent ? 'text-moss' : 'text-clay'}`}>
                        {isAscent ? '+' : '−'}
                        {Math.round(Math.abs(segment.elevationDelta))} m
                    </span>
                </div>
                <div className="flex gap-4 mt-1 text-xs text-ink-soft tabular">
                    <span>km {(segment.startDistance / 1000).toFixed(1)}</span>
                    <span>{formatDistance(segment.distance)}</span>
                    <span>{formatSlope(segment.averageSlope)} medio</span>
                </div>
            </div>
        </li>
    );
}
