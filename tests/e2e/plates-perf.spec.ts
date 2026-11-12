import { test, expect } from '@playwright/test';

// Phase 0: the facilitator's performance page runs OpenCV.js in a worker on the fake camera.
// The numbers printed here are indicative only; the real measurement happens on the
// workshop computers.
test('plate reader performance page measures the OpenCV.js worker', async ({ page }) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?role=station');
  await page.getByRole('button', { name: 'Kamera komputera', exact: true }).click();
  await expect(page.getByRole('button', { name: /Przejdź do AI Challenge/ })).toBeEnabled({
    timeout: 60000,
  });
  await page.keyboard.press('Control+Shift+D');
  await page.getByRole('button', { name: 'Test wydajności czytnika tablic' }).click();
  const dialog = page.getByRole('dialog', { name: 'Test wydajności czytnika tablic' });
  await dialog.getByRole('button', { name: 'Uruchom test' }).click();
  await expect(dialog.locator('.perf-verdict')).toBeVisible({ timeout: 120000 });
  await expect(dialog.getByTestId('mats-640')).toHaveText('0');
  await expect(dialog.getByTestId('mats-320')).toHaveText('0');
  expect(Number(await dialog.getByTestId('fps-640').textContent())).toBeGreaterThan(0);
  await expect(dialog.getByText('kamera', { exact: true })).toBeVisible();
  console.info((await dialog.locator('.perf-report').innerText()).replace(/\n+/g, ' | '));
  expect(errors).toEqual([]);
});
