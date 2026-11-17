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
  await page.getByRole('tab', { name: /Poziom 2/ }).click();
  const launch = page.getByRole('button', { name: /Uruchom czytnik tablic/ });
  await expect(launch).toBeEnabled();
  for (const name of ['Odcienie szarości', 'Progowanie', 'Odwróć kolory'])
    await page.locator('.palette-item', { hasText: name }).first().click();
  // An unknown camera plate may have 7 or 8 characters.
  await expect(page.getByText('Znaleziono 7 znaków · tablica ma 7–8')).toBeVisible({
    timeout: 30000,
  });
  await launch.click();
  await expect(page.getByRole('img', { name: 'Odczytany tekst: PL7ABC9' })).toBeVisible({
    timeout: 30000,
  });
  // A steady, clear reading is confirmed and collected.
  await expect(page.getByText('✓ Odczytano tablicę')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.reader-collected').getByLabel('PL 7ABC9')).toBeVisible();
  await page.getByLabel('Moja tablica').fill('pl7abc8');
  await expect(page.getByRole('status').filter({ hasText: 'pomylił 1 znak' })).toBeVisible();
  await expect(page.getByText('Przeczytał „9” zamiast „8”')).toBeVisible();
  await page.getByLabel('Moja tablica').fill('PL7ABC9');
  await expect(page.getByText('Brawo!')).toBeVisible();
  await page.getByRole('button', { name: '← Wróć do edytora' }).click();
  await expect(page.locator('.block-card')).toHaveCount(5);
  expect(errors).toEqual([]);
});

test('a paired phone shows each plate the reader confirmed', async ({ browser, page }) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/phone-config', (route) =>
    route.fulfill({ json: { publicOrigin: 'https://192.0.2.10' } }),
  );
  await page.goto('/?role=station');
  await page.getByRole('button', { name: 'Telefon', exact: true }).click();
  const link = page.getByRole('link', { name: 'Otwórz link telefonu' });
  const url = new URL((await link.getAttribute('href'))!);
  const context = await browser.newContext();
  const phone = await context.newPage();
  await phone.setViewportSize({ width: 390, height: 844 });
  try {
    await phone.goto(`/phone${url.hash}`);
    await phone.getByRole('button', { name: 'Dołącz do stanowiska' }).click();
    await page.getByRole('button', { name: 'Zatwierdź telefon' }).click();
    await expect(phone.getByRole('toolbar', { name: 'Sterowanie kamerą' })).toBeVisible({
      timeout: 30000,
    });
    // The phone films the same generated plate as the fake camera.
    await page.getByRole('button', { name: /Część 1\s*Czytnik tablic/ }).click({ timeout: 60000 });
    await page.getByRole('tab', { name: /Poziom 2/ }).click();
    for (const name of ['Odcienie szarości', 'Progowanie', 'Odwróć kolory'])
      await page.locator('.palette-item', { hasText: name }).first().click();
    await page.getByRole('button', { name: /Uruchom czytnik tablic/ }).click();
    await expect(page.getByText('✓ Odczytano tablicę')).toBeVisible({ timeout: 60000 });
    // The phone announces the plate and keeps a list of read plates.
    const toast = phone.getByRole('status').filter({ hasText: 'Odczytano tablicę' });
    await expect(toast).toBeVisible({ timeout: 15000 });
    await expect(toast.getByLabel('PL 7ABC9')).toBeVisible();
    await phone.getByRole('button', { name: 'Odczytane: 1' }).click();
    await expect(
      phone.getByRole('dialog', { name: 'Odczytane tablice' }).getByLabel('PL 7ABC9'),
    ).toBeVisible();
    await phone.screenshot({ path: 'test-results/phone-plate-read.png' });
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
