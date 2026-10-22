import React, { useState } from 'react';
import { Copy, MessageSquare, Phone, Share2, X } from 'lucide-react';
import type { SessionPosition } from '../state/navigationSession';
import { toUTM } from '../lib/coordinates';

export function EmergencyPanel({ position, onClose }: { position: SessionPosition | null; onClose: () => void }) {
    const [feedback, setFeedback] = useState<string | null>(null);
    const coordinates = position ? `${position.lat.toFixed(6)}, ${position.lng.toFixed(6)}` : null;
    const message = position ? `Mi ubicación: ${coordinates}\nhttps://www.openstreetmap.org/?mlat=${position.lat}&mlon=${position.lng}#map=16/${position.lat}/${position.lng}\nPrecisión: ${Math.round(position.accuracy ?? 0)} m. GPS: ${new Date(position.timestamp).toLocaleString('es-ES')}` : '';
    const copy = async () => {
        try { await navigator.clipboard.writeText(message); setFeedback('Ubicación copiada'); }
        catch { setFeedback('No se pudo copiar. Puedes enviar la ubicación por SMS.'); }
    };
    const share = async () => {
        try { if (navigator.share) await navigator.share({ text: message }); else await copy(); }
        catch (cause) { if (!(cause instanceof DOMException && cause.name === 'AbortError')) setFeedback('No se pudo compartir la ubicación'); }
    };
    return <div className="absolute inset-0 z-50 bg-surface p-5 pt-safe overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="sos-title">
        <header className="flex items-center justify-between"><h2 id="sos-title" className="text-xl font-semibold text-alert">Ubicación de emergencia</h2><button onClick={onClose} aria-label="Cerrar SOS" className="touch-target grid place-items-center"><X size={24} /></button></header>
        {position ? <div className="space-y-5 py-5">
            <div><p className="text-sm text-ink-soft">Latitud / longitud · WGS84</p><p className="text-2xl font-semibold tabular break-words">{coordinates}</p></div>
            <div><p className="text-sm text-ink-soft">UTM · zona y hemisferio</p><p className="text-lg font-semibold tabular break-words">{toUTM(position.lng, position.lat) ?? 'Fuera del rango UTM'}</p></div>
            <p className="text-sm text-ink-soft">Precisión: {position.accuracy != null ? `${Math.round(position.accuracy)} m` : 'desconocida'} · GPS: {new Date(position.timestamp).toLocaleTimeString('es-ES')}</p>
            {Date.now() - position.timestamp > 60000 && <p role="alert" className="text-alert font-semibold">Posición antigua. Espera una nueva señal GPS.</p>}
            <div className="grid grid-cols-2 gap-3">
                <button onClick={() => void copy()} className="min-h-14 border border-line rounded-lg flex items-center justify-center gap-2"><Copy size={20} />Copiar</button>
                <button onClick={() => void share()} className="min-h-14 border border-line rounded-lg flex items-center justify-center gap-2"><Share2 size={20} />Compartir</button>
            </div>
            <a href={`sms:?body=${encodeURIComponent(message)}`} className="min-h-14 border border-line rounded-lg flex items-center justify-center gap-2"><MessageSquare size={20} />Enviar ubicación por SMS</a>
        </div> : <p className="py-8 text-ink-soft">Esperando una posición GPS válida. No hay coordenadas disponibles.</p>}
        <a href="tel:112" className="min-h-16 rounded-lg bg-alert text-white font-semibold text-lg flex items-center justify-center gap-2"><Phone size={24} />Llamar al 112</a>
        {feedback && <p role="status" className="mt-4 text-sm">{feedback}</p>}
    </div>;
}