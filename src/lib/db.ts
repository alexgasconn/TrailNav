import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface Route {
  id: string;
  name: string;
  distance: number;
  elevationGain: number;
  elevationLoss: number;
  maxElevation: number;
  minElevation: number;
  gpxData: string; // The raw GPX string
  geoJson: any; // Parsed GeoJSON
  createdAt: number;
}

export interface MapRegion {
  id: string;
  name: string;
  bounds: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
  minZoom: number;
  maxZoom: number;
  sizeBytes: number;
  createdAt: number;
}

export interface Settings {
  id: string;
  units: 'metric' | 'imperial';
  deviationWarningDistance: number;
  autoZoom: boolean;
  mapRotation: boolean;
  gpsAccuracy: 'high' | 'balanced' | 'low';
  screenAlwaysOn: boolean;
}

interface TrailNavDB extends DBSchema {
  routes: {
    key: string;
    value: Route;
    indexes: { 'by-date': number };
  };
  maps: {
    key: string;
    value: MapRegion;
    indexes: { 'by-date': number };
  };
  settings: {
    key: string;
    value: Settings;
  };
}

let dbPromise: Promise<IDBPDatabase<TrailNavDB>>;

export async function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<TrailNavDB>('trailnav-db', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('routes')) {
          const routeStore = db.createObjectStore('routes', { keyPath: 'id' });
          routeStore.createIndex('by-date', 'createdAt');
        }
        if (!db.objectStoreNames.contains('maps')) {
          const mapStore = db.createObjectStore('maps', { keyPath: 'id' });
          mapStore.createIndex('by-date', 'createdAt');
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

export async function getSettings(): Promise<Settings> {
  const db = await getDB();
  const settings = await db.get('settings', 'user-settings');
  if (settings) return settings;
  
  const defaultSettings: Settings = {
    id: 'user-settings',
    units: 'metric',
    deviationWarningDistance: 25,
    autoZoom: true,
    mapRotation: true,
    gpsAccuracy: 'high',
    screenAlwaysOn: true,
  };
  await db.put('settings', defaultSettings);
  return defaultSettings;
}

export async function saveSettings(settings: Settings) {
  const db = await getDB();
  await db.put('settings', settings);
}

export async function saveRoute(route: Route) {
  const db = await getDB();
  await db.put('routes', route);
}

export async function getRoutes(): Promise<Route[]> {
  const db = await getDB();
  return db.getAllFromIndex('routes', 'by-date');
}

export async function getRoute(id: string): Promise<Route | undefined> {
  const db = await getDB();
  return db.get('routes', id);
}

export async function deleteRoute(id: string) {
  const db = await getDB();
  await db.delete('routes', id);
}
