import React from 'react';
import CorollaGleam from './CorollaGleam.js';
import ImmersiveHero from './ImmersiveHero.js';

export interface Combined3DProps {
  className?: string;
  /** 'hero' = large landing composition; 'accent' = smaller, subtler. */
  variant?: 'hero' | 'accent';
  subtle?: boolean;
}

/**
 * Unified 3D environment: the rotating iridescent Corolla Gleam glass ring
 * sits behind the existing MCP network core, so the two systems read as one
 * scene rather than two unrelated animations.
 */
export function Combined3D({ className, variant = 'hero', subtle }: Combined3DProps) {
  const isAccent = variant === 'accent';
  const ringScale = isAccent ? 70 : 100;
  const networkOpacity = isAccent ? 0.55 : 1;
  return (
    <div className={className} style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        <CorollaGleam
          subtle={subtle ?? isAccent}
          scale={ringScale}
          speed={isAccent ? 30 : 50}
          spin={isAccent ? 1.5 : 3}
          hover={isAccent ? 30 : 60}
          breathe={isAccent ? 20 : 40}
          background="transparent"
        />
      </div>
      <div style={{ position: 'absolute', inset: 0, opacity: networkOpacity, pointerEvents: 'none' }}>
        <ImmersiveHero className="h-full w-full" />
      </div>
    </div>
  );
}

export default Combined3D;