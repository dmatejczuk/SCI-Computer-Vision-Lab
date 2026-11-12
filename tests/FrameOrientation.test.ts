import { describe, expect, it } from 'vitest';
import { PlateSession } from '../src/features/plates/PlateSession';
import { frameGeometry, UPRIGHT } from '../src/features/plates/VisionClient';
import { SessionManager } from '../src/services/SessionManager';

describe('camera frame orientation for the plate reader', () => {
  it('keeps a landscape frame and scales it to the working width', () => {
    const g = frameGeometry(1280, 720, UPRIGHT, 640);
    expect(g).toMatchObject({ width: 640, height: 360, crop: { top: 0, height: 720 } });
  });

  it('crops a portrait phone frame to a centred 4:3 landscape strip', () => {
    const g = frameGeometry(720, 1280, UPRIGHT, 640);
    expect(g.crop).toEqual({ top: 370, height: 540 });
    expect(g).toMatchObject({ width: 640, height: 480 });
  });

  it('turns a sideways frame upright with a quarter rotation', () => {
    const g = frameGeometry(720, 1280, { rotate: 90, mirror: false }, 640);
    expect(g.rotated).toEqual({ width: 1280, height: 720 });
    expect(g).toMatchObject({ width: 640, height: 360 });
    expect(frameGeometry(720, 1280, { rotate: 270, mirror: true }, 640).rotated.width).toBe(1280);
    expect(frameGeometry(640, 480, { rotate: 180, mirror: false }, 640)).toMatchObject({
      width: 640,
      height: 480,
    });
  });

  it('never enlarges a small frame', () => {
    expect(frameGeometry(320, 240, UPRIGHT, 640)).toMatchObject({ width: 320, height: 240 });
  });

  it('rotates in quarter turns and keeps the setting for the next group', () => {
    const plates = new PlateSession(new SessionManager());
    plates.rotate();
    plates.rotate();
    plates.rotate();
    expect(plates.getSnapshot().orientation.rotate).toBe(270);
    plates.rotate();
    expect(plates.getSnapshot().orientation.rotate).toBe(0);
    plates.rotate(false);
    plates.setOrientation({ mirror: true });
    expect(plates.getSnapshot().orientation).toEqual({ rotate: 270, mirror: true });
    plates.reset();
    expect(plates.getSnapshot().orientation).toEqual({ rotate: 270, mirror: true });
  });
});
