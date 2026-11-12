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

describe('editor history', () => {
  it('undoes and redoes edits and merges quick slider moves into one step', async () => {
    const { PlateSession, chainGraph } = await import('../src/features/plates/PlateSession');
    const plates = new PlateSession(new SessionManager());
    const start = plates.getSnapshot().graph;
    const one = chainGraph(['grayscale']);
    plates.apply(one);
    expect(plates.getSnapshot().canUndo).toBe(true);
    const node = one.nodes[1];
    const withBlur = chainGraph(['grayscale', 'blur']);
    plates.apply(withBlur);
    const blur = withBlur.nodes[2];
    const slide = (strength: number) => {
      const graph = plates.getSnapshot().graph;
      plates.apply(
        {
          ...graph,
          nodes: graph.nodes.map((n) => (n.id === blur.id ? { ...n, params: { strength } } : n)),
        },
        `param:${blur.id}:strength`,
      );
    };
    slide(3);
    slide(4);
    slide(5);
    plates.undo();
    expect(plates.getSnapshot().graph).toBe(withBlur);
    plates.undo();
    expect(plates.getSnapshot().graph).toBe(one);
    expect(plates.getSnapshot().graph.nodes[1]).toBe(node);
    plates.redo();
    expect(plates.getSnapshot().graph).toBe(withBlur);
    plates.clearGraph();
    expect(plates.getSnapshot().graph).toBe(start);
    plates.undo();
    expect(plates.getSnapshot().graph).toBe(withBlur);
    plates.reset();
    expect(plates.getSnapshot().canUndo).toBe(false);
    expect(plates.getSnapshot().graph.nodes.map((n) => n.type)).toEqual(['camera', 'output']);
  });
});
