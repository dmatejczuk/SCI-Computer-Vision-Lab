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
