import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { plateConfig } from '../../../src/features/plates/plateConfig';
import { loadGlyphFont } from '../../../src/features/plates/recognition/font';
import {
  renderPlateScene,
  type PlateSceneOptions,
} from '../../../src/features/plates/recognition/plateImage';

/**
 * Writes a short Y4M video of a generated plate for Chromium's
 * --use-file-for-fake-video-capture, so e2e tests can point a fake camera at a plate.
 * Frames differ only by noise, like a camera looking at a still plate.
 */
export function plateVideo(text: string, scene: PlateSceneOptions = {}, frames = 8): string {
  const file = readFileSync(new URL(`../../../public${plateConfig.font.file}`, import.meta.url));
  const font = loadGlyphFont(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
  const width = 640;
  const height = 480;
  const chunks: Buffer[] = [
    Buffer.from(`YUV4MPEG2 W${width} H${height} F15:1 Ip A1:1 C420jpeg\n`, 'ascii'),
  ];
  for (let f = 0; f < frames; f++) {
    const image = renderPlateScene(font, text, { width, height, ...scene, seed: f + 1 });
    const y = Buffer.alloc(width * height);
    const u = Buffer.alloc((width / 2) * (height / 2));
    const v = Buffer.alloc((width / 2) * (height / 2));
    for (let row = 0; row < height; row++)
      for (let col = 0; col < width; col++) {
        const i = (row * width + col) * 4;
        const [r, g, b] = [image.data[i], image.data[i + 1], image.data[i + 2]];
        y[row * width + col] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        if (row % 2 === 0 && col % 2 === 0) {
          const k = (row / 2) * (width / 2) + col / 2;
          u[k] = Math.max(
            0,
            Math.min(255, Math.round(128 - 0.168736 * r - 0.331264 * g + 0.5 * b)),
          );
          v[k] = Math.max(
            0,
            Math.min(255, Math.round(128 + 0.5 * r - 0.418688 * g - 0.081312 * b)),
          );
        }
      }
    chunks.push(Buffer.from('FRAME\n', 'ascii'), y, u, v);
  }
  const directory = join(tmpdir(), 'ai-vision-e2e');
  mkdirSync(directory, { recursive: true });
  const path = join(directory, `plate-${text}-${JSON.stringify(scene).replace(/\W+/g, '')}.y4m`);
  writeFileSync(path, Buffer.concat(chunks));
  return path;
}
