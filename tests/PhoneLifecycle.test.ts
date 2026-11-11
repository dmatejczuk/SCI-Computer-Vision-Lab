import { expect, it, vi } from 'vitest';
import { SessionManager } from '../src/services/SessionManager';
import { RemoteCameraSource } from '../src/features/phone-camera/RemoteCameraSource';
it('cancels a pending phone config response before it can open a socket', async () => {
  let resolve!: (r: Response) => void;
  vi.stubGlobal(
    'fetch',
    () =>
      new Promise<Response>((r) => {
        resolve = r;
      }),
  );
  const source = new RemoteCameraSource(vi.fn());
  const pending = source.start({ srcObject: null } as HTMLVideoElement);
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  source.stop();
  resolve(new Response(JSON.stringify({ publicOrigin: 'https://192.0.2.10' })));
  await rejected;
  expect(source.stream).toBeNull();
  expect(source.getSnapshot().link).toBe('');
  vi.unstubAllGlobals();
});
it('stops both sources when changing source, preserves examples, then clears on reset', async () => {
  const session = new SessionManager();
  const localStop = vi.fn(),
    remoteStop = vi.fn();
  session.camera.stream = {
    getTracks: () => [{ stop: localStop, onended: null }],
  } as unknown as MediaStream;
  session.phone.stream = {
    getTracks: () => [{ stop: remoteStop, onended: null }],
  } as unknown as MediaStream;
  session.dataset.add('OPEN', new Float32Array(256));
  await session.selectSource('phone');
  expect(localStop).toHaveBeenCalledOnce();
  expect(remoteStop).toHaveBeenCalledOnce();
  expect(session.getSnapshot().source).toBe('phone');
  expect(session.dataset.counts.OPEN).toBe(1);
  await session.resetSession();
  expect(session.getSnapshot().source).toBe('local');
  expect(session.dataset.counts.OPEN).toBe(0);
});
it('never adds a captured embedding when the source stops during extraction', async () => {
  const session = new SessionManager();
  session.improve();
  session.frames.mark(1);
  session.camera.stream = { getTracks: () => [] } as unknown as MediaStream;
  vi.spyOn(session.extractor, 'extract').mockImplementation(async () => {
    session.frames.stop();
    return new Float32Array(256);
  });
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  await session.capture('OPEN');
  expect(session.dataset.counts.OPEN).toBe(0);
  expect(session.getSnapshot().error).toBeTruthy();
  await session.resetSession();
  log.mockRestore();
});
