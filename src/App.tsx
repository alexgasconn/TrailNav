import React, { useState, useEffect, useRef } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { Map, Settings as SettingsIcon, Route as RouteIcon } from 'lucide-react';
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

  const showBottomNavigation = currentScreen === 'home' || currentScreen === 'offline' || currentScreen === 'settings';

  return (
    <div
      className="flex flex-col h-screen bg-zinc-950 text-zinc-100 font-sans overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Main Content Area */}
      <main className={`flex-1 relative ${currentScreen === 'map' || currentScreen === 'navigation'
        ? 'overflow-hidden'
        : 'overflow-y-auto scrollable'
        }`}>
        {currentScreen === 'home' && <HomeScreen onNavigate={navigate} />}
        {currentScreen === 'import' && <RouteImportScreen onNavigate={navigate} />}
        {currentScreen === 'analysis' && selectedRoute && <RouteAnalysisScreen route={selectedRoute} onNavigate={navigate} />}
        {currentScreen === 'map' && <MapExplorerScreen route={selectedRoute} onNavigate={navigate} />}
        {currentScreen === 'navigation' && selectedRoute && <NavigationScreen route={selectedRoute} onNavigate={navigate} />}
        {currentScreen === 'offline' && <OfflineMapManagerScreen onNavigate={navigate} />}
        {currentScreen === 'settings' && <SettingsScreen onNavigate={navigate} />}
      </main>

      {/* Bottom Navigation Bar */}
      {showBottomNavigation && (
        <nav className="pb-safe bg-zinc-900 border-t border-zinc-800 sticky bottom-0 z-40">
          <div className="flex justify-around items-center h-16 px-2">
            <NavItem
              icon={<RouteIcon size={24} />}
              label="Rutas"
              active={currentScreen === 'home'}
              onClick={() => {
                setCurrentScreen('home');
                screenHistoryRef.current = [];
              }}
            />
            <NavItem
              icon={<Map size={24} />}
              label="Mapas"
              active={currentScreen === 'offline'}
              onClick={() => navigate('offline')}
            />
            <NavItem
              icon={<SettingsIcon size={24} />}
              label="Ajustes"
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
