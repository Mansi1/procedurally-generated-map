/** Types for primitives.mjs - OBJ building blocks, coordinates in metres, y up. */
export type Point = readonly number[];
export type Range = readonly [number, number];
export type Axis = 'x' | 'y' | 'z';

export interface BoxOptions {
  /** Axis the prism runs along (default y). */
  axis?: Axis;
  /** Cross-section at the far end, if it tapers. */
  x?: Range;
  y?: Range;
  z?: Range;
  /** Round with n corners instead of a rectangle. */
  n?: number;
  /** Rotation of the n-gon. */
  rot?: number;
  /** Corner cut of the rectangle, 0..0.5. */
  r?: number;
}

export interface BeamOptions {
  /** Width at p1 (default: w). */
  w1?: number;
  /** Corners of the cross-section (default 4). */
  n?: number;
}

export interface Model {
  box(name: string, mtl: string, x: Range, y: Range, z: Range, o?: BoxOptions): void;
  pair(name: string, mtl: string, x: Range, y: Range, z: Range, o?: BoxOptions): void;
  extrude(name: string, mtl: string, axis: Axis, span: Range, poly: readonly (readonly [number, number])[]): void;
  beam(name: string, mtl: string, p0: Point, p1: Point, w: number, o?: BeamOptions): void;
  emit(name: string, mtl: string, bottom: readonly Point[], top: readonly Point[]): void;
  /** Free-form surface; faces index into vertices (0-based), uvs and normals one per vertex. */
  mesh(name: string, mtl: string, vertices: readonly Point[], faces: readonly (readonly number[])[], uvs?: readonly (readonly [number, number])[], normals?: readonly Point[]): void;
  /** OBJ lines written so far. */
  out: string[];
  /** Materials used so far. */
  used: Set<string>;
}

export declare function model(): Model;
