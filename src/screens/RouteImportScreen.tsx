import React, { useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, UploadCloud } from 'lucide-react';
import { parseGPX } from '../lib/gpx';
import { Route, saveRoute } from '../lib/db';
import { Screen } from '../App';
import { formatDistance, formatElevation } from '../lib/format';
import { getRouteProfile } from '../lib/routeProfile';

export function RouteImportScreen({ onNavigate }: { onNavigate: (s: Screen, r?: Route) => void }) {
    const [isDragging, setIsDragging] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [imported, setImported] = useState<Route | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFile = async (file: File) => {
        if (!file.name.toLowerCase().endsWith('.gpx')) {
            setError('Selecciona un archivo con extensión .gpx');
            return;
        }

        setIsProcessing(true);
        setError(null);
        setImported(null);

        try {
            const route = await parseGPX(file);
            await saveRoute(route);
            setImported(route);
        } catch (parseError: any) {
            setError(parseError?.message || 'No se ha podido procesar el archivo');
        } finally {
            setIsProcessing(false);
        }
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
                    accept=".gpx,application/gpx+xml"
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
                <p className="text-base font-medium text-ink mt-4">Selecciona un archivo GPX</p>
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
