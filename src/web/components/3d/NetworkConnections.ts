import * as THREE from 'three';
import type { Disposable } from './MCPNetworkCore.js';

/**
 * Animated links between the control-plane core and each server node.
 * Each link carries a travelling packet so the network reads as live traffic
 * rather than a static diagram.
 */
export function createNetworkConnections(
  nodes: any[],
  options: { origin?: any; packetsPerLink?: number } = {},
): Disposable {
  const origin = options.origin ?? new THREE.Vector3(0, 0, 0);
  const packetsPerLink = options.packetsPerLink ?? 2;
  const group = new THREE.Group();

  const geometry = new THREE.BufferGeometry();
  const positions: number[] = [];
  const colors: number[] = [];
  const warm = new THREE.Color(0x36C78A);
  const cool = new THREE.Color(0xA0E6BD);

  for (const node of nodes) {
    positions.push(origin.x, origin.y, origin.z, node.x, node.y, node.z);
    colors.push(warm.r, warm.g, warm.b, cool.r, cool.g, cool.b);
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  const material = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.32,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const lines = new THREE.LineSegments(geometry, material);
  group.add(lines);

  const packetCount = nodes.length * packetsPerLink;
  const packetGeometry = new THREE.BufferGeometry();
  const packetPositions = new Float32Array(packetCount * 3);
  packetGeometry.setAttribute('position', new THREE.BufferAttribute(packetPositions, 3));
  const packetMaterial = new THREE.PointsMaterial({
    color: 0xA0E6BD,
    size: 0.055,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const packets = new THREE.Points(packetGeometry, packetMaterial);
  group.add(packets);

  const update = (elapsed: number) => {
    let packetIndex = 0;
    nodes.forEach((node, nodeIndex) => {
      for (let packet = 0; packet < packetsPerLink; packet += 1) {
        const speed = 0.16 + ((nodeIndex + packet) % 4) * 0.035;
        const progress = (elapsed * speed + packet / packetsPerLink + nodeIndex * 0.17) % 1;
        const eased = progress * progress * (3 - 2 * progress);
        packetPositions[packetIndex * 3] = node.x * eased;
        packetPositions[packetIndex * 3 + 1] = node.y * eased;
        packetPositions[packetIndex * 3 + 2] = node.z * eased;
        packetIndex += 1;
      }
    });
    packetGeometry.getAttribute('position').needsUpdate = true;
  };

  return {
    object: group,
    update,
    dispose: () => {
      geometry.dispose();
      material.dispose();
      packetGeometry.dispose();
      packetMaterial.dispose();
    },
  };
}
