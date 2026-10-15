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
  /** true si el sentido original del GPX se ha invertido. */
  reversed?: boolean;
}

export type MapStyleId = 'topo' | 'osm' | 'satellite' | 'carto' | 'esri_topo';

export const MAP_STYLE_IDS: MapStyleId[] = ['topo', 'osm', 'esri_topo', 'satellite', 'carto'];

/** Ajustes guardados con estilos retirados vuelven al mapa de calles. */
function normalizeStyle(style: unknown): MapStyleId {
  if (style === 'carto_voyager') return 'carto';
  if (style === 'esri') return 'satellite';
  return MAP_STYLE_IDS.includes(style as MapStyleId) ? (style as MapStyleId) : 'osm';
}

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

export type FitnessLevel = 'sedentary' | 'beginner' | 'average' | 'athletic' | 'endurance' | 'elite' | 'superhuman';
export type PaceType = 'photography' | 'relaxed' | 'steady' | 'nordic' | 'power' | 'fast' | 'trail_run' | 'sky_run';
export type PackWeight = 'light' | 'medium' | 'heavy';

export interface Settings {
  id: string;
  deviationWarningDistance: number;
  keepMapNorthUp: boolean;
  mapStyle: MapStyleId;
  mapStyleDefaultVersion?: number;
  screenAlwaysOn: boolean;
  vibrationAlerts: boolean;
  /** Perfil para estimar tiempos de ruta. */
  fitness: FitnessLevel;
  pace: PaceType;
  packWeight: PackWeight;
  includeBreaks: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'user-settings',
  deviationWarningDistance: 30,
  keepMapNorthUp: false,
  mapStyle: 'osm',
  mapStyleDefaultVersion: 1,
  screenAlwaysOn: true,
  vibrationAlerts: true,
  fitness: 'average',
  pace: 'steady',
  packWeight: 'light',
  includeBreaks: true,
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
  if (stored) {
    const mapStyle = !stored.mapStyleDefaultVersion && stored.mapStyle === 'topo' ? 'osm' : normalizeStyle(stored.mapStyle);
    const settings: Settings = { ...DEFAULT_SETTINGS, ...stored, id: DEFAULT_SETTINGS.id, mapStyle, mapStyleDefaultVersion: 1 };
    if (!stored.mapStyleDefaultVersion) await db.put('settings', settings);
    return settings;
  }
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
