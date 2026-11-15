import { Check, ChevronDown, Copy, Loader2 } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { cn } from '../lib/format.js';

/* -------------------------------------------------------------------------- */
/*  Interaction primitives                                                    */
/*  Small, focused components shared by the shell, landing page and workspace. */
/*  Every one of these is wired to a real action wherever it is used.         */
/* -------------------------------------------------------------------------- */

export function Tooltip({
  label,
  children,
  side = 'top',
  className,
}: {
  label: string;
  children: React.ReactNode;
  side?: 'top' | 'right' | 'bottom';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span
      className={cn('relative inline-flex', className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span aria-describedby={open ? id : undefined} className="inline-flex">
        {children}
      </span>
      {open && (
        <span
          role="tooltip"
          id={id}
          className={cn(
            'tooltip-pop pointer-events-none absolute z-50 whitespace-nowrap rounded-md border border-line-strong bg-surface-800 px-2 py-1 text-[10.5px] font-medium text-slate-200 shadow-xl',
            side === 'top' && 'bottom-full left-1/2 mb-1.5 -translate-x-1/2',
            side === 'bottom' && 'left-1/2 top-full mt-1.5 -translate-x-1/2',
            side === 'right' && 'left-full top-1/2 ml-2 -translate-y-1/2',
          )}
        >
          {label}
        </span>
      )}
    </span>
  );
}

export function IconButton({
  label,
  className,
  children,
  size = 'md',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: React.ReactNode;
  size?: 'sm' | 'md';
}) {
  return (
    <Tooltip label={label}>
      <button
        {...props}
        type={props.type ?? 'button'}
        aria-label={label}
        className={cn('btn btn-ghost btn-icon group', size === 'sm' && 'h-7 w-7', className)}
      >
        <span className="transition-transform duration-150 group-hover:scale-[1.08] group-active:scale-95">
          {children}
        </span>
      </button>
    </Tooltip>
  );
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (next: T) => void;
  options: Array<{ value: T; label: string; count?: number }>;
  label?: string;
}) {
  return (
    <div className="segmented" role="tablist" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          role="tab"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn('segmented-item', value === option.value && 'segmented-item-active')}
        >
          {option.label}
          {option.count !== undefined && (
            <span className="ml-1.5 text-[10px] text-slate-500">{option.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

/** Count-up animation for real metrics; falls back to the final value. */
export function AnimatedNumber({
  value,
  duration = 620,
  format = (n: number) => Math.round(n).toLocaleString(),
}: {
  value: number | null | undefined;
  duration?: number;
  format?: (n: number) => string;
}) {
  const [display, setDisplay] = useState(value ?? 0);
  const previous = useRef(value ?? 0);

  useEffect(() => {
    if (value === null || value === undefined) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !Number.isFinite(value)) {
      setDisplay(value);
      previous.current = value;
      return;
    }
    const start = performance.now();
    const from = previous.current;
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(from + (value - from) * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
      else previous.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  if (value === null || value === undefined) return <>—</>;
  return <>{format(display)}</>;
}

/** Pointer-following magnetic wrapper used on the landing CTAs. */
export function MagneticButton({
  children,
  strength = 10,
  className,
}: {
  children: React.ReactNode;
  strength?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  const move = useCallback(
    (event: React.PointerEvent) => {
      const node = ref.current;
      if (!node) return;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const rect = node.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width - 0.5) * strength;
      const y = ((event.clientY - rect.top) / rect.height - 0.5) * strength;
      node.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
    },
    [strength],
  );

  const reset = useCallback(() => {
    if (ref.current) ref.current.style.transform = 'translate3d(0,0,0)';
  }, []);

  return (
    <span
      ref={ref}
      onPointerMove={move}
      onPointerLeave={reset}
      onPointerCancel={reset}
      className={cn('inline-flex transition-transform duration-200 ease-out', className)}
    >
      {children}
    </span>
  );
}

export function GlowButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) {
  return (
    <button
      {...props}
      className={cn(
        'btn btn-primary btn-lg group relative overflow-hidden px-5',
        'after:absolute after:inset-0 after:-translate-x-full after:bg-gradient-to-r after:from-transparent after:via-white/20 after:to-transparent',
        'after:transition-transform after:duration-700 hover:after:translate-x-full',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function CommandButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="group flex h-8 items-center gap-2 rounded-lg border border-line bg-surface-900 px-2.5 text-[11.5px] text-slate-500 transition-colors hover:border-line-strong hover:text-slate-300"
      aria-label="Open command palette"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <span className="hidden sm:inline">Search</span>
      <span className="kbd ml-1 hidden sm:inline">⌘K</span>
    </button>
  );
}

export function ActionMenu({
  label,
  items,
}: {
  label: string;
  items: Array<{ label: string; onSelect: () => void; danger?: boolean; disabled?: boolean }>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <IconButton label={label} onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <ChevronDown size={13} />
      </IconButton>
      {open && (
        <div className="fade-in absolute right-0 top-full z-40 mt-1 w-48 rounded-lg border border-line bg-surface-850 p-1 shadow-2xl">
          {items.map((item) => (
            <button
              key={item.label}
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12px] transition-colors disabled:opacity-40',
                item.danger ? 'text-err hover:bg-err/10' : 'text-slate-300 hover:bg-surface-800',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Copy-to-clipboard control with explicit success feedback. */
export function CopyChip({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setFailed(false);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          setFailed(true);
          setTimeout(() => setFailed(false), 1600);
        }
      }}
      className="btn btn-sm btn-ghost"
      aria-live="polite"
    >
      {copied ? <Check size={11} className="text-ok" /> : <Copy size={11} />}
      {failed ? 'Copy failed' : copied ? 'Copied' : label}
    </button>
  );
}

export function SkeletonRows({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-2 p-4', className)}>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="skeleton h-7" style={{ width: `${92 - index * 7}%` }} />
      ))}
    </div>
  );
}

export function InlineSpinner({ label = 'Working' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] text-slate-400" aria-live="polite">
      <Loader2 size={12} className="animate-spin" />
      {label}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Atmosphere                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The flowing background used behind the whole application.
 *
 * Three blurred colour fields drift on independent CSS timelines (transform
 * only, so the compositor handles them). Rendering pauses when the tab is
 * hidden, and the CSS reduced-motion rule collapses every animation.
 */
export function AnimatedBackdrop() {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const onVisibility = () => setPaused(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  return (
    <div className="aurora-stage" data-paused={paused ? 'true' : 'false'} aria-hidden>
      <div className="aurora-field aurora-field-a" />
      <div className="aurora-field aurora-field-b" />
      <div className="aurora-field aurora-field-c" />
      <div className="grain" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Motion wrappers                                                           */
/* -------------------------------------------------------------------------- */

/** Scroll-triggered entrance. Visible immediately when motion is reduced. */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 18,
  once = true,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  once?: boolean;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduced ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: '-70px' }}
      transition={{ duration: 0.62, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/** Staggers direct children on first view. */
export function RevealGroup({
  children,
  className,
  stagger = 0.07,
}: {
  children: React.ReactNode;
  className?: string;
  stagger?: number;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduced ? false : 'hidden'}
      whileInView="show"
      viewport={{ once: true, margin: '-60px' }}
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: stagger } },
      }}
    >
      {React.Children.map(children, (child) => (
        <motion.div
          variants={{
            hidden: reduced ? {} : { opacity: 0, y: 16 },
            show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
          }}
          className="min-w-0"
        >
          {child}
        </motion.div>
      ))}
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/*  3D interaction surfaces                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Perspective tilt + pointer-following light.
 *
 * Pointer input only (touch keeps the flat card) and disabled entirely under
 * prefers-reduced-motion. The spotlight is a sibling overlay so its radial
 * gradient can never intercept clicks.
 */
export function TiltCard({
  children,
  className,
  maxTilt = 7,
  spotlight = true,
}: {
  children: React.ReactNode;
  className?: string;
  maxTilt?: number;
  spotlight?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const active = useRef(false);

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (reduced || event.pointerType !== 'mouse') return;
      const node = ref.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width;
      const py = (event.clientY - rect.top) / rect.height;
      if (!active.current) {
        node.dataset.active = 'true';
        active.current = true;
      }
      node.style.setProperty('--tilt-y', `${((px - 0.5) * maxTilt * 2).toFixed(2)}deg`);
      node.style.setProperty('--tilt-x', `${((0.5 - py) * maxTilt * 2).toFixed(2)}deg`);
      node.style.setProperty('--spot-x', `${(px * 100).toFixed(1)}%`);
      node.style.setProperty('--spot-y', `${(py * 100).toFixed(1)}%`);
    },
    [maxTilt, reduced],
  );

  const reset = useCallback(() => {
    const node = ref.current;
    if (!node) return;
    node.dataset.active = 'false';
    active.current = false;
    node.style.setProperty('--tilt-x', '0deg');
    node.style.setProperty('--tilt-y', '0deg');
  }, []);

  return (
    <div
      ref={ref}
      className={cn('tilt-card relative', className)}
      onPointerMove={onPointerMove}
      onPointerLeave={reset}
      onPointerCancel={reset}
    >
      {spotlight && <span className="tilt-spot" aria-hidden />}
      <div className="relative">{children}</div>
    </div>
  );
}

/**
 * Real 3D flip surface with genuine perspective and hidden backfaces.
 *
 * Flip is user-driven only (button / tap), so scrolling can never flip a card.
 * The control is a real button, so it is keyboard and screen-reader operable.
 */
export function FlipCard({
  front,
  back,
  className,
  minHeight = 208,
  flipLabel = 'Show details',
  backLabel = 'Back to summary',
}: {
  front: (flip: () => void) => React.ReactNode;
  back: (unflip: () => void) => React.ReactNode;
  className?: string;
  minHeight?: number;
  flipLabel?: string;
  backLabel?: string;
}) {
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    if (!flipped) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFlipped(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [flipped]);

  return (
    <div
      className={cn('flip', className)}
      data-flipped={flipped ? 'true' : 'false'}
      style={{ minHeight }}
      aria-label={flipped ? backLabel : flipLabel}
    >
      <div className="flip-inner">
        <div className="flip-face h-full">
          {front(() => setFlipped(true))}
        </div>
        <div className="flip-face flip-back h-full" aria-hidden={!flipped}>
          {back(() => setFlipped(false))}
        </div>
      </div>
    </div>
  );
}
