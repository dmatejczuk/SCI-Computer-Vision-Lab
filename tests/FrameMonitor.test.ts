import { expect, it, vi } from 'vitest';
import { FrameMonitor } from '../src/features/camera/FrameMonitor';
it('does not treat a repeated frame as fresh and clears freshness on stop', () => {
  let now = 100;
  const monitor = new FrameMonitor(vi.fn(), () => now);
  expect(monitor.fresh).toBe(false);
  monitor.mark(1);
  expect(monitor.fresh).toBe(true);
  now += 2100;
  monitor.mark(1);
  expect(monitor.fresh).toBe(false);
  monitor.mark(2);
  expect(monitor.fresh).toBe(true);
  monitor.stop();
  expect(monitor.fresh).toBe(false);
});
