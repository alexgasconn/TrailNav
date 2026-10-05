import React, { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import * as turf from '@turf/turf';
import { Compass, Crosshair, Layers, Minus, Navigation2, Plus, Satellite, WifiOff, X } from 'lucide-react';
import { MapStyleId, Route, getSettings, saveSettings } from '../lib/db';
import { Screen } from '../App';
import {
    MAP_STYLE_LABELS,
    addRouteLayers,
    buildMapStyle,
    createRoutePointMarker,
    createUserMarkerElement,
    updateUserMarkerElement,
} from '../lib/mapStyles';
import { getRouteProfile } from '../lib/routeProfile';
import { getRoutePoints } from '../lib/routePoints';
import { formatDistance, formatElevation } from '../lib/format';
import { useNavigationSession } from '../state/navigationSession';

export function MapExplorerScreen({ route, onNavigate }: { route: Route | null; onNavigate: (s: Screen, r?: Route) => void }) {
    const session = useNavigationSession();
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<maplibregl.Map | null>(null);
    const userMarkerRef = useRef<maplibregl.Marker | null>(null);
    const poiMarkersRef = useRef<maplibregl.Marker[]>([]);
    const watchIdRef = useRef<number | null>(null);
    const positionRef = useRef<[number, number] | null>(null);
    const followRef = useRef(true);
    const courseUpRef = useRef(false);
    const initialCenterRef = useRef(false);
    const cameraRef = useRef<{ center: [number, number]; zoom: number; bearing: number } | null>(null);
    const placeMarkersRef = useRef<maplibregl.Marker[]>([]);

    const [mapStyle, setMapStyle] = useState<MapStyleId | null>(null);
    const [referenceOnly, setReferenceOnly] = useState(true);
    const [following, setFollowing] = useState(true);
    const [courseUp, setCourseUp] = useState(false);
    const [online, setOnline] = useState(navigator.onLine);
    const [outsideCoverage, setOutsideCoverage] = useState(false);
    const [fix, setFix] = useState<{ accuracy: number; speed: number | null; altitude: number | null; heading: number | null } | null>(null);
    const [screenAwake, setScreenAwake] = useState(false);
    const [keepAwake, setKeepAwake] = useState(false);
    const [showStylePicker, setShowStylePicker] = useState(false);
    const [gpsError, setGpsError] = useState<string | null>(null);
    const [initAttempt, setInitAttempt] = useState(0);

    const profile = useMemo(() => (route ? getRouteProfile(route) : null), [route]);
    const routePoints = useMemo(() => (route ? getRoutePoints(route) : []), [route]);

    useEffect(() => {
        getSettings().then((settings) => {
            setMapStyle(settings.mapStyle);
            setKeepAwake(settings.screenAlwaysOn);
        }).catch(() => setMapStyle('topo'));
    }, []);

    useEffect(() => {
        const update = () => setOnline(navigator.onLine);
        window.addEventListener('online', update);
        window.addEventListener('offline', update);
        return () => {
            window.removeEventListener('online', update);
            window.removeEventListener('offline', update);
        };
    }, []);

    useEffect(() => {
        if (!keepAwake || !following || !('wakeLock' in navigator)) return;
        let lock: WakeLockSentinel | null = null;
        let disposed = false;
        const acquire = async () => {
            if (document.visibilityState !== 'visible' || (lock && !lock.released)) return;
            try {
                const next = await navigator.wakeLock.request('screen');
                if (disposed) { await next.release(); return; }
                lock = next;
                setScreenAwake(true);
                next.addEventListener('release', () => { if (!disposed) setScreenAwake(false); });
            } catch { if (!disposed) setScreenAwake(false); }
        };
        void acquire();
        document.addEventListener('visibilitychange', acquire);
        return () => {
            disposed = true;
            document.removeEventListener('visibilitychange', acquire);
            void lock?.release();
            setScreenAwake(false);
        };
    }, [keepAwake, following]);

    useEffect(() => {
        if (mapRef.current || !containerRef.current || !mapStyle) return;

        const rect = containerRef.current.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
            const timer = window.setTimeout(() => setInitAttempt((value) => value + 1), 120);
            return () => window.clearTimeout(timer);
        }

        const map = new maplibregl.Map({
            container: containerRef.current,
            style: buildMapStyle(mapStyle, referenceOnly),
            center: cameraRef.current?.center ?? positionRef.current ?? profile?.coordinates[0] ?? [1.65, 41.75],
            zoom: cameraRef.current?.zoom ?? (positionRef.current ? 14 : profile ? 12 : 7.5),
            bearing: cameraRef.current?.bearing ?? 0,
            attributionControl: { compact: true },
            trackResize: true,
        });
        mapRef.current = map;

        map.on('error', (event) => console.error('MapLibre:', event.error));
        map.on('dragstart', () => {
            followRef.current = false;
            setFollowing(false);
        });
        map.on('moveend', () => {
            const center = map.getCenter();
            setOutsideCoverage(center.lng < 0 || center.lng > 3.5 || center.lat < 40.4 || center.lat > 43);
        });
        const observer = new ResizeObserver(() => map.resize());
        observer.observe(containerRef.current);

        const applyOverlays = () => {
            if (route?.geoJson) addRouteLayers(map, route.geoJson, { width: 4 });

            poiMarkersRef.current.forEach((marker) => marker.remove());
            poiMarkersRef.current = routePoints.map((point) =>
                new maplibregl.Marker({ element: createRoutePointMarker(point) })
                    .setLngLat(point.coordinate)
                    .setPopup(
                        new maplibregl.Popup({ offset: 16, closeButton: false }).setHTML(
                            `<strong>${point.name}</strong><br/>km ${(point.distance / 1000).toFixed(1)}` +
                            (point.elevation != null ? ` · ${Math.round(point.elevation)} m` : '') +
                            (point.detail ? `<br/>${point.detail}` : '')
                        )
                    )
                    .addTo(map)
            );

            if (!userMarkerRef.current) {
                userMarkerRef.current = new maplibregl.Marker({ element: createUserMarkerElement(), rotationAlignment: 'map' })
                    .setLngLat(positionRef.current ?? profile?.coordinates[0] ?? [1.65, 41.75])
                    .addTo(map);
                if (!positionRef.current) userMarkerRef.current.getElement().style.display = 'none';
            }
        };

        map.on('load', () => {
            applyOverlays();
            if (route?.geoJson && !cameraRef.current) {
                map.fitBounds(turf.bbox(route.geoJson) as [number, number, number, number], { padding: 60, duration: 0 });
            }
            if (referenceOnly) {
                const seen = new Set<string>();
                map.querySourceFeatures('catalunya').forEach((feature) => {
                    if (feature.properties.kind !== 'place' || feature.geometry.type !== 'Point') return;
                    const name = String(feature.properties.name);
                    if (seen.has(name)) return;
                    seen.add(name);
                    const label = document.createElement('span');
                    label.className = 'map-place-label';
                    label.textContent = name;
                    placeMarkersRef.current.push(new maplibregl.Marker({ element: label, anchor: 'left', offset: [8, 0] })
                        .setLngLat(feature.geometry.coordinates as [number, number]).addTo(map));
                });
            }
            map.resize();
        });

        return () => {
            cameraRef.current = { center: map.getCenter().toArray() as [number, number], zoom: map.getZoom(), bearing: map.getBearing() };
            observer.disconnect();
            placeMarkersRef.current.forEach((marker) => marker.remove());
            placeMarkersRef.current = [];
            poiMarkersRef.current.forEach((marker) => marker.remove());
            poiMarkersRef.current = [];
            userMarkerRef.current = null;
            map.remove();
            mapRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [route?.id, mapStyle, referenceOnly, initAttempt]);

    useEffect(() => {
        if (!('geolocation' in navigator)) {
            setGpsError('Este dispositivo no permite geolocalización');
            return;
        }

        watchIdRef.current = navigator.geolocation.watchPosition(
            (browserPosition) => {
                const { longitude, latitude, accuracy, heading, speed, altitude } = browserPosition.coords;
                positionRef.current = [longitude, latitude];
                setGpsError(null);
                setFix({ accuracy, speed, altitude, heading });

                const marker = userMarkerRef.current;
                const map = mapRef.current;
                if (!map) return;
                if (followRef.current) {
                    map.easeTo({
                        center: [longitude, latitude],
                        zoom: !initialCenterRef.current ? Math.max(14, map.getZoom()) : map.getZoom(),
                        bearing: courseUpRef.current && heading != null && Number.isFinite(heading) && (speed ?? 0) > 0.8 ? heading : courseUpRef.current ? map.getBearing() : 0,
                        duration: !initialCenterRef.current ? 700 : 900,
                    });
                    initialCenterRef.current = true;
                }
                if (!marker) return;

                marker.getElement().style.display = 'block';
                marker.setLngLat([longitude, latitude]);
                const metersPerPixel = (156543.03392 * Math.cos((latitude * Math.PI) / 180)) / 2 ** map.getZoom();
                updateUserMarkerElement(marker.getElement(), {
                    heading: typeof heading === 'number' && Number.isFinite(heading) ? heading : null,
                    course: null,
                    accuracyPixels: accuracy != null ? accuracy / metersPerPixel : null,
                });
            },
            (error) => setGpsError(error.code === 1 ? 'Ubicación bloqueada. Activa el permiso de ubicación de TrailNav en Chrome.' : error.code === 3 ? 'Esperando señal GPS. Prueba en un lugar abierto.' : 'No se puede obtener la ubicación. Comprueba el GPS de Android.'),
            { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
        );

        return () => {
            if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
        };
    }, []);

    const changeStyle = async (style: MapStyleId) => {
        setShowStylePicker(false);
        setReferenceOnly(false);
        setMapStyle(style);
        const settings = await getSettings();
        await saveSettings({ ...settings, mapStyle: style });
    };

    const recenter = () => {
        followRef.current = true;
        setFollowing(true);
        if (!mapRef.current || !positionRef.current) return;
        mapRef.current.easeTo({ center: positionRef.current, zoom: Math.max(14, mapRef.current.getZoom()), duration: 600 });
    };

    const toggleCourse = () => {
        courseUpRef.current = !courseUpRef.current;
        setCourseUp(courseUpRef.current);
        if (!courseUpRef.current) mapRef.current?.easeTo({ bearing: 0, duration: 400 });
        else if (fix?.heading != null && Number.isFinite(fix.heading) && (fix.speed ?? 0) > 0.8) mapRef.current?.easeTo({ bearing: fix.heading, duration: 400 });
    };

    const isNavigatingThisRoute = session.status !== 'idle' && session.route?.id === route?.id;

    return (
        <div className="w-full h-full relative overflow-hidden bg-canvas">
            <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

            <div className="absolute top-0 left-0 right-0 pt-safe px-3 py-3 flex justify-between items-start gap-2 z-10 pointer-events-none">
                <div className="bg-surface/95 border border-line rounded-xl px-3 py-2 shadow-sm max-w-[60%]">
                    <p className="text-[11px] uppercase tracking-wider text-ink-faint">{route ? 'Ruta' : 'Navegación libre'}</p>
                    <p className="text-sm font-semibold text-ink truncate">{route ? route.name : 'Catalunya'}</p>
                    <p className="text-[11px] text-ink-soft mt-1 flex items-center gap-1"><WifiOff size={12} />{referenceOnly ? 'Base incluida · referencia' : online ? 'Mapa detallado · online' : 'Detalle guardado · offline'}</p>
                </div>

                <div className="flex flex-col items-end gap-2 pointer-events-auto">
                    <button
                        onClick={recenter}
                        className={`touch-target grid place-items-center border border-line rounded-lg shadow-sm ${following ? 'bg-moss text-white' : 'bg-surface text-ink'}`}
                        aria-label="Centrar en mi posición"
                        title="Centrar en mi posición"
                        aria-pressed={following}
                    >
                        <Crosshair size={22} />
                    </button>
                    <button
                        onClick={() => setShowStylePicker((value) => !value)}
                        className="touch-target grid place-items-center bg-surface border border-line rounded-xl shadow-sm text-ink"
                        aria-label="Cambiar tipo de mapa"
                        title="Cambiar tipo de mapa"
                    >
                        <Layers size={22} />
                    </button>
                    <button onClick={toggleCourse} className="touch-target grid place-items-center bg-surface border border-line rounded-lg shadow-sm text-ink" aria-label={courseUp ? 'Orientar al norte' : 'Orientar según rumbo GPS'} title={courseUp ? 'Orientar al norte' : 'Orientar según rumbo GPS'} aria-pressed={courseUp}><Compass size={22} className={courseUp ? 'text-moss' : ''} /></button>
                    <div className="grid bg-surface border border-line rounded-lg shadow-sm">
                        <button onClick={() => mapRef.current?.zoomIn()} className="touch-target grid place-items-center text-ink" aria-label="Acercar mapa" title="Acercar mapa"><Plus size={22} /></button>
                        <button onClick={() => mapRef.current?.zoomOut()} className="touch-target grid place-items-center text-ink border-t border-line" aria-label="Alejar mapa" title="Alejar mapa"><Minus size={22} /></button>
                    </div>
                    {showStylePicker && (
                        <div className="absolute top-16 right-16 bg-surface border border-line rounded-lg p-1.5 shadow-md w-48">
                            <button onClick={() => { setReferenceOnly(true); setShowStylePicker(false); }} className={`w-full text-left px-3 py-3 rounded-lg text-sm font-medium ${referenceOnly ? 'bg-moss-soft text-moss-strong' : 'text-ink-soft'}`}>Catalunya · incluida</button>
                            {(['topo', 'satellite', 'carto'] as MapStyleId[]).map((style) => (
                                <button
                                    key={style}
                                    onClick={() => changeStyle(style)}
                                    className={`w-full text-left px-3 py-3 rounded-lg text-sm font-medium ${!referenceOnly && mapStyle === style ? 'bg-moss-soft text-moss-strong' : 'text-ink-soft'}`}
                                >
                                    {MAP_STYLE_LABELS[style]}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {(gpsError || (referenceOnly && outsideCoverage)) && (
                <div role="status" className="absolute left-3 right-16 top-28 bg-clay-soft border border-clay/30 text-clay px-3 py-2 rounded-lg text-xs z-10">
                    {gpsError ?? 'Fuera de la cobertura del mapa base de Catalunya.'}
                </div>
            )}

            {route && profile ? (
                <div className="absolute left-3 right-3 bottom-3 bg-surface border border-line rounded-2xl p-4 shadow-lg z-10">
                    <div className="flex items-baseline justify-between gap-3">
                        <h2 className="font-semibold text-ink truncate">{route.name}</h2>
                        <span className="text-sm font-semibold text-moss tabular">{formatDistance(profile.totalDistance)}</span>
                    </div>
                    <div className="flex gap-4 mt-1 text-xs text-ink-soft tabular">
                        <span>D+ {formatElevation(profile.totalAscent)}</span>
                        <span>D− {formatElevation(profile.totalDescent)}</span>
                        <span>{routePoints.length} puntos</span>
                    </div>
                    <div className="flex gap-2 mt-4">
                        <button onClick={() => onNavigate('free')} className="h-12 w-12 shrink-0 rounded-lg border border-line grid place-items-center" aria-label="Quitar ruta y navegar libremente" title="Quitar ruta y navegar libremente"><X size={20} /></button>
                        <button
                            onClick={() => onNavigate('analysis', route)}
                            className="flex-1 h-12 rounded-xl border border-line text-ink font-medium text-sm"
                        >
                            Ver análisis
                        </button>
                        <button
                            onClick={() => onNavigate('navigation', route)}
                            className="flex-1 h-12 rounded-xl bg-moss text-white font-semibold text-sm flex items-center justify-center gap-2"
                        >
                            <Navigation2 size={18} />
                            {isNavigatingThisRoute ? 'Continuar' : 'Navegar'}
                        </button>
                    </div>
                </div>
            ) : (
                <div className="absolute left-3 right-3 bottom-6 bg-surface/95 border border-line rounded-lg p-3 shadow-lg z-10">
                    <div className="flex items-center justify-between gap-2 text-xs mb-3">
                        <span className="flex items-center gap-1.5 text-moss font-semibold"><Satellite size={15} />{fix ? 'GPS activo' : 'Buscando GPS'}</span>
                        <span className="text-ink-soft">{following ? 'Siguiendo posición' : 'Explorando'}{screenAwake ? ' · Pantalla activa' : ''}</span>
                    </div>
                    <div className="grid grid-cols-3 divide-x divide-line text-center">
                        <div><p className="text-xl font-semibold tabular">{fix?.speed != null ? (Math.max(0, fix.speed) * 3.6).toFixed(1) : '--'}</p><p className="text-[11px] text-ink-soft">km/h</p></div>
                        <div><p className="text-xl font-semibold tabular">{fix?.altitude != null ? Math.round(fix.altitude) : '--'}</p><p className="text-[11px] text-ink-soft">altitud · m</p></div>
                        <div><p className="text-xl font-semibold tabular">{fix ? Math.round(fix.accuracy) : '--'}</p><p className="text-[11px] text-ink-soft">precisión · m</p></div>
                    </div>
                    <button onClick={recenter} className="mt-3 w-full h-12 rounded-lg bg-moss text-white font-semibold text-sm flex items-center justify-center gap-2"><Navigation2 size={18} />{following ? 'Centrar posición' : 'Seguir mi posición'}</button>
                </div>
            )}
        </div>
    );
}
