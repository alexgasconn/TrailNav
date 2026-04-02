import React, { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { AlertTriangle, Compass, Pause, Play, XCircle } from 'lucide-react';
import { Route } from '../lib/db';
import { Screen } from '../App';
import * as turf from '@turf/turf';
import { useScreenWakeLock, useVibration } from '../hooks';

export function NavigationScreen({ route, onNavigate }: { route: Route, onNavigate: (s: Screen, r?: Route) => void }) {
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<maplibregl.Map | null>(null);
    const userMarker = useRef<maplibregl.Marker | null>(null);

    const [speed, setSpeed] = useState(0);
    const [elevation, setElevation] = useState(0);
    const [distanceToFinish, setDistanceToFinish] = useState(route.distance);
    const [elapsedTime, setElapsedTime] = useState(0);
    const [offRoute, setOffRoute] = useState(false);
    const [heading, setHeading] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const [accuracy, setAccuracy] = useState<number | null>(null);

    const watchId = useRef<number | null>(null);
    const startTimeRef = useRef<number>(Date.now());
    const timerRef = useRef<number | null>(null);
    const { lock: lockScreen } = useScreenWakeLock();
    const vibration = useVibration();
    const cameraBearingRef = useRef<number>(0);

    // Initialize map once
    useEffect(() => {
        if (map.current || !mapContainer.current) return;

        // Ensure container has dimensions
        const rect = mapContainer.current.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
            console.warn('Map container has no dimensions, waiting for layout...');
            // Schedule retry with a small delay
            const timer = setTimeout(() => {
                // Clear map.current to allow retry
                map.current = null;
                // This effect will run again
            }, 100);
            return () => clearTimeout(timer);
        }

        const styleConfig = {
            version: 8 as const,
            glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
            sources: {
                osm: {
                    type: 'raster' as const,
                    tiles: [
                        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                        'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
                        'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
                        'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'
                    ],
                    tileSize: 256,
                    attribution: '© OpenStreetMap contributors'
                }
            },
            layers: [
                {
                    id: 'osm',
                    type: 'raster' as const,
                    source: 'osm',
                    minzoom: 0,
                    maxzoom: 19,
                    paint: {
                        'raster-opacity': 1
                    }
                }
            ]
        };

        try {
            map.current = new maplibregl.Map({
                container: mapContainer.current,
                style: styleConfig as any,
                center: [0, 0],
                zoom: 17.8,
                pitch: 62,
                bearing: 0,
                attributionControl: false,
                interactive: false,
                trackResize: true
            });
            map.current.on('error', (event) => {
                console.error('MapLibre error:', event.error);
            });
        } catch (error) {
            console.error('Map initialization error:', error);
            return;
        }

        if (!map.current) return;

        map.current.on('load', () => {
            if (!map.current || !route.geoJson) return;

            // Add route source
            map.current.addSource('route', {
                type: 'geojson',
                data: route.geoJson
            });

            // Route shadow/casing
            map.current.addLayer({
                id: 'route-casing',
                type: 'line',
                source: 'route',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: { 'line-color': '#064e3b', 'line-width': 14, 'line-opacity': 0.9 }
            });

            // Route main line
            map.current.addLayer({
                id: 'route-core',
                type: 'line',
                source: 'route',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: { 'line-color': '#10b981', 'line-width': 7 }
            });

            // User location marker with better styling
            const el = document.createElement('div');
            el.className = 'w-10 h-10 bg-emerald-500 rounded-full border-4 border-white shadow-xl flex items-center justify-center transition-transform duration-200 accelerated';
            el.style.boxShadow = '0 0 20px rgba(16, 185, 129, 0.6), 0 0 40px rgba(16, 185, 129, 0.3)';
            el.innerHTML = '<div style="width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-bottom: 10px solid white; position: relative; top: -2px;"></div>';

            userMarker.current = new maplibregl.Marker({ element: el, rotationAlignment: 'map' })
                .setLngLat([0, 0])
                .addTo(map.current);

            startTracking();
        });

        lockScreen().catch(console.warn);

        return () => {
            if (watchId.current !== null) {
                navigator.geolocation.clearWatch(watchId.current);
            }
            if (timerRef.current !== null) {
                clearInterval(timerRef.current);
            }
            window.removeEventListener('deviceorientationabsolute', handleDeviceOrientation as any);
            map.current?.remove();
            map.current = null;
        };
    }, [route, lockScreen]);

    // Handle device orientation changes
    const handleDeviceOrientation = useCallback((event: DeviceOrientationEvent) => {
        const compassHeading = (event as any).webkitCompassHeading || (event.alpha ? Math.abs(event.alpha - 360) : null);
        if (compassHeading !== null && map.current) {
            setHeading(compassHeading);
            cameraBearingRef.current = compassHeading;
            map.current.easeTo({ bearing: compassHeading, duration: 500 });
        }
    }, []);

    const startTracking = useCallback(() => {
        if (!('geolocation' in navigator)) return;

        // Request permission for orientation on iOS 13+
        if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
            (DeviceOrientationEvent as any)
                .requestPermission()
                .then((response: string) => {
                    if (response === 'granted') {
                        window.addEventListener('deviceorientationabsolute', handleDeviceOrientation as any);
                    }
                })
                .catch(console.error);
        } else {
            window.addEventListener('deviceorientationabsolute', handleDeviceOrientation as any);
        }

        // Start position and time tracking
        watchId.current = navigator.geolocation.watchPosition(
            (position) => {
                if (isPaused) return;

                const { latitude, longitude, speed: gpsSpeed, altitude, accuracy: gpsAccuracy } = position.coords;
                const userPt = turf.point([longitude, latitude]);

                // Update map and marker with car-style third-person camera
                if (map.current && userMarker.current) {
                    userMarker.current.setLngLat([longitude, latitude]);

                    const gpsHeading = typeof position.coords.heading === 'number' && !Number.isNaN(position.coords.heading)
                        ? position.coords.heading
                        : null;
                    if (gpsHeading !== null) {
                        cameraBearingRef.current = gpsHeading;
                        setHeading(gpsHeading);
                    }

                    map.current.easeTo({
                        center: [longitude, latitude],
                        bearing: cameraBearingRef.current,
                        pitch: 62,
                        zoom: 17.8,
                        offset: [0, 220] as [number, number],
                        duration: 700,
                    });
                }

                // Update metrics
                setSpeed(gpsSpeed ? gpsSpeed * 3.6 : 0); // Convert m/s to km/h
                if (altitude) setElevation(Math.round(altitude));
                if (gpsAccuracy) setAccuracy(Math.round(gpsAccuracy));

                // Check if off route
                if (route.geoJson) {
                    const lineFeature = route.geoJson.features[0];
                    const lineGeometry = lineFeature.geometry.type === 'LineString'
                        ? turf.lineString(lineFeature.geometry.coordinates)
                        : turf.lineString(lineFeature.geometry.coordinates[0]);

                    const distanceToRoute = turf.pointToLineDistance(userPt, lineGeometry, { units: 'meters' });

                    if (distanceToRoute > 30 && !offRoute) {
                        setOffRoute(true);
                        vibration.vibrate([100, 50, 100]); // Double vibration for off-route
                        if (map.current) {
                            map.current.setPaintProperty('route-core', 'line-color', '#ef4444');
                        }
                    } else if (distanceToRoute <= 25 && offRoute) {
                        setOffRoute(false);
                        vibration.vibrate(60); // Single vibration for back on-route
                        if (map.current) {
                            map.current.setPaintProperty('route-core', 'line-color', '#10b981');
                        }
                    }

                    // Calculate remaining distance
                    const coords = lineGeometry.geometry.coordinates;
                    const endPt = turf.point(coords[coords.length - 1]);
                    const dist = turf.distance(userPt, endPt, { units: 'kilometers' }) * 1000;
                    setDistanceToFinish(dist);
                }
            },
            (error) => {
                console.error('Geolocation error:', error);
                if (error.code === 1) {
                    alert('Location permission denied. Please enable location in settings.');
                }
            },
            { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
        );
    }, [route, isPaused, offRoute, vibration, handleDeviceOrientation]);

    // Update elapsed time
    useEffect(() => {
        if (isPaused) return;

        timerRef.current = window.setInterval(() => {
            setElapsedTime(Math.floor((Date.now() - startTimeRef.current) / 1000));
        }, 1000);

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [isPaused]);

    const formatTime = (seconds: number): string => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const estimatedTimeRemaining = speed > 0 ? Math.round((distanceToFinish / 1000) / (speed / 3.6)) : 0;

    return (
        <div className="w-full h-full bg-zinc-950 relative overflow-hidden">
            {/* Map Container */}
            <div ref={mapContainer} className="w-full h-full absolute inset-0" />

            {/* Top Navigation Bar */}
            <div className="absolute top-0 left-0 right-0 pt-safe px-4 py-3 bg-gradient-to-b from-zinc-950/95 to-transparent z-20">
                <div className="flex justify-between items-center">
                    <button
                        onClick={() => onNavigate('analysis', route)}
                        className="p-3 bg-zinc-900/80 backdrop-blur-md border border-zinc-800 rounded-full text-white hover:bg-zinc-800 transition-colors shadow-lg touch-target"
                        aria-label="Exit navigation"
                    >
                        <XCircle size={24} />
                    </button>

                    <h2 className="text-white font-bold text-lg flex-1 text-center px-4">{route.name}</h2>

                    <button
                        onClick={() => {
                            setIsPaused(!isPaused);
                            if (!isPaused) {
                                vibration.vibrate(100);
                            }
                        }}
                        className="p-3 bg-zinc-900/80 backdrop-blur-md border border-zinc-800 rounded-full text-white hover:bg-zinc-800 transition-colors shadow-lg touch-target"
                        aria-label={isPaused ? 'Resume' : 'Pause'}
                    >
                        {isPaused ? <Play size={24} /> : <Pause size={24} />}
                    </button>
                </div>
            </div>

            {/* Main Metrics - Top Section */}
            <div className="absolute top-24 left-4 right-4 z-10">
                <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 backdrop-blur-md rounded-3xl p-6 shadow-2xl">
                    <div className="grid grid-cols-4 gap-2">
                        <MetricBox label="Distance" value={`${(distanceToFinish / 1000).toFixed(2)}`} unit="km" />
                        <MetricBox label="Speed" value={speed.toFixed(0)} unit="km/h" highlight={speed > 0} />
                        <MetricBox label="Time" value={formatTime(elapsedTime)} unit="" />
                        <MetricBox label="ETA" value={estimatedTimeRemaining.toString()} unit="min" />
                    </div>
                </div>
            </div>

            {/* Off-Route Alert */}
            {offRoute && (
                <div className="absolute top-48 left-4 right-4 z-10 animate-pulse">
                    <div className="bg-red-600/95 backdrop-blur-md border-2 border-red-400 text-white px-6 py-4 rounded-2xl font-bold flex items-center gap-3 shadow-2xl shadow-red-900/50">
                        <AlertTriangle size={28} />
                        <div>
                            <div className="text-lg">OFF ROUTE</div>
                            <div className="text-xs opacity-90">Return to the marked trail</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Bottom Info Panel */}
            <div className="absolute bottom-0 left-0 right-0 pb-safe px-4 py-6 bg-gradient-to-t from-zinc-950 via-zinc-950/80 to-transparent z-10">
                <div className="grid grid-cols-3 gap-3 mb-4">
                    <InfoBox
                        label="Elevation"
                        value={elevation.toString()}
                        unit="m"
                        icon="📏"
                    />
                    <InfoBox
                        label="Accuracy"
                        value={accuracy?.toString() || 'N/A'}
                        unit={accuracy ? 'm' : ''}
                        icon="🎯"
                    />
                    <InfoBox
                        label="Heading"
                        value={Math.round(heading).toString()}
                        unit="°"
                        icon="🧭"
                    />
                </div>

                {isPaused && (
                    <div className="bg-yellow-900/50 border border-yellow-700 text-yellow-100 px-4 py-3 rounded-xl text-sm text-center font-medium">
                        Navigation paused - Tap play to resume
                    </div>
                )}
            </div>

            {/* Floating Compass */}
            <div className="absolute bottom-24 right-4 z-10">
                <div className="bg-zinc-900/90 backdrop-blur-md border border-zinc-700 rounded-full p-4 shadow-lg">
                    <Compass
                        size={32}
                        className="text-emerald-500 transition-transform duration-300 accelerated"
                        style={{ transform: `rotate(${-heading}deg)` }}
                    />
                </div>
            </div>
        </div>
    );
}

function MetricBox({ label, value, unit, highlight }: { label: string, value: string, unit: string, highlight?: boolean }) {
    return (
        <div className={`${highlight ? 'bg-white/20' : 'bg-white/10'} rounded-xl p-3 text-white text-center transition-colors`}>
            <div className="text-[10px] font-semibold opacity-80 mb-1">{label}</div>
            <div className="text-lg font-bold font-mono">{value}</div>
            {unit && <div className="text-[9px] opacity-60">{unit}</div>}
        </div>
    );
}

function InfoBox({ label, value, unit, icon }: { label: string, value: string, unit: string, icon: string }) {
    return (
        <div className="bg-zinc-900/80 backdrop-blur-sm border border-zinc-800 rounded-2xl p-3 text-center">
            <div className="text-2xl mb-1">{icon}</div>
            <div className="text-[10px] font-semibold text-zinc-400 mb-1">{label}</div>
            <div className="text-lg font-bold text-white font-mono">{value}{unit && ` ${unit}`}</div>
        </div>
    );
}
