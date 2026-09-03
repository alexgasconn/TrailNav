import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { HardDrive, Map as MapIcon, Navigation2, Route as RouteIcon, Settings as SettingsIcon } from 'lucide-react';
import { HomeScreen } from './screens/HomeScreen';
import { RouteImportScreen } from './screens/RouteImportScreen';
import { RouteAnalysisScreen } from './screens/RouteAnalysisScreen';
import { MapExplorerScreen } from './screens/MapExplorerScreen';
import { NavigationScreen } from './screens/NavigationScreen';
import { OfflineMapManagerScreen } from './screens/OfflineMapManagerScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { Route, getSettings } from './lib/db';
import { registerTileProtocol } from './lib/offlineTiles';
import { formatClock, formatPercent } from './lib/format';
import { NavigationSessionProvider, useNavigationSession } from './state/navigationSession';

export type Screen = 'home' | 'import' | 'analysis' | 'map' | 'navigation' | 'offline' | 'settings';

export default function App() {
  return (
    <NavigationSessionProvider>
      <Shell />
      <Analytics />
    </NavigationSessionProvider>
  );
}

function Shell() {
  const session = useNavigationSession();
  const [currentScreen, setCurrentScreen] = useState<Screen>('home');
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);
  const [pendingRoute, setPendingRoute] = useState<Route | null>(null);
  const historyRef = useRef<Screen[]>([]);

  useEffect(() => {
    registerTileProtocol();
    getSettings().then((settings) => session.applySettings(settings));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goTo = useCallback((screen: Screen) => {
    setCurrentScreen((current) => {
      if (current !== screen) historyRef.current.push(current);
      return screen;
    });
  }, []);

  const navigate = useCallback(
    (screen: Screen, route?: Route) => {
      if (route) setSelectedRoute(route);

      if (screen === 'navigation') {
        const target = route ?? session.route;
        if (!target) return;
        // Nunca se reinicia en silencio una sesión existente de otra ruta.
        if (session.status !== 'idle' && session.route && session.route.id !== target.id) {
          setPendingRoute(target);
          return;
        }
        if (session.status === 'idle') session.startSession(target);
      }

      goTo(screen);
    },
    [goTo, session]
  );

  const goBack = useCallback(() => {
    const previous = historyRef.current.pop();
    setCurrentScreen(previous ?? 'home');
  }, []);

  useEffect(() => {
    const handleBackButton = () => {
      if (currentScreen !== 'home') goBack();
    };
    window.addEventListener('popstate', handleBackButton);
    return () => window.removeEventListener('popstate', handleBackButton);
  }, [currentScreen, goBack]);

  useEffect(() => {
    if (session.status === 'idle' && currentScreen === 'navigation') setCurrentScreen('home');
  }, [session.status, currentScreen]);

  const confirmReplaceRoute = () => {
    if (!pendingRoute) return;
    session.stopSession();
    session.startSession(pendingRoute);
    setPendingRoute(null);
    goTo('navigation');
  };

  const isFullScreenMap = currentScreen === 'map' || currentScreen === 'navigation';
  const showTabBar = currentScreen !== 'navigation';
  const showSessionBar = session.status !== 'idle' && currentScreen !== 'navigation';

  return (
    <div className="flex flex-col h-full bg-canvas text-ink font-sans overflow-hidden">
      <main className={`flex-1 relative min-h-0 ${isFullScreenMap ? 'overflow-hidden' : 'overflow-y-auto scrollable'}`}>
        {currentScreen === 'home' && <HomeScreen onNavigate={navigate} />}
        {currentScreen === 'import' && <RouteImportScreen onNavigate={navigate} />}
        {currentScreen === 'analysis' && selectedRoute && <RouteAnalysisScreen route={selectedRoute} onNavigate={navigate} />}
        {currentScreen === 'map' && <MapExplorerScreen route={selectedRoute} onNavigate={navigate} />}
        {currentScreen === 'navigation' && <NavigationScreen onNavigate={navigate} />}
        {currentScreen === 'offline' && <OfflineMapManagerScreen route={selectedRoute} />}
        {currentScreen === 'settings' && <SettingsScreen onNavigate={navigate} />}
      </main>

      {showSessionBar && session.route && (
        <button
          onClick={() => goTo('navigation')}
          className="shrink-0 flex items-center gap-3 px-4 py-3 bg-moss text-white text-left border-t border-moss-strong"
        >
          <span className="relative flex h-2.5 w-2.5">
            {session.status === 'active' && (
              <span className="absolute inline-flex h-full w-full rounded-full bg-white/70 animate-ping" />
            )}
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[11px] uppercase tracking-widest text-white/75">
              {session.status === 'paused' ? 'Navegación en pausa' : 'Navegación activa'}
            </span>
            <span className="block text-sm font-semibold truncate">{session.route.name}</span>
          </span>
          <span className="text-right">
            <span className="block text-sm font-semibold tabular">{formatClock(session.metrics?.movingSeconds ?? 0)}</span>
            <span className="block text-[11px] text-white/75 tabular">{formatPercent((session.metrics?.progress ?? 0) * 100)}</span>
          </span>
        </button>
      )}

      {showTabBar && (
        <nav className="shrink-0 pb-safe bg-surface border-t border-line">
          <div className="flex justify-around items-stretch h-16 px-2">
            <TabItem
              icon={<RouteIcon size={22} />}
              label="Rutas"
              active={currentScreen === 'home' || currentScreen === 'analysis' || currentScreen === 'import'}
              onClick={() => {
                historyRef.current = [];
                setCurrentScreen('home');
              }}
            />
            <TabItem icon={<MapIcon size={22} />} label="Mapa" active={currentScreen === 'map'} onClick={() => goTo('map')} />
            <TabItem icon={<HardDrive size={22} />} label="Offline" active={currentScreen === 'offline'} onClick={() => goTo('offline')} />
            <TabItem
              icon={<SettingsIcon size={22} />}
              label="Ajustes"
              active={currentScreen === 'settings'}
              onClick={() => goTo('settings')}
            />
          </div>
        </nav>
      )}

      {pendingRoute && (
        <div className="fixed inset-0 z-50 bg-ink/40 flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-sm bg-surface border border-line rounded-2xl p-5">
            <div className="flex items-center gap-3 text-moss">
              <Navigation2 size={20} />
              <h2 className="text-base font-semibold text-ink">Ya hay una navegación activa</h2>
            </div>
            <p className="text-sm text-ink-soft mt-3">
              Estás navegando «{session.route?.name}». Si inicias «{pendingRoute.name}» se descartarán el tiempo y el progreso
              actuales.
            </p>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setPendingRoute(null)} className="flex-1 h-12 rounded-xl border border-line text-ink font-medium">
                Mantener actual
              </button>
              <button onClick={confirmReplaceRoute} className="flex-1 h-12 rounded-xl bg-clay text-white font-semibold">
                Iniciar nueva
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TabItem({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center w-full gap-1 touch-target transition-colors ${active ? 'text-moss' : 'text-ink-faint'}`}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
    >
      {icon}
      <span className="text-[11px] font-semibold tracking-wide">{label}</span>
    </button>
  );
}
