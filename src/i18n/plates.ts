/** Polish UI copy for the plate reader module (part 1 of the workshop). */
export const plates = {
  perf: {
    title: 'Test wydajności czytnika tablic',
    open: 'Test wydajności czytnika tablic',
    intro:
      'Sprawdza, czy ten komputer płynnie przetwarza obraz: kamera → wątek roboczy → 8 operacji OpenCV.js. Test trwa około 15 sekund.',
    start: 'Uruchom test',
    again: 'Powtórz test',
    running: 'Trwa pomiar…',
    loading: 'Ładowanie OpenCV.js…',
    copy: 'Kopiuj wyniki',
    copied: 'Skopiowano',
    source: 'Źródło obrazu',
    camera: 'kamera',
    pattern: 'obraz testowy (brak kamery)',
    load: 'Ładowanie OpenCV.js',
    size: 'Rozmiar OpenCV.js',
    version: 'Wersja OpenCV',
    width: 'Szerokość robocza',
    fps: 'Klatki na sekundę',
    frame: 'Czas klatki (średnio / p95)',
    grab: 'Pobranie klatki z wideo',
    read: 'Odczyt klatki w wątku',
    thumbs: 'Miniatury (8 bloków)',
    ui: 'Płynność interfejsu (najdłuższa przerwa)',
    mats: 'Niezwolnione macierze cv.Mat',
    operation: 'Operacja',
    verdictGood: 'Wynik dobry: podgląd na żywo powinien działać płynnie (≥ 10 kl./s przy 640 px).',
    verdictReduced:
      'Wynik ograniczony: płynnie działa tylko 320 px. Czytnik sam przełączy się na mniejszy obraz.',
    verdictBad:
      'Za wolno: poniżej 10 kl./s nawet przy 320 px. Zamknij inne programy albo użyj innego komputera.',
    csp: 'Przeglądarka zablokowała WebAssembly. Serwer musi wysyłać w CSP „wasm-unsafe-eval” (patrz Caddyfile.common).',
    failed: 'Nie udało się uruchomić OpenCV.js.',
    note: 'Wynik orientacyjny. Zmierz go na każdym komputerze w sali przy włączonej kamerze.',
  },
};
