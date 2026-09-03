import React, { useCallback, useRef, useState } from 'react';

export interface InfoWindow {
    id: string;
    title: string;
    content: React.ReactNode;
}

export function InfoWindows({ windows }: { windows: InfoWindow[] }) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [activeIndex, setActiveIndex] = useState(0);

    const handleScroll = useCallback(() => {
        const container = containerRef.current;
        if (!container) return;
        const index = Math.round(container.scrollLeft / container.clientWidth);
        setActiveIndex(Math.min(windows.length - 1, Math.max(0, index)));
    }, [windows.length]);

    const goTo = (index: number) => {
        const container = containerRef.current;
        if (!container) return;
        container.scrollTo({ left: index * container.clientWidth, behavior: 'smooth' });
    };

    if (windows.length === 0) return null;

    return (
        <div className="pb-3">
            <div
                ref={containerRef}
                onScroll={handleScroll}
                className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar"
                style={{ touchAction: 'pan-x' }}
            >
                {windows.map((w) => (
                    <section key={w.id} className="w-full shrink-0 snap-center px-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">{w.title}</p>
                        </div>
                        <div>{w.content}</div>
                    </section>
                ))}
            </div>

            <div className="flex justify-center gap-1.5 pt-3">
                {windows.map((w, index) => (
                    <button
                        key={w.id}
                        onClick={() => goTo(index)}
                        aria-label={`Ver ${w.title}`}
                        className={`h-1.5 rounded-full transition-all ${index === activeIndex ? 'w-6 bg-moss' : 'w-1.5 bg-line-strong'}`}
                    />
                ))}
            </div>
        </div>
    );
}

export default InfoWindows;
