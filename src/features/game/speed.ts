import { config } from '../../config/settings';

/**
 * Running speed in px/s after `elapsedMs` of play: it grows steadily from `initialSpeed` by
 * `acceleration` px/s every second until it reaches `maxSpeed`. Pauses do not advance the
 * time, so a paused round continues at the same speed.
 */
export function gameSpeed(elapsedMs: number, game = config.game): number {
  const speed = game.initialSpeed + (game.acceleration * Math.max(0, elapsedMs)) / 1000;
  return Math.min(game.maxSpeed, speed);
}

/** Speed relative to the start, rounded to one decimal place for display (1.0, 1.1 … ). */
export const speedFactor = (speed: number, game = config.game) =>
  Math.round((speed / game.initialSpeed) * 10) / 10;
