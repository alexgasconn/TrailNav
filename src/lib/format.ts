const LOCALE = 'es-ES';

const decimalFormatter = (digits: number) =>
    new Intl.NumberFormat(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits });

const integerFormatter = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });

const timeFormatter = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' });

const dateFormatter = new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: 'short', year: 'numeric' });

export function formatInteger(value: number): string {
    if (!Number.isFinite(value)) return '—';
    return integerFormatter.format(Math.round(value));
}

export function formatDecimal(value: number, digits = 1): string {
    if (!Number.isFinite(value)) return '—';
    return decimalFormatter(digits).format(value);
}

/** Distancias en metros. Por debajo de 1 km se muestran en metros enteros. */
export function formatDistance(meters: number): string {
    if (!Number.isFinite(meters)) return '—';
    if (Math.abs(meters) < 1000) return `${formatInteger(meters)} m`;
    const km = meters / 1000;
    const digits = Math.abs(km) >= 100 ? 0 : Math.abs(km) >= 10 ? 1 : 2;
    return `${formatDecimal(km, digits)} km`;
}

export function formatElevation(meters: number): string {
    if (!Number.isFinite(meters)) return '—';
    return `${formatInteger(meters)} m`;
}

export function formatSignedElevation(meters: number): string {
    if (!Number.isFinite(meters)) return '—';
    const sign = meters > 0 ? '+' : meters < 0 ? '−' : '';
    return `${sign}${formatInteger(Math.abs(meters))} m`;
}

export function formatSpeed(kmh: number): string {
    if (!Number.isFinite(kmh) || kmh < 0) return '—';
    return `${formatDecimal(kmh, 1)} km/h`;
}

/** Ritmo expresado en segundos por kilómetro. */
export function formatPace(secondsPerKm: number): string {
    if (!Number.isFinite(secondsPerKm) || secondsPerKm <= 0 || secondsPerKm > 3600 * 3) return '—';
    const minutes = Math.floor(secondsPerKm / 60);
    const seconds = Math.round(secondsPerKm % 60);
    const normalizedMinutes = seconds === 60 ? minutes + 1 : minutes;
    const normalizedSeconds = seconds === 60 ? 0 : seconds;
    return `${normalizedMinutes}:${String(normalizedSeconds).padStart(2, '0')} min/km`;
}

/** Cronómetro HH:MM:SS a partir de segundos. */
export function formatClock(totalSeconds: number): string {
    if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '00:00:00';
    const seconds = Math.floor(totalSeconds);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Duración legible a partir de minutos: «3 h 15 min». */
export function formatDuration(totalMinutes: number): string {
    if (!Number.isFinite(totalMinutes) || totalMinutes < 0) return '—';
    const minutes = Math.round(totalMinutes);
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m} min`;
    return `${h} h ${String(m).padStart(2, '0')} min`;
}

export function formatTimeOfDay(timestamp: number): string {
    if (!Number.isFinite(timestamp)) return '—';
    return timeFormatter.format(new Date(timestamp));
}

export function formatDate(timestamp: number): string {
    if (!Number.isFinite(timestamp)) return '—';
    return dateFormatter.format(new Date(timestamp));
}

export function formatPercent(value: number, digits = 0): string {
    if (!Number.isFinite(value)) return '—';
    return `${formatDecimal(value, digits)} %`;
}

const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];

export function cardinalPoint(degrees: number): string {
    if (!Number.isFinite(degrees)) return '—';
    const normalized = ((degrees % 360) + 360) % 360;
    return CARDINALS[Math.round(normalized / 45) % 8];
}

export function formatBearing(degrees: number): string {
    if (!Number.isFinite(degrees)) return '—';
    const normalized = ((degrees % 360) + 360) % 360;
    return `${formatInteger(normalized)}° ${cardinalPoint(normalized)}`;
}

export function formatSlope(percent: number): string {
    if (!Number.isFinite(percent)) return '—';
    return `${formatDecimal(percent, 1)} %`;
}

export function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
    const mb = bytes / (1024 * 1024);
    if (mb < 1) return `${formatDecimal(bytes / 1024, 0)} kB`;
    if (mb < 1024) return `${formatDecimal(mb, mb < 10 ? 1 : 0)} MB`;
    return `${formatDecimal(mb / 1024, 2)} GB`;
}
