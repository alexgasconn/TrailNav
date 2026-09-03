import React, { useEffect, useState } from 'react';
import { Compass, Plus, Navigation, ChevronRight, Route as RouteIcon, Wifi, WifiOff, Battery, Satellite, Play } from 'lucide-react';
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
    <div className="max-w-3xl mx-auto p-4 space-y-6 pb-8">
      <header className="pt-8 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-emerald-400">
            <Compass className="w-7 h-7" />
            <span className="text-sm font-bold uppercase tracking-widest">TrailNav</span>
          </div>
          <h1 className="text-3xl font-bold text-zinc-100 mt-3">Mis rutas</h1>
          <p className="text-zinc-500 text-sm mt-1">Prepara, analiza y navega sin cobertura.</p>
        </div>
        <button
          onClick={() => onNavigate('import')}
          className="h-12 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl flex items-center gap-2 font-semibold shadow-lg shadow-emerald-950/30"
        >
          <Plus size={20} />
          <span>Añadir</span>
        </button>
      </header>

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <StatusChip icon={<Satellite size={15} />} label={`GPS ${translateStatus(gpsStatus)}`} active={gpsStatus === 'Ready'} />
        <StatusChip icon={onlineStatus ? <Wifi size={15} /> : <WifiOff size={15} />} label={onlineStatus ? 'Con conexion' : 'Modo offline'} active={onlineStatus} />
        {batteryStatus.level > 0 && <StatusChip icon={<Battery size={15} />} label={`${batteryStatus.level}%${batteryStatus.charging ? ' cargando' : ''}`} active={batteryStatus.charging} />}
      </div>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
            <RouteIcon size={17} /> Rutas guardadas
          </h2>
          <span className="text-xs text-zinc-600">{routes.length}</span>
        </div>

        {routes.length === 0 ? (
          <div className="bg-zinc-900 rounded-2xl p-8 text-center border border-zinc-800">
            <RouteIcon className="mx-auto text-zinc-700" size={34} />
            <p className="text-zinc-300 font-semibold mt-4">Todavia no hay rutas</p>
            <p className="text-zinc-500 text-sm mt-1 mb-5">Importa un track para analizar desnivel, ETA y meteorologia.</p>
            <button
              onClick={() => onNavigate('import')}
              className="px-4 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-sm font-semibold transition-colors"
            >
              Importar primera ruta
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {routes.map(route => (
              <article key={route.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
                <button onClick={() => onNavigate('analysis', route)} className="w-full flex items-start justify-between text-left group">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-zinc-100 truncate pr-4">{route.name}</h3>
                    <div className="flex items-center gap-3 mt-2 text-xs text-zinc-400">
                      <span>{(route.distance / 1000).toFixed(1)} km</span>
                      <span className="text-emerald-400">+{Math.round(route.elevationGain)} m</span>
                      <span>{Math.round(route.maxElevation)} m max</span>
                    </div>
                  </div>
                  <ChevronRight className="text-zinc-600 group-hover:text-emerald-500 transition-colors shrink-0" size={20} />
                </button>
                <div className="flex gap-2 mt-4 pt-3 border-t border-zinc-800">
                  <button onClick={() => onNavigate('analysis', route)} className="flex-1 py-2.5 bg-zinc-800 text-zinc-200 rounded-lg text-sm font-medium">Preparar</button>
                  <button onClick={() => onNavigate('navigation', route)} className="flex-1 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2"><Play size={15} /> Navegar</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function translateStatus(status: string) {
  if (status === 'Ready') return 'listo';
  if (status === 'Unavailable') return 'no disponible';
  return 'comprobando';
}

function StatusChip({ icon, label, active }: { icon: React.ReactNode, label: string, active: boolean }) {
  return (
    <div className={`shrink-0 h-9 px-3 rounded-lg border flex items-center gap-2 text-xs font-medium ${active ? 'bg-emerald-950/50 border-emerald-900 text-emerald-300' : 'bg-zinc-900 border-zinc-800 text-zinc-400'}`}>
      {icon}<span>{label}</span>
    </div>
  );
}
