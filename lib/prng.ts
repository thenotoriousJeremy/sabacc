export type Rng = () => number;

/** FNV-1a 32-bit string hash for deterministic daily seeds. */
export function hashSeed(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mulberry32 deterministic PRNG returning [0, 1). */
export function createSeededRng(seed: string | number): Rng {
  let state = typeof seed === 'number' ? seed >>> 0 : hashSeed(seed);
  if (state === 0) state = 0x9e3779b9;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomIntFrom(rng: Rng, maxExclusive: number): number {
  return Math.floor(rng() * maxExclusive);
}
