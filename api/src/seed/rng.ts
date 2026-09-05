/**
 * Small seeded PRNG (mulberry32) so the demo seed is deterministic: re-seeding on the same
 * day yields identical ids, usage curves and scores. Not for anything security-related.
 */
export class Rng {
  private state: number;

  constructor(seed: number | string = 'meridian') {
    this.state = typeof seed === 'number' ? seed >>> 0 : Rng.hash(seed);
  }

  /** FNV-1a 32-bit hash so string seeds ("usage:priya") give stable sub-streams. */
  static hash(s: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  /** Independent sub-stream keyed by name; order of calls on the parent does not matter. */
  fork(name: string): Rng {
    return new Rng(Rng.hash(`${this.state.toString(16)}:${name}`));
  }

  /** Uniform float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform float in [min, max). */
  float(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return Math.floor(this.float(min, max + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(0, items.length - 1)];
  }

  /** Approximately normal via the sum of three uniforms, clamped to [min, max]. */
  normal(mean: number, sd: number, min = -Infinity, max = Infinity): number {
    const u = (this.next() + this.next() + this.next() - 1.5) * 2; // sd ≈ 1
    return Math.min(max, Math.max(min, mean + u * sd));
  }

  /** Fisher–Yates on a copy. */
  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  /** Deterministic RFC-4122-shaped v4 UUID. */
  uuid(): string {
    const b: number[] = [];
    for (let i = 0; i < 16; i++) b.push(this.int(0, 255));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const hex = b.map((x) => x.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  /** 40-char hex string that looks like a git commit sha. */
  sha(): string {
    let s = '';
    for (let i = 0; i < 40; i++) s += this.int(0, 15).toString(16);
    return s;
  }
}
