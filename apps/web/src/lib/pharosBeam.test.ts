import { describe, it, expect } from 'vitest';
import { pose, step, turnTo, wrap, LISTEN_THETA, SPEED } from './pharosBeam';

describe('pose', () => {
  it('is long and to the right when the beam points sideways', () => {
    const p = pose(0);
    expect(p.length).toBeCloseTo(1);
    expect(p.side).toBe(1);
    expect(p.flare).toBe(0);
  });
  it('is short and flares when it points at you', () => {
    const p = pose(Math.PI / 2);
    expect(p.length).toBeCloseTo(0.12);
    expect(p.flare).toBeCloseTo(1);
    expect(p.brightness).toBeGreaterThan(pose(0).brightness);
  });
  it('goes to the left on the far half of the turn and never flares away from you', () => {
    expect(pose(Math.PI).side).toBe(-1);
    expect(pose((3 * Math.PI) / 2).flare).toBe(0);
  });
});

describe('step', () => {
  const s0 = { theta: 1, phi: 0, flash: 1 };
  it('turns at the idle speed, faster while thinking', () => {
    expect(step(s0, 'idle', 0, 1).theta).toBeCloseTo(wrap(1 + SPEED.idle));
    expect(step(s0, 'think', 0, 1).theta).toBeCloseTo(wrap(1 + SPEED.think));
  });
  it('settles toward the box while listening', () => {
    let s = { theta: 3, phi: 0, flash: 0 };
    for (let i = 0; i < 120; i++) s = step(s, 'listen', 1.2, 1 / 60);
    expect(Math.abs(turnTo(s.theta, LISTEN_THETA))).toBeLessThan(0.01);
    expect(s.phi).toBeCloseTo(1.2, 1);
  });
  it('lowers the beam again and fades the flash', () => {
    const s = step({ theta: 0, phi: 1, flash: 1 }, 'idle', 1, 0.45);
    expect(s.phi).toBeLessThan(1);
    expect(s.flash).toBeCloseTo(0.5);
  });
});

describe('turnTo', () => {
  it('takes the short way round', () => {
    expect(turnTo(0.1, Math.PI * 2 - 0.1)).toBeCloseTo(-0.2);
  });
});
