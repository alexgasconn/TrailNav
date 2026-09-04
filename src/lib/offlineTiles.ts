import maplibregl from 'maplibre-gl';
import { MapRegion, MapStyleId, StoredTile, getDB } from './db';

export const TILE_PROTOCOL = 'trailnav';

const TILE_SOURCES: Record<MapStyleId, { url: (z: number, x: number, y: number) => string; attribution: string; maxZoom: number }> = {
    topo: {
        url: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
        attribution: '© OpenStreetMap',
        maxZoom: 19,
    },
    satellite: {
        url: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
        attribution: '© Esri, Maxar, Earthstar Geographics',
        maxZoom: 18,
    },
    carto: {
        // CARTO Voyager (use provided API key param)
        url: (z, x, y) => `https://basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}.png?key=cb1_2hl3_1_c4dfd0f0c288bbb5cd981bed`,
        attribution: '© Carto, © OpenStreetMap',
        maxZoom: 19,
    },
    carto_voyager: {
        url: (z, x, y) => `https://basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}.png?key=cb1_2hl3_1_c4dfd0f0c288bbb5cd981bed`,
        attribution: '© Carto, © OpenStreetMap',
        maxZoom: 19,
    },
    stamen: {
        // Stamen Terrain (https)
        url: (z, x, y) => `https://stamen-tiles.a.ssl.fastly.net/terrain/${z}/${x}/${y}.jpg`,
        attribution: 'Map tiles by Stamen Design, under CC BY 3.0. Data by OpenStreetMap, under ODbL.',
        maxZoom: 18,
    },
    stamen_toner: {
        url: (z, x, y) => `https://stamen-tiles.a.ssl.fastly.net/toner/${z}/${x}/${y}.png`,
        attribution: 'Map tiles by Stamen Design, under CC BY 3.0. Data by OpenStreetMap, under ODbL.',
        maxZoom: 20,
    },
    stamen_watercolor: {
        url: (z, x, y) => `https://stamen-tiles.a.ssl.fastly.net/watercolor/${z}/${x}/${y}.jpg`,
        attribution: 'Map tiles by Stamen Design, under CC BY 3.0. Data by OpenStreetMap, under ODbL.',
        maxZoom: 16,
    },
    esri: {
        url: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
        attribution: '© Esri, Maxar, Earthstar Geographics',
        maxZoom: 18,
    },
};

export function tileAttribution(style: MapStyleId) {
    return TILE_SOURCES[style].attribution;
}

export function tileMaxZoom(style: MapStyleId) {
    return TILE_SOURCES[style].maxZoom;
}

export function tileTemplate(style: MapStyleId) {
    // Prefer direct network tile URLs when online to avoid relying on the
    // custom protocol handler (which may be blocked by dev service workers).
    try {
        if (typeof window !== 'undefined' && navigator.onLine) {
            // Call the url factory with template placeholders — it will interpolate
            // the placeholders into a proper template string.
            return TILE_SOURCES[style].url('{z}', '{x}', '{y}');
        }
    } catch (e) {
        // fallthrough to protocol URL
    }
    return `${TILE_PROTOCOL}://tile/${style}/{z}/{x}/{y}`;
}

function tileKey(style: MapStyleId, z: number, x: number, y: number) {
    return `${style}/${z}/${x}/${y}`;
}

async function readTile(style: MapStyleId, z: number, x: number, y: number): Promise<StoredTile | undefined> {
    const db = await getDB();
    return db.get('tiles', tileKey(style, z, x, y));
}

let protocolRegistered = false;

/**
 * Las teselas se resuelven primero desde IndexedDB y solo después desde la red:
 * sin conexión únicamente se sirven las zonas realmente descargadas.
 */
export function registerTileProtocol() {
    if (protocolRegistered) return;
    protocolRegistered = true;

    maplibregl.addProtocol(TILE_PROTOCOL, async (params, abortController) => {
        const match = /^trailnav:\/\/tile\/(topo|satellite)\/(\d+)\/(\d+)\/(\d+)/.exec(params.url);
        if (!match) throw new Error(`URL de tesela no válida: ${params.url}`);

        const style = match[1] as MapStyleId;
        const z = Number(match[2]);
        const x = Number(match[3]);
        const y = Number(match[4]);

        const stored = await readTile(style, z, x, y);
        if (stored) {
            try {
                const ab = await (stored.blob as Blob).arrayBuffer();
                return { arrayBuffer: ab } as any;
            } catch (e) {
                console.warn('Tesela almacenada inválida, continuará con red:', style, z, x, y, e);
            }
        }

        if (!navigator.onLine) throw new Error('Tesela no disponible sin conexión');

        const response = await fetch(TILE_SOURCES[style].url(z, x, y), { signal: abortController?.signal });
        if (!response.ok) throw new Error(`Error ${response.status} al descargar la tesela`);
        const ab = await response.arrayBuffer();
        return { arrayBuffer: ab } as any;
    });
}

export async function verifyTileExists(style: MapStyleId, z: number, x: number, y: number): Promise<boolean> {
    const stored = await readTile(style, z, x, y);
    if (!stored) return false;
    try {
        await (stored.blob as Blob).arrayBuffer();
        return true;
    } catch {
        return false;
    }
}

export async function preloadTilesToCache(tiles: TileCoordinate[], style: MapStyleId) {
    // Create Image objects that load via the custom protocol so the browser decodes and caches them.
    const promises: Promise<void>[] = [];
    for (const t of tiles) {
        const url = `${TILE_PROTOCOL}://tile/${style}/${t.z}/${t.x}/${t.y}`;
        const p = new Promise<void>((resolve) => {
            const img = new Image();
            img.onload = () => resolve();
            img.onerror = () => resolve();
            img.src = url;
        });
        promises.push(p);
    }
    await Promise.all(promises);
}

export interface TileCoordinate {
    z: number;
    x: number;
    y: number;
}

function lngToTileX(lng: number, z: number) {
    return Math.floor(((lng + 180) / 360) * 2 ** z);
}

function latToTileY(lat: number, z: number) {
    const rad = (lat * Math.PI) / 180;
    return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z);
}

export function listTiles(bounds: [number, number, number, number], minZoom: number, maxZoom: number): TileCoordinate[] {
    const [minLng, minLat, maxLng, maxLat] = bounds;
    const tiles: TileCoordinate[] = [];

    for (let z = minZoom; z <= maxZoom; z += 1) {
        const limit = 2 ** z - 1;
        const xStart = Math.max(0, Math.min(lngToTileX(minLng, z), lngToTileX(maxLng, z)));
        const xEnd = Math.min(limit, Math.max(lngToTileX(minLng, z), lngToTileX(maxLng, z)));
        const yStart = Math.max(0, Math.min(latToTileY(minLat, z), latToTileY(maxLat, z)));
        const yEnd = Math.min(limit, Math.max(latToTileY(minLat, z), latToTileY(maxLat, z)));

        for (let x = xStart; x <= xEnd; x += 1) {
            for (let y = yStart; y <= yEnd; y += 1) tiles.push({ z, x, y });
        }
    }

    return tiles;
}

export const MAX_TILES_PER_REGION = 9000;

export interface DownloadProgress {
    completed: number;
    total: number;
    bytes: number;
    failed: number;
}

export interface DownloadOptions {
    name: string;
    bounds: [number, number, number, number];
    style: MapStyleId;
    minZoom: number;
    maxZoom: number;
    onProgress?: (progress: DownloadProgress) => void;
    signal?: AbortSignal;
}

const CONCURRENCY = 4;

export async function downloadRegion(options: DownloadOptions): Promise<MapRegion> {
    const { name, bounds, style, minZoom, maxZoom, onProgress, signal } = options;
    const tiles = listTiles(bounds, minZoom, maxZoom);

    if (tiles.length === 0) throw new Error('El área seleccionada no contiene teselas');
    if (tiles.length > MAX_TILES_PER_REGION) {
        throw new Error(
            `El área requiere ${tiles.length} teselas. Reduce la zona o el nivel de detalle (máximo ${MAX_TILES_PER_REGION}).`
        );
    }

    const db = await getDB();
    const regionId = crypto.randomUUID();
    const progress: DownloadProgress = { completed: 0, total: tiles.length, bytes: 0, failed: 0 };

    // helper to fetch and store a single tile with retries
    async function fetchAndStoreTile(tile: TileCoordinate, retries = 2) {
        const key = tileKey(style, tile.z, tile.x, tile.y);
        try {
            const existing = await db.get('tiles', key);
            if (existing) {
                progress.bytes += existing.size;
                return true;
            }
        } catch {
            // ignore and attempt fetch
        }

        for (let attempt = 0; attempt <= retries; attempt += 1) {
            if (signal?.aborted) return false;
            try {
                const response = await fetch(TILE_SOURCES[style].url(tile.z, tile.x, tile.y), { signal });
                if (!response.ok) throw new Error(String(response.status));
                const blob = await response.blob();
                await db.put('tiles', { key, regionId, blob, size: blob.size });
                progress.bytes += blob.size;
                return true;
            } catch (err) {
                if (signal?.aborted) return false;
                if (attempt < retries) {
                    // exponential backoff
                    const wait = 200 * 2 ** attempt;
                    // eslint-disable-next-line no-await-in-loop
                    await new Promise((r) => setTimeout(r, wait));
                    continue;
                }
                // final failure
                return false;
            }
        }
        return false;
    }

    let cursor = 0;
    const worker = async () => {
        while (cursor < tiles.length) {
            if (signal?.aborted) return;
            const tile = tiles[cursor];
            cursor += 1;

            try {
                const ok = await fetchAndStoreTile(tile, 2);
                if (!ok) progress.failed += 1;
            } catch {
                if (signal?.aborted) return;
                progress.failed += 1;
            }

            progress.completed += 1;
            onProgress?.({ ...progress });
        }
    };

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    if (signal?.aborted) {
        await deleteRegionTiles(regionId);
        throw new DOMException('Descarga cancelada', 'AbortError');
    }

    if (progress.failed === tiles.length) {
        await deleteRegionTiles(regionId);
        throw new Error('No se pudo descargar ninguna tesela. Comprueba la conexión.');
    }

    const region: MapRegion = {
        id: regionId,
        name,
        bounds,
        style,
        minZoom,
        maxZoom,
        tileCount: tiles.length - progress.failed,
        sizeBytes: progress.bytes,
        createdAt: Date.now(),
    };

    await db.put('maps', region);
    return region;
}

async function deleteRegionTiles(regionId: string) {
    const db = await getDB();
    const keys = await db.getAllKeysFromIndex('tiles', 'by-region', regionId);
    const tx = db.transaction('tiles', 'readwrite');
    await Promise.all(keys.map((key) => tx.store.delete(key)));
    await tx.done;
}

export async function getRegions(): Promise<MapRegion[]> {
    const db = await getDB();
    const regions = await db.getAllFromIndex('maps', 'by-date');
    return regions.reverse();
}

export async function getMissingTilesForRegion(region: MapRegion): Promise<TileCoordinate[]> {
    const expected = listTiles(region.bounds, region.minZoom, region.maxZoom);
    const db = await getDB();
    const missing: TileCoordinate[] = [];
    for (const t of expected) {
        const key = tileKey(region.style, t.z, t.x, t.y);
        // eslint-disable-next-line no-await-in-loop
        const existing = await db.get('tiles', key);
        if (!existing) missing.push(t);
    }
    return missing;
}

export async function downloadTiles(tiles: TileCoordinate[], style: MapStyleId, regionId: string, onProgress?: (p: DownloadProgress) => void, signal?: AbortSignal, retries = 2) {
    const db = await getDB();
    const progress: DownloadProgress = { completed: 0, total: tiles.length, bytes: 0, failed: 0 };

    let cursor = 0;
    const worker = async () => {
        while (cursor < tiles.length) {
            if (signal?.aborted) return;
            const tile = tiles[cursor];
            cursor += 1;
            const key = tileKey(style, tile.z, tile.x, tile.y);
            try {
                const existing = await db.get('tiles', key);
                if (existing) {
                    progress.bytes += existing.size;
                } else {
                    let ok = false;
                    for (let attempt = 0; attempt <= retries; attempt += 1) {
                        if (signal?.aborted) break;
                        try {
                            const response = await fetch(TILE_SOURCES[style].url(tile.z, tile.x, tile.y), { signal });
                            if (!response.ok) throw new Error(String(response.status));
                            const blob = await response.blob();
                            await db.put('tiles', { key, regionId, blob, size: blob.size });
                            progress.bytes += blob.size;
                            ok = true;
                            break;
                        } catch {
                            if (attempt < retries) {
                                // backoff
                                // eslint-disable-next-line no-await-in-loop
                                await new Promise((r) => setTimeout(r, 200 * 2 ** attempt));
                                continue;
                            }
                        }
                    }
                    if (!ok) progress.failed += 1;
                }
            } catch {
                progress.failed += 1;
            }
            progress.completed += 1;
            onProgress?.({ ...progress });
        }
    };

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    return progress;
}

export async function deleteRegion(regionId: string) {
    const db = await getDB();
    await deleteRegionTiles(regionId);
    await db.delete('maps', regionId);
}

export interface StorageUsage {
    tilesBytes: number;
    tileCount: number;
    quotaBytes: number | null;
    usedBytes: number | null;
}

export async function getStorageUsage(): Promise<StorageUsage> {
    const db = await getDB();
    const regions = await db.getAll('maps');
    const tileCount = await db.count('tiles');
    const tilesBytes = regions.reduce((total, region) => total + region.sizeBytes, 0);

    let quotaBytes: number | null = null;
    let usedBytes: number | null = null;
    if (navigator.storage?.estimate) {
        try {
            const estimate = await navigator.storage.estimate();
            quotaBytes = estimate.quota ?? null;
            usedBytes = estimate.usage ?? null;
        } catch {
            quotaBytes = null;
        }
    }

    return { tilesBytes, tileCount, quotaBytes, usedBytes };
}
