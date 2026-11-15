import * as THREE from 'three';
import React, { useEffect, useRef, useState } from 'react';
import { createFloatingShapes } from './FloatingShapes.js';
import { createNetworkCore } from './MCPNetworkCore.js';
import { createNetworkConnections } from './NetworkConnections.js';
import { createNetworkParticles } from './NetworkParticles.js';

/** Static fallback used when WebGL is unavailable or the context is lost. */
function HeroFallback() {
  return (
    <div className="absolute inset-0 flex items-center justify-center" aria-hidden>
      <svg viewBox="0 0 400 400" className="h-[78%] w-auto opacity-70">
        <defs>
          <radialGradient id="hero-fallback-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#16b8a6" stopOpacity="0.5" />
            <stop offset="70%" stopColor="#69d6f5" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#69d6f5" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="200" cy="200" r="150" fill="url(#hero-fallback-glow)" />
        <circle cx="200" cy="200" r="46" fill="#101a2c" stroke="#5fe3d1" strokeWidth="1.2" />
        {Array.from({ length: 8 }).map((_, index) => {
          const angle = (index / 8) * Math.PI * 2;
          const x = 200 + Math.cos(angle) * 132;
          const y = 200 + Math.sin(angle) * 132;
          return (
            <g key={index}>
              <line x1="200" y1="200" x2={x} y2={y} stroke="#334a68" strokeWidth="1" />
              <circle cx={x} cy={y} r="5" fill={index === 2 ? '#ff8066' : index % 2 ? '#69d6f5' : '#5fe3d1'} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/**
 * The immersive hero canvas: luminous network core, connected server nodes,
 * travelling packets and ambient particles, with pointer parallax.
 *
 * Performance and safety:
 *  - device pixel ratio capped (1.5 on phones, 1.75 on desktop)
 *  - rendering pauses when offscreen or the tab is hidden
 *  - prefers-reduced-motion renders a single static frame
 *  - every geometry, material and listener is disposed on unmount
 *  - WebGL failure or context loss falls back to an SVG diagram
 */
export function ImmersiveHero({ className }: { className?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isCompact = window.matchMedia('(max-width: 768px)').matches;

    let renderer: any;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: !isCompact,
        powerPreference: 'high-performance',
      });
    } catch {
      setFailed(true);
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isCompact ? 1.5 : 1.75));
    renderer.setClearAlpha(0);
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:pan-y';
    renderer.domElement.setAttribute('aria-hidden', 'true');
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 60);
    camera.position.set(0, 0.15, 5.9);

    const core = createNetworkCore({ nodeCount: isCompact ? 6 : 8 });
    const connections = createNetworkConnections(core.nodes, { packetsPerLink: isCompact ? 1 : 2 });
    const particles = createNetworkParticles({ count: isCompact ? 240 : 560 });
    const shapes = createFloatingShapes();
    scene.add(core.object, connections.object, particles.object, shapes.object);

    const pointer = { x: 0, y: 0 };
    const smoothed = { x: 0, y: 0 };
    const onPointerMove = (event: PointerEvent) => {
      pointer.x = (event.clientX / window.innerWidth - 0.5) * 2;
      pointer.y = (event.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });

    // performance.now() instead of THREE.Clock (deprecated in three 0.187).
    const startedAt = performance.now();
    const seconds = () => (performance.now() - startedAt) / 1000;
    let frame = 0;
    let visible = true;
    let running = true;

    const draw = (elapsed: number) => {
      smoothed.x += (pointer.x - smoothed.x) * 0.06;
      smoothed.y += (pointer.y - smoothed.y) * 0.06;
      core.update(elapsed, smoothed);
      connections.update(elapsed);
      particles.update(elapsed);
      shapes.update(elapsed);
      camera.position.x = smoothed.x * 0.32;
      camera.position.y = 0.15 - smoothed.y * 0.24;
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
    };

    const loop = () => {
      if (!running) return;
      frame = requestAnimationFrame(loop);
      if (!visible || document.hidden) return;
      draw(seconds());
    };

    const resize = () => {
      const width = host.clientWidth || 1;
      const height = host.clientHeight || 1;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      if (!running || reducedMotion) renderer.render(scene, camera);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    const onContextLost = (event: Event) => {
      event.preventDefault();
      running = false;
      cancelAnimationFrame(frame);
      setFailed(true);
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost, false);

    let intersection: IntersectionObserver | undefined;
    if ('IntersectionObserver' in window) {
      intersection = new IntersectionObserver(
        (entries) => {
          visible = entries.some((entry) => entry.isIntersecting);
        },
        { threshold: 0.01 },
      );
      intersection.observe(host);
    }

    if (reducedMotion) {
      draw(0);
    } else {
      loop();
    }

    return () => {
      running = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      intersection?.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      core.dispose();
      connections.dispose();
      particles.dispose();
      shapes.dispose();
      scene.clear();
      renderer.dispose();
      renderer.forceContextLoss?.();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div ref={hostRef} className={className} role="img" aria-label="3D visualisation of MCP servers connected to a central control plane">
      {failed && <HeroFallback />}
      <p className="sr-only">
        An animated network of MCP servers linked to a central control plane.
      </p>
    </div>
  );
}

export default ImmersiveHero;
