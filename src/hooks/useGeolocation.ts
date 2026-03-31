import { useState, useEffect, useRef } from 'react';

interface GeolocationState {
    latitude: number | null;
    longitude: number | null;
    accuracy: number | null;
    altitude: number | null;
    heading: number | null;
    speed: number | null;
    timestamp: number | null;
    error: string | null;
    isTracking: boolean;
}

export function useGeolocation(enableTracking = false, enableHighAccuracy = true) {
    const [state, setState] = useState<GeolocationState>({
        latitude: null,
        longitude: null,
        accuracy: null,
        altitude: null,
        heading: null,
        speed: null,
        timestamp: null,
        error: null,
        isTracking: false,
    });

    const watchIdRef = useRef<number | null>(null);

    useEffect(() => {
        if (!enableTracking) return;

        if (!navigator.geolocation) {
            setState(prev => ({ ...prev, error: 'Geolocation not supported' }));
            return;
        }

        // Get initial position
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { coords, timestamp } = position;
                setState({
                    latitude: coords.latitude,
                    longitude: coords.longitude,
                    accuracy: coords.accuracy,
                    altitude: coords.altitude,
                    heading: coords.heading,
                    speed: coords.speed,
                    timestamp,
                    error: null,
                    isTracking: true,
                });
            },
            (error) => {
                setState(prev => ({
                    ...prev,
                    error: error.message || 'Failed to get position',
                    isTracking: false,
                }));
            },
            {
                enableHighAccuracy,
                timeout: 10000,
                maximumAge: 0, // Don't use cached position
            }
        );

        // Watch position for continuous tracking
        watchIdRef.current = navigator.geolocation.watchPosition(
            (position) => {
                const { coords, timestamp } = position;
                setState({
                    latitude: coords.latitude,
                    longitude: coords.longitude,
                    accuracy: coords.accuracy,
                    altitude: coords.altitude,
                    heading: coords.heading,
                    speed: coords.speed,
                    timestamp,
                    error: null,
                    isTracking: true,
                });
            },
            (error) => {
                setState(prev => ({
                    ...prev,
                    error: error.message || 'Location tracking error',
                }));
            },
            {
                enableHighAccuracy,
                timeout: 5000,
                maximumAge: 0,
            }
        );

        return () => {
            if (watchIdRef.current !== null) {
                navigator.geolocation.clearWatch(watchIdRef.current);
            }
        };
    }, [enableTracking, enableHighAccuracy]);

    return state;
}
