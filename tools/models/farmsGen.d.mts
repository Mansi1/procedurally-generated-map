/** Types for farmsGen.mjs - the field models the game builds at start-up. */
export declare const FARM_KINDS: readonly ['wheat', 'corn'];
export declare function farmModel(kind: (typeof FARM_KINDS)[number], detail?: number): { obj: string; mtl: string };
