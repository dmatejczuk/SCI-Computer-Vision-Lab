import { expect, it, vi } from 'vitest';
import { PeerConnectionController } from '../src/features/phone-camera/PeerConnectionController';
import type { SignalingClient } from '../src/features/phone-camera/SignalingClient';
it('queues early ICE until the answer and ignores stale generations / events after stop', async () => {
  const added: unknown[] = [],
    sent: string[] = [];
  class Peer {
    signalingState = 'stable';
    remoteDescription: unknown = null;
    localDescription = { sdp: 'offer' };
    addTrack() {
      return { getParameters: () => ({ encodings: [] }) };
    }
    async createOffer() {
      return { type: 'offer', sdp: 'offer' };
    }
    async setLocalDescription() {
      this.signalingState = 'have-local-offer';
    }
    async setRemoteDescription(value: unknown) {
      this.remoteDescription = value;
      this.signalingState = 'stable';
    }
    async addIceCandidate(value: unknown) {
      added.push(value);
    }
    close() {
      this.signalingState = 'closed';
    }
  }
  vi.stubGlobal('RTCPeerConnection', Peer);
  const controller = new PeerConnectionController(
    'phone',
    { send: (type: string) => sent.push(type) } as unknown as SignalingClient,
    { type: 'approved' },
    vi.fn(),
    vi.fn(),
  );
  try {
    await controller.sendStream({ getVideoTracks: () => [{}] } as MediaStream);
    controller.handle({ type: 'ice', generation: 1, candidate: { candidate: 'first' } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(added).toEqual([]);
    controller.handle({ type: 'answer', generation: 1, sdp: 'answer' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(added).toEqual([{ candidate: 'first' }]);
    controller.handle({ type: 'ice', generation: 0, candidate: { candidate: 'stale' } });
    controller.stop();
    controller.handle({ type: 'restart' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sent).toEqual(['offer']);
    expect(added).toHaveLength(1);
  } finally {
    controller.stop();
    vi.unstubAllGlobals();
  }
});
it('waits out brief disconnects and gives every incident a fresh recovery budget', () => {
  vi.useFakeTimers();
  const sent: string[] = [],
    failure = vi.fn();
  class Peer {
    connectionState = 'new';
    onconnectionstatechange: (() => void) | null = null;
    close() {}
  }
  vi.stubGlobal('RTCPeerConnection', Peer);
  const controller = new PeerConnectionController(
    'owner',
    { send: (type: string) => sent.push(type) } as unknown as SignalingClient,
    { type: 'approved' },
    vi.fn(),
    failure,
  );
  const pc = controller.pc as unknown as Peer;
  const state = (value: string) => {
    pc.connectionState = value;
    pc.onconnectionstatechange?.();
  };
  try {
    state('connected');
    for (let incident = 0; incident < 3; incident++) {
      state('disconnected');
      vi.advanceTimersByTime(3000);
      expect(sent).toHaveLength(incident);
      vi.advanceTimersByTime(1000);
      expect(sent).toHaveLength(incident + 1);
      state('connected');
    }
    state('disconnected');
    state('connected');
    vi.advanceTimersByTime(20000);
    expect(sent).toEqual(['restart', 'restart', 'restart']);
    expect(failure).not.toHaveBeenCalled();
  } finally {
    controller.stop();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
