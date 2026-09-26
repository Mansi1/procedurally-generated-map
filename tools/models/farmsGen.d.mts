/** Types for farmsGen.mjs - the field models the game builds at start-up from Blender parts. */
export declare const FARM_KINDS: readonly ['wheat', 'corn', 'tomato', 'potato', 'hop'];
export declare const FIELD_PARTS: readonly string[];
export declare function farmModel(
  kind: (typeof FARM_KINDS)[number],
  detail: number,
  parts: Record<string, { obj: string; mtl: string }>,
): { obj: string; mtl: string };
