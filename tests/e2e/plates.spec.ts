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
  // Level 2 uses the camera (level 1 has a built-in plate photo).
  await page.getByRole('tab', { name: /Poziom 2/ }).click();
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

test('node editor inserts blocks, explains wrong ones and undoes changes', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openPlates(page);
  const output = page.locator('.block-card[data-block="output"]');
  await expect(output.locator('.block-problem')).toContainText('czarno-biały');
  // Dragging "Progowanie" onto the colour wire is refused with an explanation.
  const wire = await page.locator('[data-testid^="rf__edge-"]').first().boundingBox();
  const canvas = page.locator('.node-canvas');
  const origin = (await canvas.boundingBox())!;
  await page
    .locator('.palette-item', { hasText: 'Progowanie' })
    .first()
    .dragTo(canvas, {
      targetPosition: {
        x: wire!.x + wire!.width / 2 - origin.x,
        y: wire!.y + wire!.height / 2 - origin.y,
      },
    });
  await expect(page.locator('.editor-bubble')).toContainText('Odcienie szarości');
  for (const name of ['Odcienie szarości', 'Progowanie', 'Odwróć kolory'])
    await page.locator('.palette-item', { hasText: name }).first().click();
  await expect(page.locator('.block-card')).toHaveCount(5);
  await expect(output.locator('.block-problem')).toHaveCount(0);
  await expect(page.locator('.wire-problem')).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(page.locator('.block-card')).toHaveCount(4);
  await page.keyboard.press('Control+y');
  await expect(page.locator('.block-card')).toHaveCount(5);
  // Delete the threshold block: the chain stays connected (now with a red wire).
  await page.locator('.block-card[data-block="threshold"] .block-delete').click();
  await expect(page.locator('.block-card')).toHaveCount(4);
  await expect(page.locator('[data-testid^="rf__edge-"]')).toHaveCount(3);
  // Large preview of a block.
  await page.getByRole('button', { name: 'Powiększ (dwuklik): Odcienie szarości' }).click();
  await expect(page.getByRole('dialog', { name: 'Podgląd: Odcienie szarości' })).toBeVisible();
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});

test('hub → plate reader → level 1 → launching the reader', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openPlates(page);
  await expect(page.getByRole('tab', { name: /Poziom 1/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const launch = page.getByRole('button', { name: /Uruchom czytnik tablic/ });
  await expect(launch).toBeDisabled();
  await page.getByRole('button', { name: /Podpowiedź/ }).click();
  await expect(page.locator('.level-hints li')).toHaveCount(1);
  for (const name of ['Odcienie szarości', 'Progowanie', 'Odwróć kolory'])
    await page.locator('.palette-item', { hasText: name }).first().click();
  await expect(page.getByText('Znaleziono 7 / 7 znaków')).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('Poziom zaliczony!')).toBeVisible();
  await launch.click();
  await expect(page.getByRole('list', { name: 'Odczytany tekst: KOT2026' })).toBeVisible();
  await expect(page.locator('.reader-details td', { hasText: /\d+%/ }).first()).toBeVisible();
  await page.getByLabel('Moja tablica').fill('KOT2026');
  await expect(page.getByText('Brawo!')).toBeVisible();
  await page.getByRole('button', { name: '← Wróć do edytora' }).click();
  await expect(page.locator('.block-card')).toHaveCount(5);
  // New group clears the plate module: level, graph and typed plate.
  await page.keyboard.press('Control+Shift+D');
  await page.getByRole('button', { name: 'Nowa grupa', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Rozpocząć pracę z nową grupą?' });
  await confirmation.getByRole('button', { name: 'Nowa grupa', exact: true }).click();
  await openPlates(page);
  await expect(page.locator('.block-card')).toHaveCount(2);
  await expect(page.getByRole('tab', { name: /Poziom 1 ✓/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});
