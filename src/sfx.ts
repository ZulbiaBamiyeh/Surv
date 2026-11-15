import type { Sfx } from "./game";

// Synthesized sound: no audio files, just oscillators and noise.
// Each effect has a minimum gap so a big fight stays pleasant instead of a wall of noise.
// The music is a slow, generated lullaby that gains a bass and a quicker pulse as the night goes on.

type Voice = { type: OscillatorType | "noise"; f0: number; f1: number; dur: number; vol: number; gap: number };
const tri = (f: number, dur: number, vol = 0.09): Voice => ({ type: "triangle", f0: f, f1: f, dur, vol, gap: 0.3 });

const V: Record<Sfx, Voice | Voice[]> = {
  bolt: { type: "triangle", f0: 660, f1: 330, dur: 0.06, vol: 0.04, gap: 0.07 },
  flame: { type: "noise", f0: 1200, f1: 400, dur: 0.2, vol: 0.06, gap: 0.2 },
  frost: [{ type: "sine", f0: 1800, f1: 1200, dur: 0.12, vol: 0.05, gap: 0.15 }, { type: "noise", f0: 4000, f1: 2000, dur: 0.15, vol: 0.03, gap: 0.15 }],
  zap: { type: "sawtooth", f0: 900, f1: 120, dur: 0.12, vol: 0.04, gap: 0.08 },
  plop: { type: "sine", f0: 180, f1: 420, dur: 0.12, vol: 0.07, gap: 0.15 },
  pool: { type: "sine", f0: 300, f1: 90, dur: 0.5, vol: 0.06, gap: 0.3 },
  burst: { type: "noise", f0: 400, f1: 80, dur: 0.35, vol: 0.12, gap: 0.12 },
  hit: { type: "square", f0: 220, f1: 110, dur: 0.035, vol: 0.022, gap: 0.045 },
  pop: { type: "sine", f0: 660, f1: 990, dur: 0.06, vol: 0.035, gap: 0.04 },
  gem: { type: "sine", f0: 1320, f1: 1760, dur: 0.06, vol: 0.03, gap: 0.035 },
  level: [tri(523, 0.1), tri(784, 0.2)],
  hurt: { type: "square", f0: 300, f1: 80, dur: 0.18, vol: 0.08, gap: 0.2 },
  magnet: { type: "sine", f0: 200, f1: 1600, dur: 0.5, vol: 0.07, gap: 0.5 },
  heal: { type: "sine", f0: 660, f1: 1100, dur: 0.3, vol: 0.07, gap: 0.3 },
  charm: { type: "sine", f0: 880, f1: 1320, dur: 0.25, vol: 0.06, gap: 0.3 },
  dice: { type: "square", f0: 900, f1: 900, dur: 0.04, vol: 0.04, gap: 0.2 },
  wave: { type: "sawtooth", f0: 80, f1: 140, dur: 0.5, vol: 0.06, gap: 1 },
  spit: { type: "sine", f0: 300, f1: 160, dur: 0.08, vol: 0.03, gap: 0.12 },
  charge: { type: "square", f0: 90, f1: 140, dur: 0.25, vol: 0.04, gap: 0.3 },
  boss: [{ type: "sawtooth", f0: 110, f1: 82, dur: 0.5, vol: 0.08, gap: 1 }, { type: "sawtooth", f0: 82, f1: 55, dur: 0.7, vol: 0.08, gap: 1 }],
  bossDown: [tri(392, 0.12), tri(523, 0.12), tri(659, 0.12), tri(1046, 0.4)],
  starfall: { type: "sine", f0: 2400, f1: 500, dur: 1.2, vol: 0.06, gap: 1 },
  starLand: [{ type: "noise", f0: 500, f1: 100, dur: 0.3, vol: 0.12, gap: 0.5 }, tri(1046, 0.3, 0.07)],
  discover: [tri(523, 0.14), tri(659, 0.14), tri(784, 0.14), tri(1046, 0.14), tri(1318, 0.5)],
  dawn: [tri(392, 0.25), tri(523, 0.25), tri(659, 0.25), tri(784, 0.25), tri(1046, 0.8)],
  over: [tri(392, 0.2), tri(330, 0.2), tri(262, 0.5)],
  tap: { type: "sine", f0: 880, f1: 880, dur: 0.04, vol: 0.04, gap: 0.03 },
  light: [tri(784, 0.08, 0.07), tri(1174, 0.22, 0.07)],
};

// A minor pentatonic lullaby: scale degrees as semitones above the root
const SCALE = [0, 3, 5, 7, 10, 12, 15, 17];
const ROOT = 220;

export class Sound {
  sfxOn = true;
  musicOn = true;
  /** 0 to 1: how far into the night we are. Later means a fuller, quicker tune. */
  intensity = 0;
  private ctx: AudioContext | null = null;
  private last = new Map<Sfx, number>();
  private noise: AudioBuffer | null = null;
  private music: GainNode | null = null;
  private nextNote = 0;
  private beat = 0;
  private playing = false;

  constructor() {
    // Audio may only start after a user gesture
    const unlock = () => {
      this.ensure();
      void this.ctx?.resume();
    };
    addEventListener("pointerdown", unlock);
    addEventListener("keydown", unlock);
    setInterval(() => this.tickMusic(), 120);
  }

  private ensure() {
    if (this.ctx) return this.ctx;
    try {
      this.ctx = new AudioContext();
      const n = this.ctx.sampleRate * 0.5;
      this.noise = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      this.music = this.ctx.createGain();
      this.music.gain.value = 0;
      this.music.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  play(name: Sfx, pitch = 1) {
    if (!this.sfxOn || !this.ctx || this.ctx.state !== "running") return;
    const voices = Array.isArray(V[name]) ? (V[name] as Voice[]) : [V[name] as Voice];
    const now = this.ctx.currentTime;
    if (now - (this.last.get(name) ?? -1) < voices[0].gap) return;
    this.last.set(name, now);
    let at = now;
    const jitter = voices.length > 1 ? 1 : 1 + (Math.random() - 0.5) * 0.08;
    for (const v of voices) {
      this.voice(v, at, pitch * jitter, this.ctx.destination);
      if (voices.length > 1) at += v.dur * 0.8;
    }
  }

  private voice(v: Voice, at: number, pitch: number, out: AudioNode) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(v.vol, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, at + v.dur);
    g.connect(out);
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

  /** Starts or stops the music (it fades). */
  setPlaying(on: boolean) {
    this.playing = on;
    if (!this.ctx || !this.music) return;
    const t = this.ctx.currentTime;
    this.music.gain.cancelScheduledValues(t);
    this.music.gain.setTargetAtTime(on && this.musicOn ? 1 : 0, t, 0.4);
  }

  /** Schedules the next few notes a little ahead of time. */
  private tickMusic() {
    const ctx = this.ctx;
    if (!ctx || !this.music || ctx.state !== "running" || !this.playing || !this.musicOn) return;
    const step = 0.42 - this.intensity * 0.14;
    if (this.nextNote < ctx.currentTime) this.nextNote = ctx.currentTime + 0.05;
    while (this.nextNote < ctx.currentTime + 0.4) {
      const b = this.beat++;
      const at = this.nextNote;
      const note = (deg: number, oct: number, dur: number, vol: number, type: OscillatorType) =>
        this.voice({ type, f0: ROOT * oct * 2 ** (SCALE[deg % SCALE.length] / 12), f1: ROOT * oct * 2 ** (SCALE[deg % SCALE.length] / 12), dur, vol, gap: 0 }, at, 1, this.music!);
      // A wandering melody: mostly steps, sometimes rests
      const bar = Math.floor(b / 8);
      const seed = Math.sin(b * 12.9898 + bar * 78.233) * 43758.5453;
      const r = seed - Math.floor(seed);
      if (b % 2 === 0 || r > 0.55 - this.intensity * 0.3) note(Math.floor(r * 6) + (bar % 2 ? 1 : 0), 2, step * 2.2, 0.022, "triangle");
      // A soft bass on the bar, from a third of the way into the night
      if (b % 8 === 0) note([0, 3, 1, 2][bar % 4], 0.5, step * 7, this.intensity > 0.3 ? 0.05 : 0.03, "sine");
      if (this.intensity > 0.6 && b % 4 === 2) note([0, 3, 1, 2][bar % 4] + 2, 1, step * 1.5, 0.018, "sine");
      this.nextNote += step;
    }
  }
}
