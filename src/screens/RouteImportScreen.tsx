import React, { useState, useRef } from 'react';
import { UploadCloud, AlertCircle, CheckCircle2, ArrowLeft, ChartNoAxesCombined, CloudSun, Navigation } from 'lucide-react';
import { parseGPX } from '../lib/gpx';
import { saveRoute } from '../lib/db';
import { Screen } from '../App';
import { Route } from '../lib/db';

export function RouteImportScreen({ onNavigate }: { onNavigate: (s: Screen, r?: Route) => void }) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<Route | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.gpx')) {
      setError('Selecciona un archivo GPX valido. FIT y KML estaran disponibles proximamente.');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setSuccess(null);

    try {
      const route = await parseGPX(file);
      await saveRoute(route);
      setSuccess(route);
      setTimeout(() => {
        onNavigate('analysis', route);
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'No se ha podido procesar la ruta');
    } finally {
      setIsProcessing(false);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => setIsDragging(false);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="p-4 min-h-full flex flex-col bg-zinc-950">
      <header className="flex items-center gap-4 pt-8 pb-6">
        <button onClick={() => onNavigate('home')} className="p-2 -ml-2 text-zinc-400 hover:text-zinc-100 transition-colors">
          <ArrowLeft size={24} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Añadir ruta</h1>
          <p className="text-sm text-zinc-500 mt-1">El primer paso para preparar tu actividad</p>
        </div>
      </header>

      <div className="flex-1 max-w-md mx-auto w-full pt-4">
        <div className="grid grid-cols-3 gap-2 mb-6">
          <ProcessStep icon={<UploadCloud size={18} />} label="Importar" active />
          <ProcessStep icon={<ChartNoAxesCombined size={18} />} label="Analizar" />
          <ProcessStep icon={<Navigation size={18} />} label="Preparar" />
        </div>

        <div
          className={`relative border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-200 ${
            isDragging 
              ? 'border-emerald-500 bg-emerald-500/10' 
              : 'border-zinc-700 bg-zinc-900 hover:border-zinc-500'
          }`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <input
            type="file"
            accept=".gpx"
            className="hidden"
            ref={fileInputRef}
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />

          <div className="flex flex-col items-center justify-center space-y-4">
            <div className="p-4 bg-zinc-800 rounded-full text-emerald-500">
              <UploadCloud size={48} strokeWidth={1.5} />
            </div>
            
            <div>
              <p className="text-lg font-medium text-zinc-200">Selecciona un archivo GPX</p>
              <p className="text-sm text-zinc-500 mt-1">Puedes arrastrarlo aqui o buscarlo en el dispositivo</p>
            </div>

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              className="mt-4 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-medium rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? 'Analizando ruta...' : 'Buscar archivo'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start gap-3 text-red-400">
            <AlertCircle className="shrink-0 mt-0.5" size={20} />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {success && (
          <div className="mt-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-start gap-3 text-emerald-400">
            <CheckCircle2 className="shrink-0 mt-0.5" size={20} />
            <div>
              <p className="text-sm font-medium">Ruta importada y analizada</p>
              <p className="text-xs opacity-80 mt-1">Abriendo la preparacion de {success.name}...</p>
            </div>
          </div>
        )}

        <div className="mt-6 flex items-start gap-3 text-xs text-zinc-500 px-2">
          <CloudSun size={18} className="shrink-0 text-sky-500" />
          <p>Despues podras revisar desnivel, subidas, ETA, meteo y mapa antes de iniciar la navegacion.</p>
        </div>
      </div>
    </div>
  );
}

function ProcessStep({ icon, label, active = false }: { icon: React.ReactNode; label: string; active?: boolean }) {
  return (
    <div className={`h-16 rounded-xl border flex flex-col items-center justify-center gap-1 text-xs font-medium ${active ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300' : 'bg-zinc-900 border-zinc-800 text-zinc-500'}`}>
      {icon}<span>{label}</span>
    </div>
  );
}
