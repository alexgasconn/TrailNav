import React, { useCallback, useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import * as turf from '@turf/turf';
import { Download, HardDrive, Loader2, Trash2, X } from 'lucide-react';
import { MapRegion, MapStyleId, Route, getSettings } from '../lib/db';
import { MAP_STYLE_LABELS, buildMapStyle } from '../lib/mapStyles';
import {
  DownloadProgress,
  MAX_TILES_PER_REGION,
  StorageUsage,
  deleteRegion,
  downloadRegion,
  getRegions,
  getStorageUsage,
  listTiles,
} from '../lib/offlineTiles';
import { formatBytes, formatDate, formatInteger, formatPercent } from '../lib/format';

const DETAIL_LEVELS = [
  { maxZoom: 14, label: 'Media', description: 'Senderos principales' },
  { maxZoom: 15, label: 'Alta', description: 'Detalle de sendero' },
  { maxZoom: 16, label: 'Máxima', description: 'Máximo zoom offline' },
];

/** Área efectiva de descarga: el rectángulo visible reducido un 8 % por lado. */
function selectionBounds(map: maplibregl.Map): [number, number, number, number] {
  const bounds = map.getBounds();
  const west = bounds.getWest();
  const east = bounds.getEast();
  const south = bounds.getSouth();
  const north = bounds.getNorth();
  const insetX = (east - west) * 0.08;
  const insetY = (north - south) * 0.08;
  return [west + insetX, south + insetY, east - insetX, north - insetY];
}

export function OfflineMapManagerScreen({ route }: { route: Route | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const maxZoomRef = useRef(15);

  const [mapStyle, setMapStyle] = useState<MapStyleId | null>(null);
  const [maxZoom, setMaxZoom] = useState(15);
  const [tileCount, setTileCount] = useState(0);
  const [regions, setRegions] = useState<MapRegion[]>([]);
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [initAttempt, setInitAttempt] = useState(0);
  const [loadingList, setLoadingList] = useState(true);

  maxZoomRef.current = maxZoom;

  const refreshList = useCallback(async () => {
    const [nextRegions, nextUsage] = await Promise.all([getRegions(), getStorageUsage()]);
    setRegions(nextRegions);
    setUsage(nextUsage);
    setLoadingList(false);
  }, []);

  useEffect(() => {
    getSettings().then((settings) => setMapStyle(settings.mapStyle));
    refreshList();
  }, [refreshList]);

  const updateEstimate = useCallback((map: maplibregl.Map, zoom: number) => {
    setTileCount(listTiles(selectionBounds(map), Math.max(8, zoom - 4), zoom).length);
  }, []);

  useEffect(() => {
    if (mapRef.current || !containerRef.current || !mapStyle) return;

    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      const timer = window.setTimeout(() => setInitAttempt((value) => value + 1), 120);
      return () => window.clearTimeout(timer);
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildMapStyle(mapStyle),
      center: [-3.7, 40.4],
      zoom: 6,
      attributionControl: { compact: true },
      trackResize: true,
    });
    mapRef.current = map;

    map.on('error', (event) => console.error('MapLibre:', event.error));
    map.on('load', () => {
      if (route?.geoJson) {
        map.fitBounds(turf.bbox(route.geoJson) as [number, number, number, number], { padding: 40, duration: 0 });
      }
      updateEstimate(map, maxZoomRef.current);
    });
    map.on('moveend', () => updateEstimate(map, maxZoomRef.current));

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapStyle, initAttempt]);

  useEffect(() => {
    if (mapRef.current) updateEstimate(mapRef.current, maxZoom);
  }, [maxZoom, updateEstimate]);

  const startDownload = async () => {
    const map = mapRef.current;
    if (!map || !mapStyle) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    setProgress({ completed: 0, total: tileCount, bytes: 0, failed: 0 });

    try {
      await downloadRegion({
        name: route ? `Zona de ${route.name}` : `Zona ${formatDate(Date.now())}`,
        bounds: selectionBounds(map),
        style: mapStyle,
        minZoom: Math.max(8, maxZoom - 4),
        maxZoom,
        signal: controller.signal,
        onProgress: setProgress,
      });
      await refreshList();
    } catch (downloadError: any) {
      if (downloadError?.name !== 'AbortError') {
        setError(downloadError?.message ?? 'No se pudo completar la descarga');
      }
    } finally {
      abortRef.current = null;
      setProgress(null);
    }
  };

  const removeRegion = async (regionId: string) => {
    await deleteRegion(regionId);
    await refreshList();
  };

  const tooManyTiles = tileCount > MAX_TILES_PER_REGION;

  return (
    <div className="flex flex-col min-h-full bg-canvas">
      <header className="pt-safe px-4 pt-6 pb-3">
        <h1 className="text-2xl font-semibold text-ink">Mapas offline</h1>
        <p className="text-sm text-ink-soft mt-1">
          Las teselas se guardan en el dispositivo y se usan automáticamente cuando no hay cobertura.
        </p>
      </header>

      <section className="px-4">
        <div className="rounded-2xl overflow-hidden border border-line bg-surface">
          <div className="relative h-64">
            <div ref={containerRef} className="absolute inset-0" />
            <div className="absolute inset-[8%] border-2 border-moss rounded-lg pointer-events-none shadow-[0_0_0_9999px_rgba(31,29,26,0.18)]" />
          </div>

          <div className="p-4 space-y-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint mb-2">Nivel de detalle</p>
              <div className="grid grid-cols-3 gap-2">
                {DETAIL_LEVELS.map((level) => (
                  <button
                    key={level.maxZoom}
                    onClick={() => setMaxZoom(level.maxZoom)}
                    disabled={Boolean(progress)}
                    className={`rounded-xl border px-2 py-2.5 text-left disabled:opacity-50 ${maxZoom === level.maxZoom ? 'border-moss bg-moss-soft' : 'border-line bg-surface'}`}
                  >
                    <span className="block text-sm font-semibold text-ink">{level.label}</span>
                    <span className="block text-[11px] text-ink-faint leading-tight">{level.description}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-baseline justify-between text-sm">
              <span className="text-ink-soft">Teselas del área seleccionada</span>
              <span className={`tabular font-semibold ${tooManyTiles ? 'text-alert' : 'text-ink'}`}>{formatInteger(tileCount)}</span>
            </div>

            {tooManyTiles && (
              <p className="text-xs text-alert">
                Supera el máximo de {formatInteger(MAX_TILES_PER_REGION)} teselas. Acerca el mapa o baja el nivel de detalle.
              </p>
            )}

            {progress ? (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-moss font-medium">
                    Descargando {formatInteger(progress.completed)} / {formatInteger(progress.total)}
                  </span>
                  <span className="tabular text-ink-soft">{formatBytes(progress.bytes)}</span>
                </div>
                <div className="h-2 bg-surface-soft rounded-full overflow-hidden">
                  <div
                    className="h-full bg-moss transition-[width] duration-200"
                    style={{ width: `${progress.total > 0 ? (progress.completed / progress.total) * 100 : 0}%` }}
                  />
                </div>
                {progress.failed > 0 && <p className="text-xs text-clay">{formatInteger(progress.failed)} teselas no disponibles</p>}
                <button
                  onClick={() => abortRef.current?.abort()}
                  className="w-full h-12 rounded-xl border border-line text-ink font-medium flex items-center justify-center gap-2"
                >
                  <X size={18} /> Cancelar descarga
                </button>
              </div>
            ) : (
              <button
                onClick={startDownload}
                disabled={tooManyTiles || tileCount === 0}
                className="w-full h-12 rounded-xl bg-moss text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Download size={18} /> Descargar esta zona
              </button>
            )}

            {error && <p className="text-sm text-alert">{error}</p>}
            <p className="text-[11px] text-ink-faint">
              Fuente: {MAP_STYLE_LABELS[mapStyle ?? 'topo']}. Descarga solo las zonas que vayas a necesitar.
            </p>
          </div>
        </div>
      </section>

      <section className="px-4 mt-5">
        <div className="bg-surface border border-line rounded-2xl p-4 flex items-center gap-3">
          <span className="grid place-items-center w-11 h-11 rounded-xl bg-moss-soft text-moss-strong shrink-0">
            <HardDrive size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink tabular">
              {formatBytes(usage?.tilesBytes ?? 0)} en {formatInteger(usage?.tileCount ?? 0)} teselas
            </p>
            {usage?.quotaBytes && usage.usedBytes != null && (
              <>
                <div className="h-1.5 bg-surface-soft rounded-full overflow-hidden mt-2">
                  <div className="h-full bg-moss" style={{ width: `${Math.min(100, (usage.usedBytes / usage.quotaBytes) * 100)}%` }} />
                </div>
                <p className="text-[11px] text-ink-faint mt-1">
                  {formatPercent((usage.usedBytes / usage.quotaBytes) * 100, 1)} de la cuota del navegador
                </p>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="px-4 mt-5 pb-6">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint mb-2">Zonas descargadas</h2>

        {loadingList ? (
          <div className="bg-surface border border-line rounded-2xl p-6 flex items-center justify-center text-ink-faint">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : regions.length === 0 ? (
          <div className="bg-surface border border-line rounded-2xl p-6 text-center">
            <p className="text-sm font-medium text-ink">Todavía no hay zonas guardadas</p>
            <p className="text-sm text-ink-soft mt-1">
              Encuadra el área de tu ruta y pulsa «Descargar esta zona» para poder usarla sin cobertura.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {regions.map((region) => (
              <li key={region.id} className="bg-surface border border-line rounded-2xl p-4 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink truncate">{region.name}</p>
                  <p className="text-xs text-ink-faint tabular mt-1">
                    {formatBytes(region.sizeBytes)} · {formatInteger(region.tileCount)} teselas · zoom {region.minZoom}–{region.maxZoom}
                  </p>
                  <p className="text-xs text-ink-faint mt-0.5">
                    {MAP_STYLE_LABELS[region.style]} · {formatDate(region.createdAt)}
                  </p>
                </div>
                <button
                  onClick={() => removeRegion(region.id)}
                  className="touch-target grid place-items-center text-ink-faint hover:text-alert"
                  aria-label={`Eliminar ${region.name}`}
                >
                  <Trash2 size={20} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
