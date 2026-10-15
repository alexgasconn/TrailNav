import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowLeftRight, Car, Map as MapIcon, Navigation2, TrendingDown, TrendingUp } from 'lucide-react';
import { Route, getSettings, saveRoute } from '../lib/db';
import { reverseRoute } from '../lib/reverseRoute';
import { Screen } from '../App';
import { TerrainSegment, analyzeRoute } from '../lib/routeAnalysis';
import { getRouteProfile } from '../lib/routeProfile';
import { getRoutePoints } from '../lib/routePoints';
import { DEFAULT_HIKER, FITNESS_LABELS, HikerProfile, PACE_LABELS, estimateRouteTime } from '../lib/eta';
import { RouteWeatherPanel } from '../components/RouteWeatherPanel';
import ProfileChart from '../components/ProfileChart';
import { formatDistance, formatDuration, formatElevation, formatSlope } from '../lib/format';
import { useNavigationSession } from '../state/navigationSession';

export function RouteAnalysisScreen({ route, onNavigate }: { route: Route; onNavigate: (s: Screen, r?: Route) => void }) {
    const session = useNavigationSession();
    const profile = useMemo(() => getRouteProfile(route), [route]);
    const analysis = useMemo(() => analyzeRoute(route), [route]);
    const points = useMemo(() => getRoutePoints(route), [route]);
    const [hiker, setHiker] = useState<HikerProfile>(DEFAULT_HIKER);
    useEffect(() => {
        getSettings().then((s) => setHiker({ fitness: s.fitness, pace: s.pace, packWeight: s.packWeight, includeBreaks: s.includeBreaks }));
    }, []);
    const eta = useMemo(() => estimateRouteTime(profile, hiker), [profile, hiker]);

    // Profile chart is rendered by ProfileChart component below

    const isActiveRoute = session.status !== 'idle' && session.route?.id === route.id;
    const [showFill, setShowFill] = useState(true);
    const [showPOI, setShowPOI] = useState(true);
    const [showSegs, setShowSegs] = useState(true);
    const [confirmReverse, setConfirmReverse] = useState(false);
    const [reversing, setReversing] = useState(false);
    const [reverseError, setReverseError] = useState<string | null>(null);

    const startPoint = profile.coordinates[0];
    const directionsUrl = startPoint
        ? `https://www.google.com/maps/dir/?api=1&destination=${startPoint[1]},${startPoint[0]}&travelmode=driving`
        : null;

    const handleReverse = async () => {
        if (reversing) return;
        setReversing(true);
        setReverseError(null);
        try {
            const reversed = reverseRoute(route);
            await saveRoute(reversed);
            if (isActiveRoute) session.stopSession();
            setConfirmReverse(false);
            onNavigate('analysis', reversed);
        } catch {
            setReverseError('No se pudo invertir la ruta. Inténtalo de nuevo.');
        } finally {
            setReversing(false);
        }
    };

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
                    <button
                        onClick={() => isActiveRoute ? setConfirmReverse(true) : void handleReverse()}
                        disabled={reversing}
                        className="h-12 rounded-xl border border-line bg-surface text-ink text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                        title="Invertir el sentido de la ruta"
                    >
                        <ArrowLeftRight size={18} />
                        {reversing ? 'Invirtiendo...' : route.reversed ? 'Sentido original' : 'Invertir sentido'}
                    </button>
                    {directionsUrl && (
                        <a
                            href={directionsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="h-12 rounded-xl border border-line bg-surface text-ink text-sm font-semibold flex items-center justify-center gap-2"
                        >
                            <Car size={18} />
                            Cómo llegar al inicio
                        </a>
                    )}
                </section>

                {reverseError && <p role="alert" className="text-sm text-alert">{reverseError}</p>}
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
                    <div className="flex items-baseline justify-between mb-3 gap-3">
                        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Tiempo por método</h2>
                        <span className="text-xs text-ink-faint">
                            {FITNESS_LABELS[hiker.fitness]} · {PACE_LABELS[hiker.pace]}{hiker.includeBreaks ? ' · con descansos' : ''}
                        </span>
                    </div>
                    <ul className="divide-y divide-line">
                        {eta.estimates.map((estimate) => (
                            <li key={estimate.name} className="flex justify-between py-2 text-sm">
                                <span className="text-ink-soft">{estimate.name}</span>
                                <span className="text-ink font-medium tabular">{formatDuration(estimate.minutes)}</span>
                            </li>
                        ))}
                    </ul>
                    <p className="text-[11px] text-ink-faint mt-2">
                        Estimación: {eta.aggregate === 'median' ? 'mediana (los m\u00e9todos difieren)' : 'media (los m\u00e9todos coinciden)'}. Ajusta tu perfil en Ajustes.
                    </p>
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
                        <div>
                            <div className="flex items-center gap-3 mb-3">
                                <label className="flex items-center gap-2 text-xs text-ink-faint">
                                    <input type="checkbox" className="form-checkbox" checked={showFill} onChange={(e) => setShowFill(e.currentTarget.checked)} />
                                    <span>Relleno por pendiente</span>
                                </label>
                                <label className="flex items-center gap-2 text-xs text-ink-faint">
                                    <input type="checkbox" className="form-checkbox" checked={showPOI} onChange={(e) => setShowPOI(e.currentTarget.checked)} />
                                    <span>Puntos de interés</span>
                                </label>
                                <label className="flex items-center gap-2 text-xs text-ink-faint">
                                    <input type="checkbox" className="form-checkbox" checked={showSegs} onChange={(e) => setShowSegs(e.currentTarget.checked)} />
                                    <span>Subidas / Bajadas</span>
                                </label>
                            </div>
                            <ProfileChart profile={profile} height={160} analysis={analysis} points={points} showColoredFill={showFill} showPoints={showPOI} showSegments={showSegs} />
                        </div>
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

            {confirmReverse && (
                <div className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-4">
                    <div role="dialog" aria-modal="true" aria-labelledby="reverse-title" className="w-full max-w-sm bg-surface border border-line rounded-lg p-5">
                        <h2 id="reverse-title" className="text-base font-semibold">¿Finalizar e invertir la ruta?</h2>
                        <p className="text-sm text-ink-soft mt-3">La navegación actual finalizará. La próxima navegación comenzará desde el extremo contrario.</p>
                        {reverseError && <p role="alert" className="text-sm text-alert mt-3">{reverseError}</p>}
                        <div className="flex flex-wrap gap-2 mt-5">
                            <button onClick={() => setConfirmReverse(false)} disabled={reversing} className="flex-1 min-h-12 px-3 rounded-lg border border-line disabled:opacity-50">Cancelar</button>
                            <button onClick={handleReverse} disabled={reversing} className="flex-1 min-h-12 px-3 rounded-lg bg-moss text-white disabled:opacity-50">{reversing ? 'Invirtiendo...' : 'Finalizar e invertir'}</button>
                        </div>
                    </div>
                </div>
            )}

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
