import proj4 from 'proj4';

export function toUTM(longitude: number, latitude: number): string | null {
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || longitude < -180 || longitude > 180 || latitude < -80 || latitude > 84) return null;
    let zone = Math.min(60, Math.floor((longitude + 180) / 6) + 1);
    if (latitude >= 56 && latitude < 64 && longitude >= 3 && longitude < 12) zone = 32;
    if (latitude >= 72 && longitude >= 0 && longitude < 42) zone = longitude < 9 ? 31 : longitude < 21 ? 33 : longitude < 33 ? 35 : 37;
    const [easting, northing] = proj4('EPSG:4326', `+proj=utm +zone=${zone} ${latitude < 0 ? '+south' : ''} +datum=WGS84 +units=m +no_defs`, [longitude, latitude]);
    return `${zone} ${latitude >= 0 ? 'N' : 'S'} · ${Math.round(easting)} E · ${Math.round(northing)} N (WGS84)`;
}