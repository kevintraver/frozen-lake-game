import * as THREE from 'three';
import { CONFIG } from './config';
import { generateHoles } from './generate';

export type TileState = 'shore' | 'ice' | 'cracking' | 'hole';

export interface Tile {
  col: number;
  row: number;
  state: TileState;
  /** Seconds left before a cracking tile breaks. */
  timer: number;
  total: number;
  warned: boolean;
  mesh: THREE.Mesh | null;
  crackMat: THREE.MeshBasicMaterial | null;
  seed: number;
}

const ICE_COLORS = [0xbfe7ff, 0xb2e0fb, 0xcaedff];
const ICE_DARK = new THREE.Color(0x5d7f99);
const TILE_H = 0.3;

function makeCrackTexture(): THREE.CanvasTexture {
  const size = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d')!;
  ctx.lineCap = 'round';
  const branch = (x: number, y: number, angle: number, len: number, width: number, depth: number) => {
    const pts: [number, number][] = [[x, y]];
    const steps = 5;
    for (let i = 0; i < steps; i++) {
      angle += (Math.random() - 0.5) * 0.9;
      x += Math.cos(angle) * (len / steps);
      y += Math.sin(angle) * (len / steps);
      pts.push([x, y]);
    }
    for (const [style, w, off] of [
      ['rgba(255,255,255,0.85)', width + 2, 1.5],
      ['rgba(25,55,90,0.95)', width, 0],
    ] as const) {
      ctx.strokeStyle = style;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(pts[0][0] + off, pts[0][1] + off);
      for (const [px, py] of pts.slice(1)) ctx.lineTo(px + off, py + off);
      ctx.stroke();
    }
    if (depth > 0) {
      const n = 1 + Math.floor(Math.random() * 2);
      for (let i = 0; i < n; i++) {
        const [bx, by] = pts[2 + Math.floor(Math.random() * (pts.length - 2))];
        branch(bx, by, angle + (Math.random() - 0.5) * 2, len * 0.55, Math.max(1, width * 0.6), depth - 1);
      }
    }
  };
  const cx = size / 2 + (Math.random() - 0.5) * 40;
  const cy = size / 2 + (Math.random() - 0.5) * 40;
  const arms = 4 + Math.floor(Math.random() * 3);
  for (let i = 0; i < arms; i++) {
    branch(cx, cy, (i / arms) * Math.PI * 2 + Math.random() * 0.6, 90 + Math.random() * 50, 4, 2);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Lake {
  readonly group = new THREE.Group();
  readonly cols = CONFIG.cols;
  readonly rows = CONFIG.lakeRows + 2;
  tiles: Tile[][] = [];

  private iceGeo = new THREE.BoxGeometry(0.94, TILE_H, 0.94);
  private snowGeo = new THREE.BoxGeometry(1, 0.4, 1);
  private crackGeo = new THREE.PlaneGeometry(0.94, 0.94);
  private iceMats = ICE_COLORS.map(
    (c) => new THREE.MeshStandardMaterial({ color: c, emissive: 0x2a5878, emissiveIntensity: 0.35, roughness: 0.15, metalness: 0.05, flatShading: true }),
  );
  private snowMat = new THREE.MeshStandardMaterial({ color: 0xf5f8fb, roughness: 0.95, flatShading: true });
  private crackTextures = Array.from({ length: 6 }, makeCrackTexture);
  private tileGroup = new THREE.Group();

  constructor() {
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(this.cols + 2, CONFIG.lakeRows + 1),
      new THREE.MeshStandardMaterial({ color: 0x163f63, roughness: 0.1, metalness: 0.3 }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, -0.32, this.worldZ((this.rows - 1) / 2));
    water.receiveShadow = true;
    this.group.add(water, this.tileGroup);
  }

  worldX(col: number): number {
    return col - (this.cols - 1) / 2;
  }
  worldZ(row: number): number {
    return -row;
  }
  inBounds(col: number, row: number): boolean {
    return col >= 0 && col < this.cols && row >= 0 && row < this.rows;
  }
  get(col: number, row: number): Tile {
    return this.tiles[row][col];
  }

  generate(): void {
    // Dispose previous per-tile resources.
    for (const row of this.tiles) for (const t of row) this.removeMesh(t);
    this.tileGroup.clear();

    const holes = generateHoles(this.cols, CONFIG.lakeRows, CONFIG.holeChance);
    this.tiles = [];
    for (let r = 0; r < this.rows; r++) {
      const row: Tile[] = [];
      for (let c = 0; c < this.cols; c++) {
        const shore = r === 0 || r === this.rows - 1;
        const t: Tile = {
          col: c,
          row: r,
          state: shore ? 'shore' : holes[r][c] ? 'hole' : 'ice',
          timer: 0,
          total: 0,
          warned: false,
          mesh: null,
          crackMat: null,
          seed: Math.random() * 100,
        };
        if (t.state !== 'hole') {
          const mesh = shore
            ? new THREE.Mesh(this.snowGeo, this.snowMat)
            : new THREE.Mesh(this.iceGeo, this.iceMats[Math.floor(Math.random() * this.iceMats.length)]);
          mesh.position.set(this.worldX(c), shore ? -0.2 : -TILE_H / 2, this.worldZ(r));
          mesh.receiveShadow = true;
          mesh.userData.baseY = mesh.position.y;
          this.tileGroup.add(mesh);
          t.mesh = mesh;
        }
        row.push(t);
      }
      this.tiles.push(row);
    }
  }

  /**
   * An animal landed on this tile. Ice starts cracking with `time` seconds left;
   * already-cracking ice keeps the shorter of its remaining time and `time`.
   * `total` is the animal's full crack time (sets how cracked it looks).
   */
  stepOn(t: Tile, time: number, total: number): void {
    if (t.state === 'ice' && t.mesh) {
      t.state = 'cracking';
      t.timer = time;
      t.total = total;
      // Own material so it can darken independently.
      t.mesh.material = (t.mesh.material as THREE.MeshStandardMaterial).clone();
      t.mesh.userData.baseColor = (t.mesh.material as THREE.MeshStandardMaterial).color.clone();
      t.crackMat = new THREE.MeshBasicMaterial({
        map: this.crackTextures[Math.floor(Math.random() * this.crackTextures.length)],
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const crack = new THREE.Mesh(this.crackGeo, t.crackMat);
      crack.rotation.x = -Math.PI / 2;
      crack.rotation.z = Math.random() * Math.PI * 2;
      crack.position.y = TILE_H / 2 + 0.003;
      t.mesh.add(crack);
    } else if (t.state === 'cracking') {
      t.timer = Math.min(t.timer, time);
    }
  }

  update(dt: number, elapsed: number, onWarn: (t: Tile) => void, onBreak: (t: Tile) => void): void {
    for (const row of this.tiles) {
      for (const t of row) {
        if (t.state !== 'cracking' || !t.mesh) continue;
        t.timer -= dt;
        const p = Math.min(1, 1 - t.timer / t.total);
        t.crackMat!.opacity = Math.min(1, 0.35 + p * 0.9);
        if (p > CONFIG.warnAt) {
          if (!t.warned) {
            t.warned = true;
            onWarn(t);
          }
          const k = (p - CONFIG.warnAt) / (1 - CONFIG.warnAt);
          const m = t.mesh.material as THREE.MeshStandardMaterial;
          m.color.copy(t.mesh.userData.baseColor).lerp(ICE_DARK, k * 0.75);
          const w = 0.025 * k;
          t.mesh.position.x = this.worldX(t.col) + Math.sin(elapsed * 55 + t.seed) * w;
          t.mesh.position.z = this.worldZ(t.row) + Math.cos(elapsed * 47 + t.seed) * w;
          t.mesh.position.y = t.mesh.userData.baseY - k * 0.06;
          t.mesh.rotation.z = Math.sin(elapsed * 40 + t.seed) * 0.03 * k;
        }
        if (t.timer <= 0) {
          onBreak(t);
          t.state = 'hole';
          this.removeMesh(t);
        }
      }
    }
  }

  private removeMesh(t: Tile): void {
    if (!t.mesh) return;
    this.tileGroup.remove(t.mesh);
    if (t.crackMat) {
      (t.mesh.material as THREE.Material).dispose();
      t.crackMat.dispose();
    }
    t.mesh = null;
    t.crackMat = null;
  }

  /** Spawn-friendly ice material for breakage shards. */
  get shardMaterial(): THREE.Material {
    return this.iceMats[0];
  }
}
