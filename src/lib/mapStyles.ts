import maplibregl from 'maplibre-gl';
import type { StyleSpecification } from 'maplibre-gl';
import { MapStyleId } from './db';
import { registerTileProtocol, tileAttribution, tileMaxZoom, tileTemplate } from './offlineTiles';
import { RoutePoint, RoutePointKind } from './routePoints';

export const MAP_STYLE_LABELS: Record<MapStyleId, string> = {
    topo: 'Topográfico (OpenTopoMap)',
    osm: 'Calles (OpenStreetMap)',
    esri_topo: 'Topográfico (Esri)',
    satellite: 'Satélite (Esri)',
    carto: 'Claro (CARTO Voyager)',
};

export function buildMapStyle(style: MapStyleId, referenceOnly = false): StyleSpecification {
    registerTileProtocol();
    return {
        version: 8,
        sources: {
            catalunya: {
                type: 'geojson',
                data: `${import.meta.env.BASE_URL}maps/catalunya.json`,
                attribution: 'Natural Earth · dominio público · mapa de referencia 1:10M',
            },
            base: {
                type: 'raster',
                tiles: [tileTemplate(style)],
                tileSize: 256,
                maxzoom: tileMaxZoom(style),
                attribution: tileAttribution(style),
            },
        },
        layers: [
            { id: 'sea', type: 'background', paint: { 'background-color': '#d5edf2' } },
            {
                id: 'land', type: 'fill', source: 'catalunya', filter: ['==', ['get', 'kind'], 'land'],
                paint: { 'fill-color': ['case', ['get', 'catalunya'], '#ecf2e4', '#f1f1eb'] },
            },
            {
                id: 'province', type: 'line', source: 'catalunya', filter: ['==', ['get', 'kind'], 'land'],
                paint: { 'line-color': '#a3b4a0', 'line-width': 1 },
            },
            {
                id: 'rivers', type: 'line', source: 'catalunya', filter: ['==', ['get', 'kind'], 'river'],
                paint: { 'line-color': '#60a5be', 'line-width': 1.5 },
            },
            {
                id: 'roads-casing', type: 'line', source: 'catalunya', filter: ['==', ['get', 'kind'], 'road'],
                paint: { 'line-color': '#c7b997', 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 1.5, 12, 5] },
            },
            {
                id: 'roads', type: 'line', source: 'catalunya', filter: ['==', ['get', 'kind'], 'road'],
                paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.5, 12, 3] },
            },
            {
                id: 'places', type: 'circle', source: 'catalunya', filter: ['==', ['get', 'kind'], 'place'],
                paint: { 'circle-radius': 4, 'circle-color': '#365e50', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 },
            },
            {
                id: 'base',
                type: 'raster',
                source: 'base',
                layout: { visibility: referenceOnly ? 'none' : 'visible' },
                paint: { 'raster-opacity': 1 },
            },
        ],
    };
}

export const ROUTE_SOURCE = 'trail-route';
export const ROUTE_DONE_SOURCE = 'trail-route-done';
export const ACTUAL_TRACK_SOURCE = 'trail-actual';
const ARROW_IMAGE = 'route-arrow';

export interface RouteLayerOptions {
    width?: number;
    showProgress?: boolean;
    showActualTrack?: boolean;
}

function ensureArrowImage(map: maplibregl.Map) {
    if (map.hasImage(ARROW_IMAGE)) return;
    const size = 32;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(10, 8);
    ctx.lineTo(22, 16);
    ctx.lineTo(10, 24);
    ctx.strokeStyle = 'rgba(124,45,18,0.55)';
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    map.addImage(ARROW_IMAGE, ctx.getImageData(0, 0, size, size));
}

export function setActualTrack(map: maplibregl.Map, coordinates: [number, number][]) {
    const source = map.getSource(ACTUAL_TRACK_SOURCE) as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    source.setData(
        coordinates.length >= 2
            ? ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } } as any)
            : ({ type: 'FeatureCollection', features: [] } as any)
    );
}

export function addRouteLayers(map: maplibregl.Map, geoJson: any, options: RouteLayerOptions = {}) {
    const width = options.width ?? 5;

    if (!map.getSource(ROUTE_SOURCE)) {
        map.addSource(ROUTE_SOURCE, { type: 'geojson', data: geoJson });
    } else {
        (map.getSource(ROUTE_SOURCE) as maplibregl.GeoJSONSource).setData(geoJson);
    }

    if (!map.getLayer('route-casing')) {
        map.addLayer({
            id: 'route-casing',
            type: 'line',
            source: ROUTE_SOURCE,
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#ffffff', 'line-width': width + 5, 'line-opacity': 0.9 },
        });
    }

    if (!map.getLayer('route-line')) {
        map.addLayer({
            id: 'route-line',
            type: 'line',
            source: ROUTE_SOURCE,
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#c2410c', 'line-width': width },
        });
    }

    if (options.showActualTrack) {
        if (!map.getSource(ACTUAL_TRACK_SOURCE)) {
            map.addSource(ACTUAL_TRACK_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        }
        if (!map.getLayer('route-actual')) {
            map.addLayer({
                id: 'route-actual',
                type: 'line',
                source: ACTUAL_TRACK_SOURCE,
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: { 'line-color': '#1d4ed8', 'line-width': 3.5, 'line-opacity': 0.9 },
            });
        }
    }

    if (options.showProgress) {
        if (!map.getSource(ROUTE_DONE_SOURCE)) {
            map.addSource(ROUTE_DONE_SOURCE, {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] },
            });
        }
        if (!map.getLayer('route-done')) {
            map.addLayer({
                id: 'route-done',
                type: 'line',
                source: ROUTE_DONE_SOURCE,
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: { 'line-color': '#0f766e', 'line-width': width, 'line-opacity': 0.95 },
            });
        }
    }

    ensureArrowImage(map);
    if (map.hasImage(ARROW_IMAGE) && !map.getLayer('route-arrows')) {
        map.addLayer({
            id: 'route-arrows',
            type: 'symbol',
            source: ROUTE_SOURCE,
            layout: {
                'symbol-placement': 'line',
                'symbol-spacing': 90,
                'icon-image': ARROW_IMAGE,
                'icon-size': 0.6,
                'icon-allow-overlap': true,
                'icon-ignore-placement': true,
            },
        });
    }
}

export function setRouteAlertState(map: maplibregl.Map, offRoute: boolean) {
    if (!map.getLayer('route-line')) return;
    map.setPaintProperty('route-line', 'line-color', offRoute ? '#b91c1c' : '#c2410c');
}

/** Etiqueta compacta con el tiempo previsto en un punto de la ruta. */
export function createWeatherMarker(icon: string, temperature: number, time: string, rain: number): HTMLElement {
    const element = document.createElement('div');
    element.style.cssText =
        'background:#ffffff;border:1px solid #d6d3d1;border-radius:12px;padding:3px 7px;box-shadow:0 1px 5px rgba(28,25,23,0.3);' +
        'font:600 12px system-ui,sans-serif;color:#1c1917;text-align:center;line-height:1.25;white-space:nowrap;';
    element.innerHTML = `<div>${icon} ${temperature}°</div><div style="font-weight:400;font-size:10px;color:#57534e">${time} · 💧${rain}%</div>`;
    return element;
}

const POINT_STYLES: Record<RoutePointKind, { background: string; glyph: string; size: number }> = {
    start: { background: '#0f766e', glyph: '▶', size: 26 },
    finish: { background: '#b45309', glyph: '■', size: 26 },
    summit: { background: '#78350f', glyph: '▲', size: 22 },
    pass: { background: '#7c2d12', glyph: '⌒', size: 20 },
    water: { background: '#0369a1', glyph: '≈', size: 20 },
    aid: { background: '#4d7c0f', glyph: '✚', size: 20 },
    junction: { background: '#57534e', glyph: '✛', size: 20 },
    turn: { background: '#a8a29e', glyph: '•', size: 14 },
    waypoint: { background: '#44403c', glyph: '◆', size: 18 },
};

export function createRoutePointMarker(point: RoutePoint): HTMLElement {
    const style = POINT_STYLES[point.kind];
    const element = document.createElement('div');
    element.style.cssText = [
        `width:${style.size}px`,
        `height:${style.size}px`,
        `background:${style.background}`,
        'border:2px solid #ffffff',
        'border-radius:50%',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'color:#ffffff',
        `font-size:${Math.round(style.size * 0.5)}px`,
        'line-height:1',
        'box-shadow:0 1px 4px rgba(28,25,23,0.35)',
        'cursor:pointer',
    ].join(';');
    element.textContent = style.glyph;
    element.setAttribute('aria-label', point.name);
    return element;
}

/**
 * Marcador de usuario con cono de orientación: el cono indica hacia dónde mira
 * el dispositivo y la flecha el rumbo real de desplazamiento.
 */
export function createUserMarkerElement(): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'width:64px;height:64px;position:absolute;will-change:transform;pointer-events:none;';
    wrapper.innerHTML = `
        <div data-role="accuracy" style="position:absolute;left:22px;top:22px;width:20px;height:20px;border-radius:50%;background:rgba(15,118,110,0.12);border:1px solid rgba(15,118,110,0.35);display:none;"></div>
        <div data-role="cone" style="position:absolute;left:50%;top:50%;width:0;height:0;transform-origin:0 0;transition:transform 180ms linear;">
            <div style="position:absolute;left:-22px;top:-34px;width:44px;height:34px;
                background:radial-gradient(farthest-side at 50% 100%, rgba(15,118,110,0.45), rgba(15,118,110,0));
                clip-path:polygon(50% 100%, 0% 0%, 100% 0%);"></div>
        </div>
        <div data-role="dot" style="position:absolute;left:50%;top:50%;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;
            background:#0f766e;border:3px solid #ffffff;box-shadow:0 1px 6px rgba(15,118,110,0.6);"></div>
        <div data-role="course" style="position:absolute;left:50%;top:50%;width:0;height:0;transform-origin:0 0;transition:transform 180ms linear;">
            <div style="position:absolute;left:-5px;top:-24px;width:10px;height:12px;background:#0f766e;
                clip-path:polygon(50% 0%, 100% 100%, 0% 100%);"></div>
        </div>
    `;
    return wrapper;
}

export function updateUserMarkerElement(
    element: HTMLElement,
    options: { heading: number | null; course: number | null; accuracyPixels: number | null }
) {
    const cone = element.querySelector<HTMLElement>('[data-role="cone"]');
    const course = element.querySelector<HTMLElement>('[data-role="course"]');
    const accuracy = element.querySelector<HTMLElement>('[data-role="accuracy"]');

    if (cone) {
        cone.style.display = options.heading == null ? 'none' : 'block';
        if (options.heading != null) cone.style.transform = `rotate(${options.heading}deg)`;
    }
    if (course) {
        course.style.display = options.course == null ? 'none' : 'block';
        if (options.course != null) course.style.transform = `rotate(${options.course}deg)`;
    }
    if (accuracy) {
        const size = options.accuracyPixels != null ? Math.min(220, options.accuracyPixels * 2) : 0;
        accuracy.style.display = size > 36 ? 'block' : 'none';
        accuracy.style.width = `${size}px`;
        accuracy.style.height = `${size}px`;
        accuracy.style.left = `${32 - size / 2}px`;
        accuracy.style.top = `${32 - size / 2}px`;
    }
}
