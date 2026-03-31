import { useState, useEffect } from 'react';

interface BatteryStatus {
    level: number;
    charging: boolean;
    dischargingTime?: number;
    chargingTime?: number;
}

export function useBatteryStatus() {
    const [battery, setBattery] = useState<BatteryStatus>({
        level: 100,
        charging: false,
    });

    useEffect(() => {
        // Check if Battery Status API is available (Android Chrome, Firefox)
        const checkBattery = async () => {
            try {
                if ('getBattery' in navigator) {
                    const bt = await (navigator as any).getBattery();

                    const updateStatus = () => {
                        setBattery({
                            level: Math.round(bt.level * 100),
                            charging: bt.charging,
                            dischargingTime: bt.dischargingTime,
                            chargingTime: bt.chargingTime,
                        });
                    };

                    updateStatus();

                    // Listen for changes
                    bt.addEventListener('levelchange', updateStatus);
                    bt.addEventListener('chargingchange', updateStatus);
                    bt.addEventListener('chargingtimechange', updateStatus);
                    bt.addEventListener('dischargingtimechange', updateStatus);

                    return () => {
                        bt.removeEventListener('levelchange', updateStatus);
                        bt.removeEventListener('chargingchange', updateStatus);
                        bt.removeEventListener('chargingtimechange', updateStatus);
                        bt.removeEventListener('dischargingtimechange', updateStatus);
                    };
                }
            } catch (error) {
                console.warn('Battery Status API not available:', error);
            }
        };

        return checkBattery();
    }, []);

    return battery;
}

export function useOnlineStatus() {
    const [isOnline, setIsOnline] = useState(navigator.onLine);

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    return isOnline;
}

export function useDeviceOrientation() {
    const [orientation, setOrientation] = useState({
        alpha: 0, // Z axis rotation
        beta: 0,  // X axis rotation
        gamma: 0, // Y axis rotation
    });

    useEffect(() => {
        const handleDeviceOrientation = (event: DeviceOrientationEvent) => {
            setOrientation({
                alpha: event.alpha || 0,
                beta: event.beta || 0,
                gamma: event.gamma || 0,
            });
        };

        // Request permission for iOS 13+
        if (typeof DeviceOrientationEvent !== 'undefined' && 'requestPermission' in DeviceOrientationEvent) {
            (DeviceOrientationEvent as any)
                .requestPermission()
                .then((permission) => {
                    if (permission === 'granted') {
                        window.addEventListener('deviceorientation', handleDeviceOrientation);
                    }
                })
                .catch(console.warn);
        } else if (typeof DeviceOrientationEvent !== 'undefined') {
            // For Android and non-iOS devices
            window.addEventListener('deviceorientation', handleDeviceOrientation);
        }

        return () => {
            window.removeEventListener('deviceorientation', handleDeviceOrientation);
        };
    }, []);

    return orientation;
}

export function useVibration() {
    return {
        vibrate: (pattern: number | number[]) => {
            if ('vibrate' in navigator) {
                navigator.vibrate(pattern);
            }
        },
        cancel: () => {
            if ('vibrate' in navigator) {
                navigator.vibrate(0);
            }
        },
    };
}

export function useScreenWakeLock() {
    const [isLocked, setIsLocked] = useState(false);

    const lock = async () => {
        try {
            await (navigator as any).wakeLock?.request('screen');
            setIsLocked(true);
        } catch (error) {
            console.warn('Wake Lock request failed:', error);
        }
    };

    const unlock = () => {
        setIsLocked(false);
    };

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.hidden) {
                unlock();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, []);

    return { isLocked, lock, unlock };
}
