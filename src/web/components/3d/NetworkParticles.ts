import * as THREE from 'three';
import type { Disposable } from './MCPNetworkCore.js';

/**
 * Ambient depth particles. Count is scaled by viewport so phones stay smooth,
 * and the whole cloud is a single draw call.
 */
export function createNetworkParticles(options: { count?: number; spread?: number } = {}): Disposable {
  const count = options.count ?? 520;
  const spread = options.spread ?? 9;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const speeds = new Float32Array(count);

  for (let index = 0; index < count; index += 1) {
    positions[index * 3] = (Math.random() - 0.5) * spread;
    positions[index * 3 + 1] = (Math.random() - 0.5) * spread * 0.62;
    positions[index * 3 + 2] = (Math.random() - 0.5) * spread * 0.7;
    speeds[index] = 0.02 + Math.random() * 0.05;
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: 0x9dc3d8,
    size: 0.026,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;

  const update = (elapsed: number) => {
    points.rotation.y = elapsed * 0.014;
    const attribute = geometry.getAttribute('position');
    for (let index = 0; index < count; index += 1) {
      attribute.array[index * 3 + 1] += speeds[index]! * 0.0016;
      if (attribute.array[index * 3 + 1]! > spread * 0.31) {
        attribute.array[index * 3 + 1] = -spread * 0.31;
      }
    }
    attribute.needsUpdate = true;
  };

  return {
    object: points,
    update,
    dispose: () => {
      geometry.dispose();
      material.dispose();
    },
  };
}
