import React, { useMemo } from 'react';
import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { Route } from '../lib/db';
import { analyzeRoute, getCurrentRamp } from '../lib/routeAnalysis';
import { RouteProfile, indexAtDistance, sampleProfile } from '../lib/routeProfile';
import { formatDistance, formatSlope } from '../lib/format';
import ProfileChart, { slopeColor } from './ProfileChart';

export function CurrentRampPanel({ route, profile, distance, hasPosition, offRoute }: {
    route: Route;
    profile: RouteProfile;
    distance: number;
    hasPosition: boolean;
    offRoute: boolean;
}) {
    const analysis = useMemo(() => analyzeRoute(route), [route]);
    const ramp = getCurrentRamp(analysis, distance);
    const startDistance = ramp?.startDistance ?? 0;
    const endDistance = ramp?.endDistance ?? 0;
    const rampProfile = useMemo(() => {
        const startIndex = indexAtDistance(profile, startDistance);
        const endIndex = Math.min(profile.coordinates.length - 1, indexAtDistance(profile, endDistance) + 1);
        const origin = profile.cumulativeDistance[startIndex];
        const elevation = profile.elevation.slice(startIndex, endIndex + 1);
        return {
            ...profile,
            coordinates: profile.coordinates.slice(startIndex, endIndex + 1),
            cumulativeDistance: profile.cumulativeDistance.slice(startIndex, endIndex + 1).map((value) => value - origin),
            elevation,
            cumulativeAscent: profile.cumulativeAscent.slice(startIndex, endIndex + 1),
            cumulativeDescent: profile.cumulativeDescent.slice(startIndex, endIndex + 1),
            totalDistance: profile.cumulativeDistance[endIndex] - origin,
            minElevation: elevation.reduce((minimum, value) => Math.min(minimum, value), Infinity),
            maxElevation: elevation.reduce((maximum, value) => Math.max(maximum, value), -Infinity),
        };
    }, [profile, startDistance, endDistance]);

    if (!profile.hasElevation || !ramp) return <p className="text-sm text-ink-soft py-4">Esta ruta no incluye datos de elevación.</p>;
    if (!hasPosition) return <p className="text-sm text-ink-soft py-4" role="status">Esperando posición GPS para identificar la rampa actual.</p>;
    if (offRoute) return <p className="text-sm text-alert py-4" role="status">Fuera de ruta. La rampa actual se actualizará al volver a la traza.</p>;

    const localStart = Math.max(0, distance - 20);
    const localEnd = Math.min(profile.totalDistance, distance + 20);
    const start = sampleProfile(profile, localStart);
    const end = sampleProfile(profile, localEnd);
    const localSlope = start && end && localEnd > localStart ? (end.elevation - start.elevation) / (localEnd - localStart) * 100 : 0;
    const Icon = ramp.trend === 'ascent' ? TrendingUp : ramp.trend === 'descent' ? TrendingDown : Minus;
    const title = ramp.trend === 'ascent' ? 'Subida actual' : ramp.trend === 'descent' ? 'Bajada actual' : 'Tramo llano';
    const origin = profile.cumulativeDistance[indexAtDistance(profile, startDistance)];

    return (
        <div aria-label={title}>
            <div className="flex items-center justify-between gap-3 mb-2">
                <span className="flex items-center gap-2 text-sm font-semibold"><Icon size={18} style={{ color: slopeColor(ramp.averageSlope) }} />{title}</span>
                <div className="text-right shrink-0">
                    <p className="text-[10px] text-ink-faint">En tu posición</p>
                    <p className="text-lg font-semibold tabular" style={{ color: slopeColor(localSlope) }} aria-label="Pendiente en tu posición">{formatSlope(localSlope)}</p>
                </div>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-2 text-xs">
                <div><p className="text-ink-faint">Longitud</p><p className="font-semibold tabular">{formatDistance(ramp.length)}</p></div>
                <div><p className="text-ink-faint">Pendiente media</p><p className="font-semibold tabular" style={{ color: slopeColor(ramp.averageSlope) }}>{formatSlope(ramp.averageSlope)}</p></div>
                <div><p className="text-ink-faint">Restante</p><p className="font-semibold tabular">{formatDistance(Math.max(0, endDistance - distance))}</p></div>
            </div>
            <div role="img" aria-label={`Perfil de la rampa con tu posición a ${formatDistance(Math.max(0, distance - startDistance))} del inicio. Pendiente local ${formatSlope(localSlope)}`}>
                <ProfileChart profile={rampProfile} height={96} currentDistance={distance - origin} showPoints={false} showSegments={false} showColoredFill />
            </div>
        </div>
    );
}