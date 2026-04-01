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
  const [showStylePicker, setShowStylePicker] = useState(false);

  // OSM style - proven to work reliably
  const osmStyle = {
    version: 8 as const,
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: {
      osm: {
        type: 'raster' as const,
        tiles: [
          'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
          'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
          'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'
        ],
        tileSize: 256,
        attribution: '© OpenStreetMap contributors'
      }
    },
    layers: [
      {
        id: 'osm',
        type: 'raster' as const,
        source: 'osm',
        minzoom: 0,
        maxzoom: 19,
        paint: {
          'raster-opacity': 1
        }
      }
    ]
  };

  // Satellite style fallback
  const satStyle = {
    version: 8 as const,
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: {
      osm: {
        type: 'raster' as const,
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        attribution: '© Esri'
      }
    },
    layers: [
      {
        id: 'osm',
        type: 'raster' as const,
        source: 'osm',
        minzoom: 0,
        maxzoom: 19
      }
    ]
  };

  const styles = {
    topo: osmStyle,
    satellite: satStyle
  };

  useEffect(() => {
    if (map.current) {
      map.current.setStyle(styles[mapStyle]);
    }
  }, [mapStyle]);

  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: styles[mapStyle] as any,
      center: [0, 0],
      zoom: 2,
      attributionControl: false,
      trackResize: true
    });

    map.current.on('error', (event) => {
      console.error('MapLibre error:', event.error);
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
            onClick={() => setShowStylePicker(v => !v)}
          >
            <Layers size={24} />
          </button>

          {showStylePicker && (
            <div className="bg-zinc-900/90 backdrop-blur-md border border-zinc-800 rounded-2xl p-2 shadow-xl w-36">
              <button
                className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-colors ${mapStyle === 'topo' ? 'bg-emerald-600 text-white' : 'text-zinc-300 hover:bg-zinc-800'}`}
                onClick={() => {
                  setMapStyle('topo');
                  setShowStylePicker(false);
                }}
              >
                Topografico
              </button>
              <button
                className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-colors ${mapStyle === 'satellite' ? 'bg-emerald-600 text-white' : 'text-zinc-300 hover:bg-zinc-800'}`}
                onClick={() => {
                  setMapStyle('satellite');
                  setShowStylePicker(false);
                }}
              >
                Satelite
              </button>
            </div>
          )}
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
