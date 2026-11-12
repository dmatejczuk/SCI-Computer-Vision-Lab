import { describe, expect, it } from 'vitest';
import {
  isIdentity,
  loadView,
  previewTransform,
  saveView,
} from '../src/features/phone-camera/viewTransform';
describe('phone view flips', () => {
  it('previews exactly the flips sent to the computer', () => {
    expect(isIdentity({ flipX: false, flipY: false })).toBe(true);
    expect(isIdentity({ flipX: false, flipY: true })).toBe(false);
    expect(previewTransform({ flipX: false, flipY: false })).toBeUndefined();
    expect(previewTransform({ flipX: true, flipY: false })).toBe('scale(-1, 1)');
    expect(previewTransform({ flipX: false, flipY: true })).toBe('scale(1, -1)');
    // Both flips together turn the image upside down (180°).
    expect(previewTransform({ flipX: true, flipY: true })).toBe('scale(-1, -1)');
  });
  it('persists valid settings and ignores broken or blocked storage', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    };
    saveView({ flipX: true, flipY: false }, storage);
    expect(loadView(storage)).toEqual({ flipX: true, flipY: false });
    data.set('aivision.phone.flip', '{"flipX":"yes","flipY":true}');
    expect(loadView(storage)).toEqual({ flipX: false, flipY: false });
    data.set('aivision.phone.flip', 'not json');
    expect(loadView(storage)).toEqual({ flipX: false, flipY: false });
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadView(blocked)).toEqual({ flipX: false, flipY: false });
    expect(() => saveView({ flipX: false, flipY: true }, blocked)).not.toThrow();
  });
});
