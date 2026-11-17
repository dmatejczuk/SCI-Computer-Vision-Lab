import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

test('the plate generator page generates plates, edits them and downloads a print PDF', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // The generator has its own address and is not linked from the first screen.
  await page.goto('/');
  await expect(page.getByRole('link', { name: /prowadzącego|generator/i })).toHaveCount(0);
  await page.goto('/?role=plate-generator');
  await expect(page.getByRole('heading', { name: 'Generator tablic' })).toBeVisible();
  const plates = page.getByRole('img', { name: /^Tablica \d+:/ });
  await expect(plates).toHaveCount(10, { timeout: 30000 });

  // Typed text is cleaned: capitals, allowed characters, at most 8 characters.
  const first = page.getByLabel('Tablica 1 – Numer');
  await first.fill('sci 2026x');
  await expect(first).toHaveValue('SCI 2026X');
  await expect(page.getByRole('img', { name: 'Tablica 1: SCI 2026X' })).toBeVisible();

  await page.getByLabel('Ile tablic').fill('5');
  await page.getByRole('button', { name: 'Losuj', exact: true }).click();
  await expect(plates).toHaveCount(5);
  await page.getByRole('button', { name: 'Usuń: Tablica 5' }).click();
  await page.getByRole('button', { name: '+ Dodaj tablicę' }).click();
  // A5: two plates per A4 sheet; A4: one per sheet, and no cut line to offer.
  await expect(page.getByText('5 tablic · 3 kartki A4')).toBeVisible();
  await expect(page.getByLabel('Linia cięcia')).toBeVisible();
  await page.getByText('A4 w poziomie', { exact: true }).click();
  await expect(page.getByRole('radio', { name: /A4 w poziomie/ })).toBeChecked();
  await expect(page.getByText('5 tablic · 5 kartek A4')).toBeVisible();
  await expect(page.getByLabel('Linia cięcia')).toHaveCount(0);
  await expect(page.getByRole('img', { name: 'Podgląd kartki' })).toBeVisible();
  await page.getByText('A5 w poziomie', { exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Pobierz PDF/ }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('tablice-SCI-5.pdf');
  const pdf = readFileSync((await download.path())!, 'latin1');
  expect(pdf.startsWith('%PDF-1.4')).toBe(true);
  expect(pdf).toContain('/Count 3');

  // Back to the first screen.
  await page.getByRole('link', { name: '← Strona główna' }).click();
  await expect(page.getByRole('heading', { name: 'Jak chcesz dołączyć?' })).toBeVisible();
  expect(errors).toEqual([]);
});
