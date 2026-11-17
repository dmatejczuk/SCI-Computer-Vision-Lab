// Verifies the plate reader's bundled assets before a build, like verify-model.mjs does for
// MobileNet: the OpenCV.js file that is bundled into the worker and, once configured, the
// tile font. A mismatch fails the build instead of shipping an unexpected file.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const sha256 = async (url) =>
  createHash('sha256')
    .update(await readFile(url))
    .digest('hex');

const opencv = JSON.parse(
  await readFile(new URL('src/features/plates/worker/opencv.checksum.json', root), 'utf8'),
);
const opencvUrl = new URL(`node_modules/${opencv.package}/${opencv.file}`, root);
const installed = JSON.parse(
  await readFile(new URL(`node_modules/${opencv.package}/package.json`, root), 'utf8'),
);
if (installed.version !== opencv.version)
  throw new Error(`OpenCV.js version ${installed.version} differs from ${opencv.version}`);
if ((await sha256(opencvUrl)) !== opencv.sha256)
  throw new Error(`OpenCV.js integrity failure: ${opencv.package}/${opencv.file}`);

const configUrl = new URL('src/features/plates/plates.config.json', root);
if (existsSync(configUrl)) {
  const config = JSON.parse(await readFile(configUrl, 'utf8'));
  const fontUrl = new URL(`public${config.font.file}`, root);
  const actual = await sha256(fontUrl);
  if (actual !== config.font.sha256)
    throw new Error(
      `Tile font integrity failure: ${config.font.file} (sha256 ${actual}). ` +
        'After replacing the font on purpose, put this checksum in plates.config.json.',
    );
}
console.info('Plate reader assets verified.');
