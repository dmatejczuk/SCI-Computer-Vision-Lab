import { test, expect } from '@playwright/test';
test('role selection, typed code, approval, signaling recovery and replacement', async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  await page.route('**/api/phone-config', (r) =>
    r.fulfill({ json: { publicOrigin: 'https://192.0.2.10' } }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: /Uruchom AI Challenge/ }).click();
  await page.getByRole('button', { name: 'Telefon', exact: true }).click();
  const code = await page.getByLabel('Kod dołączenia', { exact: true }).textContent();
  expect(code).toMatch(/^[A-Z2-9]{6}$/);
  // The manual address comes from the server's public origin, not from the desktop page URL.
  await expect(
    page.getByText('Otwórz https://192.0.2.10 i wybierz', { exact: false }),
  ).toBeVisible();
  const context = await browser.newContext();
  await context.addInitScript(() => {
    const Original = window.WebSocket;
    (window as unknown as { testSockets: WebSocket[] }).testSockets = [];
    window.WebSocket = class extends Original {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        (window as unknown as { testSockets: WebSocket[] }).testSockets.push(this);
      }
    };
  });
  const phone = await context.newPage();
  await phone.setViewportSize({ width: 390, height: 844 });
  try {
    await phone.goto('/');
    await phone.getByRole('button', { name: /Udostępnij kamerę/ }).click();
    await phone.getByLabel('Znak 1 kodu', { exact: true }).fill(code!);
    await expect(phone.getByLabel('Znak 6 kodu', { exact: true })).toHaveValue(code![5]);
    await phone.screenshot({ path: 'test-results/manual-code-phone.png', fullPage: true });
    await phone.getByRole('button', { name: 'Dołącz do stanowiska' }).click();
    await expect(phone.locator('.pair-code')).toBeVisible();
    await page.getByRole('button', { name: 'Zatwierdź telefon' }).click();
    // The camera starts by itself after approval.
    await expect(phone.getByRole('toolbar', { name: 'Sterowanie kamerą' })).toBeVisible({
      timeout: 30000,
    });
    await page.getByRole('button', { name: 'Przejdź do AI Challenge' }).click({ timeout: 60000 });
    await expect(page.getByText('Diagnostyka połączenia', { exact: true })).toHaveCount(0);
    const initialTrack = await phone
      .locator('video')
      .evaluate((v) => ((v as HTMLVideoElement).srcObject as MediaStream).getVideoTracks()[0].id);
    await phone.evaluate(() =>
      (window as unknown as { testSockets: WebSocket[] }).testSockets.at(-1)!.close(),
    );
    await expect
      .poll(() =>
        phone.evaluate(
          () => (window as unknown as { testSockets: WebSocket[] }).testSockets.length,
        ),
      )
      .toBeGreaterThan(1);
    await expect(page.getByRole('button', { name: 'Zbierz OPEN' })).toBeVisible({
      timeout: 20000,
    });
    // A paired phone needs no pairing banner or source switch in the workshop.
    await expect(page.locator('.pairing-panel')).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Źródło kamery' })).toBeHidden();
    await expect(phone.getByRole('button', { name: 'Zmień aparat' })).toBeVisible();
    await expect
      .poll(() =>
        phone
          .locator('video')
          .evaluate(
            (v) => ((v as HTMLVideoElement).srcObject as MediaStream)?.getVideoTracks()[0]?.id,
          ),
      )
      .not.toBe(initialTrack);
    await expect(phone.getByRole('button', { name: 'Zmień aparat' })).toBeEnabled();
    const videoTime = await page
      .locator('video')
      .evaluate((v) => (v as HTMLVideoElement).currentTime);
    await expect
      .poll(() => page.locator('video').evaluate((v) => (v as HTMLVideoElement).currentTime))
      .toBeGreaterThan(videoTime + 0.5);
    // A suspended camera can recover without losing its signaling socket.
    await phone
      .locator('video')
      .evaluate((v) =>
        ((v as HTMLVideoElement).srcObject as MediaStream).getTracks().forEach((t) => t.stop()),
      );
    // A paired phone that stops sending frames gets a waiting screen with a spinner.
    const lost = page.getByRole('alertdialog', { name: 'Rozłączono urządzenie' });
    await expect(lost).toBeVisible({ timeout: 6000 });
    await expect(page.getByText('Utracono połączenie z kamerą')).toHaveCount(0);
    await expect(lost).toContainText('Oczekiwanie na ponowne połączenie');
    await expect(lost.locator('.camera-lost-spinner')).toBeVisible();
    await expect(lost.getByRole('button', { name: 'Połącz nowe urządzenie' })).toBeVisible();
    await page.screenshot({ path: 'test-results/phone-disconnected.png' });
    await phone.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(lost).toHaveCount(0, { timeout: 10000 });
    await expect(page.getByRole('button', { name: 'Zbierz OPEN' })).toBeVisible();
    // Re-pairing remains available to the instructor.
    await page.keyboard.press('Control+Shift+D');
    await page.getByRole('button', { name: 'Uruchom kamerę ponownie', exact: true }).click();
    await expect(page.getByLabel('Kod dołączenia', { exact: true })).not.toHaveText(code!);
    await expect
      .poll(() =>
        phone.locator('video').evaluate((v) => (v as HTMLVideoElement).srcObject === null),
      )
      .toBe(true);
  } finally {
    await context.close();
  }
});

test('phone prediction resumes after camera suspension without re-pairing', async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  await page.route('**/api/phone-config', (r) =>
    r.fulfill({ json: { publicOrigin: 'https://192.0.2.10' } }),
  );
  await page.goto('/?role=station');
  await page.getByRole('button', { name: 'Telefon', exact: true }).click();
  const link = page.getByRole('link', { name: 'Otwórz link telefonu' });
  await expect(link).toBeVisible();
  const hash = new URL((await link.getAttribute('href'))!).hash;
  const context = await browser.newContext();
  const phone = await context.newPage();
  try {
    await phone.goto('/phone' + hash);
    await phone.getByRole('button', { name: 'Dołącz do stanowiska' }).click();
    await page.getByRole('button', { name: 'Zatwierdź telefon' }).click();
    // The camera starts by itself after approval.
    await expect(phone.getByRole('toolbar', { name: 'Sterowanie kamerą' })).toBeVisible({
      timeout: 30000,
    });
    await page.getByRole('button', { name: 'Przejdź do AI Challenge' }).click({ timeout: 60000 });
    await page.getByRole('button', { name: 'Zbierz OPEN' }).click();
    await page.getByRole('button', { name: 'Dalej: pięść' }).click();
    await page.getByRole('button', { name: 'Zbierz FIST' }).click();
    await page.getByRole('button', { name: 'Dalej: trening' }).click();
    await page.getByRole('button', { name: 'Trenuj model' }).click();
    await page.getByRole('button', { name: 'Sprawdź go' }).click();
    await phone
      .locator('video')
      .evaluate((v) =>
        ((v as HTMLVideoElement).srcObject as MediaStream).getTracks().forEach((t) => t.stop()),
      );
    await expect(page.getByRole('alertdialog', { name: 'Rozłączono urządzenie' })).toBeVisible({
      timeout: 6000,
    });
    await phone.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(page.getByRole('alertdialog')).toHaveCount(0, { timeout: 10000 });
    await expect(page.getByRole('heading', { name: 'Sprawdź swój model' })).toBeVisible();
    await expect(page.locator('.probability b').first()).not.toHaveText('0%');
    await page.getByRole('button', { name: 'Zagraj', exact: false }).click();
    await expect(page.locator('canvas')).toBeVisible();
    await phone
      .locator('video')
      .evaluate((v) =>
        ((v as HTMLVideoElement).srcObject as MediaStream).getTracks().forEach((t) => t.stop()),
      );
    await expect(page.locator('.pause-overlay')).toBeVisible({ timeout: 6000 });
    await phone.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(page.getByRole('button', { name: 'Wznów' })).toBeEnabled({ timeout: 10000 });
    await expect(page.locator('.pause-overlay')).toBeVisible();
  } finally {
    await context.close();
  }
});
