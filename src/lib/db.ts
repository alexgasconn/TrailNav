import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface Route {
  id: string;
  name: string;
  distance: number;
  elevationGain: number;
  elevationLoss: number;
  maxElevation: number;
  minElevation: number;
  gpxData: string;
  geoJson: any;
  createdAt: number;
}

export type MapStyleId =
  | 'topo'
  | 'satellite'
  | 'carto'
  | 'stamen'
  | 'carto_voyager'
  | 'stamen_toner'
  | 'stamen_watercolor'
  | 'esri';

export interface MapRegion {
  id: string;
  name: string;
  /** [minLng, minLat, maxLng, maxLat] */
  bounds: [number, number, number, number];
  style: MapStyleId;
  minZoom: number;
  maxZoom: number;
  tileCount: number;
  /** Bytes realmente almacenados en IndexedDB. */
  sizeBytes: number;
  createdAt: number;
}

export interface StoredTile {
  key: string;
  regionId: string;
  blob: Blob;
  size: number;
}

export interface Settings {
  id: string;
  deviationWarningDistance: number;
  keepMapNorthUp: boolean;
  mapStyle: MapStyleId;
  screenAlwaysOn: boolean;
  vibrationAlerts: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'user-settings',
  deviationWarningDistance: 30,
  keepMapNorthUp: false,
  mapStyle: 'topo',
  screenAlwaysOn: true,
  vibrationAlerts: true,
};

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
  tiles: {
    key: string;
    value: StoredTile;
    indexes: { 'by-region': string };
  };
  settings: {
    key: string;
    value: Settings;
  };
}

let dbPromise: Promise<IDBPDatabase<TrailNavDB>> | null = null;

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<TrailNavDB>('trailnav-db', 2, {
      upgrade(db, oldVersion) {
        if (!db.objectStoreNames.contains('routes')) {
          db.createObjectStore('routes', { keyPath: 'id' }).createIndex('by-date', 'createdAt');
        }
        if (oldVersion < 2 && db.objectStoreNames.contains('maps')) {
          // La versión 1 no guardaba teselas: cualquier región previa era un registro vacío.
          db.deleteObjectStore('maps');
        }
        if (!db.objectStoreNames.contains('maps')) {
          db.createObjectStore('maps', { keyPath: 'id' }).createIndex('by-date', 'createdAt');
        }
        if (!db.objectStoreNames.contains('tiles')) {
          db.createObjectStore('tiles', { keyPath: 'key' }).createIndex('by-region', 'regionId');
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
  const stored = await db.get('settings', DEFAULT_SETTINGS.id);
  if (stored) return { ...DEFAULT_SETTINGS, ...stored, id: DEFAULT_SETTINGS.id };
  await db.put('settings', DEFAULT_SETTINGS);
  return DEFAULT_SETTINGS;
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
  const routes = await db.getAllFromIndex('routes', 'by-date');
  return routes.reverse();
}

export async function getRoute(id: string): Promise<Route | undefined> {
  const db = await getDB();
  return db.get('routes', id);
}

export async function deleteRoute(id: string) {
  const db = await getDB();
  await db.delete('routes', id);
}
