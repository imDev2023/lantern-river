// Where the river's straightened frame lands in the 3D world. The bends are drawn only:
// the rules never see them (src/sim/world.ts). Distances here are metres as floats.

/** The centre line's sideways position at s metres downstream. */
export function bend(s: number): number {
  return 7 * Math.sin(s / 41) + 3.5 * Math.sin(s / 17 + 1.3);
}

function bendSlope(s: number): number {
  return (7 / 41) * Math.cos(s / 41) + (3.5 / 17) * Math.cos(s / 17 + 1.3);
}

export interface Frame {
  /** The centre line's point. */
  readonly px: number;
  readonly pz: number;
  /** Unit vector to the right, looking downstream. */
  readonly rx: number;
  readonly rz: number;
  /** Heading: rotation about Y that turns -Z (forward) along the river. */
  readonly yaw: number;
}

/** The river's frame at s metres: downstream runs along -Z, bending sideways along X. */
export function frameAt(s: number): Frame {
  const a = bendSlope(s);
  const n = Math.hypot(1, a);
  return { px: bend(s), pz: -s, rx: 1 / n, rz: a / n, yaw: -Math.atan(a) };
}

/** World X and Z of the point x metres right of the centre line at s metres. */
export function place(s: number, x: number): [number, number] {
  const f = frameAt(s);
  return [f.px + x * f.rx, f.pz + x * f.rz];
}
