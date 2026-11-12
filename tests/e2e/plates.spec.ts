import { test, expect, type Page } from '@playwright/test';

async function openPlates(page: Page) {
  await page.goto('/?role=station');
  await page.getByRole('button', { name: 'Kamera komputera', exact: true }).click();
  const plates = page.getByRole('button', { name: /Część 1\s*Czytnik tablic/ });
  await expect(plates).toBeEnabled({ timeout: 60000 });
  await plates.click();
  await expect(page.getByRole('heading', { name: 'Czytnik tablic rejestracyjnych' })).toBeVisible();
}

test('part 1 shows the unmirrored camera, freezes a frame and keeps the stream', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openPlates(page);
  const video = page.getByLabel('Kamera (bez odbicia lustrzanego)', { exact: true }).first();
  await expect
    .poll(() => video.evaluate((v) => getComputedStyle(v).transform))
    .toMatch(/none|matrix\(1, 0, 0, 1, 0, 0\)/);
  const track = await video.evaluate(
    (v) => ((v as HTMLVideoElement).srcObject as MediaStream).getVideoTracks()[0].id,
  );
  await expect(page.getByText(/\d+ kl\.\/s/)).toBeVisible({ timeout: 60000 });
  await page.getByRole('button', { name: 'Zatrzymaj klatkę' }).click();
  await expect(page.getByText('Zatrzymana klatka')).toBeVisible();
  await page.getByRole('button', { name: 'Wróć do obrazu na żywo' }).click();
  // Switching parts keeps the same camera stream.
  await page.getByRole('button', { name: 'Część 2: AI Challenge' }).click();
  await expect(page.getByRole('heading', { name: 'Pokaż otwartą dłoń' })).toBeVisible({
    timeout: 60000,
  });
  expect(
    await page
      .locator('video')
      .evaluate((v) => ((v as HTMLVideoElement).srcObject as MediaStream).getVideoTracks()[0].id),
  ).toBe(track);
  await page.getByRole('button', { name: 'Część 1: Czytnik tablic' }).click();
  await expect(page.getByRole('heading', { name: 'Czytnik tablic rejestracyjnych' })).toBeVisible();
  expect(errors).toEqual([]);
});
