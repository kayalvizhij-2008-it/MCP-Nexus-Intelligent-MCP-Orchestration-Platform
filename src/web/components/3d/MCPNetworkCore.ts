import * as THREE from 'three';

// three is declared untyped (see src/web/three-shim.d.ts), so the shape of the
// disposable scene parts is expressed with structural types instead.
export type ScenePart = {
  object: any;
  update: (elapsed: number, pointer?: { x: number; y: number }) => void;
  dispose: () => void;
};
export type Disposable = ScenePart;

/** Evenly distributed points on a sphere (Fibonacci lattice) — used for node placement. */
export function fibonacciSphere(count: number, radius: number): any[] {
  const points: any[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let index = 0; index < count; index += 1) {
    const y = 1 - (index / (count - 1)) * 2;
    const ringRadius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * index;
    points.push(
      new THREE.Vector3(Math.cos(theta) * ringRadius, y, Math.sin(theta) * ringRadius).multiplyScalar(
        radius,
      ),
    );
  }
  return points;
}

/**
 * The luminous network core: a faceted wire shell around a soft inner glow,
 * two orbit rings and the server nodes that the connections attach to.
 */
export function createNetworkCore(options: { nodeCount?: number; radius?: number } = {}): Disposable & {
  nodes: any[];
  nodeMeshes: any[];
} {
  const nodeCount = options.nodeCount ?? 8;
  const radius = options.radius ?? 2.35;
  const group = new THREE.Group();
  const nodes = fibonacciSphere(nodeCount, radius);
  const nodeMeshes: any[] = [];

  const shellGeometry = new THREE.IcosahedronGeometry(0.98, 1);
  const shellMaterial = new THREE.MeshBasicMaterial({
    color: 0x16b8a6,
    wireframe: true,
    transparent: true,
    opacity: 0.4,
  });
  const shell = new THREE.Mesh(shellGeometry, shellMaterial);
  group.add(shell);

  const coreGeometry = new THREE.IcosahedronGeometry(0.58, 3);
  const coreMaterial = new THREE.MeshBasicMaterial({
    color: 0x5fe3d1,
    transparent: true,
    opacity: 0.26,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const core = new THREE.Mesh(coreGeometry, coreMaterial);
  group.add(core);

  const haloGeometry = new THREE.SphereGeometry(1.45, 32, 32);
  const haloMaterial = new THREE.MeshBasicMaterial({
    color: 0x69d6f5,
    transparent: true,
    opacity: 0.05,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.BackSide,
  });
  const halo = new THREE.Mesh(haloGeometry, haloMaterial);
  group.add(halo);

  const ringGeometry = new THREE.TorusGeometry(1.55, 0.004, 8, 128);
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0x69d6f5,
    transparent: true,
    opacity: 0.32,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const ringA = new THREE.Mesh(ringGeometry, ringMaterial);
  ringA.rotation.x = Math.PI / 2.4;
  const ringB = new THREE.Mesh(ringGeometry, ringMaterial.clone());
  ringB.rotation.set(Math.PI / 1.7, 0.6, 0);
  ringB.scale.setScalar(0.82);
  group.add(ringA, ringB);

  const nodeGeometry = new THREE.OctahedronGeometry(0.055, 0);
  const nodeMaterialWarm = new THREE.MeshBasicMaterial({ color: 0x5fe3d1 });
  const nodeMaterialCool = new THREE.MeshBasicMaterial({ color: 0x69d6f5 });
  const nodeMaterialAccent = new THREE.MeshBasicMaterial({ color: 0xff8066 });

  nodes.forEach((position, index) => {
    const mesh = new THREE.Mesh(
      nodeGeometry,
      index === 2 ? nodeMaterialAccent : index % 2 === 0 ? nodeMaterialWarm : nodeMaterialCool,
    );
    mesh.position.copy(position);
    nodeMeshes.push(mesh);
    group.add(mesh);
  });

  const update = (elapsed: number, pointer: { x: number; y: number } = { x: 0, y: 0 }) => {
    group.rotation.y = elapsed * 0.07 + pointer.x * 0.28;
    group.rotation.x = pointer.y * 0.16;
    shell.rotation.y = elapsed * 0.11;
    shell.rotation.z = elapsed * 0.04;
    core.rotation.y = -elapsed * 0.16;
    const pulse = 1 + Math.sin(elapsed * 0.9) * 0.045;
    core.scale.setScalar(pulse);
    ringA.rotation.z = elapsed * 0.16;
    ringB.rotation.z = -elapsed * 0.12;
    nodeMeshes.forEach((mesh, index) => {
      mesh.rotation.x = elapsed * 0.3 + index;
      mesh.rotation.y = elapsed * 0.24;
      const scale = 0.92 + Math.sin(elapsed * 1.4 + index) * 0.12;
      mesh.scale.setScalar(scale);
    });
  };

  const dispose = () => {
    shellGeometry.dispose();
    shellMaterial.dispose();
    coreGeometry.dispose();
    coreMaterial.dispose();
    haloGeometry.dispose();
    haloMaterial.dispose();
    ringGeometry.dispose();
    ringMaterial.dispose();
    ringB.material.dispose();
    nodeGeometry.dispose();
    nodeMaterialWarm.dispose();
    nodeMaterialCool.dispose();
    nodeMaterialAccent.dispose();
  };

  return { object: group, update, dispose, nodes, nodeMeshes };
}
