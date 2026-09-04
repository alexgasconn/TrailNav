import React, { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import * as turf from '@turf/turf';
import { AlertTriangle, ChevronDown, Compass, Crosshair, Flag, Pause, Play, Layers, Eye, EyeOff, Satellite } from 'lucide-react';
import { Screen } from '../App';
import { Route, getSettings, saveSettings, MapStyleId } from '../lib/db';
import { SessionMetrics, useNavigationSession } from '../state/navigationSession';
import { getRouteProfile } from '../lib/routeProfile';
import { getRoutePoints } from '../lib/routePoints';
import {
    ROUTE_DONE_SOURCE,
    addRouteLayers,
    buildMapStyle,
    createRoutePointMarker,
    createUserMarkerElement,
    setRouteAlertState,
    updateUserMarkerElement,
    MAP_STYLE_LABELS,
} from '../lib/mapStyles';
import { MetricPanels } from '../components/MetricPanels';
import {
    formatClock,
    formatDistance,
    formatElevation,
    formatPace,
    formatPercent,
    formatSignedElevation,
    formatSpeed,
    formatTimeOfDay,
} from '../lib/format';
import ProfileChart from '../components/ProfileChart';
import { sampleProfile, indexAtDistance } from '../lib/routeProfile';

export function NavigationScreen({ onNavigate }: { onNavigate: (s: Screen, r?: Route) => void }) {
    const session = useNavigationSession();

    if (!session.route || session.status === 'idle') {
        return <EmptyNavigationState hydrated={session.hydrated} onNavigate={onNavigate} />;
    }

    return <NavigationView key={session.route.id} route={session.route} onNavigate={onNavigate} />;
}

function NavigationView({ route, onNavigate }: { route: Route; onNavigate: (s: Screen, r?: Route) => void }) {
    const session = useNavigationSession();
    const { status, metrics, position, heading, course, gpsError } = session;

    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<maplibregl.Map | null>(null);
    const userMarkerRef = useRef<maplibregl.Marker | null>(null);
    const poiMarkersRef = useRef<maplibregl.Marker[]>([]);
    const lastProgressRef = useRef(-1);

    const [mapReady, setMapReady] = useState(false);
    const [mapError, setMapError] = useState<string | null>(null);
    const [initAttempt, setInitAttempt] = useState(0);
    const [following, setFollowing] = useState(true);
    const [rotateWithHeading, setRotateWithHeading] = useState(true);
    const [confirmFinish, setConfirmFinish] = useState(false);
    const [slopeWindowMeters, setSlopeWindowMeters] = useState(200);
    const [showPanels, setShowPanels] = useState(true);
    const [mapStyle, setMapStyle] = useState<MapStyleId>('topo');
    const [showMapMenu, setShowMapMenu] = useState(false);
    const mapMenuButtonRef = useRef<HTMLButtonElement | null>(null);

    // smoothing refs
    const smoothedPosRef = useRef<{ lng: number; lat: number } | null>(null);
    const smoothedHeadingRef = useRef<number | null>(null);
    const smoothedCourseRef = useRef<number | null>(null);

    const profile = useMemo(() => getRouteProfile(route), [route]);
    const routePoints = useMemo(() => getRoutePoints(route), [route]);
    const routeLine = useMemo(
        () => (profile.coordinates.length >= 2 ? turf.lineString(profile.coordinates) : null),
        [profile]
    );

    useEffect(() => {
        getSettings().then((settings) => {
            setRotateWithHeading(!settings.keepMapNorthUp);
            try {
                if (settings.mapStyle) setMapStyle(settings.mapStyle as MapStyleId);
            } catch (e) { }
        });
    }, []);

    useEffect(() => {
        if (mapRef.current || !containerRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
            const timer = window.setTimeout(() => setInitAttempt((value) => value + 1), 120);
            return () => window.clearTimeout(timer);
        }

        let cancelled = false;
        getSettings().then((settings) => {
            if (cancelled || mapRef.current || !containerRef.current) return;

            try {
                const map = new maplibregl.Map({
                    container: containerRef.current,
                    style: buildMapStyle(settings.mapStyle),
                    center: profile.coordinates[0] ?? [0, 40],
                    zoom: 15,
                    attributionControl: { compact: true },
                    trackResize: true,
                });
                mapRef.current = map;

                map.on('error', (event) => {
                    // eslint-disable-next-line no-console
                    console.error('MapLibre:', (event as any)?.error ?? event);
                    try {
                        setMapError(String((event as any)?.error ?? 'Map error'));
                    } catch (e) { }
                });
                map.on('dragstart', () => setFollowing(false));
                map.on('load', () => {
                    addRouteLayers(map, route.geoJson, { width: 6, showProgress: true });

                    routePoints
                        .filter((point) => point.kind !== 'turn')
                        .forEach((point) => {
                            const marker = new maplibregl.Marker({ element: createRoutePointMarker(point) })
                                .setLngLat(point.coordinate)
                                .setPopup(
                                    new maplibregl.Popup({ offset: 16, closeButton: false }).setText(
                                        `${point.name} · km ${(point.distance / 1000).toFixed(1)}`
                                    )
                                )
                                .addTo(map);
                            poiMarkersRef.current.push(marker);
                        });

                    userMarkerRef.current = new maplibregl.Marker({
                        element: createUserMarkerElement(),
                        rotationAlignment: 'map',
                        pitchAlignment: 'map',
                    })
                        .setLngLat(profile.coordinates[0] ?? [0, 40])
                        .addTo(map);

                    // Ensure the container has explicit full-viewport sizing to avoid
                    // parent-height collapse on some mobile browsers.
                    try {
                        if (containerRef.current) {
                            containerRef.current.style.width = '100%';
                            containerRef.current.style.minHeight = '100dvh';
                            containerRef.current.style.height = '100dvh';
                        }
                    } catch (e) { }

                    // Force a resize after load and again shortly after to ensure the canvas
                    // fills the container (fixes cases where only the lower part is visible).
                    const safeResize = () => {
                        try {
                            map.resize();
                        } catch (e) {
                            // ignore
                        }
                    };
                    safeResize();
                    const later = window.setTimeout(() => {
                        safeResize();
                        // also nudge map to redraw at the current center/zoom
                        try {
                            map.jumpTo({ center: map.getCenter(), zoom: map.getZoom() });
                        } catch (e) { }
                    }, 250);

                    setMapReady(true);
                    setMapError(null);

                    // also listen for idle as a fallback in case load timing is odd
                    try {
                        map.on('idle', () => {
                            try {
                                setMapReady(true);
                            } catch (e) { }
                        });
                    } catch (e) { }

                    // when base source finishes loading, mark ready
                    try {
                        map.on('sourcedata', (ev: any) => {
                            try {
                                if (ev.sourceId === 'base' && ev.isSourceLoaded) {
                                    try { setMapReady(true); } catch (e) { }
                                }
                            } catch (e) { }
                        });
                    } catch (e) { }

                    // Add window resize / orientation handlers to keep the canvas correct.
                    const onWindowResize = () => safeResize();
                    window.addEventListener('resize', onWindowResize);
                    window.addEventListener('orientationchange', onWindowResize);

                    // cleanup for the handlers when map is destroyed
                    map.on('remove', () => {
                        window.removeEventListener('resize', onWindowResize);
                        window.removeEventListener('orientationchange', onWindowResize);
                    });

                    // ensure we clear the timeout on unmount
                    const clearLater = () => window.clearTimeout(later);

                    // attach to local scope so cleanup in effect return can clear
                    (map as any).__trailnav_clearLater = clearLater;

                    // safety: if load doesn't fire for some reason, mark ready when canvas appears
                    try {
                        const canvasCheck = window.setTimeout(() => {
                            try {
                                const canvas = map.getContainer().querySelector('canvas');
                                if (canvas && !mapReady) {
                                    try { setMapReady(true); } catch (e) { }
                                }
                            } catch (e) { }
                        }, 1000);
                        // style load timeout for clearer diagnostics
                        const styleTimeout = window.setTimeout(() => {
                            try {
                                if (mapRef.current && !(mapRef.current as any).isStyleLoaded?.()) {
                                    try { setMapError('Style load timeout'); } catch (e) { }
                                }
                            } catch (e) { }
                        }, 10000);
                        // attach to clearLater so it gets cleared on destroy
                        const prev = (map as any).__trailnav_clearLater;
                        (map as any).__trailnav_clearLater = () => {
                            try { window.clearTimeout(canvasCheck); } catch (e) { }
                            try { window.clearTimeout(styleTimeout); } catch (e) { }
                            try { if (prev) prev(); } catch (e) { }
                        };
                    } catch (e) { }

                    // Debug overlay to help diagnose clipped map issues on mobile devices.
                    // Visible only while `window.__TRAILNAV_DEBUG_MAP` is true.
                    try {
                        if ((window as any).__TRAILNAV_DEBUG_MAP) {
                            const dbg = document.createElement('div');
                            dbg.style.position = 'fixed';
                            dbg.style.left = '8px';
                            dbg.style.top = '8px';
                            dbg.style.zIndex = '99999';
                            dbg.style.background = 'rgba(0,0,0,0.6)';
                            dbg.style.color = 'white';
                            dbg.style.padding = '6px 8px';
                            dbg.style.fontSize = '12px';
                            dbg.style.borderRadius = '8px';
                            dbg.innerText = 'map-debug';
                            document.body.appendChild(dbg);
                            const updateDbg = () => {
                                try {
                                    const crect = containerRef.current?.getBoundingClientRect();
                                    const canvas = map.getContainer().querySelector('canvas');
                                    const crectC = canvas ? canvas.getBoundingClientRect() : null;
                                    dbg.innerText = `container: ${crect?.width?.toFixed(0)}x${crect?.height?.toFixed(0)}\ncanvas: ${crectC?.width?.toFixed(0)}x${crectC?.height?.toFixed(0)}\nscrollY:${window.scrollY}`;
                                } catch (e) { }
                            };
                            updateDbg();
                            const dbgI = window.setInterval(updateDbg, 500);
                            setTimeout(() => {
                                window.clearInterval(dbgI);
                                dbg.remove();
                            }, 15000);
                        }
                    } catch (e) { }
                });

                // When style is changed dynamically, re-apply route layers after style load
                try {
                    map.on('styledata', () => {
                        try {
                            // Re-apply route layers after a style change.
                            addRouteLayers(map, route.geoJson, { width: 6, showProgress: true });
                        } catch (e) { }
                    });
                } catch (e) { }
                // close map menu if clicking outside
                try {
                    const onDocClick = (ev: MouseEvent) => {
                        if (!showMapMenu) return;
                        const btn = mapMenuButtonRef.current;
                        const tgt = ev.target as Node | null;
                        const menu = document.querySelector('[data-map-menu]');
                        // don't close if clicking the button or inside the menu
                        if (btn && tgt && (btn.contains(tgt) || (menu && menu.contains && menu.contains(tgt)))) return;
                        setShowMapMenu(false);
                    };
                    document.addEventListener('click', onDocClick);
                    map.on('remove', () => document.removeEventListener('click', onDocClick));
                } catch (e) { }
            } catch (e) {
                // eslint-disable-next-line no-console
                console.error('Map init error', e);
                try {
                    setMapError(String(e));
                } catch (e) { }
                return;
            }
        });

        return () => {
            cancelled = true;
            poiMarkersRef.current.forEach((marker) => marker.remove());
            poiMarkersRef.current = [];
            userMarkerRef.current = null;
            if (mapRef.current) {
                try {
                    const m = mapRef.current as any;
                    if (m.__trailnav_clearLater) m.__trailnav_clearLater();
                } catch (e) { }
                mapRef.current.remove();
            }
            mapRef.current = null;
            setMapReady(false);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [route.id, initAttempt]);

    // Posición, cono de brújula y flecha de desplazamiento del usuario.
    useEffect(() => {
        const map = mapRef.current;
        const marker = userMarkerRef.current;
        if (!map || !marker || !mapReady || !position) return;

        // compute distance between smoothed position and new reading
        const prev = smoothedPosRef.current;
        const newPos = { lng: position.lng, lat: position.lat };
        // convert to meters using turf (returns km)
        let movedMeters = Infinity;
        try {
            if (prev) movedMeters = turf.distance([prev.lng, prev.lat], [newPos.lng, newPos.lat], { units: 'kilometers' }) * 1000;
            else movedMeters = Infinity;
        } catch (e) {
            movedMeters = Infinity;
        }

        // derive a smoothing factor: when user is nearly stationary (low speed), increase smoothing
        const speed = (position.speed ?? 0); // m/s if provided by geo API
        const alpha = speed < 0.8 ? 0.12 : 0.55; // lower alpha -> heavier smoothing

        if (!prev) {
            smoothedPosRef.current = newPos;
        } else {
            // linear interpolation
            smoothedPosRef.current = {
                lng: prev.lng + (newPos.lng - prev.lng) * alpha,
                lat: prev.lat + (newPos.lat - prev.lat) * alpha,
            };
        }

        const sm = smoothedPosRef.current!;
        marker.setLngLat([sm.lng, sm.lat]);

        // smoothing for heading/course (angles)
        const smoothAngle = (prevA: number | null, nextA: number | null, a: number) => {
            if (nextA == null) return prevA;
            if (prevA == null) return nextA;
            // shortest delta
            let d = ((nextA - prevA + 540) % 360) - 180;
            return (prevA + d * a + 360) % 360;
        };

        smoothedHeadingRef.current = smoothAngle(smoothedHeadingRef.current, heading ?? null, 0.35);
        smoothedCourseRef.current = smoothAngle(smoothedCourseRef.current, course ?? null, 0.25);

        // choose which orientation to display: prefer heading (device) when available, otherwise course
        const displayOrient = smoothedHeadingRef.current ?? smoothedCourseRef.current ?? null;

        const metersPerPixel = (156543.03392 * Math.cos((sm.lat * Math.PI) / 180)) / 2 ** map.getZoom();
        updateUserMarkerElement(marker.getElement(), {
            heading: smoothedHeadingRef.current ?? null,
            course: smoothedCourseRef.current ?? null,
            accuracyPixels: position.accuracy != null ? position.accuracy / metersPerPixel : null,
        });

        if (following) {
            // only animate camera for meaningful movements to avoid constant micro-pans
            if (movedMeters > 1.2) {
                try {
                    map.easeTo({
                        center: [sm.lng, sm.lat],
                        bearing: rotateWithHeading ? (displayOrient ?? map.getBearing()) : 0,
                        duration: 700,
                        easing: (t) => t,
                    });
                } catch (e) { }
            }
        }
    }, [position, heading, course, following, rotateWithHeading, mapReady]);

    useEffect(() => {
        try {
            mapRef.current?.resize();
        } catch (e) { }
    }, [showPanels]);

    // Traza ya recorrida sobre la ruta.
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !mapReady || !routeLine || !metrics) return;
        if (Math.abs(metrics.distanceDone - lastProgressRef.current) < 20) return;
        lastProgressRef.current = metrics.distanceDone;

        const source = map.getSource(ROUTE_DONE_SOURCE) as maplibregl.GeoJSONSource | undefined;
        if (!source) return;

        if (metrics.distanceDone <= 10) {
            source.setData({ type: 'FeatureCollection', features: [] } as any);
            return;
        }
        source.setData(turf.lineSliceAlong(routeLine, 0, metrics.distanceDone / 1000, { units: 'kilometers' }) as any);
    }, [metrics, mapReady, routeLine]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !mapReady) return;
        setRouteAlertState(map, Boolean(metrics?.offRoute));
    }, [metrics?.offRoute, mapReady]);

    const panels = useMemo(() => buildPanels(metrics, profile, route, slopeWindowMeters, setSlopeWindowMeters), [metrics, profile, route, slopeWindowMeters]);

    return (
        <div className="w-full h-full relative overflow-hidden bg-canvas">
            <div ref={containerRef} className="absolute inset-0" />

            {/* Diagnostic box removed per user request */}

            <div className="absolute top-0 left-0 right-0 pt-safe z-20 pointer-events-none">
                <div className="flex items-center gap-2 px-3 py-3">
                    <button
                        onClick={() => onNavigate('home')}
                        className="pointer-events-auto touch-target grid place-items-center bg-surface/95 border border-line rounded-xl shadow-sm text-ink"
                        aria-label="Minimizar navegación manteniendo la sesión activa"
                    >
                        <ChevronDown size={22} />
                    </button>

                    <div className="flex-1 min-w-0 bg-surface/95 border border-line rounded-xl px-3 py-2 shadow-sm">
                        <p className="text-sm font-semibold text-ink truncate">{route.name}</p>
                        <p className="text-[11px] text-ink-faint tabular">
                            {formatDistance(metrics?.distanceDone ?? 0)} de {formatDistance(metrics?.totalDistance ?? 0)}
                        </p>
                    </div>

                    <button
                        onClick={() => setRotateWithHeading((value) => !value)}
                        className={`pointer-events-auto touch-target grid place-items-center rounded-xl border shadow-sm ${rotateWithHeading ? 'bg-moss border-moss text-white' : 'bg-surface/95 border-line text-ink'}`}
                        aria-label={rotateWithHeading ? 'Fijar el mapa al norte' : 'Rotar el mapa con la brújula'}
                    >
                        <Compass size={22} />
                    </button>
                    <button
                        onClick={() => setShowPanels((v) => !v)}
                        className={`pointer-events-auto touch-target grid place-items-center rounded-xl border shadow-sm ${showPanels ? 'bg-surface/95 border-line text-ink' : 'bg-surface/95 border-line text-ink'}`}
                        aria-label={showPanels ? 'Ocultar paneles' : 'Mostrar paneles'}
                    >
                        {showPanels ? <Eye size={22} /> : <EyeOff size={22} />}
                    </button>
                    {/* Map style cycle button */}
                    <div className="relative">
                        <button
                            ref={mapMenuButtonRef}
                            onClick={() => setShowMapMenu((v) => !v)}
                            className="pointer-events-auto touch-target grid place-items-center rounded-xl border shadow-sm bg-surface/95 border-line text-ink"
                            aria-label="Cambiar estilo de mapa"
                        >
                            <Layers size={20} />
                        </button>
                        {showMapMenu && (
                            <div data-map-menu="true" className="absolute right-0 mt-2 w-44 bg-surface border border-line rounded-xl shadow-lg z-40">
                                {(
                                    ['topo', 'carto', 'carto_voyager', 'stamen', 'stamen_toner', 'stamen_watercolor', 'esri', 'satellite'] as MapStyleId[]
                                ).map((s) => (
                                    <button
                                        key={s}
                                        onClick={async (ev) => {
                                            // prevent document click handlers from interfering
                                            try {
                                                ev.stopPropagation();
                                            } catch (e) { }
                                            setShowMapMenu(false);
                                            setMapStyle(s);
                                            try {
                                                const current = await getSettings();
                                                await saveSettings({ ...current, mapStyle: s });
                                            } catch (e) {
                                                // eslint-disable-next-line no-console
                                                console.warn('Failed to save map style', e);
                                            }
                                            try {
                                                const m = mapRef.current;
                                                if (m) {
                                                    // provide small visual feedback while switching
                                                    try { setMapError(`Aplicando estilo ${s}…`); } catch (e) { }
                                                    m.setStyle(buildMapStyle(s));
                                                    try { setMapError(null); } catch (e) { }
                                                } else {
                                                    try { setMapError('Mapa no inicializado'); } catch (e) { }
                                                }
                                            } catch (e) {
                                                // eslint-disable-next-line no-console
                                                console.error('Error applying map style', e);
                                                try { setMapError(String(e)); } catch (err) { }
                                            }
                                        }}
                                        className={`w-full text-left px-3 py-2 hover:bg-surface/80 ${mapStyle === s ? 'font-semibold' : ''}`}
                                    >
                                        {MAP_STYLE_LABELS[s] ?? s}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="h-1 mx-3 rounded-full bg-line overflow-hidden">
                    <div
                        className="h-full bg-moss transition-[width] duration-500"
                        style={{ width: `${Math.min(100, (metrics?.progress ?? 0) * 100)}%` }}
                    />
                </div>
            </div>

            <button
                onClick={() => {
                    setFollowing(true);
                    try {
                        const map = mapRef.current;
                        if (map && position) {
                            map.easeTo({
                                center: [position.lng, position.lat],
                                bearing: rotateWithHeading ? heading ?? course ?? map.getBearing() : 0,
                                duration: 700,
                                easing: (t) => t,
                            });
                        }
                    } catch (e) { }
                }}
                className={`absolute right-3 bottom-[17rem] z-20 touch-target grid place-items-center rounded-full shadow-md ${following ? 'bg-moss text-white border-moss border' : 'bg-surface border-line text-moss bg-surface'}`}
                aria-label={following ? 'Centrado en mi posición (activo)' : 'Volver a centrar en mi posición'}
            >
                <Crosshair size={22} />
            </button>

            {/* Floating toggle removed — use top header toggle only */}

            <div className="absolute bottom-0 left-0 right-0 z-20 pb-safe">
                {metrics?.offRoute && (
                    <div className="mx-3 mb-2 bg-alert text-white px-4 py-3 rounded-xl flex items-center gap-3 shadow-lg">
                        <AlertTriangle size={22} className="shrink-0" />
                        <div className="min-w-0">
                            <p className="font-semibold text-sm">Fuera de ruta</p>
                            <p className="text-xs text-white/85">A {formatDistance(metrics.distanceFromRoute ?? 0)} de la traza</p>
                        </div>
                    </div>
                )}

                {gpsError && (
                    <div className="mx-3 mb-2 bg-clay-soft border border-clay/30 text-clay px-4 py-2.5 rounded-xl text-sm flex items-center gap-2">
                        <Satellite size={18} className="shrink-0" /> {gpsError}
                    </div>
                )}

                {status === 'paused' && (
                    <div className="mx-3 mb-2 bg-surface border border-line text-ink-soft px-4 py-2.5 rounded-xl text-sm text-center">
                        Actividad en pausa. El tiempo y la media no avanzan.
                    </div>
                )}

                <div className="bg-surface-soft/95 backdrop-blur border-t border-line pt-3 pb-3">
                    {showPanels && (
                        <div className="px-4 pb-2">
                            <MetricPanels panels={panels} />
                        </div>
                    )}

                    <div className="flex gap-2 px-4 pt-4">
                        <button
                            onClick={() => (status === 'active' ? session.pauseSession() : session.resumeSession())}
                            className="flex-1 h-14 rounded-xl bg-surface border border-line text-ink font-semibold flex items-center justify-center gap-2"
                        >
                            {status === 'active' ? <Pause size={20} /> : <Play size={20} />}
                            {status === 'active' ? 'Pausar' : 'Reanudar'}
                        </button>
                        <button
                            onClick={() => setConfirmFinish(true)}
                            className="flex-1 h-14 rounded-xl bg-moss text-white font-semibold flex items-center justify-center gap-2"
                        >
                            <Flag size={20} />
                            Finalizar
                        </button>
                    </div>
                </div>
            </div>

            {confirmFinish && (
                <div className="absolute inset-0 z-30 bg-ink/40 flex items-end justify-center p-4">
                    <div className="w-full max-w-sm bg-surface border border-line rounded-2xl p-5">
                        <h2 className="text-base font-semibold text-ink">Finalizar navegación</h2>
                        <p className="text-sm text-ink-soft mt-2">
                            Llevas {formatDistance(metrics?.distanceDone ?? 0)} en {formatClock(metrics?.movingSeconds ?? 0)}. La
                            sesión se cerrará y el progreso se descartará.
                        </p>
                        <div className="flex gap-2 mt-5">
                            <button onClick={() => setConfirmFinish(false)} className="flex-1 h-12 rounded-xl border border-line font-medium">
                                Seguir navegando
                            </button>
                            <button
                                onClick={() => {
                                    setConfirmFinish(false);
                                    session.stopSession();
                                    onNavigate('home');
                                }}
                                className="flex-1 h-12 rounded-xl bg-alert text-white font-semibold"
                            >
                                Finalizar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function buildPanels(metrics: SessionMetrics | null, profile: ReturnType<typeof getRouteProfile>, route: Route, windowMeters: number, setWindowMeters: (v: number) => void) {
    if (!metrics) return [];

    const base = [
        {
            id: 'progress',
            title: 'Progreso',
            items: [
                { label: 'Recorrido', value: formatDistance(metrics.distanceDone), tone: 'accent' as const },
                { label: 'Restante', value: formatDistance(metrics.distanceRemaining) },
                { label: 'Completado', value: formatPercent(metrics.progress * 100) },
            ],
        },
        {
            id: 'elevation',
            title: 'Elevación',
            items: [
                { label: 'Altitud', value: metrics.altitude != null ? formatElevation(metrics.altitude) : '—' },
                {
                    label: 'D+ acumulado',
                    value: metrics.ascentDone != null ? formatSignedElevation(metrics.ascentDone) : '—',
                    tone: 'accent' as const,
                },
                { label: 'D+ restante', value: metrics.ascentRemaining != null ? formatElevation(metrics.ascentRemaining) : '—' },
                { label: 'D− restante', value: metrics.descentRemaining != null ? formatElevation(metrics.descentRemaining) : '—' },
            ],
        },
        {
            id: 'time_rhythm',
            title: 'Tiempo y ritmo',
            items: [
                { label: 'Velocidad', value: metrics.currentSpeed != null ? formatSpeed(metrics.currentSpeed) : '—' },
                { label: 'Media', value: metrics.averageSpeed != null ? formatSpeed(metrics.averageSpeed) : '—' },
                { label: 'Ritmo medio', value: metrics.paceSeconds != null ? formatPace(metrics.paceSeconds) : '—' },
                { label: 'En movimiento', value: formatClock(metrics.movingSeconds) },
                { label: 'Restante', value: metrics.remainingSeconds != null ? formatClock(metrics.remainingSeconds) : '—' },
                { label: 'Llegada', value: metrics.arrivalTimestamp != null ? formatTimeOfDay(metrics.arrivalTimestamp) : '—' },
            ],
        },
        {
            id: 'gps',
            title: 'Señal y ruta',
            items: [
                {
                    label: 'Precisión',
                    value: metrics.accuracy != null ? formatDistance(metrics.accuracy) : '—',
                    tone: metrics.accuracy != null && metrics.accuracy > 25 ? ('warn' as const) : ('default' as const),
                },
                { label: 'Desvío', value: metrics.distanceFromRoute != null ? formatDistance(metrics.distanceFromRoute) : '—' },
                { label: 'Total ruta', value: formatDistance(metrics.totalDistance) },
            ],
        },
    ];

    // append info windows (profile, weather, slope) as panels with content
    const info = buildInfoWindows(profile, route, metrics, windowMeters, setWindowMeters).map((w) => ({ id: w.id, title: w.title, content: w.content }));

    return [...base, ...info];
}

function buildInfoWindows(
    profile: ReturnType<typeof getRouteProfile>,
    route: Route,
    metrics: SessionMetrics | null,
    windowMeters: number,
    setWindowMeters: (v: number) => void
): Array<{ id: string; title: string; content: React.ReactNode }> {
    const windows: Array<{ id: string; title: string; content: React.ReactNode }> = [];

    // Note: Weather panel intentionally omitted from navigation info carousel.

    // Slope / ascent-descent detail window
    if (profile.hasElevation && metrics) {
        const center = Math.max(0, Math.min(profile.totalDistance, metrics.distanceDone || 0));
        const start = Math.max(0, center - windowMeters / 2);
        const end = Math.min(profile.totalDistance, start + windowMeters);

        const startSample = sampleProfile(profile, start);
        const endSample = sampleProfile(profile, end);

        let avgSlope = 0;
        let gained = 0;
        let length = Math.max(0.001, end - start);

        if (startSample && endSample) {
            avgSlope = ((endSample.elevation - startSample.elevation) / length) * 100;
            // approximate accumulated positive/negative within window via cumulative arrays
            const si = indexAtDistance(profile, start);
            const ei = indexAtDistance(profile, end);
            const ascentAtStart = profile.cumulativeAscent[si] ?? 0;
            const ascentAtEnd = profile.cumulativeAscent[ei] ?? 0;
            gained = Math.max(0, ascentAtEnd - ascentAtStart);
        }

        const direction = avgSlope > 0.5 ? 'Subida' : avgSlope < -0.5 ? 'Bajada' : 'Plano';

        const content = (
            <div className="p-0">
                <ProfileChart profile={profile} height={72} currentDistance={metrics.distanceDone ?? null} showPoints={false} showSegments={false} showColoredFill={false} />
            </div>
        );

        windows.push({ id: 'slope', title: '', content });
    }

    return windows;
}

function EmptyNavigationState({ hydrated, onNavigate }: { hydrated: boolean; onNavigate: (s: Screen) => void }) {
    return (
        <div className="h-full flex flex-col items-center justify-center gap-4 px-8 text-center">
            <Compass size={40} className="text-ink-faint" />
            <div>
                <h1 className="text-lg font-semibold text-ink">
                    {hydrated ? 'No hay ninguna navegación activa' : 'Recuperando sesión…'}
                </h1>
                <p className="text-sm text-ink-soft mt-2">Elige una ruta guardada y pulsa «Navegar» para iniciar la actividad.</p>
            </div>
            <button onClick={() => onNavigate('home')} className="h-12 px-5 rounded-xl bg-moss text-white font-semibold">
                Ver mis rutas
            </button>
        </div>
    );
}
