/** Polish UI copy for the plate generator (facilitator mode). */
export const generator = {
  title: 'Generator tablic',
  back: '← Strona główna',
  loadingFont: 'Ładowanie…',
  fontFailed: 'Nie udało się wczytać czcionki tablic. Odśwież stronę.',
  platesLegend: 'Tablice',
  count: 'Ile tablic',
  draw: 'Losuj',
  add: '+ Dodaj tablicę',
  format: 'Format wydruku',
  formats: { a5: 'A5 w poziomie', a4: 'A4 w poziomie' },
  formatInfo: (width: number, height: number, perSheet: number) =>
    `${width} × ${height} mm · ${perSheet === 1 ? '1 tablica' : `${perSheet} tablice`} na kartce A4`,
  finish: 'Wykończenie',
  fold: 'Do złożenia na pół',
  cutLines: 'Linia cięcia',
  sheetPreview: 'Podgląd kartki',
  summary: (plates: number, sheets: number) =>
    `${plates} ${plural(plates, 'tablica', 'tablice', 'tablic')} · ${sheets} ${plural(sheets, 'kartka', 'kartki', 'kartek')} A4`,
  download: 'Pobierz PDF do druku',
  empty: 'Brak tablic.',
  plateLabel: (index: number) => `Tablica ${index}`,
  textLabel: 'Numer',
  reroll: 'Wylosuj ponownie',
  remove: 'Usuń',
  tooLong: 'Najwyżej 8 znaków.',
  emptyText: 'Brak numeru.',
  fileName: 'tablice-SCI',
};

function plural(count: number, one: string, few: string, many: string) {
  if (count === 1) return one;
  const tens = count % 100;
  const units = count % 10;
  return units >= 2 && units <= 4 && (tens < 12 || tens > 14) ? few : many;
}
