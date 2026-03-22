import React, { useEffect, useState } from 'react';
import { ArrowLeft, Settings as SettingsIcon, Save, AlertCircle } from 'lucide-react';
import { getSettings, saveSettings, Settings } from '../lib/db';
import { Screen } from '../App';

export function SettingsScreen({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSettings().then(setSettings);
  }, []);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    await saveSettings(settings);
    setTimeout(() => setSaving(false), 500);
  };

  if (!settings) return <div className="p-8 text-center text-zinc-500">Loading...</div>;

  return (
    <div className="p-4 h-full flex flex-col bg-zinc-950">
      <header className="flex items-center gap-4 pt-8 pb-6">
        <button onClick={() => onNavigate('home')} className="p-2 -ml-2 text-zinc-400 hover:text-zinc-100 transition-colors">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-2xl font-bold text-zinc-100">Settings</h1>
      </header>

      <div className="flex-1 overflow-y-auto space-y-6">
        {/* Units */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">Units</h2>
          <div className="flex gap-3">
            <button 
              onClick={() => setSettings({ ...settings, units: 'metric' })}
              className={`flex-1 py-3 font-medium rounded-xl transition-colors text-sm ${
                settings.units === 'metric' 
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/20' 
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
              }`}
            >
              Metric (km, m)
            </button>
            <button 
              onClick={() => setSettings({ ...settings, units: 'imperial' })}
              className={`flex-1 py-3 font-medium rounded-xl transition-colors text-sm ${
                settings.units === 'imperial' 
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/20' 
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
              }`}
            >
              Imperial (mi, ft)
            </button>
          </div>
        </div>

        {/* Navigation */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-2">Navigation</h2>
          
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-zinc-100">Deviation Warning</p>
              <p className="text-xs text-zinc-500 mt-1">Alert when off route</p>
            </div>
            <select 
              value={settings.deviationWarningDistance}
              onChange={(e) => setSettings({ ...settings, deviationWarningDistance: Number(e.target.value) })}
              className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block p-2.5"
            >
              <option value={15}>15 m</option>
              <option value={25}>25 m</option>
              <option value={50}>50 m</option>
              <option value={100}>100 m</option>
            </select>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-zinc-100">Auto Zoom</p>
              <p className="text-xs text-zinc-500 mt-1">Zoom in at junctions</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer" 
                checked={settings.autoZoom}
                onChange={(e) => setSettings({ ...settings, autoZoom: e.target.checked })}
              />
              <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-zinc-100">Map Rotation</p>
              <p className="text-xs text-zinc-500 mt-1">Rotate map with compass</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer" 
                checked={settings.mapRotation}
                onChange={(e) => setSettings({ ...settings, mapRotation: e.target.checked })}
              />
              <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
            </label>
          </div>
        </div>

        {/* Battery */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-2">Battery & Performance</h2>
          
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-zinc-100">GPS Accuracy</p>
              <p className="text-xs text-zinc-500 mt-1">Higher uses more battery</p>
            </div>
            <select 
              value={settings.gpsAccuracy}
              onChange={(e) => setSettings({ ...settings, gpsAccuracy: e.target.value as any })}
              className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block p-2.5"
            >
              <option value="high">High</option>
              <option value="balanced">Balanced</option>
              <option value="low">Low</option>
            </select>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-zinc-100">Screen Always On</p>
              <p className="text-xs text-zinc-500 mt-1">During navigation</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer" 
                checked={settings.screenAlwaysOn}
                onChange={(e) => setSettings({ ...settings, screenAlwaysOn: e.target.checked })}
              />
              <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
            </label>
          </div>
        </div>

        {/* Save Button */}
        <button 
          onClick={handleSave}
          className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-semibold rounded-2xl transition-colors flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20"
        >
          {saving ? 'Saved!' : 'Save Settings'}
          {!saving && <Save size={20} />}
        </button>
      </div>
    </div>
  );
}
