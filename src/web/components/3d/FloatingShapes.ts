import * as THREE from 'three';
import type { Disposable } from './MCPNetworkCore.js';

type Floater = {
  mesh: any;
  baseY: number;
  baseX: number;
  spin: number;
  bob: number;
  phase: number;
};

/**
 * Layered floating geometry around the network core: a glass ring, a faceted
 * crystal, two cubes and a soft wire sphere. They drift on individual sine
 * paths so the hero reads as depth rather than a flat diagram.
 *
 * Everything is basic/additive material — no lights, no shadow maps — so the
 * whole set costs a handful of draw calls.
 */
export function createFloatingShapes(): Disposable {
  const group = new THREE.Group();
  const floaters: Floater[] = [];
  const disposables: Array<{ dispose: () => void }> = [];
  const geometries: any[] = [];
  const materials: any[] = [];

  const add = (
    geometry: any,
    material: any,
    options: { x: number; y: number; z: number; scale?: number; spin?: number; bob?: number; phase?: number },
  ) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(options.x, options.y, options.z);
    mesh.scale.setScalar(options.scale ?? 1);
    group.add(mesh);
    geometries.push(geometry);
    materials.push(material);
    floaters.push({
      mesh,
      baseX: options.x,
      baseY: options.y,
      spin: options.spin ?? 0.2,
      bob: options.bob ?? 0.12,
      phase: options.phase ?? Math.random() * Math.PI * 2,
    });
  };

  // glass ring — thin torus, ice blue
  add(new THREE.TorusGeometry(0.62, 0.012, 8, 96), new THREE.MeshBasicMaterial({
    color: 0xA0E6BD,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }), { x: -2.05, y: 0.95, z: 0.35, spin: 0.3, bob: 0.16, phase: 0.4 });

  // faceted crystal — teal wire
  add(new THREE.OctahedronGeometry(0.34, 0), new THREE.MeshBasicMaterial({
    color: 0xA0E6BD,
    wireframe: true,
    transparent: true,
    opacity: 0.55,
  }), { x: 2.25, y: 1.15, z: 0.15, spin: 0.36, bob: 0.2, phase: 1.9 });

  // soft wire sphere — silver
  add(new THREE.IcosahedronGeometry(0.26, 1), new THREE.MeshBasicMaterial({
    color: 0xC5D0CA,
    wireframe: true,
    transparent: true,
    opacity: 0.22,
  }), { x: 2.45, y: -1.15, z: -0.4, spin: 0.22, bob: 0.14, phase: 3.1 });

  // two small solid cubes — coral + ice
  add(new THREE.BoxGeometry(0.16, 0.16, 0.16), new THREE.MeshBasicMaterial({
    color: 0xD9B978,
    transparent: true,
    opacity: 0.85,
  }), { x: -2.4, y: -1.05, z: 0.5, spin: 0.5, bob: 0.1, phase: 2.2 });

  add(new THREE.BoxGeometry(0.12, 0.12, 0.12), new THREE.MeshBasicMaterial({
    color: 0xA0E6BD,
    transparent: true,
    opacity: 0.8,
  }), { x: -1.55, y: -1.45, z: -0.3, spin: 0.62, bob: 0.12, phase: 4.4 });

  const update = (elapsed: number) => {
    floaters.forEach((floater) => {
      floater.mesh.rotation.x = elapsed * floater.spin * 0.6 + floater.phase;
      floater.mesh.rotation.y = elapsed * floater.spin;
      floater.mesh.position.y = floater.baseY + Math.sin(elapsed * 0.5 + floater.phase) * floater.bob;
      floater.mesh.position.x = floater.baseX + Math.cos(elapsed * 0.32 + floater.phase) * 0.08;
    });
  };

  const dispose = () => {
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    disposables.forEach((item) => item.dispose());
  };

  return { object: group, update, dispose };
}
