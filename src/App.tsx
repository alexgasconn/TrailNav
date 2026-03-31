import React, { useState, useEffect, useRef } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { Home, Upload, Map, Settings as SettingsIcon, Compass, Download, Activity, ArrowLeft, X } from 'lucide-react';
import { HomeScreen } from './screens/HomeScreen';
import { RouteImportScreen } from './screens/RouteImportScreen';
import { RouteAnalysisScreen } from './screens/RouteAnalysisScreen';
import { MapExplorerScreen } from './screens/MapExplorerScreen';
import { NavigationScreen } from './screens/NavigationScreenNew';
import { OfflineMapManagerScreen } from './screens/OfflineMapManagerScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { Route } from './lib/db';

export type Screen = 'home' | 'import' | 'analysis' | 'map' | 'navigation' | 'offline' | 'settings';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('home');
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);
  const [swipeStartX, setSwipeStartX] = useState(0);
  const [swipeStartY, setSwipeStartY] = useState(0);
  const screenHistoryRef = useRef<Screen[]>([]);

  const navigate = (screen: Screen, route?: Route) => {
    screenHistoryRef.current.push(currentScreen);
    if (route) setSelectedRoute(route);
    setCurrentScreen(screen);
  };

  const goBack = () => {
    const previousScreen = screenHistoryRef.current.pop();
    if (previousScreen) {
      setCurrentScreen(previousScreen);
    } else {
      setCurrentScreen('home');
    }
  };

  // Handle swipe gestures for navigation
  const handleTouchStart = (e: React.TouchEvent) => {
    setSwipeStartX(e.touches[0].clientX);
    setSwipeStartY(e.touches[0].clientY);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const swipeEndX = e.changedTouches[0].clientX;
    const swipeEndY = e.changedTouches[0].clientY;
    const swipeDeltaX = swipeEndX - swipeStartX;
    const swipeDeltaY = Math.abs(swipeEndY - swipeStartY);

    // Swipe right to go back
    if (swipeDeltaX > 50 && swipeDeltaY < 30 && currentScreen !== 'home') {
      goBack();
    }
    // Swipe left to go home
    else if (swipeDeltaX < -50 && swipeDeltaY < 30 && currentScreen !== 'home') {
      setCurrentScreen('home');
      screenHistoryRef.current = [];
    }
  };

  // Handle device orientation changes
  useEffect(() => {
    const handleOrientationChange = () => {
      // Trigger layout recalculation
      window.dispatchEvent(new Event('resize'));
    };

    window.addEventListener('orientationchange', handleOrientationChange);
    return () => window.removeEventListener('orientationchange', handleOrientationChange);
  }, []);

  // Handle system back button on Android
  useEffect(() => {
    const handleBackButton = (e: PopStateEvent) => {
      if (currentScreen !== 'home') {
        goBack();
        e.preventDefault();
      }
    };

    window.addEventListener('popstate', handleBackButton);
    return () => window.removeEventListener('popstate', handleBackButton);
  }, [currentScreen]);

  const showBackButton = currentScreen !== 'home' && currentScreen !== 'navigation';

  return (
    <div
      className="flex flex-col h-screen bg-zinc-950 text-zinc-100 font-sans overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Top bar for non-home screens */}
      {showBackButton && (
        <div className="pt-safe flex items-center justify-between px-4 py-2 bg-gradient-to-b from-zinc-900 to-zinc-950 border-b border-zinc-800">
          <button
            onClick={goBack}
            className="p-2 -ml-2 hover:bg-zinc-800 rounded-lg transition-colors touch-target"
            aria-label="Go back"
          >
            <ArrowLeft size={24} />
          </button>
          <h2 className="text-lg font-semibold flex-1 text-center">{getScreenTitle(currentScreen)}</h2>
          <button
            onClick={() => {
              setCurrentScreen('home');
              screenHistoryRef.current = [];
            }}
            className="p-2 -mr-2 hover:bg-zinc-800 rounded-lg transition-colors touch-target"
            aria-label="Go home"
          >
            <Home size={24} />
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto relative scrollable">
        {currentScreen === 'home' && <HomeScreen onNavigate={navigate} />}
        {currentScreen === 'import' && <RouteImportScreen onNavigate={navigate} />}
        {currentScreen === 'analysis' && selectedRoute && <RouteAnalysisScreen route={selectedRoute} onNavigate={navigate} />}
        {currentScreen === 'map' && <MapExplorerScreen route={selectedRoute} onNavigate={navigate} />}
        {currentScreen === 'navigation' && selectedRoute && <NavigationScreen route={selectedRoute} onNavigate={navigate} />}
        {currentScreen === 'offline' && <OfflineMapManagerScreen onNavigate={navigate} />}
        {currentScreen === 'settings' && <SettingsScreen onNavigate={navigate} />}
      </main>

      {/* Bottom Navigation Bar */}
      {currentScreen !== 'navigation' && (
        <nav className="pb-safe bg-zinc-900 border-t border-zinc-800 sticky bottom-0 z-40">
          <div className="flex justify-around items-center h-16 px-2">
            <NavItem
              icon={<Home size={24} />}
              label="Home"
              active={currentScreen === 'home'}
              onClick={() => {
                setCurrentScreen('home');
                screenHistoryRef.current = [];
              }}
            />
            <NavItem
              icon={<Upload size={24} />}
              label="Import"
              active={currentScreen === 'import'}
              onClick={() => navigate('import')}
            />
            <NavItem
              icon={<Map size={24} />}
              label="Explorer"
              active={currentScreen === 'map'}
              onClick={() => navigate('map')}
            />
            <NavItem
              icon={<Download size={24} />}
              label="Offline"
              active={currentScreen === 'offline'}
              onClick={() => navigate('offline')}
            />
            <NavItem
              icon={<SettingsIcon size={24} />}
              label="Settings"
              active={currentScreen === 'settings'}
              onClick={() => navigate('settings')}
            />
          </div>
        </nav>
      )}
      <Analytics />
    </div>
  );
}

function getScreenTitle(screen: Screen): string {
  const titles: Record<Screen, string> = {
    home: 'TrailNav',
    import: 'Import Route',
    analysis: 'Route Details',
    map: 'Map Explorer',
    navigation: 'Navigation',
    offline: 'Offline Maps',
    settings: 'Settings'
  };
  return titles[screen] || 'TrailNav';
}

function NavItem({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors touch-target ${active ? 'text-emerald-500' : 'text-zinc-500 hover:text-zinc-300 active:text-zinc-300'
        }`}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
    >
      {icon}
      <span className="text-[10px] font-medium uppercase tracking-wider">{label}</span>
    </button>
  );
}
