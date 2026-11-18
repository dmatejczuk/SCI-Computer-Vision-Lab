import { describe, expect, it } from 'vitest';
import { config } from '../src/config/settings';
import { gameSpeed, speedFactor } from '../src/features/game/speed';

describe('game speed', () => {
  const { initialSpeed, acceleration, maxSpeed, gravity, jumpVelocity } = config.game;

  it('starts at the initial speed and grows noticeably every second', () => {
    expect(gameSpeed(0)).toBe(initialSpeed);
    expect(gameSpeed(10000)).toBe(initialSpeed + acceleration * 10);
    // After 20 s the game is clearly faster (at least 30 %).
    expect(gameSpeed(20000) / initialSpeed).toBeGreaterThanOrEqual(1.3);
  });

  it('never exceeds the maximum and never goes below the start', () => {
    expect(gameSpeed(10 * 60 * 1000)).toBe(maxSpeed);
    expect(gameSpeed(-500)).toBe(initialSpeed);
    for (let ms = 0; ms < 120000; ms += 1000)
      expect(gameSpeed(ms + 1000)).toBeGreaterThanOrEqual(gameSpeed(ms));
  });

  it('reaches the top speed within about a minute', () => {
    const seconds = (maxSpeed - initialSpeed) / acceleration;
    expect(seconds).toBeGreaterThan(30);
    expect(seconds).toBeLessThan(90);
  });

  it('keeps obstacles clearable at the top speed', () => {
    // Time above the 42 px obstacle (hitbox 39 px) and time the hitboxes overlap at maxSpeed.
    const v = -jumpVelocity,
      height = 39;
    const discriminant = v * v - 2 * gravity * height;
    const airAbove = (2 * Math.sqrt(discriminant)) / gravity;
    const overlap = (28 + 28) / maxSpeed;
    expect(airAbove - overlap).toBeGreaterThan(0.4);
  });

  it('shows the tempo with one decimal place', () => {
    expect(speedFactor(initialSpeed)).toBe(1);
    expect(speedFactor(initialSpeed * 1.44)).toBe(1.4);
    expect(speedFactor(maxSpeed)).toBe(Math.round((maxSpeed / initialSpeed) * 10) / 10);
  });
});
