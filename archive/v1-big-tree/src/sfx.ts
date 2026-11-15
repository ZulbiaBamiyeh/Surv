import type { Sfx } from "./game";

// Tiny synthesized sound effects: no audio files, just oscillators and noise.
// Each sound has a minimum gap so a big fight stays pleasant instead of a wall of noise.

type Voice = { type: OscillatorType | "noise"; f0: number; f1: number; dur: number; vol: number; gap: number };

const V: Record<Sfx, Voice | Voice[]> = {
  shoot: { type: "triangle", f0: 520, f1: 260, dur: 0.07, vol: 0.05, gap: 0.06 },
  ring: { type: "noise", f0: 900, f1: 300, dur: 0.25, vol: 0.08, gap: 0.2 },
  ice: [{ type: "sine", f0: 1800, f1: 1200, dur: 0.12, vol: 0.05, gap: 0.15 }, { type: "noise", f0: 4000, f1: 2000, dur: 0.15, vol: 0.03, gap: 0.15 }],
  zap: { type: "sawtooth", f0: 900, f1: 120, dur: 0.12, vol: 0.04, gap: 0.08 },
  plop: { type: "sine", f0: 180, f1: 420, dur: 0.12, vol: 0.08, gap: 0.15 },
  meteor: { type: "noise", f0: 300, f1: 60, dur: 0.4, vol: 0.14, gap: 0.12 },
  hit: { type: "square", f0: 220, f1: 110, dur: 0.035, vol: 0.025, gap: 0.04 },
  pop: { type: "sine", f0: 660, f1: 990, dur: 0.06, vol: 0.04, gap: 0.035 },
  gem: { type: "sine", f0: 1320, f1: 1760, dur: 0.06, vol: 0.035, gap: 0.03 },
  level: [{ type: "triangle", f0: 523, f1: 523, dur: 0.1, vol: 0.09, gap: 0.3 }, { type: "triangle", f0: 784, f1: 784, dur: 0.18, vol: 0.09, gap: 0.3 }],
  hurt: { type: "square", f0: 300, f1: 80, dur: 0.18, vol: 0.08, gap: 0.2 },
  pickup: [{ type: "triangle", f0: 660, f1: 660, dur: 0.08, vol: 0.09, gap: 0.3 }, { type: "triangle", f0: 990, f1: 1320, dur: 0.2, vol: 0.09, gap: 0.3 }],
  magnet: { type: "sine", f0: 200, f1: 1600, dur: 0.5, vol: 0.08, gap: 0.5 },
  chest: [{ type: "triangle", f0: 784, f1: 784, dur: 0.1, vol: 0.1, gap: 0.3 }, { type: "triangle", f0: 1046, f1: 1568, dur: 0.3, vol: 0.1, gap: 0.3 }],
  danger: { type: "sawtooth", f0: 110, f1: 82, dur: 0.6, vol: 0.06, gap: 1 },
  wave: { type: "sawtooth", f0: 80, f1: 140, dur: 0.5, vol: 0.06, gap: 1 },
  spit: { type: "sine", f0: 300, f1: 160, dur: 0.08, vol: 0.03, gap: 0.12 },
  charge: { type: "square", f0: 90, f1: 140, dur: 0.25, vol: 0.04, gap: 0.3 },
  heal: { type: "sine", f0: 660, f1: 1100, dur: 0.3, vol: 0.07, gap: 0.3 },
  charm: { type: "sine", f0: 880, f1: 1320, dur: 0.25, vol: 0.06, gap: 0.3 },
  dizzy: { type: "triangle", f0: 400, f1: 700, dur: 0.3, vol: 0.05, gap: 0.3 },
  totem: { type: "triangle", f0: 160, f1: 240, dur: 0.2, vol: 0.07, gap: 0.3 },
  ward: { type: "sine", f0: 440, f1: 880, dur: 0.3, vol: 0.06, gap: 0.3 },
  unseal: [{ type: "triangle", f0: 523, f1: 523, dur: 0.12, vol: 0.1, gap: 0.5 }, { type: "triangle", f0: 659, f1: 659, dur: 0.12, vol: 0.1, gap: 0.5 }, { type: "triangle", f0: 1046, f1: 1046, dur: 0.3, vol: 0.1, gap: 0.5 }],
  stop: { type: "sine", f0: 1200, f1: 200, dur: 0.5, vol: 0.07, gap: 0.5 },
  dice: { type: "square", f0: 900, f1: 900, dur: 0.04, vol: 0.04, gap: 0.2 },
  hole: { type: "sawtooth", f0: 60, f1: 30, dur: 0.6, vol: 0.06, gap: 0.3 },
  dig: { type: "noise", f0: 600, f1: 200, dur: 0.15, vol: 0.06, gap: 0.2 },
  rewind: { type: "sine", f0: 300, f1: 1500, dur: 0.6, vol: 0.08, gap: 1 },
};

export class Sound {
  muted = false;
  private ctx: AudioContext | null = null;
  private last = new Map<Sfx, number>();
  private noise: AudioBuffer | null = null;

  constructor() {
    try {
      this.muted = localStorage.getItem("bunny-muted") === "1";
    } catch {
      /* storage can be unavailable */
    }
    // Audio may only start after a user gesture
    const unlock = () => {
      this.ensure();
      removeEventListener("pointerdown", unlock);
      removeEventListener("keydown", unlock);
    };
    addEventListener("pointerdown", unlock);
    addEventListener("keydown", unlock);
  }

  toggle(): boolean {
    this.muted = !this.muted;
    try {
      localStorage.setItem("bunny-muted", this.muted ? "1" : "0");
    } catch {
      /* ignore */
    }
    return !this.muted;
  }

  private ensure() {
    if (this.ctx) return this.ctx;
    try {
      this.ctx = new AudioContext();
      const n = this.ctx.sampleRate * 0.5;
      this.noise = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  play(name: Sfx, pitch = 1) {
    if (this.muted || !this.ctx || this.ctx.state !== "running") {
      if (this.ctx?.state === "suspended") void this.ctx.resume();
      return;
    }
    const voices = Array.isArray(V[name]) ? (V[name] as Voice[]) : [V[name] as Voice];
    const now = this.ctx.currentTime;
    const prev = this.last.get(name) ?? -1;
    if (now - prev < voices[0].gap) return;
    this.last.set(name, now);
    let at = now;
    const jitter = 1 + (Math.random() - 0.5) * 0.08;
    for (const v of voices) {
      this.voice(v, at, pitch * jitter);
      if (voices.length > 1) at += v.dur * 0.8;
    }
  }

  private voice(v: Voice, at: number, pitch: number) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(v.vol, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, at + v.dur);
    g.connect(ctx.destination);
    if (v.type === "noise") {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.setValueAtTime(v.f0 * pitch, at);
      f.frequency.exponentialRampToValueAtTime(Math.max(20, v.f1 * pitch), at + v.dur);
      src.connect(f).connect(g);
      src.start(at);
      src.stop(at + v.dur + 0.02);
    } else {
      const o = ctx.createOscillator();
      o.type = v.type;
      o.frequency.setValueAtTime(v.f0 * pitch, at);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, v.f1 * pitch), at + v.dur);
      o.connect(g);
      o.start(at);
      o.stop(at + v.dur + 0.02);
    }
  }
}
