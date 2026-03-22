import React, { useEffect, useRef } from 'react';
import { ArrowLeft, Play, Map as MapIcon, Mountain, ArrowUpRight, ArrowDownRight, Clock } from 'lucide-react';
import { Route } from '../lib/db';
import { Screen } from '../App';
import * as turf from '@turf/turf';

export function RouteAnalysisScreen({ route, onNavigate }: { route: Route, onNavigate: (s: Screen, r?: Route) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Estimate duration (Naismith's rule: 5km/h + 1min per 10m ascent)
  const estimatedMinutes = (route.distance / 1000 / 5) * 60 + (route.elevationGain / 10);
  const hours = Math.floor(estimatedMinutes / 60);
  const minutes = Math.round(estimatedMinutes % 60);

  useEffect(() => {
    // Draw elevation profile
    const canvas = canvasRef.current;
    if (!canvas || !route.geoJson) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const coords = route.geoJson.features[0].geometry.type === 'LineString'
      ? route.geoJson.features[0].geometry.coordinates
      : route.geoJson.features[0].geometry.coordinates[0];

    if (!coords || coords.length === 0) return;

    const width = canvas.width;
    const height = canvas.height;
    
    ctx.clearRect(0, 0, width, height);

    const minEle = route.minElevation;
    const maxEle = route.maxElevation;
    const eleRange = maxEle - minEle || 1;

    // Calculate distances along route for x-axis
    let totalDist = 0;
    const points: { x: number, y: number, ele: number, dist: number }[] = [];
    
    points.push({ x: 0, y: height - ((coords[0][2] || 0) - minEle) / eleRange * height, ele: coords[0][2] || 0, dist: 0 });

    for (let i = 1; i < coords.length; i++) {
      const p1 = turf.point([coords[i-1][0], coords[i-1][1]]);
      const p2 = turf.point([coords[i][0], coords[i][1]]);
      const dist = turf.distance(p1, p2, { units: 'kilometers' }) * 1000;
      totalDist += dist;
      
      const ele = coords[i][2] || 0;
      const x = (totalDist / route.distance) * width;
      const y = height - ((ele - minEle) / eleRange) * (height * 0.8) - (height * 0.1); // 10% padding top/bottom
      
      points.push({ x, y, ele, dist: totalDist });
    }

    // Draw filled area
    ctx.beginPath();
    ctx.moveTo(0, height);
    points.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(width, height);
    ctx.closePath();

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, 'rgba(16, 185, 129, 0.4)'); // emerald-500
    gradient.addColorStop(1, 'rgba(16, 185, 129, 0.0)');
    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw line
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    points.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.strokeStyle = '#10b981'; // emerald-500
    ctx.lineWidth = 2;
    ctx.stroke();

  }, [route]);

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      <header className="flex items-center gap-4 p-4 pt-8 bg-zinc-900/50 backdrop-blur-md sticky top-0 z-10 border-b border-zinc-800">
        <button onClick={() => onNavigate('home')} className="p-2 -ml-2 text-zinc-400 hover:text-zinc-100 transition-colors">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-xl font-bold text-zinc-100 truncate flex-1">{route.name}</h1>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard icon={<MapIcon size={18} />} label="Distance" value={`${(route.distance / 1000).toFixed(2)} km`} />
          <StatCard icon={<Clock size={18} />} label="Est. Time" value={`${hours}h ${minutes}m`} />
          <StatCard icon={<ArrowUpRight size={18} className="text-emerald-500" />} label="Elevation Gain" value={`${Math.round(route.elevationGain)} m`} />
          <StatCard icon={<ArrowDownRight size={18} className="text-red-500" />} label="Elevation Loss" value={`${Math.round(route.elevationLoss)} m`} />
          <StatCard icon={<Mountain size={18} />} label="Max Elevation" value={`${Math.round(route.maxElevation)} m`} />
          <StatCard icon={<Mountain size={18} className="rotate-180" />} label="Min Elevation" value={`${Math.round(route.minElevation)} m`} />
        </div>

        {/* Elevation Profile */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">
          <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">Elevation Profile</h3>
          <div className="relative w-full h-48 rounded-xl overflow-hidden bg-zinc-950/50">
            <canvas 
              ref={canvasRef} 
              className="absolute inset-0 w-full h-full"
              width={800} // High res internal
              height={400}
            />
            {/* Axis labels */}
            <div className="absolute left-2 top-2 text-[10px] text-zinc-500 font-mono">{Math.round(route.maxElevation)}m</div>
            <div className="absolute left-2 bottom-2 text-[10px] text-zinc-500 font-mono">{Math.round(route.minElevation)}m</div>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="p-4 bg-zinc-900 border-t border-zinc-800 pb-safe">
        <div className="flex gap-3">
          <button 
            onClick={() => onNavigate('map', route)}
            className="flex-1 py-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold rounded-2xl transition-colors flex items-center justify-center gap-2"
          >
            <MapIcon size={20} />
            View Map
          </button>
          <button 
            onClick={() => onNavigate('navigation', route)}
            className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-2xl transition-colors flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20"
          >
            <Play size={20} fill="currentColor" />
            Start
          </button>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode, label: string, value: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-2">
      <div className="text-zinc-500">{icon}</div>
      <div>
        <p className="text-2xl font-bold text-zinc-100">{value}</p>
        <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mt-0.5">{label}</p>
      </div>
    </div>
  );
}
