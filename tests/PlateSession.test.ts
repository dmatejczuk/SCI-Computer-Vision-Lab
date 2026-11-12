import { describe, expect, it, vi } from 'vitest';
import { SessionManager } from '../src/services/SessionManager';
import {
  adaptWidth,
  FULL_WIDTH,
  REDUCED_WIDTH,
  SLOW_PASS_MS,
} from '../src/features/plates/PlateSession';

function fakeVideo() {
  return {
    srcObject: null as unknown,
    play: vi.fn(async () => {}),
    getVideoPlaybackQuality: () => ({ totalVideoFrames: 1 }),
    currentTime: 0,
  } as unknown as HTMLVideoElement;
}

describe('plate module integration with the session', () => {
  it('switches frame monitoring to the plate video and back without touching the source', () => {
    const session = new SessionManager();
    const main = fakeVideo();
    const plates = fakeVideo();
    const stream = { id: 'stream' } as unknown as MediaStream;
    session.attachVideo(main);
    session.camera.stream = stream;
    session.enterPlates(plates);
    expect(session.getSnapshot().mode).toBe('plates');
    expect(plates.srcObject).toBe(stream);
    expect(session.activeVideo).toBe(plates);
    session.leavePlates();
    expect(session.getSnapshot().mode).toBe('gestures');
    expect(plates.srcObject).toBeNull();
    expect(main.srcObject).toBe(stream);
    expect(session.activeVideo).toBe(main);
    session.frames.stop();
    session.camera.stream = null;
  });

  it('runs registered reset handlers on "Nowa grupa" and leaves plate mode', async () => {
    const session = new SessionManager();
    const handler = vi.fn();
    const unsubscribe = session.onReset(handler);
    session.attachVideo(fakeVideo());
    session.enterPlates(fakeVideo());
    await session.resetSession();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot().mode).toBe('gestures');
    expect(session.activeVideo).not.toBeNull();
    unsubscribe();
    await session.resetSession();
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('working resolution', () => {
  it('drops to 320 px when passes are slow and returns when they are fast again', () => {
    expect(adaptWidth(FULL_WIDTH, [10, 12])).toBe(FULL_WIDTH);
    const slow = Array(5).fill(SLOW_PASS_MS + 5);
    expect(adaptWidth(FULL_WIDTH, slow)).toBe(REDUCED_WIDTH);
    expect(adaptWidth(REDUCED_WIDTH, Array(5).fill(30))).toBe(REDUCED_WIDTH);
    expect(adaptWidth(REDUCED_WIDTH, Array(5).fill(5))).toBe(FULL_WIDTH);
  });
});
