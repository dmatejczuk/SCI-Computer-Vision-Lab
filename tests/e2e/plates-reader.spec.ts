import { test, expect } from '@playwright/test';
import { plateVideo } from './helpers/plateVideo';

// The fake camera shows a generated plate (Chromium plays the Y4M file in a loop).
const video = plateVideo('PL7ABC9', { plateWidth: 0.7 });
test.use({
  launchOptions: {
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      `--use-file-for-fake-video-capture=${video}`,
    ],
  },
});

test('plate reader reads a plate from the camera and compares it with "Moja tablica"', async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?role=station');
  await page.getByRole('button', { name: 'Kamera komputera', exact: true }).click();
  await page.getByRole('button', { name: /Część 1\s*Czytnik tablic/ }).click({ timeout: 60000 });
  const launch = page.getByRole('button', { name: /Uruchom czytnik tablic/ });
  await expect(launch).toBeDisabled();
  for (const name of ['Odcienie szarości', 'Progowanie', 'Odwróć kolory'])
    await page.locator('.palette-item', { hasText: name }).first().click();
  await expect(page.getByText('Znaleziono 7 / 7 znaków')).toBeVisible({ timeout: 30000 });
  await launch.click();
  await expect(page.getByRole('list', { name: 'Odczytany tekst: PL7ABC9' })).toBeVisible({
    timeout: 30000,
  });
  await page.getByLabel('Moja tablica').fill('pl7abc8');
  await expect(page.getByRole('status').filter({ hasText: 'pomylił 1 znak' })).toBeVisible();
  await expect(page.getByText('Przeczytał „9” zamiast „8”')).toBeVisible();
  await page.getByLabel('Moja tablica').fill('PL7ABC9');
  await expect(page.getByText('Brawo!')).toBeVisible();
  await page.getByRole('button', { name: '← Wróć do edytora' }).click();
  await expect(page.locator('.block-card')).toHaveCount(5);
  expect(errors).toEqual([]);
});
