import * as THREE from 'three';
import type { AnimalKind } from './config';

/** Low-poly animals built from primitives. Origin at the feet, facing -Z. */

const mats = new Map<number, THREE.MeshStandardMaterial>();
function mat(color: number): THREE.MeshStandardMaterial {
  let m = mats.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.8 });
    mats.set(color, m);
  }
  return m;
}

function part(
  group: THREE.Group,
  geo: THREE.BufferGeometry,
  color: number,
  pos: [number, number, number],
  scale?: [number, number, number],
  rot?: [number, number, number],
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat(color));
  m.position.set(...pos);
  if (scale) m.scale.set(...scale);
  if (rot) m.rotation.set(...rot);
  m.castShadow = true;
  group.add(m);
  return m;
}

const sphere = (r: number) => new THREE.SphereGeometry(r, 8, 6);
const box = (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z);

function eyes(g: THREE.Group, y: number, z: number, spread: number): void {
  for (const s of [-1, 1]) {
    part(g, sphere(0.04), 0xffffff, [s * spread, y, z]);
    part(g, sphere(0.022), 0x111111, [s * spread, y, z - 0.03]);
  }
}

function penguin(): THREE.Group {
  const g = new THREE.Group();
  const black = 0x1d2533;
  const orange = 0xf28c28;
  part(g, sphere(0.28), black, [0, 0.38, 0], [1, 1.35, 0.9]);
  part(g, sphere(0.22), 0xf4f6f8, [0, 0.36, -0.12], [0.85, 1.25, 0.6]);
  part(g, sphere(0.2), black, [0, 0.78, 0]);
  part(g, sphere(0.13), 0xf4f6f8, [0, 0.78, -0.1], [1, 0.8, 0.6]);
  eyes(g, 0.82, -0.17, 0.075);
  part(g, new THREE.ConeGeometry(0.06, 0.16, 5), orange, [0, 0.75, -0.25], undefined, [-Math.PI / 2, 0, 0]);
  for (const s of [-1, 1]) {
    part(g, box(0.12, 0.05, 0.18), orange, [s * 0.1, 0.025, -0.08]);
    part(g, box(0.05, 0.32, 0.16), black, [s * 0.29, 0.42, 0], undefined, [0, 0, s * 0.35]);
  }
  return g;
}

function fox(): THREE.Group {
  const g = new THREE.Group();
  const orange = 0xe07a2e;
  const white = 0xf6efe6;
  const dark = 0x3a2a20;
  part(g, box(0.32, 0.28, 0.6), orange, [0, 0.42, 0]);
  part(g, box(0.26, 0.2, 0.1), white, [0, 0.4, -0.29]);
  part(g, box(0.3, 0.27, 0.28), orange, [0, 0.66, -0.36]);
  part(g, box(0.16, 0.12, 0.2), white, [0, 0.6, -0.56]);
  part(g, box(0.05, 0.05, 0.04), 0x111111, [0, 0.63, -0.67]);
  eyes(g, 0.71, -0.5, 0.08);
  for (const s of [-1, 1]) {
    part(g, new THREE.ConeGeometry(0.075, 0.18, 4), orange, [s * 0.09, 0.88, -0.34], undefined, [0, Math.PI / 4, 0]);
    for (const z of [-0.2, 0.2]) part(g, box(0.08, 0.28, 0.08), dark, [s * 0.1, 0.14, z]);
  }
  part(g, new THREE.CylinderGeometry(0.06, 0.13, 0.42, 6), orange, [0, 0.52, 0.46], undefined, [-Math.PI / 2 - 0.5, 0, 0]);
  part(g, sphere(0.09), white, [0, 0.62, 0.66]);
  return g;
}

function bear(): THREE.Group {
  const g = new THREE.Group();
  const brown = 0x6b4a32;
  const light = 0xa07a58;
  part(g, sphere(0.4), brown, [0, 0.56, 0.02], [1, 0.85, 1.25]);
  part(g, sphere(0.26), brown, [0, 0.84, -0.48]);
  part(g, sphere(0.12), light, [0, 0.77, -0.71], [1, 0.8, 1]);
  part(g, sphere(0.05), 0x111111, [0, 0.8, -0.82]);
  eyes(g, 0.9, -0.69, 0.1);
  for (const s of [-1, 1]) {
    part(g, sphere(0.08), brown, [s * 0.17, 1.05, -0.44]);
    for (const z of [-0.3, 0.3]) part(g, new THREE.CylinderGeometry(0.11, 0.12, 0.36, 6), brown, [s * 0.21, 0.18, z]);
  }
  return g;
}

export function buildAnimal(kind: AnimalKind): THREE.Group {
  const inner = kind === 'penguin' ? penguin() : kind === 'fox' ? fox() : bear();
  // Wrap so the game can scale/rotate the outer group freely.
  const outer = new THREE.Group();
  outer.add(inner);
  outer.userData.kind = kind;
  return outer;
}

/** Height above the feet where a label should sit. */
export const LABEL_HEIGHT: Record<AnimalKind, number> = { penguin: 1.15, fox: 1.15, bear: 1.35 };
