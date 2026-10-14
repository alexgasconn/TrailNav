import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
    size?: 'sm' | 'md' | 'lg';
    loading?: boolean;
    children: React.ReactNode;
}

export function Button({
    variant = 'primary',
    size = 'md',
    loading = false,
    disabled = false,
    children,
    className = '',
    ...props
}: ButtonProps) {
    const variantStyles = {
        primary: 'bg-emerald-600 hover:bg-emerald-500 text-white',
        secondary: 'bg-zinc-800 hover:bg-zinc-700 text-zinc-100',
        danger: 'bg-red-600 hover:bg-red-500 text-white',
        ghost: 'bg-transparent hover:bg-zinc-800 text-zinc-100',
    };

    const sizeStyles = {
        sm: 'px-3 py-2 text-sm',
        md: 'px-4 py-3 text-base',
        lg: 'px-6 py-4 text-lg',
    };

    return (
        <button
            {...props}
            disabled={disabled || loading}
            className={`
        rounded-xl font-semibold transition-all active:scale-95 touch-target disabled:opacity-50
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${className}
      `}
        >
            {loading ? '⏳ Loading...' : children}
        </button>
    );
}

interface CardProps {
    children: React.ReactNode;
    className?: string;
}

export function Card({ children, className = '' }: CardProps) {
    return (
        <div
            className={`
        bg-zinc-900 border border-zinc-800 rounded-2xl shadow-md
        ${className}
      `}
        >
            {children}
        </div>
    );
}

interface BadgeProps {
    children: React.ReactNode;
    variant?: 'success' | 'warning' | 'error' | 'info';
}

export function Badge({ children, variant = 'info' }: BadgeProps) {
    const variantStyles = {
        success: 'bg-emerald-900/50 text-emerald-300 border border-emerald-700',
        warning: 'bg-yellow-900/50 text-yellow-300 border border-yellow-700',
        error: 'bg-red-900/50 text-red-300 border border-red-700',
        info: 'bg-blue-900/50 text-blue-300 border border-blue-700',
    };

    return (
        <span
            className={`
        inline-block px-3 py-1 rounded-full text-xs font-semibold
        ${variantStyles[variant]}
      `}
        >
            {children}
        </span>
    );
}

interface LoadingSpinnerProps {
    size?: 'sm' | 'md' | 'lg';
}

export function LoadingSpinner({ size = 'md' }: LoadingSpinnerProps) {
    const sizeStyles = {
        sm: 'w-6 h-6',
        md: 'w-10 h-10',
        lg: 'w-16 h-16',
    };

    return (
        <div className={`${sizeStyles[size]} border-4 border-zinc-700 border-t-emerald-500 rounded-full animate-spin`} />
    );
}

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
}

export function Modal({ isOpen, onClose, title, children }: ModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
                <div className="sticky top-0 bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
                    <h2 className="text-xl font-bold text-white">{title}</h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
                        aria-label="Close modal"
                    >
                        ✕
                    </button>
                </div>
                <div className="p-6">
                    {children}
                </div>
            </div>
        </div>
    );
}
