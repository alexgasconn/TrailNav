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
};

export function tileAttribution(style: MapStyleId) {
    return TILE_SOURCES[style].attribution;
}

export function tileMaxZoom(style: MapStyleId) {
    return TILE_SOURCES[style].maxZoom;
}

export function tileTemplate(style: MapStyleId) {
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
        if (stored) return { data: await stored.blob.arrayBuffer() };

        if (!navigator.onLine) throw new Error('Tesela no disponible sin conexión');

        const response = await fetch(TILE_SOURCES[style].url(z, x, y), { signal: abortController?.signal });
        if (!response.ok) throw new Error(`Error ${response.status} al descargar la tesela`);
        return { data: await response.arrayBuffer() };
    });
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
                    const response = await fetch(TILE_SOURCES[style].url(tile.z, tile.x, tile.y), { signal });
                    if (!response.ok) throw new Error(String(response.status));
                    const blob = await response.blob();
                    await db.put('tiles', { key, regionId, blob, size: blob.size });
                    progress.bytes += blob.size;
                }
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
