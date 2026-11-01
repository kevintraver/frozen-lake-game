// All gameplay tuning lives here.

export type AnimalKind = 'penguin' | 'fox' | 'bear';

export interface AnimalStats {
  name: string;
  blurb: string;
  /** Seconds a tile survives after this animal lands on it. */
  crackTime: number;
  /** Seconds a single hop takes. */
  hopTime: number;
  /** Can hold Shift / long-swipe to leap 2 tiles. */
  canLeap: boolean;
  /** Base pitch (Hz) of the hop sound. */
  hopPitch: number;
}

export const ANIMALS: Record<AnimalKind, AnimalStats> = {
  penguin: {
    name: 'Penguin',
    blurb: 'Light-footed: ice holds longer, but slow hops.',
    crackTime: 1.6,
    hopTime: 0.26,
    canLeap: false,
    hopPitch: 720,
  },
  fox: {
    name: 'Fox',
    blurb: 'Quick and nimble. Normal weight.',
    crackTime: 1.0,
    hopTime: 0.14,
    canLeap: false,
    hopPitch: 560,
  },
  bear: {
    name: 'Bear',
    blurb: 'Heavy: ice breaks fast. Shift to leap 2 tiles.',
    crackTime: 0.6,
    hopTime: 0.22,
    canLeap: true,
    hopPitch: 300,
  },
};

export const ANIMAL_ORDER: AnimalKind[] = ['penguin', 'fox', 'bear'];

export const CONFIG = {
  /** Lake width in tiles. */
  cols: 9,
  /** Lake depth in tiles (excluding the two shore rows). */
  lakeRows: 20,
  /** Chance each lake tile starts as a hole. */
  holeChance: 0.2,
  /** A leap landing leaves only this fraction of the animal's crack time. */
  leapLandingFactor: 0.6,
  /** Leap hop duration multiplier. */
  leapTimeFactor: 1.6,
  /** Fraction of crack time after which the tile darkens and wobbles. */
  warnAt: 0.65,
  hopHeight: 0.35,
  leapHeight: 0.9,
  /** Seconds from falling in to showing the retry screen. */
  fallDelay: 1.0,
};
