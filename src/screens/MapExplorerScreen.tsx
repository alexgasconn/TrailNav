import React, { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import * as turf from '@turf/turf';
import { Crosshair, Layers, Navigation2, Route as RouteIcon } from 'lucide-react';
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

    const [mapStyle, setMapStyle] = useState<MapStyleId | null>(null);
    const [showStylePicker, setShowStylePicker] = useState(false);
    const [gpsError, setGpsError] = useState<string | null>(null);
    const [initAttempt, setInitAttempt] = useState(0);

    const profile = useMemo(() => (route ? getRouteProfile(route) : null), [route]);
    const routePoints = useMemo(() => (route ? getRoutePoints(route) : []), [route]);

    useEffect(() => {
        getSettings().then((settings) => setMapStyle(settings.mapStyle));
    }, []);

    useEffect(() => {
        if (mapRef.current || !containerRef.current || !mapStyle) return;

        const rect = containerRef.current.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
            const timer = window.setTimeout(() => setInitAttempt((value) => value + 1), 120);
            return () => window.clearTimeout(timer);
        }

        const map = new maplibregl.Map({
            container: containerRef.current,
            style: buildMapStyle(mapStyle),
            center: profile?.coordinates[0] ?? [-3.7, 40.4],
            zoom: profile ? 12 : 5,
            attributionControl: { compact: true },
            trackResize: true,
        });
        mapRef.current = map;

        map.on('error', (event) => console.error('MapLibre:', event.error));
        map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');

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
                    .setLngLat(positionRef.current ?? profile?.coordinates[0] ?? [-3.7, 40.4])
                    .addTo(map);
                if (!positionRef.current) userMarkerRef.current.getElement().style.display = 'none';
            }
        };

        map.on('load', () => {
            applyOverlays();
            if (route?.geoJson) {
                map.fitBounds(turf.bbox(route.geoJson) as [number, number, number, number], { padding: 60, duration: 0 });
            }
        });

        return () => {
            poiMarkersRef.current.forEach((marker) => marker.remove());
            poiMarkersRef.current = [];
            userMarkerRef.current = null;
            map.remove();
            mapRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [route?.id, mapStyle, initAttempt]);

    useEffect(() => {
        if (!('geolocation' in navigator)) {
            setGpsError('Este dispositivo no permite geolocalización');
            return;
        }

        watchIdRef.current = navigator.geolocation.watchPosition(
            (browserPosition) => {
                const { longitude, latitude, accuracy, heading } = browserPosition.coords;
                positionRef.current = [longitude, latitude];
                setGpsError(null);

                const marker = userMarkerRef.current;
                const map = mapRef.current;
                if (!marker || !map) return;

                marker.getElement().style.display = 'block';
                marker.setLngLat([longitude, latitude]);
                const metersPerPixel = (156543.03392 * Math.cos((latitude * Math.PI) / 180)) / 2 ** map.getZoom();
                updateUserMarkerElement(marker.getElement(), {
                    heading: typeof heading === 'number' && Number.isFinite(heading) ? heading : null,
                    course: null,
                    accuracyPixels: accuracy != null ? accuracy / metersPerPixel : null,
                });
            },
            (error) => setGpsError(error.message || 'No se puede obtener la ubicación'),
            { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
        );

        return () => {
            if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
        };
    }, []);

    const changeStyle = async (style: MapStyleId) => {
        setShowStylePicker(false);
        setMapStyle(style);
        const settings = await getSettings();
        await saveSettings({ ...settings, mapStyle: style });
    };

    const recenter = () => {
        if (!mapRef.current || !positionRef.current) return;
        mapRef.current.easeTo({ center: positionRef.current, zoom: Math.max(14, mapRef.current.getZoom()), duration: 600 });
    };

    const isNavigatingThisRoute = session.status !== 'idle' && session.route?.id === route?.id;

    return (
        <div className="w-full h-full relative overflow-hidden bg-canvas">
            <div ref={containerRef} className="absolute inset-0" />

            <div className="absolute top-0 left-0 right-0 pt-safe px-3 py-3 flex justify-between items-start gap-2 z-10 pointer-events-none">
                <div className="bg-surface/95 border border-line rounded-xl px-3 py-2 shadow-sm max-w-[60%]">
                    <p className="text-[11px] uppercase tracking-wider text-ink-faint">Mapa</p>
                    <p className="text-sm font-semibold text-ink truncate">{route ? route.name : 'Sin ruta seleccionada'}</p>
                </div>

                <div className="flex flex-col items-end gap-2 pointer-events-auto">
                    <button
                        onClick={recenter}
                        className="touch-target grid place-items-center bg-surface border border-line rounded-xl shadow-sm text-ink"
                        aria-label="Centrar en mi posición"
                    >
                        <Crosshair size={22} />
                    </button>
                    <button
                        onClick={() => setShowStylePicker((value) => !value)}
                        className="touch-target grid place-items-center bg-surface border border-line rounded-xl shadow-sm text-ink"
                        aria-label="Cambiar tipo de mapa"
                    >
                        <Layers size={22} />
                    </button>
                    {showStylePicker && (
                        <div className="bg-surface border border-line rounded-xl p-1.5 shadow-md w-40">
                            {(Object.keys(MAP_STYLE_LABELS) as MapStyleId[]).map((style) => (
                                <button
                                    key={style}
                                    onClick={() => changeStyle(style)}
                                    className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium ${mapStyle === style ? 'bg-moss-soft text-moss-strong' : 'text-ink-soft'}`}
                                >
                                    {MAP_STYLE_LABELS[style]}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {gpsError && (
                <div className="absolute left-3 right-3 top-24 bg-clay-soft border border-clay/30 text-clay px-3 py-2 rounded-xl text-sm z-10">
                    {gpsError}
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
                <div className="absolute left-3 right-3 bottom-3 bg-surface border border-line rounded-2xl p-4 shadow-lg z-10 flex items-center gap-3">
                    <RouteIcon size={20} className="text-ink-faint shrink-0" />
                    <p className="text-sm text-ink-soft flex-1">Selecciona una ruta para verla sobre el mapa.</p>
                    <button onClick={() => onNavigate('home')} className="h-10 px-3 rounded-lg bg-moss text-white text-sm font-semibold">
                        Mis rutas
                    </button>
                </div>
            )}
        </div>
    );
}
