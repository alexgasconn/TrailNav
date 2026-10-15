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
type MetricPanelsProps = { panels: MetricPanel[]; onDismiss?: () => void };

export class MetricPanels extends React.Component<MetricPanelsProps, { activeIndex: number; dragOffset: number }> {
    containerRef: React.RefObject<HTMLDivElement>;
    touchStart: { x: number; y: number } | null = null;

    constructor(props: MetricPanelsProps) {
        super(props);
        this.containerRef = React.createRef<HTMLDivElement>();
        this.state = { activeIndex: 0, dragOffset: 0 };
        this.handleScroll = this.handleScroll.bind(this);
        this.goTo = this.goTo.bind(this);
    }

    handleScroll() {
        const container = this.containerRef.current;
        const panels = this.props.panels;
        if (!container) return;
        const index = Math.round(container.scrollLeft / container.clientWidth);
        this.setState({ activeIndex: Math.min(panels.length - 1, Math.max(0, index)) });
    }

    goTo(index: number) {
        const container = this.containerRef.current;
        if (!container) return;
        container.scrollTo({ left: index * container.clientWidth, behavior: 'smooth' });
    }

    handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
        this.touchStart = null;
        if (!this.props.onDismiss || event.touches.length !== 1) return;
        if ((event.target as Element).closest('button, a, input, select, textarea, [role="slider"]')) return;
        const touch = event.touches[0];
        this.touchStart = { x: touch.clientX, y: touch.clientY };
    };

    handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
        if (!this.touchStart) return;
        if (event.touches.length !== 1) {
            this.cancelTouch();
            return;
        }
        const deltaX = event.touches[0].clientX - this.touchStart.x;
        const deltaY = event.touches[0].clientY - this.touchStart.y;
        if ((Math.abs(deltaX) > 12 && Math.abs(deltaX) > Math.abs(deltaY)) || deltaY < -12) {
            this.cancelTouch();
            return;
        }
        this.setState({ dragOffset: Math.min(160, Math.max(0, deltaY)) });
    };

    handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
        const start = this.touchStart;
        const touch = event.changedTouches[0];
        this.cancelTouch();
        if (!start || !touch) return;
        const deltaX = touch.clientX - start.x;
        const deltaY = touch.clientY - start.y;
        if (deltaY >= 56 && deltaY > Math.abs(deltaX) * 1.5) this.props.onDismiss?.();
    };

    cancelTouch = () => {
        this.touchStart = null;
        this.setState({ dragOffset: 0 });
    };

    render() {
        const panels = this.props.panels;
        if (panels.length === 0) return null;

        return (
            <div
                onTouchStart={this.handleTouchStart}
                onTouchMove={this.handleTouchMove}
                onTouchEnd={this.handleTouchEnd}
                onTouchCancel={this.cancelTouch}
                style={{
                    touchAction: 'pan-x',
                    transform: `translateY(${this.state.dragOffset}px)`,
                    opacity: Math.max(0.35, 1 - this.state.dragOffset / 240),
                    transition: this.state.dragOffset > 0 ? 'none' : 'transform 150ms ease, opacity 150ms ease',
                }}
            >
                {this.props.onDismiss && <div aria-hidden="true" className="w-10 h-1 rounded-full bg-line-strong mx-auto mb-2" />}
                <div
                    ref={this.containerRef}
                    onScroll={this.handleScroll}
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
                            onClick={() => this.goTo(index)}
                            aria-label={`Ver ${panel.title}`}
                            className={`h-1.5 rounded-full transition-all ${index === this.state.activeIndex ? 'w-6 bg-moss' : 'w-1.5 bg-line-strong'}`}
                        />
                    ))}
                </div>
            </div>
        );
    }
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
