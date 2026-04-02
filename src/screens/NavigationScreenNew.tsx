import React, { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { AlertTriangle, Pause, Play, XCircle } from 'lucide-react';
import { Route } from '../lib/db';
import { Screen } from '../App';
import * as turf from '@turf/turf';
import { useVibration } from '../hooks';

export function NavigationScreen({ route, onNavigate }: { route: Route, onNavigate: (s: Screen, r?: Route) => void }) {
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<maplibregl.Map | null>(null);
    const userMarker = useRef<maplibregl.Marker | null>(null);

    const [speed, setSpeed] = useState(0);
    const [elevation, setElevation] = useState<number | null>(null);
    const [distanceToFinish, setDistanceToFinish] = useState(route.distance);
    const [elapsedTime, setElapsedTime] = useState(0);
    const [offRoute, setOffRoute] = useState(false);
    const [heading, setHeading] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const [accuracy, setAccuracy] = useState<number | null>(null);

    // Refs to avoid stale closures in GPS/timer callbacks
    const isPausedRef = useRef(false);
    const offRouteRef = useRef(false);

    const watchId = useRef<number | null>(null);
    const startTimeRef = useRef<number>(Date.now());
    const timerRef = useRef<number | null>(null);
    const vibration = useVibration();
    // Stable refs so GPS callback never captures stale objects
    const vibrationRef = useRef(vibration);
    vibrationRef.current = vibration;
    const routeRef = useRef(route);
    routeRef.current = route;

    // Sync state â†’ refs (no render cost)
    useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);
    useEffect(() => { offRouteRef.current = offRoute; }, [offRoute]);

    // â”€â”€ Map init: only depends on route (stable) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    useEffect(() => {
        if (map.current || !mapContainer.current) return;

        const rect = mapContainer.current.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
            const t = setTimeout(() => { /* trigger re-run by forcing a state update would cause flicker; instead just wait */ }, 150);
            return () => clearTimeout(t);
        }

        const styleConfig = {
            version: 8 as const,
            sources: {
                osm: {
                    type: 'raster' as const,
                    tiles: [
                        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                        'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
                        'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
                        'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
                    ],
                    tileSize: 256,
                    attribution: 'Â© OpenStreetMap contributors',
                },
            },
            layers: [{ id: 'osm', type: 'raster' as const, source: 'osm', minzoom: 0, maxzoom: 19 }],
        };

        try {
            map.current = new maplibregl.Map({
                container: mapContainer.current,
                style: styleConfig as any,
                center: [0, 0],
                zoom: 18,
                pitch: 0,
                bearing: 0,
                attributionControl: false,
                interactive: true,
                trackResize: true,
            });
        } catch (e) {
            console.error('Map init error:', e);
            return;
        }

        map.current.on('error', (ev) => console.error('MapLibre:', ev.error));

        map.current.on('load', () => {
            const m = map.current;
            if (!m || !route.geoJson) return;

            m.addSource('route', { type: 'geojson', data: route.geoJson });
            m.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#064e3b', 'line-width': 14, 'line-opacity': 0.9 } });
            m.addLayer({ id: 'route-core', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#10b981', 'line-width': 7 } });

            // Draw start/end markers
            if (route.geoJson.features[0]?.geometry.type === 'LineString') {
                const coords = (route.geoJson.features[0].geometry as any).coordinates as number[][];
                if (coords.length) {
                    const startEl = document.createElement('div');
                    startEl.style.cssText = 'width:14px;height:14px;background:#10b981;border:3px solid #fff;border-radius:50%;box-shadow:0 0 8px rgba(16,185,129,0.8)';
                    new maplibregl.Marker({ element: startEl }).setLngLat(coords[0] as [number, number]).addTo(m);

                    const endEl = document.createElement('div');
                    endEl.style.cssText = 'width:16px;height:16px;background:#f59e0b;border:3px solid #fff;border-radius:50%;box-shadow:0 0 8px rgba(245,158,11,0.8)';
                    new maplibregl.Marker({ element: endEl }).setLngLat(coords[coords.length - 1] as [number, number]).addTo(m);
                }
            }

            // User location dot
            const el = document.createElement('div');
            el.style.cssText = 'width:20px;height:20px;background:#3b82f6;border:3px solid #fff;border-radius:50%;box-shadow:0 0 12px rgba(59,130,246,0.8)';
            userMarker.current = new maplibregl.Marker({ element: el, rotationAlignment: 'map' })
                .setLngLat([0, 0])
                .addTo(m);

            startTracking();
        });

        return () => {
            if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
            if (timerRef.current !== null) clearInterval(timerRef.current);
            window.removeEventListener('deviceorientationabsolute', onOrientation as EventListener);
            map.current?.remove();
            map.current = null;
            userMarker.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [route]); // ONLY route â€” lockScreen intentionally excluded to prevent flicker

    // â”€â”€ Wake lock: separate effect, runs once â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    useEffect(() => {
        (navigator as any).wakeLock?.request('screen').catch(console.warn);
    }, []);

    // â”€â”€ Timer: restarts only when isPaused changes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    useEffect(() => {
        if (isPaused) return;
        timerRef.current = window.setInterval(() => {
            setElapsedTime(Math.floor((Date.now() - startTimeRef.current) / 1000));
        }, 1000);
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [isPaused]);

    // â”€â”€ Orientation handler: stable, uses refs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const onOrientation = useCallback((event: DeviceOrientationEvent) => {
        const h = (event as any).webkitCompassHeading ?? (event.alpha != null ? (360 - event.alpha) % 360 : null);
        if (h !== null) setHeading(h);
    }, []);

    // â”€â”€ GPS tracking: stable callback, reads state via refs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const startTracking = useCallback(() => {
        if (!('geolocation' in navigator)) return;

        if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
            (DeviceOrientationEvent as any).requestPermission()
                .then((r: string) => { if (r === 'granted') window.addEventListener('deviceorientationabsolute', onOrientation as EventListener); })
                .catch(console.error);
        } else {
            window.addEventListener('deviceorientationabsolute', onOrientation as EventListener);
        }

        watchId.current = navigator.geolocation.watchPosition(
            (pos) => {
                if (isPausedRef.current) return;

                const { latitude: lat, longitude: lng, speed: spd, altitude: alt, accuracy: acc, heading: gpsHdg } = pos.coords;
                const userPt = turf.point([lng, lat]);

                if (map.current && userMarker.current) {
                    userMarker.current.setLngLat([lng, lat]);

                    const bearing = typeof gpsHdg === 'number' && !isNaN(gpsHdg) ? gpsHdg : 0;
                    if (typeof gpsHdg === 'number' && !isNaN(gpsHdg)) setHeading(gpsHdg);

                    map.current.easeTo({ center: [lng, lat], bearing, pitch: 0, zoom: 18, duration: 400 });
                }

                setSpeed(spd ? spd * 3.6 : 0);
                if (alt != null) setElevation(Math.round(alt));
                if (acc != null) setAccuracy(Math.round(acc));

                const r = routeRef.current;
                if (r.geoJson?.features[0]) {
                    const geom = r.geoJson.features[0].geometry;
                    const coords = geom.type === 'LineString' ? geom.coordinates : (geom as any).coordinates[0];
                    const line = turf.lineString(coords);
                    const dist = turf.pointToLineDistance(userPt, line, { units: 'meters' });

                    if (dist > 30 && !offRouteRef.current) {
                        offRouteRef.current = true;
                        setOffRoute(true);
                        vibrationRef.current.vibrate([100, 50, 100]);
                        map.current?.setPaintProperty('route-core', 'line-color', '#ef4444');
                    } else if (dist <= 25 && offRouteRef.current) {
                        offRouteRef.current = false;
                        setOffRoute(false);
                        vibrationRef.current.vibrate(60);
                        map.current?.setPaintProperty('route-core', 'line-color', '#10b981');
                    }

                    const endPt = turf.point(coords[coords.length - 1]);
                    setDistanceToFinish(turf.distance(userPt, endPt, { units: 'kilometers' }) * 1000);
                }
            },
            (err) => { console.error('GPS error:', err); },
            { enableHighAccuracy: true, maximumAge: 0, timeout: 8000 }
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onOrientation]); // stable â€” all mutable state read via refs

    const formatTime = (s: number) => {
        const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    };

    const eta = speed > 0.5 ? Math.round((distanceToFinish / 1000) / (speed / 3.6) / 60) : null;

    return (
        <div className="w-full h-full bg-zinc-950 relative overflow-hidden">
            {/* Map */}
            <div ref={mapContainer} className="w-full h-full absolute inset-0" />

            {/* Top Bar */}
            <div className="absolute top-0 left-0 right-0 pt-safe px-4 py-3 bg-gradient-to-b from-zinc-950/90 to-transparent z-20 pointer-events-none">
                <div className="flex justify-between items-center pointer-events-auto">
                    <button
                        onClick={() => onNavigate('home')}
                        className="p-3 bg-red-900/80 backdrop-blur border border-red-800 rounded-full text-white hover:bg-red-800 transition-colors shadow-lg touch-target"
                    >
                        <XCircle size={22} />
                    </button>
                    <div className="bg-zinc-900/80 backdrop-blur border border-zinc-800 rounded-2xl px-4 py-2 mx-2 flex-1 text-center">
                        <p className="text-white font-semibold text-sm truncate">{route.name}</p>
                    </div>
                    <button
                        onClick={() => { setIsPaused(p => !p); if (!isPaused) startTimeRef.current += Date.now() - startTimeRef.current; }}
                        className="p-3 bg-zinc-900/80 backdrop-blur border border-zinc-700 rounded-full text-white hover:bg-zinc-800 transition-colors shadow-lg touch-target"
                    >
                        {isPaused ? <Play size={22} /> : <Pause size={22} />}
                    </button>
                </div>
            </div>

            {/* Stats panel */}
            <div className="absolute bottom-0 left-0 right-0 pb-safe z-20 pointer-events-none">

                {/* Off-route alert */}
                {offRoute && (
                    <div className="mx-4 mb-3 bg-red-600/95 border-2 border-red-400 text-white px-4 py-3 rounded-2xl flex items-center gap-3 shadow-xl">
                        <AlertTriangle size={24} className="flex-shrink-0" />
                        <div>
                            <div className="font-bold text-sm">FUERA DE RUTA</div>
                            <div className="text-xs opacity-90">Vuelve al sendero marcado</div>
                        </div>
                    </div>
                )}

                {isPaused && (
                    <div className="mx-4 mb-3 bg-yellow-900/80 border border-yellow-700 text-yellow-100 px-4 py-3 rounded-2xl text-sm text-center font-medium">
                        â¸ Pausado â€” toca â–¶ para continuar
                    </div>
                )}

                {/* Main numbers */}
                <div className="bg-zinc-900/95 backdrop-blur border-t border-zinc-800 px-4 pt-4 pb-2">
                    <div className="grid grid-cols-4 gap-2 mb-3">
                        <StatCard label="Distancia" value={(distanceToFinish / 1000).toFixed(2)} unit="km" big />
                        <StatCard label="Velocidad" value={speed.toFixed(0)} unit="km/h" big accent={speed > 0.5} />
                        <StatCard label="Tiempo" value={formatTime(elapsedTime)} unit="" big />
                        <StatCard label="ETA" value={eta != null ? String(eta) : 'â€”'} unit={eta != null ? 'min' : ''} big />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        <StatCard label="ElevaciÃ³n" value={elevation != null ? String(elevation) : 'â€”'} unit={elevation != null ? 'm' : ''} />
                        <StatCard
                            label="PrecisiÃ³n GPS"
                            value={accuracy != null ? String(accuracy) : 'â€”'}
                            unit={accuracy != null ? 'm' : ''}
                            warn={accuracy != null && accuracy > 25}
                        />
                        <StatCard label="Rumbo" value={`${Math.round(heading)}Â°`} unit="" />
                    </div>
                </div>
            </div>
        </div>
    );
}

function StatCard({ label, value, unit, big, accent, warn }: { label: string, value: string, unit: string, big?: boolean, accent?: boolean, warn?: boolean }) {
    const bg = warn ? 'bg-red-900/40 border-red-800' : accent ? 'bg-emerald-900/50 border-emerald-700' : 'bg-zinc-800/60 border-zinc-700';
    const valueColor = warn ? 'text-red-300' : accent ? 'text-emerald-300' : 'text-white';
    return (
        <div className={`${bg} border rounded-xl px-2 py-2 text-center`}>
            <div className="text-zinc-400 text-[9px] font-semibold uppercase tracking-wide mb-1">{label}</div>
            <div className={`${valueColor} ${big ? 'text-xl' : 'text-base'} font-bold font-mono leading-none`}>{value}</div>
            {unit && <div className="text-zinc-500 text-[9px] mt-0.5">{unit}</div>}
        </div>
    );
}

