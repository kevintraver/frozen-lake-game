import * as THREE from 'three';

/** Static snowy surroundings: banks, shores and trees. */
export function buildScenery(cols: number, rows: number): THREE.Group {
  const g = new THREE.Group();
  const snow = new THREE.MeshStandardMaterial({ color: 0xf2f6fa, roughness: 0.95, flatShading: true });
  const halfW = cols / 2;
  const lakeLen = rows; // rows 0..rows-1 span z = 0.5 .. -(rows-0.5)
  const zMid = -(rows - 1) / 2;

  const addBox = (w: number, d: number, x: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, d), snow);
    m.position.set(x, -0.22, z);
    m.receiveShadow = true;
    g.add(m);
  };
  const side = 14;
  addBox(side, lakeLen + 30, -(halfW + side / 2), zMid);
  addBox(side, lakeLen + 30, halfW + side / 2, zMid);
  addBox(cols, 15, 0, 0.5 + 7.5); // behind start shore
  addBox(cols, 15, 0, -(rows - 0.5) - 7.5); // beyond far shore

  // Trees (seeded so the scene is stable).
  let s = 7;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3d2b, flatShading: true });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f5d4a, flatShading: true });
  const capMat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true });
  const trunkGeo = new THREE.CylinderGeometry(0.08, 0.1, 0.4, 5);
  const leafGeo = new THREE.ConeGeometry(0.55, 1.3, 6);
  const capGeo = new THREE.ConeGeometry(0.28, 0.5, 6);

  const tree = (x: number, z: number, scale: number) => {
    const t = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 0.2;
    const leaf = new THREE.Mesh(leafGeo, leafMat);
    leaf.position.y = 0.95;
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.y = 1.42;
    for (const m of [trunk, leaf, cap]) {
      m.castShadow = true;
      t.add(m);
    }
    t.position.set(x, 0.03, z);
    t.scale.setScalar(scale);
    t.rotation.y = rnd() * Math.PI;
    g.add(t);
  };

  for (let i = 0; i < 70; i++) {
    const sideSign = rnd() < 0.5 ? -1 : 1;
    const x = sideSign * (halfW + 0.8 + rnd() * 9);
    const z = 3 - rnd() * (rows + 13);
    tree(x, z, 0.8 + rnd() * 0.8);
  }
  // A few on the far shore behind the finish.
  for (let i = 0; i < 10; i++) {
    tree((rnd() - 0.5) * cols, -(rows + 1.5) - rnd() * 6, 0.8 + rnd() * 0.7);
  }
  // A few behind the start (kept out of the picker view).
  for (let i = 0; i < 6; i++) {
    tree((rnd() - 0.5) * cols, 11 + rnd() * 5, 0.8 + rnd() * 0.6);
  }
  return g;
}
