import maplibregl from 'maplibre-gl';
import type { StyleSpecification } from 'maplibre-gl';
import { MapStyleId } from './db';
import { registerTileProtocol, tileAttribution, tileMaxZoom, tileTemplate } from './offlineTiles';
import { RoutePoint, RoutePointKind } from './routePoints';

export const MAP_STYLE_LABELS: Record<MapStyleId, string> = {
    topo: 'Topográfico',
    satellite: 'Satélite',
};

export function buildMapStyle(style: MapStyleId): StyleSpecification {
    registerTileProtocol();
    return {
        version: 8,
        sources: {
            base: {
                type: 'raster',
                tiles: [tileTemplate(style)],
                tileSize: 256,
                maxzoom: tileMaxZoom(style),
                attribution: tileAttribution(style),
            },
        },
        layers: [
            {
                id: 'base',
                type: 'raster',
                source: 'base',
                paint: { 'raster-opacity': 1, 'raster-saturation': style === 'topo' ? -0.15 : 0 },
            },
        ],
    };
}

export const ROUTE_SOURCE = 'trail-route';
export const ROUTE_DONE_SOURCE = 'trail-route-done';

export interface RouteLayerOptions {
    width?: number;
    showProgress?: boolean;
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
}

export function setRouteAlertState(map: maplibregl.Map, offRoute: boolean) {
    if (!map.getLayer('route-line')) return;
    map.setPaintProperty('route-line', 'line-color', offRoute ? '#b91c1c' : '#c2410c');
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
    wrapper.style.cssText = 'width:64px;height:64px;position:relative;will-change:transform;';
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
