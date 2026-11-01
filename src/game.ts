import * as THREE from 'three';
import { ANIMALS, ANIMAL_ORDER, CONFIG, type AnimalKind } from './config';
import { Lake, type Tile } from './lake';
import { buildAnimal, LABEL_HEIGHT } from './animals';
import { buildScenery } from './scenery';
import { Sfx } from './audio';

type Mode = 'select' | 'playing' | 'falling' | 'won' | 'lost';

interface Hop {
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
  col: number;
  row: number;
  t: number;
  dur: number;
  height: number;
  leap: boolean;
}

interface Effect {
  update(dt: number): boolean; // false = remove
}

const PICKER_SPACING = { wide: 2.2, portrait: 1.45 };
const isPortrait = () => window.innerWidth / window.innerHeight < 0.8;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  readonly lake = new Lake();
  private sfx = new Sfx();
  private raycaster = new THREE.Raycaster();

  mode: Mode = 'select';
  private animals: Record<AnimalKind, THREE.Group>;
  private selected = 1;
  private kind: AnimalKind = 'fox';
  col = 0;
  row = 0;
  private yaw = 0;
  private targetYaw = 0;
  private hop: Hop | null = null;
  private queued: { dc: number; dr: number; leap: boolean } | null = null;
  private squash = 0;
  private modeTime = 0;
  private elapsed = 0;
  private effects: Effect[] = [];
  private effectsGroup = new THREE.Group();
  private camPos = new THREE.Vector3(0, 2.6, 5.2);
  private camLook = new THREE.Vector3(0, 0.55, -0.3);
  private timer = new THREE.Timer();
  private overlayShown = false;

  private ui = {
    select: $<HTMLDivElement>('select-screen'),
    labels: $<HTMLDivElement>('labels'),
    hud: $<HTMLDivElement>('hud'),
    progress: $<HTMLDivElement>('progress-fill'),
    hint: $<HTMLParagraphElement>('controls-hint'),
    overlay: $<HTMLDivElement>('overlay'),
    overlayTitle: $<HTMLHeadingElement>('overlay-title'),
    overlaySub: $<HTMLParagraphElement>('overlay-sub'),
    retry: $<HTMLButtonElement>('retry-btn'),
    change: $<HTMLButtonElement>('change-btn'),
    start: $<HTMLButtonElement>('start-btn'),
    mute: $<HTMLButtonElement>('mute'),
  };
  private labelEls: HTMLDivElement[] = [];

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0xdbe9f4);
    this.scene.fog = new THREE.Fog(0xdbe9f4, 14, 38);
    this.scene.add(new THREE.HemisphereLight(0xeaf4ff, 0x8aa0b8, 1.1));
    const sun = new THREE.DirectionalLight(0xfff4e0, 1.8);
    sun.position.set(7, 14, 2);
    sun.target.position.set(0, 0, -10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 50 });
    sun.shadow.bias = -0.0005;
    this.scene.add(sun, sun.target);

    this.scene.add(this.lake.group, buildScenery(this.lake.cols, this.lake.rows), this.effectsGroup);
    this.lake.generate();

    this.animals = Object.fromEntries(ANIMAL_ORDER.map((k) => [k, buildAnimal(k)])) as Record<AnimalKind, THREE.Group>;
    for (const k of ANIMAL_ORDER) this.scene.add(this.animals[k]);

    this.buildLabels();
    this.bindInput();
    this.updateMuteButton();
    this.enterSelect();

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.timer.connect(document);
    this.renderer.setAnimationLoop((t) => this.frame(t));
  }

  // ---------- UI ----------

  private buildLabels(): void {
    const max = { hop: 0.1, crack: 1.8 };
    ANIMAL_ORDER.forEach((k, i) => {
      const a = ANIMALS[k];
      const speed = Math.max(0.1, Math.min(1, (0.32 - a.hopTime) / (0.32 - max.hop)));
      const grip = Math.min(1, a.crackTime / max.crack);
      const el = document.createElement('div');
      el.className = 'label';
      el.innerHTML = `
        <div class="name">${a.name}</div>
        <div class="stats">
          <div class="stat"><span>Speed</span><i><b style="width:${speed * 100}%"></b></i></div>
          <div class="stat"><span>Light step</span><i><b style="width:${grip * 100}%"></b></i></div>
          <div class="stat"><span>Leap</span><i><b style="width:${a.canLeap ? 100 : 0}%"></b></i></div>
          <p>${a.blurb}</p>
        </div>`;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.sfx.unlock();
        if (this.selected === i) this.startRun();
        else this.select(i);
      });
      this.ui.labels.appendChild(el);
      this.labelEls.push(el);
    });
  }

  private updateMuteButton(): void {
    this.ui.mute.textContent = this.sfx.muted ? '🔇' : '🔊';
  }

  private toggleMute(): void {
    this.sfx.unlock();
    this.sfx.setMuted(!this.sfx.muted);
    this.updateMuteButton();
  }

  private showOverlay(title: string, sub: string, retryText: string): void {
    this.ui.overlayTitle.textContent = title;
    this.ui.overlaySub.textContent = sub;
    this.ui.retry.textContent = retryText;
    this.ui.overlay.classList.remove('hidden');
    this.overlayShown = true;
  }

  private hideOverlay(): void {
    this.ui.overlay.classList.add('hidden');
    this.overlayShown = false;
  }

  // ---------- Modes ----------

  private select(i: number): void {
    this.selected = (i + ANIMAL_ORDER.length) % ANIMAL_ORDER.length;
    this.sfx.blip();
    this.labelEls.forEach((el, j) => el.classList.toggle('selected', j === this.selected));
  }

  private enterSelect(): void {
    this.mode = 'select';
    this.modeTime = 0;
    this.hop = null;
    this.queued = null;
    this.hideOverlay();
    this.lake.generate();
    ANIMAL_ORDER.forEach((k, i) => {
      const a = this.animals[k];
      a.visible = true;
      a.position.set((i - 1) * (isPortrait() ? PICKER_SPACING.portrait : PICKER_SPACING.wide), 0, 0.1);
      a.rotation.set(0, Math.PI, 0);
      a.scale.setScalar(1);
    });
    this.ui.select.classList.remove('hidden');
    this.ui.hud.classList.add('hidden');
    this.select(this.selected);
  }

  private startRun(): void {
    this.kind = ANIMAL_ORDER[this.selected];
    this.mode = 'playing';
    this.modeTime = 0;
    this.hop = null;
    this.queued = null;
    this.squash = 0;
    this.hideOverlay();
    this.clearEffects();
    this.lake.generate();
    this.col = Math.floor(this.lake.cols / 2);
    this.row = 0;
    this.yaw = this.targetYaw = 0;
    ANIMAL_ORDER.forEach((k) => (this.animals[k].visible = k === this.kind));
    const p = this.player;
    p.position.set(this.lake.worldX(this.col), 0, this.lake.worldZ(this.row));
    p.rotation.set(0, 0, 0);
    p.scale.setScalar(1);
    this.ui.select.classList.add('hidden');
    this.ui.hud.classList.remove('hidden');
    const touch = window.matchMedia('(pointer: coarse)').matches;
    const move = touch ? 'Swipe to hop' : 'Arrows / WASD to hop';
    const leap = ANIMALS[this.kind].canLeap ? (touch ? ' · Long swipe to leap' : ' · Hold Shift to leap') : '';
    this.ui.hint.textContent = move + leap;
    this.updateProgress();
  }

  private get player(): THREE.Group {
    return this.animals[this.kind];
  }

  private updateProgress(): void {
    this.ui.progress.style.width = `${(this.row / (this.lake.rows - 1)) * 100}%`;
  }

  // ---------- Input ----------

  private bindInput(): void {
    window.addEventListener('keydown', (e) => {
      this.sfx.unlock();
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      if (k === 'm') return this.toggleMute();
      if (this.mode === 'select') {
        if (k === 'arrowleft' || k === 'a') this.select(this.selected - 1);
        else if (k === 'arrowright' || k === 'd') this.select(this.selected + 1);
        else if (k === 'enter' || k === ' ') this.startRun();
        return;
      }
      if (this.overlayShown) {
        if (k === 'enter' || k === ' ' || k === 'r') this.startRun();
        else if (k === 'c') this.enterSelect();
        return;
      }
      if (this.mode !== 'playing' || e.repeat) return;
      const dirs: Record<string, [number, number]> = {
        arrowup: [0, 1], w: [0, 1],
        arrowdown: [0, -1], s: [0, -1],
        arrowleft: [-1, 0], a: [-1, 0],
        arrowright: [1, 0], d: [1, 0],
      };
      const d = dirs[k];
      if (d) this.requestMove(d[0], d[1], e.shiftKey);
    });

    // Swipes on touch screens.
    const canvas = this.renderer.domElement;
    let sx = 0;
    let sy = 0;
    let tracking = false;
    canvas.addEventListener('touchstart', (e) => {
      this.sfx.unlock();
      if (e.touches.length !== 1) return;
      tracking = true;
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
    }, { passive: true });
    canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    canvas.addEventListener('touchend', (e) => {
      if (!tracking || this.mode !== 'playing') return;
      tracking = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - sx;
      const dy = t.clientY - sy;
      const dist = Math.hypot(dx, dy);
      if (dist < 25) return;
      const long = dist > Math.max(120, 0.25 * Math.min(window.innerWidth, window.innerHeight));
      if (Math.abs(dx) > Math.abs(dy)) this.requestMove(Math.sign(dx), 0, long);
      else this.requestMove(0, dy < 0 ? 1 : -1, long);
    });

    // Click / tap animals in the picker.
    canvas.addEventListener('click', (e) => {
      this.sfx.unlock();
      if (this.mode !== 'select') return;
      const ndc = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      this.raycaster.setFromCamera(ndc, this.camera);
      const hits = this.raycaster.intersectObjects(ANIMAL_ORDER.map((k) => this.animals[k]), true);
      if (!hits.length) return;
      let o: THREE.Object3D | null = hits[0].object;
      while (o && !o.userData.kind) o = o.parent;
      if (!o) return;
      const i = ANIMAL_ORDER.indexOf(o.userData.kind as AnimalKind);
      if (i === this.selected) this.startRun();
      else this.select(i);
    });

    this.ui.start.addEventListener('click', () => {
      this.sfx.unlock();
      this.startRun();
    });
    this.ui.retry.addEventListener('click', () => this.startRun());
    this.ui.change.addEventListener('click', () => this.enterSelect());
    this.ui.mute.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleMute();
    });
  }

  private requestMove(dc: number, dr: number, leapHeld: boolean): void {
    const leap = leapHeld && ANIMALS[this.kind].canLeap;
    if (this.hop) {
      this.queued = { dc, dr, leap };
      return;
    }
    this.startHop(dc, dr, leap);
  }

  private startHop(dc: number, dr: number, leap: boolean): void {
    const a = ANIMALS[this.kind];
    let dist = leap ? 2 : 1;
    if (!this.lake.inBounds(this.col + dc * dist, this.row + dr * dist)) dist = 1;
    const nc = this.col + dc * dist;
    const nr = this.row + dr * dist;
    this.targetYaw = dr === 1 ? 0 : dr === -1 ? Math.PI : dc === -1 ? Math.PI / 2 : -Math.PI / 2;
    if (!this.lake.inBounds(nc, nr)) {
      this.squash = 0.12; // bump in place
      return;
    }
    const isLeap = dist === 2;
    this.hop = {
      fromX: this.player.position.x,
      fromZ: this.player.position.z,
      toX: this.lake.worldX(nc),
      toZ: this.lake.worldZ(nr),
      col: nc,
      row: nr,
      t: 0,
      dur: a.hopTime * (isLeap ? CONFIG.leapTimeFactor : 1),
      height: isLeap ? CONFIG.leapHeight : CONFIG.hopHeight,
      leap: isLeap,
    };
    this.sfx.hop(a.hopPitch * (isLeap ? 0.8 : 1));
  }

  private land(h: Hop): void {
    this.hop = null;
    this.col = h.col;
    this.row = h.row;
    this.squash = h.leap ? 0.2 : 0.14;
    this.updateProgress();
    const tile = this.lake.get(this.col, this.row);
    if (tile.state === 'hole') return this.fallIn();
    if (this.row === this.lake.rows - 1) return this.win();
    if (tile.state === 'ice' || tile.state === 'cracking') {
      const a = ANIMALS[this.kind];
      const wasIce = tile.state === 'ice';
      this.lake.stepOn(tile, a.crackTime * (h.leap ? CONFIG.leapLandingFactor : 1), a.crackTime);
      this.sfx.crack(h.leap ? 0.8 : wasIce ? 0.25 : 0.5);
      if (h.leap) this.spawnShards(tile, 3);
    }
    if (this.queued) {
      const q = this.queued;
      this.queued = null;
      this.startHop(q.dc, q.dr, q.leap);
    }
  }

  private fallIn(): void {
    this.mode = 'falling';
    this.modeTime = 0;
    this.queued = null;
    this.sfx.splash();
    this.spawnSplash(this.player.position.x, this.player.position.z);
  }

  private win(): void {
    this.mode = 'won';
    this.modeTime = 0;
    this.queued = null;
    this.sfx.win();
  }

  // ---------- Effects ----------

  private clearEffects(): void {
    this.effects = [];
    this.effectsGroup.clear();
  }

  private spawnShards(tile: Tile, n: number): void {
    const x0 = this.lake.worldX(tile.col);
    const z0 = this.lake.worldZ(tile.row);
    for (let i = 0; i < n; i++) {
      const s = 0.12 + Math.random() * 0.18;
      const m = new THREE.Mesh(new THREE.BoxGeometry(s, 0.08, s * 1.3), this.lake.shardMaterial);
      m.position.set(x0 + (Math.random() - 0.5) * 0.7, -0.05, z0 + (Math.random() - 0.5) * 0.7);
      m.rotation.set(Math.random(), Math.random() * 3, Math.random());
      const v = new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.6 + Math.random() * 1.2, (Math.random() - 0.5) * 1.2);
      const spin = (Math.random() - 0.5) * 8;
      this.effectsGroup.add(m);
      this.effects.push({
        update: (dt) => {
          v.y -= 9 * dt;
          m.position.addScaledVector(v, dt);
          m.rotation.x += spin * dt;
          if (m.position.y < -0.3) v.multiplyScalar(0.85); // sinking in water
          if (m.position.y < -1.2) {
            this.effectsGroup.remove(m);
            m.geometry.dispose();
            return false;
          }
          return true;
        },
      });
    }
  }

  private spawnSplash(x: number, z: number): void {
    const dropMat = new THREE.MeshStandardMaterial({ color: 0xeaf6ff, flatShading: true });
    const dropGeo = new THREE.SphereGeometry(0.06, 5, 4);
    for (let i = 0; i < 18; i++) {
      const m = new THREE.Mesh(dropGeo, dropMat);
      m.position.set(x, -0.25, z);
      const a = Math.random() * Math.PI * 2;
      const r = 0.8 + Math.random() * 1.4;
      const v = new THREE.Vector3(Math.cos(a) * r, 2.5 + Math.random() * 2.5, Math.sin(a) * r);
      this.effectsGroup.add(m);
      this.effects.push({
        update: (dt) => {
          v.y -= 12 * dt;
          m.position.addScaledVector(v, dt);
          if (m.position.y < -0.35) {
            this.effectsGroup.remove(m);
            return false;
          }
          return true;
        },
      });
    }
    for (let i = 0; i < 2; i++) {
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.38, 28), ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, -0.3, z);
      this.effectsGroup.add(ring);
      let t = -i * 0.25;
      this.effects.push({
        update: (dt) => {
          t += dt;
          if (t < 0) {
            ring.visible = false;
            return true;
          }
          ring.visible = true;
          ring.scale.setScalar(1 + t * 3);
          ringMat.opacity = Math.max(0, 0.8 - t * 0.8);
          if (t > 1) {
            this.effectsGroup.remove(ring);
            ring.geometry.dispose();
            ringMat.dispose();
            return false;
          }
          return true;
        },
      });
    }
  }

  // ---------- Loop ----------

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    // Widen the view on portrait screens so the lake width still fits.
    this.camera.fov = isPortrait() ? 68 : 50;
    this.camera.updateProjectionMatrix();
    if (this.mode === 'select') {
      ANIMAL_ORDER.forEach((k, i) => (this.animals[k].position.x = (i - 1) * (isPortrait() ? PICKER_SPACING.portrait : PICKER_SPACING.wide)));
    }
  }

  private frame(time: number): void {
    this.timer.update(time);
    const dt = Math.min(this.timer.getDelta(), 0.05);
    this.elapsed += dt;
    this.modeTime += dt;

    if (this.mode === 'playing' || this.mode === 'falling' || this.mode === 'won') {
      this.lake.update(
        dt,
        this.elapsed,
        () => this.sfx.crack(0.6),
        (tile) => {
          this.sfx.breakIce();
          this.spawnShards(tile, 4);
          if (this.mode === 'playing' && !this.hop && tile.col === this.col && tile.row === this.row) this.fallIn();
        },
      );
    }

    if (this.mode === 'select') this.updateSelect();
    else this.updatePlayer(dt);

    this.effects = this.effects.filter((e) => e.update(dt));
    this.updateCamera(dt);
    if (this.mode === 'select') this.positionLabels();
    this.renderer.render(this.scene, this.camera);
  }

  private updateSelect(): void {
    ANIMAL_ORDER.forEach((k, i) => {
      const a = this.animals[k];
      const sel = i === this.selected;
      a.position.y = sel ? Math.abs(Math.sin(this.elapsed * 4)) * 0.15 : 0;
      a.rotation.y = Math.PI + (sel ? Math.sin(this.elapsed * 1.5) * 0.4 : 0);
    });
  }

  private updatePlayer(dt: number): void {
    const p = this.player;
    // Face movement direction (shortest angle).
    let dy = this.targetYaw - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw += dy * Math.min(1, dt * 18);
    p.rotation.y = this.yaw;

    if (this.hop) {
      const h = this.hop;
      h.t = Math.min(1, h.t + dt / h.dur);
      const e = h.t;
      p.position.x = h.fromX + (h.toX - h.fromX) * e;
      p.position.z = h.fromZ + (h.toZ - h.fromZ) * e;
      p.position.y = Math.sin(Math.PI * e) * h.height;
      const stretch = Math.sin(Math.PI * e) * 0.12;
      p.scale.set(1 - stretch * 0.5, 1 + stretch, 1 - stretch * 0.5);
      if (h.t >= 1) {
        p.position.y = 0;
        this.land(h);
      }
    } else if (this.mode === 'falling') {
      const t = Math.min(1, this.modeTime / 0.7);
      p.position.y = -1.3 * t * t;
      p.rotation.x = -0.6 * t;
      if (this.modeTime > CONFIG.fallDelay && !this.overlayShown) {
        this.mode = 'lost';
        this.showOverlay('Splash!', `The ${ANIMALS[this.kind].name.toLowerCase()} fell through the ice.`, 'Try again');
      }
    } else if (this.mode === 'won') {
      p.position.y = Math.abs(Math.sin(this.modeTime * 6)) * 0.3;
      this.targetYaw = Math.PI;
      if (this.modeTime > 0.6 && !this.overlayShown) {
        this.showOverlay('You made it across!', `The ${ANIMALS[this.kind].name.toLowerCase()} is safe on the far shore.`, 'Play again');
      }
    }

    if (!this.hop && this.mode !== 'falling' && this.mode !== 'lost') {
      if (this.squash > 0) {
        const s = this.squash / 0.14;
        p.scale.set(1 + 0.15 * s, 1 - 0.25 * s, 1 + 0.15 * s);
        this.squash = Math.max(0, this.squash - dt);
      } else {
        p.scale.setScalar(1);
      }
    }
  }

  private updateCamera(dt: number): void {
    const pos = new THREE.Vector3();
    const look = new THREE.Vector3();
    if (this.mode === 'select') {
      pos.set(0, 2.6, isPortrait() ? 6.6 : 5.2);
      look.set(0, 0.55, -0.3);
    } else if (isPortrait()) {
      // Narrow screens can't fit the whole lake width, so track the player more closely.
      const p = this.player.position;
      pos.set(p.x * 0.85, 7.5, p.z + 6.2);
      look.set(p.x * 0.9, 0, p.z - 2.6);
    } else {
      const p = this.player.position;
      pos.set(p.x * 0.55, 6.2, p.z + 5.6);
      look.set(p.x * 0.8, 0, p.z - 3.2);
    }
    const k = 1 - Math.exp(-dt * 4);
    this.camPos.lerp(pos, k);
    this.camLook.lerp(look, k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }

  private positionLabels(): void {
    const v = new THREE.Vector3();
    ANIMAL_ORDER.forEach((k, i) => {
      const a = this.animals[k];
      v.set(a.position.x, LABEL_HEIGHT[k], a.position.z).project(this.camera);
      const el = this.labelEls[i];
      el.style.left = `${((v.x + 1) / 2) * window.innerWidth}px`;
      el.style.top = `${((1 - v.y) / 2) * window.innerHeight}px`;
    });
  }
}
