/** Types for lib.mjs - so far only the parts TypeScript tools use. */
import type { Model } from './primitives.mjs';

export { model } from './primitives.mjs';
export type { Model } from './primitives.mjs';

/** Material name -> diffuse colour as the MTL line wants it ("r g b", 0..1). */
export declare const PALETTE: Readonly<Record<string, string>>;

/** Writes `<dir>/<file>.obj` and `.mtl`; `paint` is the colour of the material Paint. */
export declare function write(dir: string, file: string, header: string, m: Model, paint: string): void;
