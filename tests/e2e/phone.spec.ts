import { test, expect } from '@playwright/test';
test('phone WebRTC powers capture, training, laboratory and game; reset stops the phone', async ({
  browser,
  page,
}) => {
  test.setTimeout(180000);
  page.setDefaultTimeout(15000);
  // A routable HTTPS QR is generated; this test navigates its fragment on the test origin.
  // Real phone HTTPS trust and physical LAN transport are covered by the hardware checklist.
  await page.route('**/api/phone-config', (route) =>
    route.fulfill({ json: { publicOrigin: 'https://192.0.2.10' } }),
  );
  await page.goto('/?role=station');
  await page.getByRole('button', { name: 'Telefon', exact: true }).click();
  const link = page.getByRole('link', { name: 'Otwórz link telefonu' });
  await expect(link).toBeVisible();
  const url = new URL((await link.getAttribute('href'))!);
  expect(url.hostname).toBe('192.0.2.10');
  const context = await browser.newContext();
  const phone = await context.newPage();
  await phone.setViewportSize({ width: 390, height: 844 });
  const imports: string[] = [];
  phone.on('request', (r) => imports.push(r.url()));
  try {
    await phone.goto(`/phone${url.hash}`);
    await expect(phone).toHaveURL(/\/phone$/);
    await phone.getByRole('button', { name: 'Dołącz do stanowiska' }).click();
    await expect(phone.locator('.pair-code')).toBeVisible();
    await page.getByRole('button', { name: 'Zatwierdź telefon' }).click();
    await phone.getByRole('button', { name: 'Uruchom aparat', exact: true }).click();
    await page.getByRole('button', { name: 'Przejdź do AI Challenge' }).click({ timeout: 60000 });
    await expect(page.getByRole('heading', { name: 'Pokaż otwartą dłoń' })).toBeVisible({
      timeout: 60000,
    });
    await expect
      .poll(() => page.locator('video').evaluate((v) => (v as HTMLVideoElement).videoWidth))
      .toBeGreaterThan(0);
    await phone.screenshot({ path: 'test-results/phone-mobile.png', fullPage: true });
    await page.keyboard.press('Control+Shift+D');
    await page.getByText('Diagnostyka połączenia telefonu', { exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText(
      process.env.ICE_RELAY_ONLY === 'true' ? 'TURN' : 'P2P',
    );
    await page.getByRole('button', { name: 'Zamknij', exact: true }).click();
    await page.getByRole('button', { name: 'Zbierz OPEN' }).click();
    await expect(page.getByRole('button', { name: 'Dalej: pięść' })).toBeEnabled({
      timeout: 30000,
    });
    await page.getByRole('button', { name: 'Dalej: pięść' }).click();
    await page.getByRole('button', { name: 'Zbierz FIST' }).click();
    await expect(page.getByRole('button', { name: 'Dalej: trening' })).toBeEnabled({
      timeout: 30000,
    });
    await page.getByRole('button', { name: 'Dalej: trening' }).click();
    await page.getByRole('button', { name: 'Trenuj model' }).click();
    await expect(page.getByRole('heading', { name: 'Model gotowy' })).toBeVisible({
      timeout: 45000,
    });
    await page.getByRole('button', { name: 'Sprawdź go' }).click();
    await page.getByRole('button', { name: /JAK AI TO WIDZI/ }).click();
    await page.getByRole('button', { name: /ZATRZYMAJ KLATKĘ/ }).click();
    await expect(page.locator('.lab-shell')).toBeVisible();
    // Return via the laboratory's own action, then exercise the game.
    await page.getByRole('button', { name: /Wróć do testowania/ }).click();
    await page.getByRole('button', { name: 'Zagraj', exact: false }).click();
    await expect(page.locator('.game-container canvas')).toBeVisible();

    await page.screenshot({ path: 'test-results/phone-workshop.png', fullPage: true });
    await phone.getByRole('button', { name: 'Zatrzymaj transmisję' }).click();
    await expect(page.locator('.pause-overlay')).toBeVisible();
    await expect
      .poll(() =>
        phone.locator('video').evaluate((v) => (v as HTMLVideoElement).srcObject === null),
      )
      .toBe(true);
    await page.keyboard.press('Control+Shift+D');
    await page.getByRole('button', { name: 'Nowa grupa', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Rozpocząć pracę z nową grupą?' })
      .getByRole('button', { name: 'Nowa grupa', exact: true })
      .click();
    await expect(page.getByRole('button', { name: 'Kamera komputera', exact: true })).toBeEnabled();
    expect(imports.some((u) => /tensorflow|phaser|SessionManager|\/app\/App/.test(u))).toBe(false);
  } finally {
    await context.close();
  }
});

test('phone freeze blocks new samples, re-pair and group reset release an active sender', async ({
  browser,
  page,
}) => {
  page.setDefaultTimeout(15000);
  await page.route('**/api/phone-config', (route) =>
    route.fulfill({ json: { publicOrigin: 'https://192.0.2.10' } }),
  );
  await page.goto('/?role=station');
  await page.getByRole('button', { name: 'Telefon', exact: true }).click();
  const context = await browser.newContext();
  let phone = await context.newPage();
  async function connect() {
    const link = page.getByRole('link', { name: 'Otwórz link telefonu' });
    await expect(link).toBeVisible();
    const hash = new URL((await link.getAttribute('href'))!).hash;
    await phone.goto(`/phone${hash}`);
    await phone.getByRole('button', { name: 'Dołącz do stanowiska' }).click();
    await page.getByRole('button', { name: 'Zatwierdź telefon' }).click();
    await phone.getByRole('button', { name: 'Uruchom aparat', exact: true }).click();
    await page.getByRole('button', { name: 'Przejdź do AI Challenge' }).click({ timeout: 60000 });
    await expect(page.getByRole('heading', { name: 'Pokaż otwartą dłoń' })).toBeVisible({
      timeout: 60000,
    });
  }
  try {
    await connect();
    // Stop media without a signaling leave: the receiver must detect missing decoded frames.
    await phone
      .locator('video')
      .evaluate(
        (v) =>
          (v as HTMLVideoElement).srcObject &&
          ((v as HTMLVideoElement).srcObject as MediaStream).getTracks().forEach((t) => t.stop()),
      );
    await expect(page.locator('.error:visible').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: 'Zbierz OPEN' })).toHaveCount(0);
    await expect(page.locator('.pairing-panel')).toHaveCount(0);
    await page.getByRole('button', { name: 'Spróbuj ponownie', exact: true }).click();
    await phone.close();
    phone = await context.newPage();
    await connect();
    await page.keyboard.press('Control+Shift+D');
    await page.getByRole('button', { name: 'Nowa grupa', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Rozpocząć pracę z nową grupą?' })
      .getByRole('button', { name: 'Nowa grupa', exact: true })
      .click();
    await expect(phone.getByRole('status')).toContainText('Transmisja zakończona');
    expect(
      await phone.locator('video').evaluate((v) => (v as HTMLVideoElement).srcObject),
    ).toBeNull();
  } finally {
    await context.close();
  }
});
