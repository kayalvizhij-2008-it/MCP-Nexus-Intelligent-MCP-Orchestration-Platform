import {
  AlertTriangle,
  Check,
  ChevronRight,
  Copy,
  Inbox,
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { cn, statusTone } from '../lib/format.js';

/* -------------------------------- surfaces -------------------------------- */

export function Panel({
  title,
  subtitle,
  actions,
  children,
  className,
  bodyClassName,
  flush,
  signal,
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  flush?: boolean;
  signal?: boolean;
}) {
  return (
    <section className={cn('panel', signal && 'panel-signal', className)}>
      {(title || actions) && (
        <header className="panel-head">
          <div className="min-w-0">
            {title && <h2 className="panel-title truncate">{title}</h2>}
            {subtitle && <p className="panel-sub mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn(flush ? '' : 'p-5', bodyClassName)}>{children}</div>
    </section>
  );
}

export function Button({
  variant = 'default',
  size,
  loading,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'icon' | 'lg';
  loading?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={cn(
        'btn',
        variant === 'primary' && 'btn-primary',
        variant === 'ghost' && 'btn-ghost',
        variant === 'danger' && 'btn-danger',
        variant === 'outline' && 'btn-outline',
        size === 'sm' && 'btn-sm',
        size === 'icon' && 'btn-icon',
        size === 'lg' && 'btn-lg',
        className,
      )}
    >
      {loading && <Loader2 size={13} className="animate-spin" />}
      {children}
    </button>
  );
}

export function Badge({
  tone = 'muted',
  children,
  className,
}: {
  tone?: 'ok' | 'warn' | 'err' | 'info' | 'violet' | 'coral' | 'muted';
  children: React.ReactNode;
  className?: string;
}) {
  return <span className={cn('badge', `badge-${tone}`, className)}>{children}</span>;
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const tone = statusTone(status);
  return (
    <span className={cn('badge', `badge-${tone}`)}>
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          tone === 'ok' && 'bg-ok',
          tone === 'warn' && 'bg-warn pulse-dot',
          tone === 'err' && 'bg-err',
          tone === 'info' && 'bg-accent',
          tone === 'muted' && 'bg-slate-500',
        )}
      />
      {label ?? status}
    </span>
  );
}

export function Dot({ tone = 'ok', pulse }: { tone?: 'ok' | 'warn' | 'err' | 'muted'; pulse?: boolean }) {
  return (
    <span
      className={cn(
        'inline-block h-1.5 w-1.5 rounded-full',
        tone === 'ok' && 'bg-ok',
        tone === 'warn' && 'bg-warn',
        tone === 'err' && 'bg-err',
        tone === 'muted' && 'bg-slate-500',
        pulse && 'pulse-dot',
      )}
    />
  );
}

/* --------------------------------- inputs --------------------------------- */

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn('input', props.className)} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn('input', props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn('input appearance-none bg-surface-900 pr-8', props.className)}
    />
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors',
        checked ? 'border-accent/40 bg-accent/80' : 'border-line bg-surface-700',
        disabled && 'cursor-not-allowed opacity-40',
      )}
    >
      <span
        className={cn(
          'inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform',
          checked ? 'translate-x-[18px]' : 'translate-x-[3px]',
        )}
      />
    </button>
  );
}

/* --------------------------------- states --------------------------------- */

export function Spinner({ className }: { className?: string }) {
  return <Loader2 size={16} className={cn('animate-spin text-slate-500', className)} />;
}

export function LoadingBlock({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 px-1 py-8 text-[12.5px] text-muted">
      <Spinner />
      {label}…
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-err/20 bg-err/5 p-4">
      <div className="flex items-center gap-2 text-[12.5px] font-medium text-err">
        <AlertTriangle size={14} /> {error}
      </div>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          <RefreshCw size={12} /> Retry
        </Button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <div className="mb-1 flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface-800 text-slate-500">
        {icon ?? <Inbox size={16} />}
      </div>
      <p className="text-[13px] font-medium text-slate-200">{title}</p>
      {description && <p className="max-w-sm text-[12px] leading-relaxed text-slate-500">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/* ---------------------------------- misc ---------------------------------- */

export function StatCard({
  label,
  value,
  sub,
  tone,
  icon,
  children,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: 'ok' | 'warn' | 'err' | 'info' | 'violet' | 'coral';
  icon?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="panel group relative overflow-hidden p-4 transition-colors duration-200 hover:border-line-strong">
      <span
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 h-px opacity-70 transition-opacity duration-300 group-hover:opacity-100',
          tone === 'ok' && 'bg-gradient-to-r from-transparent via-ok/70 to-transparent',
          tone === 'warn' && 'bg-gradient-to-r from-transparent via-warn/70 to-transparent',
          tone === 'err' && 'bg-gradient-to-r from-transparent via-err/70 to-transparent',
          tone === 'coral' && 'bg-gradient-to-r from-transparent via-coral/70 to-transparent',
          (!tone || tone === 'info' || tone === 'violet') &&
            'bg-gradient-to-r from-transparent via-accent/70 to-transparent',
        )}
        aria-hidden
      />
      <div className="flex items-start justify-between gap-2">
        <div className="stat-label">{label}</div>
        {icon && (
          <div
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-md border',
              tone === 'ok' && 'border-ok/20 bg-ok/10 text-ok',
              tone === 'warn' && 'border-warn/20 bg-warn/10 text-warn',
              tone === 'err' && 'border-err/20 bg-err/10 text-coral-soft',
              tone === 'coral' && 'border-coral/25 bg-coral/10 text-coral',
              tone === 'violet' && 'border-ice/25 bg-ice/10 text-ice',
              (!tone || tone === 'info') && 'border-accent/25 bg-accent/10 text-accent-soft',
            )}
          >
            {icon}
          </div>
        )}
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <div className="stat-value">{value}</div>
        {children}
      </div>
      {sub && <div className="mt-2 text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}

export function Sparkline({
  values,
  tone = 'accent',
  height = 32,
  width = 120,
}: {
  values: number[];
  tone?: 'accent' | 'ok' | 'err' | 'violet';
  height?: number;
  width?: number;
}) {
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const points = values
    .map((value, index) => `${index * step},${height - (value / max) * (height - 4) - 2}`)
    .join(' ');
  const color =
    tone === 'ok' ? '#35d6a0' : tone === 'err' ? '#ff8066' : tone === 'violet' ? '#69d6f5' : '#16b8a6';
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      {values.length > 0 && (
        <circle
          cx={(values.length - 1) * step}
          cy={height - (values[values.length - 1]! / max) * (height - 4) - 2}
          r="2"
          fill={color}
        />
      )}
    </svg>
  );
}

export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard unavailable */
        }
      }}
      className="btn btn-sm btn-ghost"
      title={label}
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {copied ? 'Copied' : label}
    </button>
  );
}

export function JsonBlock({
  value,
  maxHeight = 320,
  className,
}: {
  value: unknown;
  maxHeight?: number;
  className?: string;
}) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return (
    <div className={cn('relative', className)}>
      <div className="absolute right-2 top-2 z-10">
        <CopyButton value={text} />
      </div>
      <pre className="code-block" style={{ maxHeight }}>
        {text}
      </pre>
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 pt-[8vh] backdrop-blur-sm">
      <div className={cn('panel fade-in w-full bg-surface-850 panel-signal', width)}>
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h3 className="text-[14px] font-semibold text-white">{title}</h3>
            {description && <p className="mt-0.5 text-[12px] text-muted">{description}</p>}
          </div>
          <button onClick={onClose} className="btn btn-icon btn-ghost" aria-label="Close">
            <X size={14} />
          </button>
        </header>
        <div className="max-h-[60vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ id: string; label: string; count?: number }>;
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-line">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cn('tab', active === tab.id && 'tab-active')}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className="rounded bg-surface-800 px-1 py-0.5 text-[10px] text-slate-400">{tab.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function Breadcrumb({ items }: { items: Array<{ label: string; to?: string }> }) {
  return (
    <div className="flex items-center gap-1 text-[11.5px] text-slate-500">
      {items.map((item, index) => (
        <span key={index} className="flex items-center gap-1">
          {index > 0 && <ChevronRight size={11} className="text-slate-700" />}
          <span className={index === items.length - 1 ? 'text-slate-300' : ''}>{item.label}</span>
        </span>
      ))}
    </div>
  );
}

/* --------------------------------- toasts --------------------------------- */

type Toast = { id: number; message: string; tone: 'ok' | 'err' | 'info' };
const ToastContext = createContext<{ push: (message: string, tone?: Toast['tone']) => void }>({
  push: () => undefined,
});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, tone: Toast['tone'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current.slice(-3), { id, message, tone }]);
    setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 4200);
  }, []);
  const value = useMemo(() => ({ push }), [push]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[320px] flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              'fade-in pointer-events-auto rounded-lg border px-3.5 py-2.5 text-[12.5px] shadow-xl backdrop-blur',
              toast.tone === 'ok' && 'border-ok/25 bg-ok/10 text-emerald-100',
              toast.tone === 'err' && 'border-err/25 bg-red-950/60 text-red-100',
              toast.tone === 'info' && 'border-line-strong bg-surface-800/95 text-slate-200',
            )}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
