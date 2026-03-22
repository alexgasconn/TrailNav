import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ArrowLeft, Layers, LocateFixed } from 'lucide-react';
import { Route } from '../lib/db';
import { Screen } from '../App';
import * as turf from '@turf/turf';

export function MapExplorerScreen({ route, onNavigate }: { route: Route | null, onNavigate: (s: Screen, r?: Route) => void }) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [mapStyle, setMapStyle] = useState<'satellite' | 'topo'>('topo');

  const styles = {
    topo: 'https://api.maptiler.com/maps/outdoor-v2/style.json?key=get_your_own_OpIi9ZULNHzrESv6T2vL', // Using a demo key or fallback
    satellite: 'https://api.maptiler.com/maps/hybrid/style.json?key=get_your_own_OpIi9ZULNHzrESv6T2vL'
  };

  // Fallback to OSM if no key
  const fallbackStyle = {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '&copy; OpenStreetMap Contributors',
      }
    },
    layers: [
      {
        id: 'osm',
        type: 'raster',
        source: 'osm',
        minzoom: 0,
        maxzoom: 19
      }
    ]
  };

  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: fallbackStyle as any, // Use OSM raster for simplicity and offline caching
      center: [0, 0],
      zoom: 2,
      attributionControl: false
    });

    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');
    
    // Add Geolocate control
    const geolocate = new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true
    });
    map.current.addControl(geolocate, 'bottom-right');

    map.current.on('load', () => {
      if (route && route.geoJson && map.current) {
        // Add route source
        map.current.addSource('route', {
          type: 'geojson',
          data: route.geoJson
        });

        // Add route layer (casing)
        map.current.addLayer({
          id: 'route-casing',
          type: 'line',
          source: 'route',
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': '#064e3b', // emerald-900
            'line-width': 8,
            'line-opacity': 0.5
          }
        });

        // Add route layer (core)
        map.current.addLayer({
          id: 'route-core',
          type: 'line',
          source: 'route',
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': '#10b981', // emerald-500
            'line-width': 4
          }
        });

        // Fit bounds
        const bbox = turf.bbox(route.geoJson);
        map.current.fitBounds(bbox as [number, number, number, number], {
          padding: 50,
          duration: 1000
        });
      }
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, [route]);

  return (
    <div className="relative w-full h-full bg-zinc-950">
      {/* Map Container */}
      <div ref={mapContainer} className="absolute inset-0" />

      {/* Top Bar Overlay */}
      <div className="absolute top-0 left-0 right-0 p-4 pt-8 bg-gradient-to-b from-zinc-950/80 to-transparent pointer-events-none flex justify-between items-start z-10">
        <button 
          onClick={() => onNavigate('home')} 
          className="p-3 bg-zinc-900/80 backdrop-blur-md border border-zinc-800 rounded-full text-zinc-100 hover:bg-zinc-800 pointer-events-auto shadow-lg"
        >
          <ArrowLeft size={24} />
        </button>

        <div className="flex flex-col gap-2 pointer-events-auto">
          <button 
            className="p-3 bg-zinc-900/80 backdrop-blur-md border border-zinc-800 rounded-full text-zinc-100 hover:bg-zinc-800 shadow-lg"
            onClick={() => setMapStyle(s => s === 'topo' ? 'satellite' : 'topo')}
          >
            <Layers size={24} />
          </button>
        </div>
      </div>

      {/* Route Info Overlay (if route selected) */}
      {route && (
        <div className="absolute bottom-20 left-4 right-4 bg-zinc-900/90 backdrop-blur-md border border-zinc-800 rounded-3xl p-4 shadow-2xl z-10">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-bold text-zinc-100 truncate pr-4">{route.name}</h3>
            <span className="text-emerald-500 font-mono font-medium text-sm">{(route.distance / 1000).toFixed(1)} km</span>
          </div>
          <div className="flex gap-2 mt-4">
            <button 
              onClick={() => onNavigate('analysis', route)}
              className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium rounded-xl transition-colors text-sm"
            >
              Analysis
            </button>
            <button 
              onClick={() => onNavigate('navigation', route)}
              className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-xl transition-colors text-sm shadow-lg shadow-emerald-900/20"
            >
              Navigate
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
