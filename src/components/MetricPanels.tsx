import React, { useCallback, useRef, useState } from 'react';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
    constructor(props: any) {
        super(props);
        this.state = { hasError: false };
    }
    static getDerivedStateFromError() {
        return { hasError: true };
    }
    componentDidCatch(error: any) {
        // log to console for diagnostics
        // eslint-disable-next-line no-console
        console.error('Metric panel error:', error);
    }
    render() {
        if (this.state.hasError) {
            return <div className="bg-surface border border-line rounded-xl p-3 text-sm text-ink-soft">Error al mostrar este panel</div>;
        }
        return this.props.children as any;
    }
}

export interface MetricItem {
    label: string;
    value: string;
    hint?: string;
    tone?: 'default' | 'accent' | 'warn';
}

export interface MetricPanel {
    id: string;
    title: string;
    items?: MetricItem[];
    content?: React.ReactNode;
}

/**
 * Paneles de métricas deslizables: se usa scroll con ajuste por página para que
 * el gesto horizontal sea el nativo del sistema.
 */
export function MetricPanels({ panels }: { panels: MetricPanel[] }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [activeIndex, setActiveIndex] = useState(0);

    const handleScroll = useCallback(() => {
        const container = containerRef.current;
        if (!container) return;
        const index = Math.round(container.scrollLeft / container.clientWidth);
        setActiveIndex(Math.min(panels.length - 1, Math.max(0, index)));
    }, [panels.length]);

    const goTo = (index: number) => {
        const container = containerRef.current;
        if (!container) return;
        container.scrollTo({ left: index * container.clientWidth, behavior: 'smooth' });
    };

    if (panels.length === 0) return null;

    return (
        <div>
            <div
                ref={containerRef}
                onScroll={handleScroll}
                className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar"
                style={{ touchAction: 'pan-x' }}
            >
                {panels.map((panel) => (
                    <section key={panel.id} className="w-full shrink-0 snap-center px-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint mb-2">{panel.title}</p>
                        {panel.content ? (
                            <ErrorBoundary>{panel.content}</ErrorBoundary>
                        ) : (
                            <div className={`grid gap-2 ${panel.items && panel.items.length > 3 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                                {panel.items?.map((item) => (
                                    <MetricCell key={item.label} item={item} />
                                ))}
                            </div>
                        )}
                    </section>
                ))}
            </div>

            <div className="flex justify-center gap-1.5 pt-3">
                {panels.map((panel, index) => (
                    <button
                        key={panel.id}
                        onClick={() => goTo(index)}
                        aria-label={`Ver ${panel.title}`}
                        className={`h-1.5 rounded-full transition-all ${index === activeIndex ? 'w-6 bg-moss' : 'w-1.5 bg-line-strong'}`}
                    />
                ))}
            </div>
        </div>
    );
}

function MetricCell({ item }: { item: MetricItem }) {
    const tone = item.tone === 'accent' ? 'text-moss' : item.tone === 'warn' ? 'text-alert' : 'text-ink';

    return (
        <div className="bg-surface border border-line rounded-xl px-3 py-2.5 min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint truncate">{item.label}</p>
            <p className={`text-xl font-semibold tabular leading-tight mt-1 truncate ${tone}`}>{item.value}</p>
            {item.hint && <p className="text-[11px] text-ink-faint truncate mt-0.5">{item.hint}</p>}
        </div>
    );
}
