import test from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from '@xmldom/xmldom';
import { parseRouteFile, routeFromGeoJSON, exportRouteGPX } from '../src/lib/gpx';
import { duplicateRoute, editRouteCopy } from '../src/lib/routeTools';
import { reverseRoute } from '../src/lib/reverseRoute';
import { getRoutePoints } from '../src/lib/routePoints';
import { toUTM } from '../src/lib/coordinates';
import { addTrackPoint, createActualTrack, replayTrack } from '../src/lib/actualTrack';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { getDB, saveRoute, getRoute, getRoutes, deleteRoute, getSettings, saveSettings } from '../src/lib/db';

const coordinates = Array.from({ length: 101 }, (_, index) => [2 + index * 0.0001, 41, 100 + index]);
const geojson = {
    type: 'FeatureCollection', features: [
        { type: 'Feature', properties: { name: 'Ruta & <prueba>' }, geometry: { type: 'LineString', coordinates } },
        { type: 'Feature', properties: { name: 'Fuente', desc: 'Agua & sombra', sym: 'water' }, geometry: { type: 'Point', coordinates: coordinates[50] } },
    ]
};

test('importa GPX, KML y GeoJSON con métricas calculadas', async () => {
    const original = routeFromGeoJSON(geojson, 'Ruta');
    const gpx = await parseRouteFile(new File([exportRouteGPX(original)], 'ruta.gpx'));
    assert.equal(gpx.name, original.name);
    assert.ok(Math.abs(gpx.distance - original.distance) < 0.01);
    const json = await parseRouteFile(new File([JSON.stringify(geojson)], 'ruta.geojson'));
    assert.equal(json.geoJson.features.length, 2);
    const kml = await parseRouteFile(new File(['<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>KML</name><LineString><coordinates>2,41,100 2.01,41,200</coordinates></LineString></Placemark></Document></kml>'], 'ruta.kml'));
    assert.equal(kml.name, 'KML');
    assert.ok(kml.distance > 800);
});

test('rechaza coordenadas inválidas, rutas vacías y formatos no admitidos', async () => {
    assert.throws(() => routeFromGeoJSON({ type: 'FeatureCollection', features: [] }, 'vacía'));
    assert.throws(() => routeFromGeoJSON({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: [[181, 41], [2, 41]] } }] }, 'incorrecta'));
    await assert.rejects(parseRouteFile(new File(['<html/>'], 'ruta.gpx')));
    await assert.rejects(parseRouteFile(new File(['texto'], 'ruta.txt')));
});

test('exporta XML escapado y waypoints con notas y tipo', () => {
    const original = routeFromGeoJSON(geojson, 'Ruta');
    const output = exportRouteGPX(original);
    const doc = new DOMParser().parseFromString(output, 'text/xml');
    assert.equal(doc.getElementsByTagName('trkpt').length, 101);
    assert.equal(doc.getElementsByTagName('wpt').length, 1);
    assert.equal(doc.getElementsByTagName('desc')[0].textContent, 'Agua & sombra');
    assert.equal(doc.getElementsByTagName('sym')[0].textContent, 'water');
    assert.ok(output.includes('&amp;'));
});

test('duplicar y recortar conserva el original y recalcula métricas', () => {
    const original = routeFromGeoJSON(geojson, 'Ruta');
    const snapshot = JSON.stringify(original);
    const copy = duplicateRoute(original);
    assert.notEqual(copy.id, original.id);
    copy.geoJson.features[0].geometry.coordinates[0][0] = 3;
    assert.equal(JSON.stringify(original), snapshot);
    const trimmed = editRouteCopy(original, 25, 75);
    assert.ok(trimmed.distance < original.distance * 0.52 && trimmed.distance > original.distance * 0.48);
    assert.notEqual(trimmed.id, original.id);
    assert.equal(JSON.stringify(original), snapshot);
    assert.throws(() => editRouteCopy(original, 80, 20));
    assert.ok(editRouteCopy(original, 0, 100, 5).geoJson.features[0].geometry.coordinates.length < 101);
});

test('exportación invertida sigue el sentido actual y actualiza waypoints', () => {
    const original = routeFromGeoJSON(geojson, 'Ruta');
    const reversed = reverseRoute(original);
    const doc = new DOMParser().parseFromString(exportRouteGPX(reversed), 'text/xml');
    assert.equal(Number(doc.getElementsByTagName('trkpt')[0].getAttribute('lon')), coordinates[100][0]);
    getRoutePoints(original);
    const updated = { ...original, geoJson: { ...geojson, features: [...geojson.features, { type: 'Feature', properties: { name: 'Cruce', sym: 'junction' }, geometry: { type: 'Point', coordinates: coordinates[40] } }] } };
    assert.ok(getRoutePoints(updated).some((point) => point.name === 'Cruce' && point.kind === 'junction'));
});

test('UTM valida zona, hemisferio y límites geográficos', () => {
    assert.equal(toUTM(3, 0), '31 N · 500000 E · 0 N (WGS84)');
    assert.ok(toUTM(3, -1)?.startsWith('31 S'));
    assert.ok(toUTM(180, 0)?.startsWith('60 N'));
    assert.equal(toUTM(0, 90), null);
    assert.equal(toUTM(NaN, 40), null);
});

test('las posiciones GPS inválidas no contaminan las métricas del recorrido', () => {
    const track = createActualTrack();
    assert.equal(addTrackPoint(track, 2, 41, 100, 10), true);
    const snapshot = structuredClone(track);
    for (const [lng, lat, accuracy] of [[NaN, 41, 10], [181, 41, 10], [2, 91, 10], [2, Infinity, 10], [2, 41, NaN], [2, 41, -1], [2, 41, 100]]) {
        assert.equal(addTrackPoint(track, lng, lat, 100, accuracy), false);
    }
    assert.deepEqual(track, snapshot);
});

test('recupera los puntos válidos de un recorrido parcialmente corrupto', () => {
    assert.deepEqual(replayTrack(null), createActualTrack());
    assert.deepEqual(replayTrack({ points: [] }), createActualTrack());
    const recovered = replayTrack([null, {}, [], ['2', 41], [2, 41, null], [Infinity, 41], [2.001, 41, 110]]);
    assert.equal(recovered.points.length, 2);
    assert.ok(recovered.distance > 80 && recovered.distance < 90);
    assert.ok(Number.isFinite(recovered.ascent));
});

test('la base de datos reintenta tras un fallo de apertura y conserva rutas y ajustes', async () => {
    const originalOpen = indexedDB.open;
    indexedDB.open = () => { throw new Error('Almacenamiento temporalmente no disponible'); };
    try {
        await assert.rejects(async () => getDB(), /temporalmente/);
    } finally {
        indexedDB.open = originalOpen;
    }

    const database = await getDB();
    assert.equal(await getDB(), database);
    const original = routeFromGeoJSON(geojson, 'Persistencia');
    await saveRoute(original);
    assert.deepEqual(await getRoute(original.id), original);
    assert.equal((await getRoutes()).length, 1);
    const settings = await getSettings();
    await saveSettings({ ...settings, soundAlerts: true });
    assert.equal((await getSettings()).soundAlerts, true);
    await deleteRoute(original.id);
    assert.equal(await getRoute(original.id), undefined);
    assert.equal((await getRoutes()).length, 0);

    const upgraded = indexedDB.open('trailnav-db', 3);
    await new Promise<void>((resolve, reject) => {
        upgraded.onsuccess = () => { upgraded.result.close(); resolve(); };
        upgraded.onerror = () => reject(upgraded.error);
    });
    await assert.rejects(getDB(), { name: 'VersionError' });
    globalThis.indexedDB = new IDBFactory();
    assert.ok(await getDB());
});