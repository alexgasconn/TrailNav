import React, { useEffect, useState } from 'react';
import { Compass, HardDrive, Info, Loader2, MapPin, Smartphone } from 'lucide-react';
import { MapStyleId, Settings, getSettings, saveSettings } from '../lib/db';
import { Screen } from '../App';
import { MAP_STYLE_LABELS } from '../lib/mapStyles';
import { getStorageUsage } from '../lib/offlineTiles';
import { formatBytes, formatInteger } from '../lib/format';
import { useNavigationSession } from '../state/navigationSession';

const DEVIATION_OPTIONS = [20, 30, 50, 80];

export function SettingsScreen({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  const session = useNavigationSession();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [storage, setStorage] = useState<{ tilesBytes: number; tileCount: number } | null>(null);

  useEffect(() => {
    getSettings().then(setSettings);
    getStorageUsage().then((usage) => setStorage({ tilesBytes: usage.tilesBytes, tileCount: usage.tileCount }));
  }, []);

  const update = async (patch: Partial<Settings>) => {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    await saveSettings(next);
    session.applySettings(next);
  };

  if (!settings) {
    return (
      <div className="h-full grid place-items-center text-ink-faint">
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto w-full px-4 pb-8">
      <header className="pt-safe pt-6 pb-4">
        <h1 className="text-2xl font-semibold text-ink">Ajustes</h1>
      </header>

      <div className="space-y-5">
        <Group icon={<MapPin size={18} />} title="Cartografía">
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(MAP_STYLE_LABELS) as MapStyleId[]).map((style) => (
              <button
                key={style}
                onClick={() => update({ mapStyle: style })}
                className={`h-12 rounded-xl border font-medium text-sm ${settings.mapStyle === style ? 'border-moss bg-moss-soft text-moss-strong' : 'border-line text-ink-soft'}`}
              >
                {MAP_STYLE_LABELS[style]}
              </button>
            ))}
          </div>
          <p className="text-xs text-ink-faint mt-3">El estilo elegido es el que se descarga y se usa sin conexión.</p>
        </Group>

        <Group icon={<Compass size={18} />} title="Navegación">
          <Row label="Aviso de desvío" description="Distancia máxima respecto a la traza antes de avisar">
            <div className="flex gap-1.5">
              {DEVIATION_OPTIONS.map((meters) => (
                <button
                  key={meters}
                  onClick={() => update({ deviationWarningDistance: meters })}
                  className={`h-10 px-3 rounded-lg border text-sm font-medium tabular ${settings.deviationWarningDistance === meters ? 'border-moss bg-moss-soft text-moss-strong' : 'border-line text-ink-soft'}`}
                >
                  {meters} m
                </button>
              ))}
            </div>
          </Row>

          <Toggle
            label="Mapa siempre al norte"
            description="Desactivado, el mapa gira con la brújula"
            checked={settings.keepMapNorthUp}
            onChange={(value) => update({ keepMapNorthUp: value })}
          />

          <Toggle
            label="Vibración al salir de la ruta"
            description="Requiere soporte del dispositivo"
            checked={settings.vibrationAlerts}
            onChange={(value) => update({ vibrationAlerts: value })}
          />
        </Group>

        <Group icon={<Smartphone size={18} />} title="Dispositivo">
          <Toggle
            label="Pantalla siempre encendida"
            description="Solo mientras hay una navegación activa"
            checked={settings.screenAlwaysOn}
            onChange={(value) => update({ screenAlwaysOn: value })}
          />
        </Group>

        <Group icon={<HardDrive size={18} />} title="Almacenamiento">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-ink-soft tabular">
              {storage ? `${formatBytes(storage.tilesBytes)} en ${formatInteger(storage.tileCount)} teselas` : 'Calculando…'}
            </p>
            <button onClick={() => onNavigate('offline')} className="h-10 px-3 rounded-lg bg-moss text-white text-sm font-semibold">
              Gestionar
            </button>
          </div>
        </Group>

        <div className="flex items-start gap-3 px-1 text-xs text-ink-faint">
          <Info size={16} className="shrink-0 mt-0.5" />
          <p>
            Cartografía de OpenStreetMap y Esri. Meteorología de Open-Meteo. Las rutas y las teselas se guardan únicamente en
            este dispositivo.
          </p>
        </div>
      </div>
    </div>
  );
}

function Group({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="bg-surface border border-line rounded-2xl p-4">
      <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-ink-faint mb-3">
        {icon}
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Row({ label, description, children }: { label: string; description: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-sm font-medium text-ink">{label}</p>
      <p className="text-xs text-ink-faint mt-0.5 mb-2">{description}</p>
      {children}
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button onClick={() => onChange(!checked)} className="w-full flex items-center justify-between gap-4 text-left">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{label}</span>
        <span className="block text-xs text-ink-faint mt-0.5">{description}</span>
      </span>
      <span
        role="switch"
        aria-checked={checked}
        className={`shrink-0 w-12 h-7 rounded-full p-0.5 transition-colors ${checked ? 'bg-moss' : 'bg-line-strong'}`}
      >
        <span className={`block w-6 h-6 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : ''}`} />
      </span>
    </button>
  );
}
