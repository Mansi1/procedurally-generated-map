// Alle Beispiel-Rezepte, nach Gruppen.
import type { Preset } from './base.ts';
import { EXOTEN } from './exoten.ts';
import { GETREIDE } from './getreide.ts';
import { KLASSIKER } from './klassiker.ts';
import { LAUBBAEUME } from './laubbaeume.ts';
import { NADELBAEUME } from './nadelbaeume.ts';
import { OBST } from './obst.ts';

export { GROUPS, type Group, type Preset } from './base.ts';

export const PRESETS = {
  ...LAUBBAEUME, ...NADELBAEUME, ...OBST, ...EXOTEN, ...GETREIDE, ...KLASSIKER,
} satisfies Record<string, Preset>;

export type PresetName = keyof typeof PRESETS;

export const isPresetName = (name: string): name is PresetName => Object.hasOwn(PRESETS, name);
