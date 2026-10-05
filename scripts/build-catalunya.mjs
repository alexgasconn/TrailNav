import { mkdir, writeFile } from 'node:fs/promises';
import { bbox, bboxClip, simplify } from '@turf/turf';

const bounds = [0, 40.4, 3.5, 43];
const datasets = [
    ['land', 'ne_10m_admin_1_states_provinces'],
    ['road', 'ne_10m_roads'],
    ['river', 'ne_10m_rivers_lake_centerlines'],
    ['place', 'ne_10m_populated_places'],
];
const features = [];

function removeEmptyParts(geometry) {
    if (geometry.type === 'MultiPolygon') {
        geometry.coordinates = geometry.coordinates.filter(polygon => polygon[0]?.length >= 4)
            .map(polygon => polygon.filter(ring => ring.length >= 4));
    } else if (geometry.type === 'Polygon') {
        geometry.coordinates = geometry.coordinates[0]?.length >= 4 ? geometry.coordinates.filter(ring => ring.length >= 4) : [];
    } else if (geometry.type === 'MultiLineString') {
        geometry.coordinates = geometry.coordinates.filter(line => line.length >= 2);
    }
    return geometry.coordinates.length > 0;
}

for (const [kind, dataset] of datasets) {
    const url = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/${dataset}.geojson`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${dataset}: HTTP ${response.status}`);
    const collection = await response.json();
    let count = 0;
    for (const feature of collection.features) {
        if (!feature.geometry) continue;
        const extent = bbox(feature);
        if (extent[2] < bounds[0] || extent[0] > bounds[2] || extent[3] < bounds[1] || extent[1] > bounds[3]) continue;
        const clipped = kind === 'place' ? feature : bboxClip(feature, bounds);
        if (!removeEmptyParts(clipped.geometry)) continue;
        const result = kind === 'place' ? clipped : simplify(clipped, { tolerance: 0.0003, highQuality: true });
        features.push({
            type: 'Feature',
            properties: {
                kind,
                name: feature.properties.name || feature.properties.NAME || '',
                catalunya: kind === 'land' && ['Barcelona', 'Tarragona', 'Lérida', 'Gerona'].includes(feature.properties.name),
            },
            geometry: result.geometry,
        });
        count += 1;
    }
    console.log(`${kind}: ${count}`);
}

const collection = { type: 'FeatureCollection', features };
const output = JSON.stringify(collection, (_, value) => typeof value === 'number' ? Math.round(value * 1e5) / 1e5 : value);
await mkdir(new URL('../public/maps/', import.meta.url), { recursive: true });
await writeFile(new URL('../public/maps/catalunya.json', import.meta.url), output);
console.log(`Catalunya: ${(Buffer.byteLength(output) / 1024).toFixed(0)} KB. Natural Earth, public domain.`);