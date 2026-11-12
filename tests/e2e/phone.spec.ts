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
    // The camera starts by itself after approval.
    await expect(phone.getByRole('toolbar', { name: 'Sterowanie kamerą' })).toBeVisible({
      timeout: 30000,
    });
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

test('phone viewfinder flips the sent image like its preview and fits portrait and landscape', async ({
  browser,
  page,
}) => {
  test.setTimeout(120000);
  page.setDefaultTimeout(15000);
  await page.route('**/api/phone-config', (route) =>
    route.fulfill({ json: { publicOrigin: 'https://192.0.2.10' } }),
  );
  await page.goto('/?role=station');
  await page.getByRole('button', { name: 'Telefon', exact: true }).click();
  const link = page.getByRole('link', { name: 'Otwórz link telefonu' });
  await expect(link).toBeVisible();
  const hash = new URL((await link.getAttribute('href'))!).hash;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const phone = await context.newPage();
  // Bright pixels in three bands of the received frame. The fake camera draws its timestamp in
  // the top-left corner, so flips move that text to the bottom or the right.
  const bands = () =>
    page.locator('video').evaluate((v) => {
      const video = v as HTMLVideoElement,
        { videoWidth: w, videoHeight: h } = video;
      if (!w || !h) return null;
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(video, 0, 0);
      const bright = (x0: number, y0: number) => {
        const d = ctx.getImageData(x0 * w, y0 * h, 0.37 * w, 0.13 * h).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i + 1] > 200) n++;
        return n;
      };
      return {
        topLeft: bright(0.08, 0.01),
        topRight: bright(0.55, 0.01),
        bottomLeft: bright(0.08, 0.86),
      };
    });
  const corner = async () => {
    const b = await bands();
    if (!b) return null;
    const max = Math.max(b.topLeft, b.topRight, b.bottomLeft);
    return max === b.topLeft ? 'topLeft' : max === b.topRight ? 'topRight' : 'bottomLeft';
  };
  try {
    await phone.goto(`/phone${hash}`);
    await phone.getByRole('button', { name: 'Dołącz do stanowiska' }).click();
    await page.getByRole('button', { name: 'Zatwierdź telefon' }).click();
    // The camera starts by itself after approval.
    await expect(phone.getByRole('toolbar', { name: 'Sterowanie kamerą' })).toBeVisible({
      timeout: 30000,
    });
    await page.getByRole('button', { name: 'Przejdź do AI Challenge' }).click({ timeout: 60000 });
    await expect.poll(corner).toBe('topLeft');
    const toolbar = phone.getByRole('toolbar', { name: 'Sterowanie kamerą' });
    await expect(toolbar).toBeVisible();
    await expect(phone.getByText('Trzymaj dłoń', { exact: false })).toHaveCount(0);
    await expect(phone.getByRole('heading')).toHaveCount(0);
    // Fullscreen needs a tap, so the auto-started camera stays windowed until the button is used.
    const fullscreen = phone.getByRole('button', { name: 'Pełny ekran' });
    await expect(fullscreen).toHaveAttribute('aria-pressed', 'false');
    await fullscreen.click();
    await expect(fullscreen).toHaveAttribute('aria-pressed', 'true');
    await fullscreen.click();
    await expect(fullscreen).toHaveAttribute('aria-pressed', 'false');
    // No notice covers the viewfinder while streaming.
    await expect(phone.getByRole('status')).toBeHidden();
    for (const size of [
      { width: 390, height: 844 },
      { width: 844, height: 390 },
    ]) {
      await phone.setViewportSize(size);
      const box = (await toolbar.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(size.width + 0.5);
      expect(box.y + box.height).toBeLessThanOrEqual(size.height + 0.5);
      expect(await phone.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        size.width,
      );
      // The preview fills the stage and letterboxes the camera image (object-fit: contain).
      await expect
        .poll(() =>
          phone.locator('video').evaluate((v) => {
            const e = v as HTMLVideoElement,
              stage = e.parentElement!.getBoundingClientRect();
            return (
              Math.abs(e.clientWidth - stage.width) < 1 &&
              Math.abs(e.clientHeight - stage.height) < 1 &&
              getComputedStyle(e).objectFit === 'contain'
            );
          }),
        )
        .toBe(true);
      await phone.screenshot({ path: `test-results/phone-live-${size.width}x${size.height}.png` });
    }
    // Each flip is shown in the phone preview and reaches the computer the same way.
    const flipX = phone.getByRole('button', { name: 'Odbij poziomo' });
    const flipY = phone.getByRole('button', { name: 'Odbij pionowo' });
    const preview = () => phone.locator('video').evaluate((v) => getComputedStyle(v).transform);
    await flipY.click();
    await expect(flipY).toHaveAttribute('aria-pressed', 'true');
    expect(await preview()).toBe('matrix(1, 0, 0, -1, 0, 0)');
    await expect.poll(corner, { timeout: 10000 }).toBe('bottomLeft');
    await phone.screenshot({ path: 'test-results/phone-live-flipped.png' });
    await flipY.click();
    await flipX.click();
    expect(await preview()).toBe('matrix(-1, 0, 0, 1, 0, 0)');
    await expect.poll(corner, { timeout: 10000 }).toBe('topRight');
    // Turning both off sends the plain camera image again.
    await flipX.click();
    expect(await preview()).toBe('none');
    await expect.poll(corner, { timeout: 10000 }).toBe('topLeft');
    // The setting is remembered on the phone for the next stream.
    expect(await phone.evaluate(() => localStorage.getItem('aivision.phone.flip'))).toBe(
      '{"flipX":false,"flipY":false}',
    );
    await expect(page.getByRole('button', { name: 'Zbierz OPEN' })).toBeVisible();
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
    // The camera starts by itself after approval.
    await expect(phone.getByRole('toolbar', { name: 'Sterowanie kamerą' })).toBeVisible({
      timeout: 30000,
    });
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
    await expect(page.getByRole('alertdialog', { name: 'Rozłączono urządzenie' })).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByRole('button', { name: 'Zbierz OPEN' })).toHaveCount(0);
    await expect(page.locator('.pairing-panel')).toHaveCount(0);
    // Re-pairing starts from the disconnection screen, which covers the workshop.
    await page
      .getByRole('alertdialog', { name: 'Rozłączono urządzenie' })
      .getByRole('button', { name: 'Połącz nowe urządzenie' })
      .click();
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
