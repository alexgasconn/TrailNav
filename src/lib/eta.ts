import { RouteAnalysis } from './routeAnalysis';

export interface EtaEstimate {
    name: string;
    minutes: number;
}

export interface EtaConsensus {
    estimates: EtaEstimate[];
    accepted: EtaEstimate[];
    minutes: number;
    range: [number, number];
}

const clampMinutes = (minutes: number) => Math.max(1, minutes);

export function estimateRouteTime(distanceMeters: number, analysis: RouteAnalysis): EtaConsensus {
    const distanceKm = distanceMeters / 1000;
    const ascent = analysis.totalAscent;
    const descent = analysis.totalDescent;
    const horizontalMinutes = (distanceKm / 5) * 60;
    const uphillMinutes = ascent / 600 * 60;
    const segmentMinutes = analysis.segments.reduce((total, segment) => {
        const slope = segment.averageSlope / 100;
        const speed = 6 * Math.exp(-3.5 * Math.abs(Math.tan(Math.atan(slope)) + 0.05));
        return total + (segment.distance / 1000 / Math.max(1.5, speed)) * 60;
    }, 0);
    const flatDistance = Math.max(0, distanceKm - analysis.segments.reduce((sum, segment) => sum + segment.distance / 1000, 0));
    const toblerMinutes = ((flatDistance / 5) * 60) + (segmentMinutes || uphillMinutes);
    const munterMinutes = ((distanceKm + (ascent / 100)) / 4) * 60;
    const swissMinutes = Math.max(horizontalMinutes, uphillMinutes) + Math.min(horizontalMinutes, uphillMinutes) / 2;
    const petzoldtMinutes = ((distanceKm * 60) / 5.5) + (ascent * 0.08) + (descent * 0.025);

    const estimates = [
        { name: 'Naismith', minutes: clampMinutes(horizontalMinutes + uphillMinutes) },
        { name: 'Tobler', minutes: clampMinutes(toblerMinutes) },
        { name: 'Munter', minutes: clampMinutes(munterMinutes) },
        { name: 'Swiss Standard', minutes: clampMinutes(swissMinutes) },
        { name: 'Petzoldt', minutes: clampMinutes(petzoldtMinutes) },
    ];
    const sorted = estimates.map((estimate) => estimate.minutes).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const deviations = sorted.map((value) => Math.abs(value - median)).sort((a, b) => a - b);
    const mad = deviations[Math.floor(deviations.length / 2)] || 1;
    const accepted = estimates.filter((estimate) => Math.abs(estimate.minutes - median) <= 1.5 * mad);
    const consensusValues = accepted.length > 0 ? accepted.map((estimate) => estimate.minutes) : [median];
    const consensus = consensusValues.reduce((sum, value) => sum + value, 0) / consensusValues.length;

    return {
        estimates,
        accepted,
        minutes: Math.round(consensus),
        range: [Math.round(Math.min(...consensusValues)), Math.round(Math.max(...consensusValues))],
    };
}
