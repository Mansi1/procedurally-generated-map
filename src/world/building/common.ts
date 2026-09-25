// common.ts
// Was die Gebäudeklassen schon beim Laden ihrer Definition brauchen - ohne
// Abhängigkeit von catalog.ts, das seinerseits die Klassen lädt.

import type { GatherType } from '../catalog';

/** Was ein Dorfbewohner sammeln kann. */
export const GATHER_TYPES: readonly GatherType[] = ['wood', 'stone', 'gold', 'berries'];

/** Untergründe, auf denen überhaupt gebaut werden kann. */
export const BUILDABLE = ['beach', 'desert', 'grass', 'forest', 'snow'] as const;
