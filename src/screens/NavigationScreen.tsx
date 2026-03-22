import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ArrowLeft, Navigation2, AlertTriangle, Compass } from 'lucide-react';
import { Route } from '../lib/db';
import { Screen } from '../App';
import * as turf from '@turf/turf';

export function NavigationScreen({ route, onNavigate }: { route: Route, onNavigate: (s: Screen, r?: Route) => void }) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const userMarker = useRef<maplibregl.Marker | null>(null);
  const [speed, setSpeed] = useState(0);
  const [elevation, setElevation] = useState(0);
  const [distanceToFinish, setDistanceToFinish] = useState(route.distance);
  const [offRoute, setOffRoute] = useState(false);
  const [heading, setHeading] = useState(0);
  const watchId = useRef<number | null>(null);

  useEffect(() => {
    if (!mapContainer.current) return;

    // Initialize map
    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
          }
        },
        layers: [
          {
            id: 'osm',
            type: 'raster',
            source: 'osm',
            minzoom: 0,
            maxzoom: 19,
            paint: {
              'raster-brightness-max': 0.3, // Dark mode map
              'raster-saturation': -0.8
            }
          }
        ]
      },
      center: [0, 0],
      zoom: 16,
      pitch: 60, // 3D view
      bearing: 0,
      attributionControl: false,
      interactive: false // Disable interaction in nav mode
    });

    map.current.on('load', () => {
      if (!map.current || !route.geoJson) return;

      // Add route
      map.current.addSource('route', {
        type: 'geojson',
        data: route.geoJson
      });

      map.current.addLayer({
        id: 'route-casing',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#064e3b', 'line-width': 12, 'line-opacity': 0.8 }
      });

      map.current.addLayer({
        id: 'route-core',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#10b981', 'line-width': 6 }
      });

      // Create custom user marker
      const el = document.createElement('div');
      el.className = 'w-8 h-8 bg-emerald-500 rounded-full border-4 border-zinc-950 shadow-[0_0_20px_rgba(16,185,129,0.5)] flex items-center justify-center transition-transform duration-300';
      el.innerHTML = '<div class="w-0 h-0 border-l-4 border-r-4 border-b-8 border-l-transparent border-r-transparent border-b-zinc-950"></div>';
      
      userMarker.current = new maplibregl.Marker({ element: el, rotationAlignment: 'map' })
        .setLngLat([0, 0])
        .addTo(map.current);

      // Start tracking
      startTracking();
    });

    return () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
      window.removeEventListener('deviceorientationabsolute', handleOrientation as any);
      map.current?.remove();
    };
  }, [route]);

  const handleOrientation = (event: DeviceOrientationEvent) => {
    let compassHeading = (event as any).webkitCompassHeading || (event.alpha ? Math.abs(event.alpha - 360) : null);
    if (compassHeading !== null) {
      setHeading(compassHeading);
      if (map.current) {
        // Smoothly rotate map
        map.current.easeTo({ bearing: compassHeading, duration: 300 });
      }
    }
  };

  const startTracking = () => {
    if (!('geolocation' in navigator)) return;

    // Request orientation permission for iOS
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      (DeviceOrientationEvent as any).requestPermission()
        .then((response: string) => {
          if (response === 'granted') {
            window.addEventListener('deviceorientationabsolute', handleOrientation as any, true);
          }
        })
        .catch(console.error);
    } else {
      window.addEventListener('deviceorientationabsolute', handleOrientation as any, true);
    }

    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, speed: gpsSpeed, altitude } = position.coords;
        const userPt = turf.point([longitude, latitude]);

        if (map.current && userMarker.current) {
          userMarker.current.setLngLat([longitude, latitude]);
          map.current.easeTo({ center: [longitude, latitude], duration: 1000 });
        }

        setSpeed(gpsSpeed ? gpsSpeed * 3.6 : 0); // m/s to km/h
        if (altitude) setElevation(altitude);

        // Calculate off-route
        if (route.geoJson) {
          const line = route.geoJson.features[0].geometry.type === 'LineString' 
            ? turf.lineString(route.geoJson.features[0].geometry.coordinates)
            : turf.lineString(route.geoJson.features[0].geometry.coordinates[0]);
          
          const distanceToRoute = turf.pointToLineDistance(userPt, line, { units: 'meters' });
          
          if (distanceToRoute > 25) {
            setOffRoute(true);
            if (map.current) {
              map.current.setPaintProperty('route-core', 'line-color', '#ef4444'); // Red
            }
          } else {
            setOffRoute(false);
            if (map.current) {
              map.current.setPaintProperty('route-core', 'line-color', '#10b981'); // Emerald
            }
          }

          // Rough distance to finish (straight line from current to end for simplicity in prototype)
          const coords = line.geometry.coordinates;
          const endPt = turf.point(coords[coords.length - 1]);
          const dist = turf.distance(userPt, endPt, { units: 'kilometers' }) * 1000;
          setDistanceToFinish(dist);
        }
      },
      (error) => console.error(error),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
    );
  };

  return (
    <div className="relative w-full h-full bg-zinc-950 overflow-hidden">
      {/* Map Container */}
      <div ref={mapContainer} className="absolute inset-0" />

      {/* Top HUD */}
      <div className="absolute top-0 left-0 right-0 p-4 pt-8 bg-gradient-to-b from-zinc-950/90 to-transparent z-10">
        <div className="flex justify-between items-start mb-4">
          <button 
            onClick={() => onNavigate('analysis', route)} 
            className="p-3 bg-zinc-900/80 backdrop-blur-md border border-zinc-800 rounded-full text-zinc-100 hover:bg-zinc-800 shadow-lg"
          >
            <ArrowLeft size={24} />
          </button>
          
          {offRoute && (
            <div className="bg-red-500/90 backdrop-blur-md text-white px-4 py-2 rounded-full font-bold flex items-center gap-2 shadow-lg shadow-red-900/50 animate-pulse">
              <AlertTriangle size={20} />
              OFF ROUTE
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <HudMetric label="Dist to Finish" value={`${(distanceToFinish / 1000).toFixed(2)}`} unit="km" />
          <HudMetric label="Speed" value={speed.toFixed(1)} unit="km/h" />
          <HudMetric label="Elevation" value={Math.round(elevation).toString()} unit="m" />
        </div>
      </div>

      {/* Bottom Compass Overlay */}
      <div className="absolute bottom-8 right-4 bg-zinc-900/80 backdrop-blur-md border border-zinc-800 rounded-full p-3 shadow-lg z-10 flex flex-col items-center justify-center w-14 h-14">
        <Compass 
          size={24} 
          className="text-emerald-500 transition-transform duration-300" 
          style={{ transform: `rotate(${-heading}deg)` }} 
        />
        <span className="text-[10px] font-mono text-zinc-400 mt-1">{Math.round(heading)}Â°</span>
      </div>
    </div>
  );
}

function HudMetric({ label, value, unit }: { label: string, value: string, unit: string }) {
  return (
    <div className="bg-zinc-900/80 backdrop-blur-md border border-zinc-800 rounded-2xl p-3 flex flex-col items-center justify-center shadow-lg">
      <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider mb-1">{label}</span>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold text-zinc-100 font-mono">{value}</span>
        <span className="text-xs text-zinc-500 font-medium">{unit}</span>
      </div>
    </div>
  );
}
