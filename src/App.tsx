import React, { useState, useEffect } from 'react';
import { Home, Upload, Map, Settings as SettingsIcon, Compass, Download, Activity } from 'lucide-react';
import { HomeScreen } from './screens/HomeScreen';
import { RouteImportScreen } from './screens/RouteImportScreen';
import { RouteAnalysisScreen } from './screens/RouteAnalysisScreen';
import { MapExplorerScreen } from './screens/MapExplorerScreen';
import { NavigationScreen } from './screens/NavigationScreen';
import { OfflineMapManagerScreen } from './screens/OfflineMapManagerScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { Route } from './lib/db';

export type Screen = 'home' | 'import' | 'analysis' | 'map' | 'navigation' | 'offline' | 'settings';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('home');
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);

  const navigate = (screen: Screen, route?: Route) => {
    if (route) setSelectedRoute(route);
    setCurrentScreen(screen);
  };

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100 font-sans overflow-hidden">
      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto relative">
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
        <nav className="bg-zinc-900 border-t border-zinc-800 pb-safe">
          <div className="flex justify-around items-center h-16 px-2">
            <NavItem icon={<Home size={24} />} label="Home" active={currentScreen === 'home'} onClick={() => navigate('home')} />
            <NavItem icon={<Upload size={24} />} label="Import" active={currentScreen === 'import'} onClick={() => navigate('import')} />
            <NavItem icon={<Map size={24} />} label="Map" active={currentScreen === 'map'} onClick={() => navigate('map')} />
            <NavItem icon={<Download size={24} />} label="Offline" active={currentScreen === 'offline'} onClick={() => navigate('offline')} />
            <NavItem icon={<SettingsIcon size={24} />} label="Settings" active={currentScreen === 'settings'} onClick={() => navigate('settings')} />
          </div>
        </nav>
      )}
    </div>
  );
}

function NavItem({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors ${
        active ? 'text-emerald-500' : 'text-zinc-500 hover:text-zinc-300'
      }`}
    >
      {icon}
      <span className="text-[10px] font-medium uppercase tracking-wider">{label}</span>
    </button>
  );
}
