import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Route, Settings, getRoute } from '../lib/db';
import { getRouteProfile, sampleProfile } from '../lib/routeProfile';
import { matchPosition } from '../lib/mapMatching';

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
    gpsError: string | null;
    hydrated: boolean;
    startSession: (route: Route) => void;
    pauseSession: () => void;
    resumeSession: () => void;
    stopSession: () => void;
    deviationThreshold: number;
    applySettings: (settings: Settings) => void;
}

const STORAGE_KEY = 'trailnav-active-session';
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
    const [deviationThreshold, setDeviationThreshold] = useState(30);
    const [screenAlwaysOn, setScreenAlwaysOn] = useState(true);

    const startedAtRef = useRef(0);
    const pausedTotalRef = useRef(0);
    const pausedAtRef = useRef<number | null>(null);
    const watchIdRef = useRef<number | null>(null);
    const wakeLockRef = useRef<any>(null);
    const headingRef = useRef<number | null>(null);
    const courseRef = useRef<number | null>(null);
    const vibrationEnabledRef = useRef(true);
    const wasOffRouteRef = useRef(false);

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
                setRoute(storedRoute);
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

        const onOrientation = (event: DeviceOrientationEvent) => {
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

                const speedKmh = typeof speed === 'number' && Number.isFinite(speed) && speed >= 0 ? speed * 3.6 : null;
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
                if (!matched) return;
                setDistanceFromRoute(matched.distanceFromRoute);

                // Con precisión pobre no se toca el progreso para no falsear las métricas.
                if (accuracy != null && accuracy > MAX_TRUSTED_ACCURACY) return;
                if (matched.distanceFromRoute > Math.max(120, deviationThreshold * 3)) return;
                setDistanceDone(matched.distanceAlongRoute);
            },
            (error) => setGpsError(error.message || 'No se puede obtener la ubicación'),
            { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
        );

        return () => {
            if (watchIdRef.current !== null) {
                navigator.geolocation.clearWatch(watchIdRef.current);
                watchIdRef.current = null;
            }
        };
    }, [status, route, deviationThreshold]);

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
        startedAtRef.current = Date.now();
        pausedTotalRef.current = 0;
        pausedAtRef.current = null;
        courseRef.current = null;
        wasOffRouteRef.current = false;
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
        localStorage.removeItem(STORAGE_KEY);
    }, []);

    const applySettings = useCallback((settings: Settings) => {
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
        const remaining = Math.max(0, totalDistance - done);

        const reference = status === 'paused' && pausedAtRef.current ? pausedAtRef.current : Date.now();
        const elapsedMs = Math.max(0, reference - startedAtRef.current);
        const movingMs = Math.max(0, elapsedMs - pausedTotalRef.current);
        const movingSeconds = Math.floor(movingMs / 1000);

        const averageSpeed = movingSeconds > 30 && done > 20 ? done / 1000 / (movingSeconds / 3600) : null;
        const paceSeconds = averageSpeed && averageSpeed > 0.2 ? 3600 / averageSpeed : null;
        const remainingSeconds = averageSpeed && averageSpeed > 0.5 ? (remaining / 1000 / averageSpeed) * 3600 : null;

        const sample = sampleProfile(profile, done);

        return {
            totalDistance,
            distanceDone: done,
            distanceRemaining: remaining,
            progress: totalDistance > 0 ? done / totalDistance : 0,
            elapsedSeconds: Math.floor(elapsedMs / 1000),
            movingSeconds,
            currentSpeed: status === 'paused' ? 0 : position?.speed ?? null,
            averageSpeed,
            paceSeconds,
            altitude: position?.altitude ?? sample?.elevation ?? null,
            ascentDone: sample?.ascent ?? null,
            descentDone: sample?.descent ?? null,
            ascentRemaining: sample?.remainingAscent ?? null,
            descentRemaining: sample?.remainingDescent ?? null,
            remainingSeconds,
            arrivalTimestamp: remainingSeconds != null ? Date.now() + remainingSeconds * 1000 : null,
            offRoute: distanceFromRoute != null && distanceFromRoute > deviationThreshold,
            distanceFromRoute,
            accuracy: position?.accuracy ?? null,
        };
    }, [route, status, distanceDone, distanceFromRoute, position, deviationThreshold, tick]);

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
        };
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        } catch {
            /* almacenamiento lleno: la sesión sigue viva en memoria */
        }
    }, [route, status, distanceDone, position]);

    // Aviso háptico solo en la transición dentro/fuera de la traza.
    useEffect(() => {
        const offRoute = Boolean(metrics?.offRoute);
        if (offRoute === wasOffRouteRef.current) return;
        wasOffRouteRef.current = offRoute;
        if (vibrationEnabledRef.current && 'vibrate' in navigator) {
            navigator.vibrate(offRoute ? [140, 70, 140] : 60);
        }
    }, [metrics?.offRoute]);

    const value = useMemo<NavigationSessionValue>(
        () => ({
            route,
            status,
            metrics,
            position,
            heading,
            course,
            gpsError,
            hydrated,
            startSession,
            pauseSession,
            resumeSession,
            stopSession,
            deviationThreshold,
            applySettings,
        }),
        [
            route,
            status,
            metrics,
            position,
            heading,
            course,
            gpsError,
            hydrated,
            startSession,
            pauseSession,
            resumeSession,
            stopSession,
            deviationThreshold,
            applySettings,
        ]
    );

    return <NavigationSessionContext.Provider value={value}>{children}</NavigationSessionContext.Provider>;
}

export function useNavigationSession() {
    const context = useContext(NavigationSessionContext);
    if (!context) throw new Error('useNavigationSession debe usarse dentro de NavigationSessionProvider');
    return context;
}
