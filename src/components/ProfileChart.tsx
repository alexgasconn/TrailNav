import React, { useEffect, useRef } from 'react';
import type { RouteProfile } from '../lib/routeProfile';
import { indexAtDistance } from '../lib/routeProfile';
import type { RoutePoint } from '../lib/routePoints';
import type { RouteAnalysis } from '../lib/routeAnalysis';

type Props = {
    profile: RouteProfile;
    height?: number;
    currentDistance?: number | null;
    // thresholds in percent
    moderateThreshold?: number;
    steepThreshold?: number;
    // optional extras
    showColoredFill?: boolean;
    showPoints?: boolean;
    showSegments?: boolean;
    points?: RoutePoint[];
    analysis?: RouteAnalysis | null;
};

function slopeColor(pct: number, moderate: number, steep: number) {
    const abs = Math.abs(pct);
    if (abs >= steep) return '#b3261e'; // alert red
    if (abs >= moderate) return '#f59e0b'; // orange
    return '#3f6b52'; // moss green
}

export function ProfileChart({
    profile,
    height = 72,
    currentDistance = null,
    moderateThreshold = 6,
    steepThreshold = 12,
    showColoredFill = true,
    showPoints = true,
    showSegments = true,
    points,
    analysis,
}: Props) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !profile.hasElevation) return;

        const ratio = window.devicePixelRatio || 1;
        const width = canvas.clientWidth;
        const h = height;
        canvas.width = Math.max(1, Math.floor(width * ratio));
        canvas.height = Math.max(1, Math.floor(h * ratio));

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.scale(ratio, ratio);
        ctx.clearRect(0, 0, width, h);

        const range = Math.max(1, profile.maxElevation - profile.minElevation);
        const padding = 6;
        const usableH = h - padding * 2;

        const toX = (distance: number) => (distance / (profile.totalDistance || 1)) * width;
        const toY = (elevation: number) => h - padding - ((elevation - profile.minElevation) / range) * usableH;

        // draw filled profile
        if (true) {
            // default subtle single gradient background in case colored fill disabled
            const g = ctx.createLinearGradient(0, 0, 0, h);
            g.addColorStop(0, 'rgba(63,107,82,0.12)');
            g.addColorStop(1, 'rgba(63,107,82,0.02)');

            // If colored fill is requested, paint each segment as a trapezoid filled with slope color
            if (showColoredFill) {
                for (let i = 0; i < profile.coordinates.length - 1; i += 1) {
                    const d0 = profile.cumulativeDistance[i];
                    const d1 = profile.cumulativeDistance[i + 1];
                    const e0 = profile.elevation[i];
                    const e1 = profile.elevation[i + 1];
                    const dx = Math.max(0.0001, d1 - d0);
                    const slopePct = ((e1 - e0) / dx) * 100; // percent

                    const x0 = toX(d0);
                    const y0 = toY(e0);
                    const x1 = toX(d1);
                    const y1 = toY(e1);

                    ctx.beginPath();
                    ctx.moveTo(x0, h);
                    ctx.lineTo(x0, y0);
                    ctx.lineTo(x1, y1);
                    ctx.lineTo(x1, h);
                    ctx.closePath();
                    ctx.fillStyle = slopeColor(slopePct, moderateThreshold, steepThreshold);
                    ctx.fill();
                }
            } else {
                ctx.beginPath();
                ctx.moveTo(0, h);
                for (let i = 0; i < profile.coordinates.length; i += 1) {
                    const x = toX(profile.cumulativeDistance[i]);
                    const y = toY(profile.elevation[i]);
                    ctx.lineTo(x, y);
                }
                ctx.lineTo(width, h);
                ctx.closePath();
                ctx.fillStyle = g;
                ctx.fill();
            }
        }

        // draw colored slope segments (outline)
        ctx.lineWidth = 2;
        for (let i = 0; i < profile.coordinates.length - 1; i += 1) {
            const d0 = profile.cumulativeDistance[i];
            const d1 = profile.cumulativeDistance[i + 1];
            const e0 = profile.elevation[i];
            const e1 = profile.elevation[i + 1];
            const dx = Math.max(0.0001, d1 - d0);
            const slopePct = ((e1 - e0) / dx) * 100; // percent
            ctx.beginPath();
            ctx.strokeStyle = slopeColor(slopePct, moderateThreshold, steepThreshold);
            const x0 = toX(d0);
            const y0 = toY(e0);
            const x1 = toX(d1);
            const y1 = toY(e1);
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y1);
            ctx.stroke();
        }

        // draw outline on top
        ctx.beginPath();
        for (let i = 0; i < profile.coordinates.length; i += 1) {
            const x = toX(profile.cumulativeDistance[i]);
            const y = toY(profile.elevation[i]);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = '#2f5340';
        ctx.lineWidth = 1;
        ctx.stroke();

        // draw segments (ascents/descents) if provided via analysis in props
        if (showSegments && analysis && Array.isArray(analysis.segments)) {
            for (const seg of analysis.segments) {
                const xs = toX(seg.startDistance);
                const xe = toX(seg.endDistance);
                ctx.beginPath();
                ctx.rect(xs, padding, xe - xs, usableH);
                ctx.fillStyle = seg.trend === 'ascent' ? 'rgba(62,153,91,0.08)' : 'rgba(179,38,30,0.06)';
                ctx.fill();
                // boundary line
                ctx.beginPath();
                ctx.moveTo(xs, padding);
                ctx.lineTo(xs, h - padding);
                ctx.strokeStyle = 'rgba(0,0,0,0.06)';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        }

        // draw current position marker if provided
        if (currentDistance != null) {
            const clamped = Math.max(0, Math.min(currentDistance, profile.totalDistance));
            const xi = toX(clamped);
            ctx.beginPath();
            ctx.moveTo(xi, padding);
            ctx.lineTo(xi, h - padding);
            ctx.strokeStyle = '#111827';
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            ctx.stroke();
            ctx.setLineDash([]);

            // sample elevation at position and draw small circle on curve
            const idx = indexAtDistance(profile, clamped);
            const next = Math.min(idx + 1, profile.coordinates.length - 1);
            const span = profile.cumulativeDistance[next] - profile.cumulativeDistance[idx] || 1;
            const ratio = (clamped - profile.cumulativeDistance[idx]) / span;
            const elev = profile.elevation[idx] + (profile.elevation[next] - profile.elevation[idx]) * ratio;
            const yi = toY(elev);
            ctx.beginPath();
            ctx.fillStyle = '#111827';
            ctx.arc(xi, yi, 4, 0, Math.PI * 2);
            ctx.fill();
        }

        // draw points of interest (if provided)
        if (showPoints && Array.isArray(points)) {
            for (const pt of points) {
                if (!Number.isFinite(pt.distance)) continue;
                const x = toX(pt.distance);
                const elev = pt.elevation != null ? pt.elevation : null;
                let y = h - padding;
                if (elev != null && profile.hasElevation) y = toY(elev);

                // marker
                ctx.beginPath();
                ctx.fillStyle = pt.kind === 'summit' ? '#b3261e' : '#111827';
                ctx.arc(x, y, 4, 0, Math.PI * 2);
                ctx.fill();

                // label
                ctx.font = '11px Inter, system-ui, -apple-system, "Segoe UI", Roboto';
                ctx.fillStyle = 'rgba(17,24,39,0.9)';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                const label = pt.name || '';
                if (label) ctx.fillText(label, x, Math.max(6, y - 6));
            }
        }
    }, [profile, height, currentDistance, moderateThreshold, steepThreshold, showColoredFill, showPoints, showSegments, points, analysis]);

    return <canvas ref={canvasRef} className="w-full block" style={{ height: `${height}px` }} />;
}

export default ProfileChart;
