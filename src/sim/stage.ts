// What a stage is, as data. A new stage is a new Stage value plus its art: the rules in
// this folder stay the same. Values given as [start, end] ramp from the stage's first
// obstacle chunk to its last, which is how a stage gets harder towards the sea.
//
// A stage that has been used for a daily run is frozen: changing any value changes the
// river, so a recorded run would no longer replay. Bump `version` for a new layout.

/** A value at the start of the stage and at its end. */
export type Ramp = readonly [start: number, end: number];

export interface Stage {
  /** Stable identifier, used in run records and URLs, for example "canal-town". */
  readonly id: string;
  /** Bumped whenever any value below changes. */
  readonly version: number;
  /** The name players see. */
  readonly name: string;
  /** Distance from the start to the sea, in micrometres. */
  readonly length: number;
  /** Downstream speed in micrometres per tick. */
  readonly speed: Ramp;
  /** The river's half width at chunk boundaries is drawn from [min, max], in micrometres. */
  readonly halfWidth: readonly [min: number, max: number];
  readonly light: {
    /** The flame's light at the start, out of LIGHT_MAX. */
    readonly start: number;
    /** Light lost every tick. */
    readonly drain: number;
  };
  readonly rocks: {
    /** Rock rows per chunk, in hundredths: 150 is one row plus a 50% chance of a second. */
    readonly rowsPer100: Ramp;
    /** Rock radius range, in micrometres. */
    readonly radius: readonly [min: number, max: number];
    /** Width of the always-open channel through a row, in micrometres. */
    readonly channel: Ramp;
    /** Percent chance of a second rock on each side of the channel. */
    readonly second: Ramp;
  };
  readonly shrines: {
    /** Percent chance of a shrine in a chunk. */
    readonly chance: Ramp;
    /** Radius within which a shrine lends light, in micrometres. */
    readonly aura: number;
    /** Light lent per tick at the shrine itself, falling to zero at the aura's edge. */
    readonly gain: number;
  };
  readonly gates: {
    /** Percent chance that a rock row is a lantern gate instead. */
    readonly chance: Ramp;
    /** Clear width between the gate's posts, in micrometres. */
    readonly gap: Ramp;
    /** Light for passing between the posts. */
    readonly bonus: number;
  };
  readonly wind: {
    /** Percent chance of a gust in a chunk. */
    readonly chance: Ramp;
    /** Gust length range, in micrometres. */
    readonly length: readonly [min: number, max: number];
    /** Sideways push, in micrometres per tick per tick. */
    readonly push: number;
    /** Extra light lost per tick inside a gust. */
    readonly drain: number;
  };
}
