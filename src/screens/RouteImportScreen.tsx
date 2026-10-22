import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, UploadCloud } from 'lucide-react';
import { parseRouteFile } from '../lib/gpx';
import { Route, saveRoute } from '../lib/db';
import { Screen } from '../App';
import { formatDistance, formatElevation } from '../lib/format';
import { getRouteProfile } from '../lib/routeProfile';

export function RouteImportScreen({ onNavigate, initialFile, onFileConsumed }: { onNavigate: (s: Screen, r?: Route) => void; initialFile?: File | null; onFileConsumed?: () => void }) {
    const [isDragging, setIsDragging] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [imported, setImported] = useState<Route | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [routeUrl, setRouteUrl] = useState('');
    const sharedReadRef = useRef(false);
    const launchReadRef = useRef<File | null>(null);

    const handleFile = async (file: File) => {
        setIsProcessing(true);
        setError(null);
        setImported(null);

        try {
            const route = await parseRouteFile(file);
            await saveRoute(route);
            setImported(route);
        } catch (parseError: any) {
            setError(parseError?.message || 'No se ha podido procesar el archivo');
        } finally {
            setIsProcessing(false);
        }
    };

    useEffect(() => {
        if (!initialFile || launchReadRef.current === initialFile) return;
        launchReadRef.current = initialFile;
        void handleFile(initialFile);
        onFileConsumed?.();
    }, [initialFile]);

    useEffect(() => {
        if (sharedReadRef.current) return;
        sharedReadRef.current = true;
        const url = new URL(window.location.href);
        const id = url.searchParams.get('shared');
        if (url.searchParams.has('url')) setRouteUrl(url.searchParams.get('url') ?? '');
        if (url.searchParams.has('shareError')) setError('No se pudo recibir el archivo. Selecciona un GPX, KML o GeoJSON de hasta 20 MB.');
        for (const key of ['shared', 'url', 'shareError', 'action']) url.searchParams.delete(key);
        window.history.replaceState(window.history.state, '', url.href);
        if (!id || !/^[\da-f-]{36}$/i.test(id)) return;
        void (async () => {
            try {
                const cache = await caches.open('trailnav-shared-routes');
                const key = new URL(`__shared_route/${id}`, new URL(import.meta.env.BASE_URL, window.location.origin));
                const response = await cache.match(key);
                if (!response) throw new Error('El archivo compartido ya no está disponible');
                const file = new File([await response.blob()], decodeURIComponent(response.headers.get('X-File-Name') || 'ruta.gpx'));
                await handleFile(file);
                await cache.delete(key);
            } catch { setError('No se pudo abrir el archivo compartido. Selecciónalo desde el almacenamiento.'); }
        })();
    }, []);

    const importUrl = async (event: React.FormEvent) => {
        event.preventDefault();
        setError(null);
        setImported(null);
        setIsProcessing(true);
        try {
            const url = new URL(routeUrl);
            if (url.protocol !== 'https:') throw new Error('Utiliza un enlace HTTPS directo al archivo');
            const response = await fetch(url, { signal: AbortSignal.timeout(30000), credentials: 'omit' });
            if (!response.ok) throw new Error('No se pudo descargar el archivo');
            if (Number(response.headers.get('content-length')) > 20 * 1024 * 1024) throw new Error('El archivo supera 20 MB');
            const blob = await response.blob();
            const name = decodeURIComponent(url.pathname.split('/').pop() || 'ruta.gpx');
            const route = await parseRouteFile(new File([blob], name));
            await saveRoute(route);
            setImported(route);
        } catch (cause) {
            setError(cause instanceof Error && cause.message !== 'Failed to fetch' ? cause.message : 'El servidor no permite descargar el enlace (CORS) o no hay conexión. Descarga el archivo e impórtalo.');
        } finally { setIsProcessing(false); }
    };

    return (
        <div className="max-w-xl mx-auto w-full px-4 pb-8">
            <header className="pt-safe pt-6 pb-4 flex items-center gap-2">
                <button onClick={() => onNavigate('home')} className="touch-target grid place-items-center -ml-3 text-ink" aria-label="Volver">
                    <ArrowLeft size={22} />
                </button>
                <h1 className="text-2xl font-semibold text-ink">Añadir ruta</h1>
            </header>

            <div
                className={`border-2 border-dashed rounded-2xl p-8 text-center transition-colors ${isDragging ? 'border-moss bg-moss-soft' : 'border-line-strong bg-surface'}`}
                onDragOver={(event) => {
                    event.preventDefault();
                    setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(event) => {
                    event.preventDefault();
                    setIsDragging(false);
                    const file = event.dataTransfer.files?.[0];
                    if (file) handleFile(file);
                }}
            >
                <input
                    type="file"
                    accept=".gpx,.kml,.geojson,.json,application/gpx+xml,application/vnd.google-earth.kml+xml,application/geo+json"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) handleFile(file);
                        event.target.value = '';
                    }}
                />

                <span className="grid place-items-center w-16 h-16 rounded-full bg-moss-soft text-moss-strong mx-auto">
                    <UploadCloud size={30} strokeWidth={1.6} />
                </span>
                <p className="text-base font-medium text-ink mt-4">GPX · KML · GeoJSON</p>
                <p className="text-sm text-ink-soft mt-1">También puedes arrastrarlo hasta aquí</p>

                <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isProcessing}
                    className="mt-5 h-12 px-6 bg-moss text-white font-semibold rounded-xl inline-flex items-center gap-2 disabled:opacity-60"
                >
                    {isProcessing && <Loader2 size={18} className="animate-spin" />}
                    {isProcessing ? 'Analizando…' : 'Buscar archivo'}
                </button>
            </div>

            <form onSubmit={importUrl} className="mt-5 space-y-2">
                <label htmlFor="route-url" className="text-sm font-medium">Enlace directo a una ruta</label>
                <input id="route-url" type="url" required value={routeUrl} onChange={(event) => setRouteUrl(event.target.value)} placeholder="https://…/ruta.gpx" className="w-full min-h-12 px-3 rounded-lg border border-line bg-surface" />
                <button disabled={isProcessing} className="w-full min-h-12 rounded-lg border border-line font-semibold disabled:opacity-50">Importar enlace</button>
            </form>

            {error && (
                <div className="mt-4 p-4 bg-clay-soft border border-clay/25 rounded-2xl flex items-start gap-3 text-clay">
                    <AlertCircle className="shrink-0 mt-0.5" size={18} />
                    <p className="text-sm">{error}</p>
                </div>
            )}

            {imported && <ImportedSummary route={imported} onNavigate={onNavigate} />}

            <p className="text-xs text-ink-faint mt-6 px-1">
                El archivo se guarda en este dispositivo. La distancia y el desnivel se calculan a partir de los puntos del track,
                filtrando el ruido de altitud.
            </p>
        </div>
    );
}

function ImportedSummary({ route, onNavigate }: { route: Route; onNavigate: (s: Screen, r?: Route) => void }) {
    const profile = getRouteProfile(route);

    return (
        <div className="mt-4 p-4 bg-surface border border-line rounded-2xl">
            <div className="flex items-start gap-3">
                <CheckCircle2 className="shrink-0 mt-0.5 text-moss" size={20} />
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink truncate">{route.name}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-ink-soft tabular">
                        <span>{formatDistance(profile.totalDistance)}</span>
                        <span>D+ {formatElevation(profile.totalAscent)}</span>
                        <span>D− {formatElevation(profile.totalDescent)}</span>
                    </div>
                </div>
            </div>
            <div className="flex gap-2 mt-4">
                <button onClick={() => onNavigate('home')} className="flex-1 h-12 rounded-xl border border-line text-ink font-medium">
                    Mis rutas
                </button>
                <button onClick={() => onNavigate('analysis', route)} className="flex-1 h-12 rounded-xl bg-moss text-white font-semibold">
                    Ver análisis
                </button>
            </div>
        </div>
    );
}
