import React, { useCallback, useEffect, useState } from 'react';
import { Compass, MapPin, Mountain, Navigation2, Plus, Route as RouteIcon, Satellite, Trash2, WifiOff } from 'lucide-react';
import { Route, deleteRoute, getRoutes } from '../lib/db';
import { Screen } from '../App';
import { getRouteProfile, invalidateRouteProfile } from '../lib/routeProfile';
import { invalidateRoutePoints } from '../lib/routePoints';
import { formatDate, formatDistance, formatElevation } from '../lib/format';
import { useNavigationSession } from '../state/navigationSession';

type GpsState = 'checking' | 'ready' | 'denied' | 'unsupported';

export function HomeScreen({ onNavigate }: { onNavigate: (s: Screen, r?: Route) => void }) {
  const session = useNavigationSession();
  const [routes, setRoutes] = useState<Route[] | null>(null);
  const [gpsState, setGpsState] = useState<GpsState>('checking');
  const [online, setOnline] = useState(navigator.onLine);
  const [pendingDelete, setPendingDelete] = useState<Route | null>(null);

  const loadRoutes = useCallback(() => {
    getRoutes()
      .then(setRoutes)
      .catch(() => setRoutes([]));
  }, []);

  useEffect(() => {
    loadRoutes();

    if (!('geolocation' in navigator)) {
      setGpsState('unsupported');
    } else {
      navigator.geolocation.getCurrentPosition(
        () => setGpsState('ready'),
        () => setGpsState('denied'),
        { timeout: 8000, enableHighAccuracy: false, maximumAge: 60000 }
      );
    }

    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [loadRoutes]);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    await deleteRoute(pendingDelete.id);
    invalidateRouteProfile(pendingDelete.id);
    invalidateRoutePoints(pendingDelete.id);
    setPendingDelete(null);
    loadRoutes();
  };

  return (
    <div className="max-w-3xl mx-auto w-full px-4 pb-8">
      <header className="pt-safe pt-6 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-moss">
            <Compass size={20} />
            <span className="text-xs font-bold uppercase tracking-[0.18em]">TrailNav</span>
          </div>
          <h1 className="text-2xl font-semibold text-ink mt-2">Mis rutas</h1>
        </div>
        <button
          onClick={() => onNavigate('import')}
          className="h-12 px-4 bg-moss text-white rounded-xl flex items-center gap-2 font-semibold shrink-0"
        >
          <Plus size={20} />
          Añadir
        </button>
      </header>

      <div className="flex gap-2 mt-4">
        <StatusChip
          icon={<Satellite size={15} />}
          label={gpsLabel(gpsState)}
          tone={gpsState === 'ready' ? 'ok' : gpsState === 'checking' ? 'neutral' : 'warn'}
        />
        <StatusChip
          icon={online ? <MapPin size={15} /> : <WifiOff size={15} />}
          label={online ? 'Con conexión' : 'Sin conexión'}
          tone={online ? 'ok' : 'neutral'}
        />
      </div>

      {session.status !== 'idle' && session.route && (
        <button
          onClick={() => onNavigate('navigation', session.route!)}
          className="w-full mt-4 bg-moss-soft border border-moss/30 rounded-2xl p-4 flex items-center gap-3 text-left"
        >
          <Navigation2 size={20} className="text-moss-strong shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-wider text-moss-strong font-semibold">
              {session.status === 'paused' ? 'Navegación en pausa' : 'Navegación activa'}
            </p>
            <p className="text-sm font-semibold text-ink truncate">{session.route.name}</p>
          </div>
          <span className="text-sm font-semibold text-moss-strong">Continuar</span>
        </button>
      )}

      <section className="mt-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint flex items-center gap-2">
            <RouteIcon size={15} /> Rutas guardadas
          </h2>
          {routes && <span className="text-xs text-ink-faint tabular">{routes.length}</span>}
        </div>

        {routes === null ? (
          <div className="space-y-2">
            {[0, 1].map((index) => (
              <div key={index} className="h-32 rounded-2xl bg-surface border border-line animate-pulse" />
            ))}
          </div>
        ) : routes.length === 0 ? (
          <div className="bg-surface border border-line rounded-2xl p-8 text-center">
            <Mountain className="mx-auto text-ink-faint" size={32} />
            <p className="text-ink font-semibold mt-4">Todavía no hay rutas</p>
            <p className="text-ink-soft text-sm mt-1 mb-5">
              Importa un archivo GPX para analizar el perfil y navegarlo sin cobertura.
            </p>
            <button onClick={() => onNavigate('import')} className="h-12 px-5 bg-moss text-white rounded-xl font-semibold">
              Importar primera ruta
            </button>
          </div>
        ) : (
          <ul className="space-y-3">
            {routes.map((route) => (
              <RouteCard
                key={route.id}
                route={route}
                activeSession={session.status !== 'idle' && session.route?.id === route.id}
                onOpen={() => onNavigate('analysis', route)}
                onNavigateRoute={() => onNavigate('navigation', route)}
                onDelete={() => setPendingDelete(route)}
              />
            ))}
          </ul>
        )}
      </section>

      {pendingDelete && (
        <div className="fixed inset-0 z-50 bg-ink/40 flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-sm bg-surface border border-line rounded-2xl p-5">
            <h2 className="text-base font-semibold text-ink">Eliminar ruta</h2>
            <p className="text-sm text-ink-soft mt-2">Se eliminará «{pendingDelete.name}» y su análisis del dispositivo.</p>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setPendingDelete(null)} className="flex-1 h-12 rounded-xl border border-line font-medium">
                Cancelar
              </button>
              <button onClick={confirmDelete} className="flex-1 h-12 rounded-xl bg-alert text-white font-semibold">
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RouteCard({
  route,
  activeSession,
  onOpen,
  onNavigateRoute,
  onDelete,
}: {
  route: Route;
  activeSession: boolean;
  onOpen: () => void;
  onNavigateRoute: () => void;
  onDelete: () => void;
}) {
  const profile = getRouteProfile(route);

  return (
    <li className="bg-surface border border-line rounded-2xl overflow-hidden">
      <button onClick={onOpen} className="w-full text-left p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-semibold text-ink truncate">{route.name}</h3>
          {activeSession && (
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider bg-moss-soft text-moss-strong px-2 py-1 rounded-md">
              En curso
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-ink-soft tabular">
          <span className="text-ink font-medium">{formatDistance(profile.totalDistance || route.distance)}</span>
          <span>D+ {formatElevation(profile.totalAscent)}</span>
          <span>D− {formatElevation(profile.totalDescent)}</span>
          {profile.hasElevation && <span>máx. {formatElevation(profile.maxElevation)}</span>}
        </div>
        <p className="text-xs text-ink-faint mt-2">Importada el {formatDate(route.createdAt)}</p>
      </button>

      <div className="flex gap-2 px-4 pb-4">
        <button onClick={onOpen} className="flex-1 h-11 rounded-xl border border-line text-ink text-sm font-medium">
          Preparar
        </button>
        <button
          onClick={onNavigateRoute}
          className="flex-1 h-11 rounded-xl bg-moss text-white text-sm font-semibold flex items-center justify-center gap-2"
        >
          <Navigation2 size={16} />
          {activeSession ? 'Continuar' : 'Navegar'}
        </button>
        <button
          onClick={onDelete}
          className="w-11 h-11 rounded-xl border border-line grid place-items-center text-ink-faint"
          aria-label={`Eliminar ${route.name}`}
        >
          <Trash2 size={18} />
        </button>
      </div>
    </li>
  );
}

function gpsLabel(state: GpsState) {
  if (state === 'ready') return 'GPS listo';
  if (state === 'denied') return 'GPS sin permiso';
  if (state === 'unsupported') return 'GPS no disponible';
  return 'Comprobando GPS';
}

function StatusChip({ icon, label, tone }: { icon: React.ReactNode; label: string; tone: 'ok' | 'warn' | 'neutral' }) {
  const styles =
    tone === 'ok'
      ? 'bg-moss-soft border-moss/25 text-moss-strong'
      : tone === 'warn'
        ? 'bg-clay-soft border-clay/25 text-clay'
        : 'bg-surface border-line text-ink-soft';

  return (
    <span className={`h-9 px-3 rounded-lg border flex items-center gap-2 text-xs font-medium ${styles}`}>
      {icon}
      {label}
    </span>
  );
}
