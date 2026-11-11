import { test, expect } from '@playwright/test';

test('camera hub requires a live preview and preserves the stream on entry', async ({ page }) => {
  await page.goto('/?role=station');
  await expect(page.getByRole('heading', { name: 'Wybierz swoją kamerę' })).toBeVisible();
  const enter = page.getByRole('button', { name: 'Przejdź do AI Challenge' });
  await expect(enter).toBeDisabled();
  expect(await page.locator('video').evaluate((v) => (v as HTMLVideoElement).srcObject)).toBeNull();
  await page.screenshot({ path: 'test-results/hub-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/hub-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.getByRole('button', { name: 'Kamera komputera', exact: true }).click();
  await expect(enter).toBeEnabled({ timeout: 60000 });
  const track = await page
    .locator('video')
    .evaluate((v) => ((v as HTMLVideoElement).srcObject as MediaStream).getVideoTracks()[0].id);
  await enter.click();
  await expect(page.getByRole('heading', { name: 'Pokaż otwartą dłoń' })).toBeVisible();
  expect(
    await page
      .locator('video')
      .evaluate((v) => ((v as HTMLVideoElement).srcObject as MediaStream).getVideoTracks()[0].id),
  ).toBe(track);
});

test('phone QR replaces choices without scrolling on a laptop', async ({ page }) => {
  await page.route('**/api/phone-config', (route) =>
    route.fulfill({ json: { publicOrigin: 'https://192.0.2.10' } }),
  );
  await page.goto('/?role=station');
  await page.getByRole('button', { name: 'Telefon', exact: true }).click();
  await expect(page.getByAltText('Kod QR zaproszenia telefonu')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Wybór kamery' })).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(
    true,
  );
  await page.screenshot({ path: 'test-results/hub-qr-compact.png', fullPage: true });
  await page.getByRole('button', { name: 'Zmień kamerę', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Wybór kamery' })).toBeVisible();
  await expect(page.getByAltText('Kod QR zaproszenia telefonu')).toHaveCount(0);
});
