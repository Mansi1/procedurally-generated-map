// Primitives for building OBJ models. File coords: metres, x = left/right,
// y = up, z = front. Every primitive becomes one `o` object. No Node APIs -
// the game builds the field models with it at start-up (farmsGen.mjs).

const ranges = (axis) => (axis === 'x' ? ['z', 'y'] : axis === 'z' ? ['x', 'y'] : ['x', 'z']);
const place = (axis, u, v, a) => (axis === 'x' ? [a, v, u] : axis === 'z' ? [u, v, a] : [u, a, v]);

function ring([u0, u1], [v0, v1], o) {
  if (o.n) {
    const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2, ru = (u1 - u0) / 2, rv = (v1 - v0) / 2;
    const off = o.rot ?? Math.PI / o.n;
    return Array.from({ length: o.n }, (_, i) => {
      const a = off + (i * 2 * Math.PI) / o.n;
      return [cu + ru * Math.cos(a), cv + rv * Math.sin(a)];
    });
  }
  const r = o.r ?? 0;
  if (r <= 0) return [[u0, v0], [u0, v1], [u1, v1], [u1, v0]];
  const cu = r * (u1 - u0), cv = r * (v1 - v0);
  return [
    [u0 + cu, v0], [u0, v0 + cv], [u0, v1 - cv], [u0 + cu, v1],
    [u1 - cu, v1], [u1, v1 - cv], [u1, v0 + cv], [u1 - cu, v0],
  ];
}

export function model() {
  const out = [];
  let base = 0;
  const used = new Set();

  /** Two outlines of equal length joined by side faces, both capped. */
  function emit(name, mtl, bottom, top) {
    used.add(mtl);
    const n = bottom.length;
    out.push(`o ${name}`);
    for (const p of [...bottom, ...top]) out.push(`v ${p.map((v) => +v.toFixed(3)).join(' ')}`);
    out.push(`usemtl ${mtl}`, 's off');
    const b = (i) => base + 1 + (i % n);
    const t = (i) => base + 1 + n + (i % n);
    out.push(`f ${bottom.map((_, i) => b(n - 1 - i)).join(' ')}`);
    out.push(`f ${top.map((_, i) => t(i)).join(' ')}`);
    for (let i = 0; i < n; i++) out.push(`f ${b(i)} ${b(i + 1)} ${t(i + 1)} ${t(i)}`);
    base += 2 * n;
  }

  /**
   * Prism along `o.axis` (default y) from the axis range; the cross-section is
   * the rect of the other two ranges, tapering to o.x/o.y/o.z at the far end.
   * o.r cuts the corners, o.n makes it an n-gon (cylinder, cone).
   */
  function box(name, mtl, x, y, z, o = {}) {
    const axis = o.axis ?? 'y';
    const R = { x, y, z };
    const T = { x: o.x ?? x, y: o.y ?? y, z: o.z ?? z };
    const [u, v] = ranges(axis);
    const [a0, a1] = R[axis];
    const bottom = ring(R[u], R[v], o).map(([pu, pv]) => place(axis, pu, pv, a0));
    const top = ring(T[u], T[v], o).map(([pu, pv]) => place(axis, pu, pv, a1));
    emit(name, mtl, bottom, top);
  }

  /** Convex outline `poly` (2D, in the plane across `axis`) extruded over [a0, a1]. */
  function extrude(name, mtl, axis, [a0, a1], poly) {
    emit(name, mtl, poly.map(([u, v]) => place(axis, u, v, a0)), poly.map(([u, v]) => place(axis, u, v, a1)));
  }

  /** Square (or o.n-sided round) beam of width w from point p0 to p1. */
  function beam(name, mtl, p0, p1, w, o = {}) {
    const d = p1.map((v, i) => v - p0[i]);
    const len = Math.hypot(...d);
    const dn = d.map((v) => v / len);
    const up = Math.abs(dn[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const norm = (a) => { const l = Math.hypot(...a); return a.map((v) => v / l); };
    const s1 = norm(cross(dn, up));
    const s2 = cross(s1, dn);
    const n = o.n ?? 4;
    const w1 = o.w1 ?? w;
    const at = (p, ww) => Array.from({ length: n }, (_, i) => {
      const a = Math.PI / n + (i * 2 * Math.PI) / n;
      const k = n === 4 ? Math.SQRT1_2 : 0.5;
      const c = Math.cos(a) * ww * k, s = Math.sin(a) * ww * k;
      return p.map((v, j) => v + s1[j] * c + s2[j] * s);
    });
    emit(name, mtl, at(p0, w), at(p1, w1));
  }

  /** Mirror in x: '#' in the name becomes L (x > 0) / R. */
  const mx = ([a, b]) => [-b, -a];
  function pair(name, mtl, x, y, z, o = {}) {
    box(name.replace('#', 'L'), mtl, x, y, z, o);
    box(name.replace('#', 'R'), mtl, mx(x), y, z, o.x ? { ...o, x: mx(o.x) } : o);
  }

  return { box, pair, extrude, beam, emit, out, used };
}

