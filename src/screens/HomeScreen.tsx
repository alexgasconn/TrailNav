import React, { useEffect, useState } from 'react';
import { Compass, Map as MapIcon, Upload, Navigation, ChevronRight, Activity, Wifi, WifiOff, Battery, Zap } from 'lucide-react';
import { getRoutes, Route } from '../lib/db';
import { Screen } from '../App';

export function HomeScreen({ onNavigate }: { onNavigate: (s: Screen, r?: Route) => void }) {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [gpsStatus, setGpsStatus] = useState('Checking...');
  const [batteryStatus, setBatteryStatus] = useState({ level: 0, charging: false });
  const [onlineStatus, setOnlineStatus] = useState(navigator.onLine);

  useEffect(() => {
    getRoutes().then(setRoutes);

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        () => setGpsStatus('Ready'),
        () => setGpsStatus('Unavailable'),
        { timeout: 5000, enableHighAccuracy: true }
      );
    } else {
      setGpsStatus('Not Supported');
    }

    // Check battery status for Android devices
    if ('getBattery' in navigator) {
      (navigator as any).getBattery().then((battery: any) => {
        setBatteryStatus({ level: Math.round(battery.level * 100), charging: battery.charging });
        battery.addEventListener('levelchange', () => {
          setBatteryStatus({ level: Math.round(battery.level * 100), charging: battery.charging });
        });
        battery.addEventListener('chargingtimechange', () => {
          setBatteryStatus({ level: Math.round(battery.level * 100), charging: battery.charging });
        });
      });
    }

    // Listen for online/offline status
    const handleOnline = () => setOnlineStatus(true);
    const handleOffline = () => setOnlineStatus(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <div className="p-4 space-y-6">
      <header className="flex items-center justify-between pt-8 pb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-emerald-500 flex items-center gap-2">
            <Compass className="w-8 h-8" />
            TrailNav
          </h1>
          <p className="text-zinc-400 text-sm mt-1">Offline GPS Navigation</p>
        </div>
      </header>

      {/* Status Cards */}
      <div className="grid grid-cols-2 gap-3">
        <StatusCard icon={<Navigation size={18} />} label="GPS" value={gpsStatus} color="text-emerald-400" />
        <StatusCard icon={<MapIcon size={18} />} label="Offline Maps" value="Available" color="text-blue-400" />
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3">
        <ActionButton
          icon={<Upload size={24} />}
          label="Import GPX"
          onClick={() => onNavigate('import')}
          primary
        />
        <ActionButton
          icon={<MapIcon size={24} />}
          label="Explorer"
          onClick={() => onNavigate('map')}
        />
      </div>

      {/* Recent Routes */}
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2 text-zinc-300">
          <Activity size={18} />
          Recent Routes
        </h2>

        {routes.length === 0 ? (
          <div className="bg-zinc-900 rounded-2xl p-6 text-center border border-zinc-800">
            <p className="text-zinc-500 mb-4">No routes imported yet.</p>
            <button
              onClick={() => onNavigate('import')}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-full text-sm font-medium transition-colors"
            >
              Import your first route
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {routes.map(route => (
              <button
                key={route.id}
                onClick={() => onNavigate('analysis', route)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-center justify-between hover:bg-zinc-800 transition-colors text-left group"
              >
                <div>
                  <h3 className="font-medium text-zinc-100 truncate pr-4">{route.name}</h3>
                  <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500 font-mono">
                    <span>{(route.distance / 1000).toFixed(1)} km</span>
                    <span>â€¢</span>
                    <span className="text-emerald-500/80">â†‘ {Math.round(route.elevationGain)}m</span>
                  </div>
                </div>
                <ChevronRight className="text-zinc-600 group-hover:text-emerald-500 transition-colors" size={20} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusCard({ icon, label, value, color }: { icon: React.ReactNode, label: string, value: string, color: string }) {
  return (
    <div className={`${color} rounded-2xl p-3 flex items-center gap-3 border border-opacity-20 border-white shadow-md touch-target`}>
      <div className="p-2.5 bg-black/20 rounded-lg">
        {icon}
      </div>
      <div className="flex-1">
        <p className="text-[11px] uppercase tracking-wider font-semibold opacity-75">{label}</p>
        <p className="text-sm font-bold">{value}</p>
      </div>
    </div>
  );
}

function ActionButton({ icon, label, onClick, primary }: { icon: React.ReactNode, label: string, onClick: () => void, primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center p-6 rounded-3xl transition-all active:scale-95 touch-target font-semibold shadow-lg ${primary
          ? 'bg-gradient-to-br from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white'
          : 'bg-gradient-to-br from-zinc-800 to-zinc-900 hover:from-zinc-700 hover:to-zinc-800 text-zinc-100'
        }`}
    >
      <div className="mb-2">{icon}</div>
      <span className="text-sm">{label}</span>
    </button>
  );
}
