import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_SETTINGS, Route, Settings, getRoute } from '../lib/db';
import { getRouteProfile, sampleProfile } from '../lib/routeProfile';
import { matchPosition } from '../lib/mapMatching';
import { ActualTrack, addTrackPoint, createActualTrack, replayTrack } from '../lib/actualTrack';
import { enableAlertAudio, playAlert } from '../lib/alerts';
import { getRoutePoints } from '../lib/routePoints';
import * as turf from '@turf/turf';
import { downloadGPX } from '../lib/gpx';

export type SessionStatus = 'idle' | 'active' | 'paused';

export interface SessionPosition {
    lng: number;
    lat: number;
    altitude: number | null;
    accuracy: number | null;
    /** Velocidad instantánea del GPS en km/h. */
    speed: number | null;
    course: number | null;
    timestamp: number;
}

export interface SessionMetrics {
    totalDistance: number;
    distanceDone: number;
    distanceRemaining: number;
    progress: number;
    elapsedSeconds: number;
    movingSeconds: number;
    currentSpeed: number | null;
    averageSpeed: number | null;
    paceSeconds: number | null;
    altitude: number | null;
    ascentDone: number | null;
    descentDone: number | null;
    /** Km realmente recorridos por el usuario (no los de la traza GPX). */
    actualDistance: number;
    actualAscent: number | null;
    actualDescent: number | null;
    ascentRemaining: number | null;
    descentRemaining: number | null;
    remainingSeconds: number | null;
    arrivalTimestamp: number | null;
    offRoute: boolean;
    distanceFromRoute: number | null;
    accuracy: number | null;
}

interface PersistedSession {
    routeId: string;
    startedAt: number;
    pausedTotalMs: number;
    pausedAt: number | null;
    status: Exclude<SessionStatus, 'idle'>;
    distanceDone: number;
    position: SessionPosition | null;
    autoPausedTotalMs?: number;
    autoPausedAt?: number | null;
}

interface NavigationSessionValue {
    route: Route | null;
    status: SessionStatus;
    metrics: SessionMetrics | null;
    position: SessionPosition | null;
    /** Rumbo suavizado de la brújula del dispositivo. */
    heading: number | null;
    /** Rumbo de desplazamiento suavizado, solo con movimiento real. */
    course: number | null;
    /** Recorrido real del usuario [lng, lat]. */
    trail: [number, number][];
    gpsError: string | null;
    hydrated: boolean;
    startSession: (route: Route) => void;
    pauseSession: () => void;
    resumeSession: () => void;
    stopSession: () => void;
    deviationThreshold: number;
    applySettings: (settings: Settings) => void;
    settings: Settings;
    autoPaused: boolean;
    notice: string | null;
    dismissNotice: () => void;
    exportTrack: () => void;
    toggleScreenAwake: () => void;
}

const STORAGE_KEY = 'trailnav-active-session';
const TRACK_KEY = 'trailnav-active-track';
const MAX_TRUSTED_ACCURACY = 50;

const NavigationSessionContext = createContext<NavigationSessionValue | null>(null);

function readPersisted(): PersistedSession | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as PersistedSession;
        if (!parsed?.routeId || !Number.isFinite(parsed.startedAt)) return null;
        return parsed;
    } catch {
        return null;
    }
}

function smoothAngle(previous: number | null, next: number, factor = 0.25): number {
    if (previous == null) return next;
    const delta = ((next - previous + 540) % 360) - 180;
    return (previous + delta * factor + 360) % 360;
}

export function NavigationSessionProvider({ children }: { children: React.ReactNode }) {
    const [route, setRoute] = useState<Route | null>(null);
    const [status, setStatus] = useState<SessionStatus>('idle');
    const [position, setPosition] = useState<SessionPosition | null>(null);
    const [distanceDone, setDistanceDone] = useState(0);
    const [distanceFromRoute, setDistanceFromRoute] = useState<number | null>(null);
    const [heading, setHeading] = useState<number | null>(null);
    const [course, setCourse] = useState<number | null>(null);
    const [gpsError, setGpsError] = useState<string | null>(null);
    const [hydrated, setHydrated] = useState(false);
    const [tick, setTick] = useState(0);
    const [trackVersion, setTrackVersion] = useState(0);
    const [deviationThreshold, setDeviationThreshold] = useState(30);
    const [screenAlwaysOn, setScreenAlwaysOn] = useState(true);
    const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
    const settingsRef = useRef(DEFAULT_SETTINGS);
    const [autoPaused, setAutoPaused] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);
    const autoPausedAtRef = useRef<number | null>(null);
    const autoPausedTotalRef = useRef(0);
    const stationarySinceRef = useRef<number | null>(null);
    const announcedRef = useRef(new Set<string>());
    const previousFixRef = useRef<{ coordinate: [number, number]; timestamp: number; accuracy: number } | null>(null);

    const startedAtRef = useRef(0);
    const pausedTotalRef = useRef(0);
    const pausedAtRef = useRef<number | null>(null);
    const watchIdRef = useRef<number | null>(null);
    const wakeLockRef = useRef<any>(null);
    const headingRef = useRef<number | null>(null);
    const courseRef = useRef<number | null>(null);
    const vibrationEnabledRef = useRef(true);
    const wasOffRouteRef = useRef(false);
    const trackRef = useRef<ActualTrack>(createActualTrack());

    const persistTrack = useCallback(() => {
        try {
            localStorage.setItem(TRACK_KEY, JSON.stringify(trackRef.current.points));
        } catch {
            /* almacenamiento lleno: el recorrido sigue en memoria */
        }
    }, []);

    // Rehidratación de la sesión tras cerrar o recargar la aplicación.
    useEffect(() => {
        const persisted = readPersisted();
        if (!persisted) {
            setHydrated(true);
            return;
        }
        getRoute(persisted.routeId)
            .then((storedRoute) => {
                if (!storedRoute) {
                    localStorage.removeItem(STORAGE_KEY);
                    return;
                }
                startedAtRef.current = persisted.startedAt;
                pausedTotalRef.current = persisted.pausedTotalMs;
                pausedAtRef.current = persisted.pausedAt;
                autoPausedTotalRef.current = persisted.autoPausedTotalMs ?? 0;
                autoPausedAtRef.current = persisted.autoPausedAt ?? null;
                setAutoPaused(autoPausedAtRef.current != null);
                setRoute(storedRoute);
                try {
                    const rawTrack = localStorage.getItem(TRACK_KEY);
                    trackRef.current = rawTrack ? replayTrack(JSON.parse(rawTrack)) : createActualTrack();
                    setTrackVersion((value) => value + 1);
                } catch {
                    trackRef.current = createActualTrack();
                }
                setDistanceDone(persisted.distanceDone);
                setPosition(persisted.position);
                setStatus(persisted.status);
            })
            .finally(() => setHydrated(true));
    }, []);

    useEffect(() => {
        if (status !== 'active') return;
        const interval = window.setInterval(() => setTick((value) => value + 1), 1000);
        return () => window.clearInterval(interval);
    }, [status]);

    // Brújula del dispositivo.
    useEffect(() => {
        if (status === 'idle') return;
        if (typeof DeviceOrientationEvent === 'undefined') return;
        let lastUpdate = 0;

        const onOrientation = (event: DeviceOrientationEvent) => {
            const now = Date.now();
            if (document.visibilityState !== 'visible' || now - lastUpdate < (settingsRef.current.batterySaver ? 800 : 150)) return;
            lastUpdate = now;
            const raw = (event as any).webkitCompassHeading ?? (event.alpha != null ? (360 - event.alpha) % 360 : null);
            if (raw == null || !Number.isFinite(raw)) return;
            headingRef.current = smoothAngle(headingRef.current, raw);
            setHeading(headingRef.current);
        };

        const attach = () => {
            window.addEventListener('deviceorientationabsolute', onOrientation as EventListener);
            window.addEventListener('deviceorientation', onOrientation as EventListener);
        };

        const requestPermission = (DeviceOrientationEvent as any)?.requestPermission;
        if (typeof requestPermission === 'function') {
            requestPermission
                .call(DeviceOrientationEvent)
                .then((result: string) => {
                    if (result === 'granted') attach();
                })
                .catch(() => undefined);
        } else {
            attach();
        }

        return () => {
            window.removeEventListener('deviceorientationabsolute', onOrientation as EventListener);
            window.removeEventListener('deviceorientation', onOrientation as EventListener);
        };
    }, [status]);

    // El seguimiento GPS vive en el proveedor para sobrevivir al cambio de pestaña.
    useEffect(() => {
        if (status !== 'active' || !route) return;
        if (!('geolocation' in navigator)) {
            setGpsError('Este dispositivo no permite geolocalización');
            return;
        }

        watchIdRef.current = navigator.geolocation.watchPosition(
            (browserPosition) => {
                const { latitude, longitude, altitude, accuracy, speed, heading: gpsHeading } = browserPosition.coords;
                setGpsError(null);

                let speedKmh = typeof speed === 'number' && Number.isFinite(speed) && speed >= 0 ? speed * 3.6 : null;
                const previousFix = previousFixRef.current;
                const seconds = previousFix ? (browserPosition.timestamp - previousFix.timestamp) / 1000 : 0;
                if (speedKmh == null && previousFix && seconds >= 1 && seconds <= 30 && accuracy <= 30 && previousFix.accuracy <= 30) {
                    const meters = turf.distance(previousFix.coordinate, [longitude, latitude], { units: 'meters' });
                    speedKmh = meters < Math.max(5, accuracy) ? 0 : meters / seconds * 3.6;
                }
                previousFixRef.current = { coordinate: [longitude, latitude], timestamp: browserPosition.timestamp, accuracy };
                if (typeof gpsHeading === 'number' && Number.isFinite(gpsHeading) && (speedKmh ?? 0) > 1) {
                    courseRef.current = smoothAngle(courseRef.current, gpsHeading, 0.35);
                    setCourse(courseRef.current);
                }

                setPosition({
                    lng: longitude,
                    lat: latitude,
                    altitude: typeof altitude === 'number' && Number.isFinite(altitude) ? altitude : null,
                    accuracy: typeof accuracy === 'number' && Number.isFinite(accuracy) ? accuracy : null,
                    speed: speedKmh,
                    course: courseRef.current,
                    timestamp: browserPosition.timestamp,
                });

                const matched = matchPosition(route, [longitude, latitude]);
                const now = Date.now();
                const preferences = settingsRef.current;
                if (preferences.autoPause && speedKmh != null && accuracy <= 30) {
                    if (speedKmh < preferences.autoPauseSpeed) {
                        stationarySinceRef.current ??= now;
                        if (now - stationarySinceRef.current >= 15000 && autoPausedAtRef.current == null) {
                            autoPausedAtRef.current = now;
                            setAutoPaused(true);
                        }
                    } else {
                        stationarySinceRef.current = null;
                        if (autoPausedAtRef.current != null) {
                            autoPausedTotalRef.current += now - autoPausedAtRef.current;
                            autoPausedAtRef.current = null;
                            setAutoPaused(false);
                        }
                    }
                }
                if (autoPausedAtRef.current == null && addTrackPoint(trackRef.current, longitude, latitude, typeof altitude === 'number' ? altitude : null, accuracy ?? null)) {
                    setTrackVersion((value) => value + 1);
                    if (trackRef.current.points.length % 10 === 0) persistTrack();
                }
                if (!matched) return;
                setDistanceFromRoute(matched.distanceFromRoute);

                // Con precisión pobre no se toca el progreso para no falsear las métricas.
                if (accuracy != null && accuracy > MAX_TRUSTED_ACCURACY) return;
                if (matched.distanceFromRoute > Math.max(120, deviationThreshold * 3)) return;
                setDistanceDone(matched.distanceAlongRoute);
            },
            (error) => setGpsError(error.message || 'No se puede obtener la ubicación'),
            { enableHighAccuracy: !settings.batterySaver, maximumAge: settings.batterySaver ? 10000 : 2000, timeout: 20000 }
        );

        return () => {
            if (watchIdRef.current !== null) {
                navigator.geolocation.clearWatch(watchIdRef.current);
                watchIdRef.current = null;
            }
        };
    }, [status, route, deviationThreshold, persistTrack, settings.batterySaver]);

    // Guarda el recorrido real al ocultar o cerrar la app.
    useEffect(() => {
        if (status === 'idle') return;
        const flush = () => persistTrack();
        window.addEventListener('pagehide', flush);
        document.addEventListener('visibilitychange', flush);
        return () => {
            window.removeEventListener('pagehide', flush);
            document.removeEventListener('visibilitychange', flush);
        };
    }, [status, persistTrack]);

    useEffect(() => {
        let cancelled = false;
        const request = async () => {
            if (status !== 'active' || !screenAlwaysOn || !(navigator as any).wakeLock) return;
            try {
                const lock = await (navigator as any).wakeLock.request('screen');
                if (cancelled) lock.release?.();
                else wakeLockRef.current = lock;
            } catch {
                /* el navegador puede denegarlo; no es crítico */
            }
        };
        request();
        const onVisibility = () => {
            if (document.visibilityState === 'visible') request();
        };
        document.addEventListener('visibilitychange', onVisibility);

        return () => {
            cancelled = true;
            document.removeEventListener('visibilitychange', onVisibility);
            wakeLockRef.current?.release?.();
            wakeLockRef.current = null;
        };
    }, [status, screenAlwaysOn]);

    const startSession = useCallback((nextRoute: Route) => {
        enableAlertAudio();
        autoPausedAtRef.current = null;
        autoPausedTotalRef.current = 0;
        stationarySinceRef.current = null;
        previousFixRef.current = null;
        announcedRef.current.clear();
        setAutoPaused(false);
        setNotice(null);
        startedAtRef.current = Date.now();
        pausedTotalRef.current = 0;
        pausedAtRef.current = null;
        courseRef.current = null;
        wasOffRouteRef.current = false;
        trackRef.current = createActualTrack();
        localStorage.removeItem(TRACK_KEY);
        setTrackVersion((value) => value + 1);
        setRoute(nextRoute);
        setDistanceDone(0);
        setDistanceFromRoute(null);
        setPosition(null);
        setCourse(null);
        setGpsError(null);
        setStatus('active');
    }, []);

    const pauseSession = useCallback(() => {
        setStatus((current) => {
            if (current !== 'active') return current;
            if (autoPausedAtRef.current != null) autoPausedTotalRef.current += Date.now() - autoPausedAtRef.current;
            autoPausedAtRef.current = null;
            stationarySinceRef.current = null;
            setAutoPaused(false);
            pausedAtRef.current = Date.now();
            return 'paused';
        });
    }, []);

    const resumeSession = useCallback(() => {
        setStatus((current) => {
            if (current !== 'paused') return current;
            if (pausedAtRef.current) pausedTotalRef.current += Date.now() - pausedAtRef.current;
            pausedAtRef.current = null;
            return 'active';
        });
    }, []);

    const stopSession = useCallback(() => {
        autoPausedAtRef.current = null;
        autoPausedTotalRef.current = 0;
        stationarySinceRef.current = null;
        setAutoPaused(false);
        setNotice(null);
        setStatus('idle');
        setRoute(null);
        setPosition(null);
        setDistanceDone(0);
        setDistanceFromRoute(null);
        setCourse(null);
        setHeading(null);
        headingRef.current = null;
        courseRef.current = null;
        startedAtRef.current = 0;
        pausedTotalRef.current = 0;
        pausedAtRef.current = null;
        trackRef.current = createActualTrack();
        setTrackVersion((value) => value + 1);
        localStorage.removeItem(TRACK_KEY);
        localStorage.removeItem(STORAGE_KEY);
    }, []);

    const applySettings = useCallback((settings: Settings) => {
        settingsRef.current = settings;
        setSettings(settings);
        if (settings.soundAlerts || settings.voiceAlerts) enableAlertAudio();
        if (!settings.autoPause && autoPausedAtRef.current != null) {
            autoPausedTotalRef.current += Date.now() - autoPausedAtRef.current;
            autoPausedAtRef.current = null;
            setAutoPaused(false);
        }
        setDeviationThreshold(settings.deviationWarningDistance);
        setScreenAlwaysOn(settings.screenAlwaysOn);
        vibrationEnabledRef.current = settings.vibrationAlerts;
    }, []);

    const metrics = useMemo<SessionMetrics | null>(() => {
        if (!route || status === 'idle') return null;
        void tick;

        const profile = getRouteProfile(route);
        const totalDistance = profile.totalDistance || route.distance;
        const done = Math.min(Math.max(distanceDone, 0), totalDistance);
        const actual = trackRef.current;
        const actualDistance = actual.distance;
        const remaining = Math.max(0, totalDistance - done);

        const reference = status === 'paused' && pausedAtRef.current ? pausedAtRef.current : Date.now();
        const elapsedMs = Math.max(0, reference - startedAtRef.current);
        const movingMs = Math.max(0, elapsedMs - pausedTotalRef.current - autoPausedTotalRef.current - (autoPausedAtRef.current != null ? reference - autoPausedAtRef.current : 0));
        const movingSeconds = Math.floor(movingMs / 1000);

        const averageSpeed = movingSeconds > 30 && actualDistance > 20 ? actualDistance / 1000 / (movingSeconds / 3600) : null;
        const paceSeconds = averageSpeed && averageSpeed > 0.2 ? 3600 / averageSpeed : null;
        const remainingSeconds = averageSpeed && averageSpeed > 0.5 ? (remaining / 1000 / averageSpeed) * 3600 : null;

        const sample = sampleProfile(profile, done);

        return {
            totalDistance,
            distanceDone: done,
            distanceRemaining: remaining,
            progress: totalDistance > 0 ? Math.min(1, done / totalDistance) : 0,
            elapsedSeconds: Math.floor(elapsedMs / 1000),
            movingSeconds,
            currentSpeed: status === 'paused' || autoPaused ? 0 : position?.speed ?? null,
            averageSpeed,
            paceSeconds,
            altitude: position?.altitude ?? sample?.elevation ?? null,
            ascentDone: sample?.ascent ?? null,
            descentDone: sample?.descent ?? null,
            actualDistance,
            actualAscent: actual.hasAltitude ? actual.ascent : null,
            actualDescent: actual.hasAltitude ? actual.descent : null,
            ascentRemaining: sample?.remainingAscent ?? null,
            descentRemaining: sample?.remainingDescent ?? null,
            remainingSeconds,
            arrivalTimestamp: remainingSeconds != null ? Date.now() + remainingSeconds * 1000 : null,
            offRoute: position?.accuracy != null && position.accuracy <= MAX_TRUSTED_ACCURACY && distanceFromRoute != null && distanceFromRoute > deviationThreshold,
            distanceFromRoute,
            accuracy: position?.accuracy ?? null,
        };
    }, [route, status, distanceDone, distanceFromRoute, position, deviationThreshold, tick, trackVersion, autoPaused]);

    const trail = useMemo<[number, number][]>(() => {
        void trackVersion;
        return trackRef.current.points.map((point) => [point[0], point[1]]);
    }, [trackVersion]);

    useEffect(() => {
        if (!route || status === 'idle') return;
        const payload: PersistedSession = {
            routeId: route.id,
            startedAt: startedAtRef.current,
            pausedTotalMs: pausedTotalRef.current,
            pausedAt: pausedAtRef.current,
            status: status === 'paused' ? 'paused' : 'active',
            distanceDone,
            position,
            autoPausedTotalMs: autoPausedTotalRef.current,
            autoPausedAt: autoPausedAtRef.current,
        };
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        } catch {
            /* almacenamiento lleno: la sesión sigue viva en memoria */
        }
    }, [route, status, distanceDone, position, autoPaused]);

    // Aviso háptico solo en la transición dentro/fuera de la traza.
    useEffect(() => {
        const offRoute = Boolean(metrics?.offRoute);
        if (offRoute === wasOffRouteRef.current) return;
        wasOffRouteRef.current = offRoute;
        if (offRoute && status === 'active') playAlert('Atención, fuera de ruta', settingsRef.current.soundAlerts, settingsRef.current.voiceAlerts);
        if (vibrationEnabledRef.current && 'vibrate' in navigator) {
            navigator.vibrate(offRoute ? [140, 70, 140] : 60);
        }
    }, [metrics?.offRoute]);

    useEffect(() => {
        if (!route || !position || status !== 'active' || !settings.waypointAlerts || (position.accuracy ?? Infinity) > 50 || metrics?.offRoute) return;
        const nearby = getRoutePoints(route).find((point) => point.kind !== 'start' && !announcedRef.current.has(point.id) &&
            Math.abs(point.distance - distanceDone) <= settings.waypointRadius * 2 &&
            turf.distance([position.lng, position.lat], point.coordinate, { units: 'meters' }) <= settings.waypointRadius);
        if (!nearby) return;
        announcedRef.current.add(nearby.id);
        const distance = Math.round(turf.distance([position.lng, position.lat], nearby.coordinate, { units: 'meters' }));
        const message = `A ${distance} metros: ${nearby.name}${nearby.kind === 'turn' ? ' (según el track)' : ''}`;
        setNotice(message);
        playAlert(message, settings.soundAlerts, settings.voiceAlerts);
        if (settings.vibrationAlerts) navigator.vibrate?.([80, 50, 80]);
    }, [route, position, status, settings, distanceDone, metrics?.offRoute]);

    const exportTrack = useCallback(() => {
        const coordinates = trackRef.current.points.map(([lng, lat, altitude]) => Number.isFinite(altitude) ? [lng, lat, altitude] : [lng, lat]);
        if (coordinates.length < 2) return;
        downloadGPX({ name: `${route?.name ?? 'Recorrido'} - grabación`, geoJson: turf.featureCollection([turf.lineString(coordinates)]) });
    }, [route]);

    const toggleScreenAwake = useCallback(() => setScreenAlwaysOn((value) => !value), []);
    const dismissNotice = useCallback(() => setNotice(null), []);

    const value = useMemo<NavigationSessionValue>(
        () => ({
            route,
            status,
            metrics,
            position,
            heading,
            course,
            trail,
            gpsError,
            hydrated,
            startSession,
            pauseSession,
            resumeSession,
            stopSession,
            deviationThreshold,
            applySettings,
            settings: { ...settings, screenAlwaysOn },
            autoPaused,
            notice,
            dismissNotice,
            exportTrack,
            toggleScreenAwake,
        }),
        [
            route,
            status,
            metrics,
            position,
            heading,
            course,
            trail,
            gpsError,
            hydrated,
            startSession,
            pauseSession,
            resumeSession,
            stopSession,
            deviationThreshold,
            applySettings,
            settings, screenAlwaysOn, autoPaused, notice, dismissNotice, exportTrack, toggleScreenAwake,
        ]
    );

    return <NavigationSessionContext.Provider value={value}>{children}</NavigationSessionContext.Provider>;
}

export function useNavigationSession() {
    const context = useContext(NavigationSessionContext);
    if (!context) throw new Error('useNavigationSession debe usarse dentro de NavigationSessionProvider');
    return context;
}
