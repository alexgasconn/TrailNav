import React, { useState, useRef } from 'react';
import { UploadCloud, File, AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react';
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
      setError('Please upload a valid .gpx file');
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
      setError(err.message || 'Failed to parse GPX file');
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
    <div className="p-4 h-full flex flex-col">
      <header className="flex items-center gap-4 pt-8 pb-6">
        <button onClick={() => onNavigate('home')} className="p-2 -ml-2 text-zinc-400 hover:text-zinc-100 transition-colors">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-2xl font-bold text-zinc-100">Import Route</h1>
      </header>

      <div className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full">
        <div
          className={`relative border-2 border-dashed rounded-3xl p-8 text-center transition-all duration-200 ${
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
              <p className="text-lg font-medium text-zinc-200">Upload GPX File</p>
              <p className="text-sm text-zinc-500 mt-1">Drag & drop or tap to browse</p>
            </div>

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              className="mt-4 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-medium rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? 'Processing...' : 'Select File'}
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
              <p className="text-sm font-medium">Route imported successfully!</p>
              <p className="text-xs opacity-80 mt-1">{success.name}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
