import React, { useState } from 'react';
import { ArrowLeft, Download, Map as MapIcon, Trash2, HardDrive, CheckCircle2 } from 'lucide-react';
import { Screen } from '../App';

export function OfflineMapManagerScreen({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [maps, setMaps] = useState([
    { id: '1', name: 'Yosemite Valley', size: '120 MB', date: '2023-10-24' },
    { id: '2', name: 'Grand Canyon South Rim', size: '85 MB', date: '2023-11-02' }
  ]);

  const handleDownload = () => {
    setDownloading(true);
    setProgress(0);
    
    // Simulate download
    const interval = setInterval(() => {
      setProgress(p => {
        if (p >= 100) {
          clearInterval(interval);
          setDownloading(false);
          setMaps([{ id: Date.now().toString(), name: 'New Region', size: '45 MB', date: new Date().toISOString().split('T')[0] }, ...maps]);
          return 100;
        }
        return p + 5;
      });
    }, 200);
  };

  return (
    <div className="p-4 h-full flex flex-col bg-zinc-950">
      <header className="flex items-center gap-4 pt-8 pb-6">
        <button onClick={() => onNavigate('home')} className="p-2 -ml-2 text-zinc-400 hover:text-zinc-100 transition-colors">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-2xl font-bold text-zinc-100">Offline Maps</h1>
      </header>

      <div className="flex-1 overflow-y-auto space-y-6">
        {/* Storage Summary */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 flex items-center gap-4">
          <div className="p-3 bg-zinc-800 rounded-2xl text-emerald-500">
            <HardDrive size={24} />
          </div>
          <div className="flex-1">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-zinc-400">Storage Used</span>
              <span className="text-zinc-100 font-medium">205 MB</span>
            </div>
            <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 w-1/4 rounded-full" />
            </div>
          </div>
        </div>

        {/* Download New */}
        <div>
          <h2 className="text-lg font-semibold mb-3 text-zinc-300">Download Region</h2>
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">
            <p className="text-sm text-zinc-400 mb-4">Select an area on the map to download tiles for offline use.</p>
            
            {downloading ? (
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-emerald-500 font-medium">Downloading...</span>
                  <span className="text-zinc-400 font-mono">{progress}%</span>
                </div>
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500 rounded-full transition-all duration-200" 
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            ) : (
              <button 
                onClick={handleDownload}
                className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <MapIcon size={20} />
                Select Area
              </button>
            )}
          </div>
        </div>

        {/* Downloaded Maps */}
        <div>
          <h2 className="text-lg font-semibold mb-3 text-zinc-300">Saved Maps</h2>
          <div className="space-y-3">
            {maps.map(map => (
              <div key={map.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-center justify-between group">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-500/10 rounded-xl text-emerald-500">
                    <CheckCircle2 size={20} />
                  </div>
                  <div>
                    <h3 className="font-medium text-zinc-100">{map.name}</h3>
                    <div className="flex items-center gap-2 mt-1 text-xs text-zinc-500 font-mono">
                      <span>{map.size}</span>
                      <span>â€¢</span>
                      <span>{map.date}</span>
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => setMaps(maps.filter(m => m.id !== map.id))}
                  className="p-2 text-zinc-600 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={20} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
