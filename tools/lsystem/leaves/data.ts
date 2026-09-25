// Die erzeugten Blattdaten (leaves.json, von fetch.ts) - überall nutzbar, auch im Browser.
import json from './leaves.json';
import type { LeafName, Tone } from './sources.ts';

export type { LeafName, Tone } from './sources.ts';

export interface LeafData {
  readonly tone: Tone;
  /** Umriss in Blattlängen, Stiel bei (0, 0), Spitze bei y = 1, gegen den Uhrzeigersinn. */
  readonly outline: readonly (readonly [number, number])[];
  /** Linker und rechter Rand der Textur, in Blattlängen vom Stiel aus. */
  readonly x0: number;
  readonly x1: number;
  /** Durchschnittsfarbe des Fotos, 0..1. */
  readonly average: readonly [number, number, number];
}

export const LEAVES = json as unknown as Readonly<Record<LeafName, LeafData>>;
