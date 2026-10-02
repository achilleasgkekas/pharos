// The lighthouse beam behind the AI bar, as plain numbers so the motion can be tested.
// The beam turns around the tower (theta, radians). Seen from the side, a beam that points
// at you looks short and bright, one that points sideways looks long; `pose` turns the
// angle into what is drawn: how long, which side, how bright, and how much the lamp flares.

export type BeamMode = 'idle' | 'listen' | 'think';

/** Radians per second: one slow turn in about 6 s at rest, under 2 s while the AI thinks. */
export const SPEED: Record<BeamMode, number> = { idle: 1.05, listen: 0, think: 3.6 };

/** While you type the beam settles here: nearly sideways, so it reaches the box. */
export const LISTEN_THETA = 0.28;

const TAU = Math.PI * 2;

export function wrap(a: number): number {
  return ((a % TAU) + TAU) % TAU;
}

/** Shortest signed turn from a to b. */
export function turnTo(a: number, b: number): number {
  const d = wrap(b - a);
  return d > Math.PI ? d - TAU : d;
}

/** Ease `from` toward `to`, frame-rate independent (`rate` per second). */
export function ease(from: number, to: number, dt: number, rate = 6): number {
  return from + (to - from) * (1 - Math.exp(-rate * dt));
}

export type Pose = {
  /** 0..1 of the full beam length on screen. */
  length: number;
  /** 1 = the beam goes to the right of the lamp, -1 = to the left. */
  side: 1 | -1;
  /** 0..1 beam opacity. */
  brightness: number;
  /** 0..1 lamp flare: strongest when the beam points at you. */
  flare: number;
};

export function pose(theta: number): Pose {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const toward = Math.max(0, s); // > 0: the beam swings toward the viewer
  return {
    length: 0.12 + 0.88 * Math.abs(c),
    side: c >= 0 ? 1 : -1,
    brightness: 0.35 + 0.45 * toward + 0.2 * Math.abs(c),
    flare: toward ** 6,
  };
}

/** One animation step. `aim` is the elevation (radians, up from horizontal) toward the box. */
export function step(
  state: { theta: number; phi: number; flash: number },
  mode: BeamMode,
  aim: number,
  dt: number
): { theta: number; phi: number; flash: number } {
  const theta =
    mode === 'listen' ? state.theta + turnTo(state.theta, LISTEN_THETA) * (1 - Math.exp(-5 * dt)) : wrap(state.theta + SPEED[mode] * dt);
  const phi = ease(state.phi, mode === 'listen' ? aim : 0, dt, 5);
  return { theta, phi, flash: Math.max(0, state.flash - dt / 0.9) };
}
