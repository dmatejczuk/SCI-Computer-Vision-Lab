import { describe, expect, it } from 'vitest';
import { deviceName } from '../src/features/phone-camera/deviceName';
describe('suggested device names', () => {
  it('suggests readable names without treating them as identity', () => {
    expect(deviceName('Mozilla iPhone AppleWebKit Safari')).toBe('iPhone · Safari');
    expect(deviceName('Mozilla Android Chrome/123')).toBe('Telefon Android · Chrome');
    expect(deviceName('Mozilla Windows Chrome/123 Edg/123')).toBe('Komputer Windows · Edge');
    expect(deviceName('unknown')).toBe('Moje urządzenie');
  });
});
