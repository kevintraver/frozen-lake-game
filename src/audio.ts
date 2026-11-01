/** Tiny synthesized sound effects via Web Audio — no asset files. */
const MUTE_KEY = 'frozen-lake-muted';

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  muted = localStorage.getItem(MUTE_KEY) === '1';

  /** Must be called from a user gesture before sounds can play. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.6;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    localStorage.setItem(MUTE_KEY, m ? '1' : '0');
    if (this.master) this.master.gain.value = m ? 0 : 0.6;
  }

  private env(gain: number, when: number, dur: number): GainNode | null {
    if (!this.ctx || !this.master) return null;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    g.connect(this.master);
    return g;
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0, freqEnd?: number): void {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const g = this.env(gain, t, dur);
    if (!g) return;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    o.connect(g);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, type: BiquadFilterType, freq: number, gain: number, delay = 0, freqEnd?: number, q = 1): void {
    if (!this.ctx || !this.noiseBuf || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const g = this.env(gain, t, dur);
    if (!g) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    src.connect(f).connect(g);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  hop(pitch: number): void {
    this.tone(pitch, 0.09, 'sine', 0.18, 0, pitch * 1.5);
  }

  /** Ice starting to crack; intensity 0..1. */
  crack(intensity = 0.3): void {
    const n = 2 + Math.round(intensity * 4);
    for (let i = 0; i < n; i++) {
      this.noise(0.035, 'highpass', 2500 + Math.random() * 3000, 0.25 + intensity * 0.2, i * 0.03 + Math.random() * 0.02);
    }
  }

  breakIce(): void {
    this.noise(0.3, 'bandpass', 1400, 0.45, 0, 250, 0.8);
    this.crack(1);
  }

  splash(): void {
    this.noise(0.7, 'lowpass', 2500, 0.6, 0, 180);
    this.tone(140, 0.35, 'sine', 0.3, 0, 55);
  }

  win(): void {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.22, i * 0.11));
  }

  blip(): void {
    this.tone(660, 0.06, 'triangle', 0.12);
  }
}
