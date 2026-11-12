# Plate reader (part 1)

Part 1 of the workshop teaches classical image processing. Students connect OpenCV operations
in a Blender-style node editor until only the characters of a plate are left (white characters
on a black background), then launch the plate reader, which shows the image before and after
processing and the text it read. UI labels are quoted in Polish as they appear in the app.

After the camera hub, a station chooses **Część 1: Czytnik tablic** or **Część 2: AI Challenge**.
Part 1 uses the whole screen with one slim top bar (SCI mark, part switcher, levels and actions);
the switcher changes parts without losing the camera source or a paired phone. **Nowa grupa**
clears both parts. The plate generator is a facilitator tool: **Tryb prowadzącego** at the bottom
of the first screen ("Jak chcesz dołączyć?"), `/?role=instructor`.

## Camera image

The reader never mirrors the image. Every frame is turned upright, cropped and scaled before the
operations see it, and the camera preview (top right) shows exactly that frame:

- a portrait image (a phone held upright) is cropped around its centre to a 4:3 landscape strip;
- ⟲ / ⟳ rotate by a quarter turn (a phone held sideways), ⇋ flips left-right;
- the setting stays for the next group (it belongs to the station's camera set-up).

## Levels

| Level | Image | Goal | Reference solution |
| --- | --- | --- | --- |
| 1 **Pierwsza tablica** | Built-in plate photo generated from the tile font (`sampleText`) | Read the built-in plate | Odcienie szarości → Progowanie → Odwróć kolory |
| 2 **Twoja tablica** | Camera (or **Obraz ćwiczebny**) | Read the group's own plate | + Rozmycie, automatic threshold, Filtr kształtów |
| 3 **Trudne warunki** | Camera (or a tilted, shadowed, dirty practice image) | Tilt, shadow, dirt | Znajdź tablicę + Wytnij i wyprostuj, Progowanie adaptacyjne, Otwarcie, Filtr kształtów |

Each level offers its own subset of blocks, a goal and 4–5 hints revealed one at a time with
**Podpowiedź**. Every level starts with **Kamera** wired straight to **Wynik**: the red wire
says what is still missing. A level counts as solved (✓ on its tab) when the reader reads the
whole plate correctly: the built-in plate, or on camera levels the plate typed in **Moja tablica**.
Each level keeps its own graph while the group works.

## Node editor

- **Palette**: a click inserts the block in front of **Wynik** (or into the selected wire);
  dragging a block onto a wire inserts it there; dropping it elsewhere places it freely, and a
  loose block dragged onto a wire is inserted too.
- **Sockets and wires** are colored by data type: color image (yellow), grayscale (grey),
  black-and-white (white), plate region (purple). An incompatible connection is refused with a
  speech bubble ("„Progowanie” potrzebuje: obraz w odcieniach szarości… Wstaw najpierw blok
  „Odcienie szarości”."). A wire whose types no longer fit turns red and dashed.
- Each block shows a **live thumbnail**, 0–2 sliders and its problems in a red bubble.
  ⤢ or a double click opens a large preview.
- **Cofnij / Ponów** (Ctrl+Z, Ctrl+Y), Delete removes the selected block (the chain stays
  connected), **Wyczyść** returns to the level's starting graph (undoable).
- **Zatrzymaj klatkę** freezes the camera frame inside the worker, so sliders can be tuned on a
  still image; then only the blocks after a changed slider are recomputed.
- **Wynik** shows "Znaleziono N / M znaków"; **Uruchom czytnik tablic** is enabled when the count
  is plausible (M − 2 … M + 1).

Blocks: Kamera, Odcienie szarości (`cvtColor`), Rozmycie (`GaussianBlur`), Jasność i kontrast
(`convertScaleAbs`), Wyrównaj kontrast (`equalizeHist`), Progowanie (`threshold`, manual or Otsu),
Progowanie adaptacyjne (`adaptiveThreshold`), Odwróć kolory (`bitwise_not`), Odchudzanie /
Pogrubianie (`erode` / `dilate`), Otwarcie / Domknięcie (`morphologyEx`), Krawędzie (`Canny`),
Znajdź tablicę (`findContours` + `approxPolyDP`), Wytnij i wyprostuj (`warpPerspective`), Filtr
kształtów (`connectedComponentsWithStats`), Podgląd, Porównaj, Wynik.

## Reader screen

The reader shows the camera image with the plate outline (when the graph has **Znajdź tablicę**)
next to the Output image with a box around each character, the result as plate tiles in the tile
font, and a table with each character's similarity and the two closest alternatives (e.g.
"B 99%, 8 71%"). The reading is stabilised by voting over the last 7 frames. In **Moja tablica**
students type what they assembled; misread, missing and extra characters are highlighted.
**← Wróć do edytora** keeps the graph.

## Recognition

Template matching, not general OCR: connected white regions are merged (broken characters),
filtered by size and proportions, and the largest row of similar-height regions is taken, left
to right. Each character is scaled to 24×40 keeping its proportions and compared with templates
drawn from the **same font as the tiles**, only for the configured character set. Similarity is
the normalised correlation in percent. Polish plate rules are not applied; confusable pairs (0/O,
1/I, 8/B, 5/S, 2/Z) are a workshop challenge.

## Configuration: font, character set, plate geometry

Everything lives in one file, `src/features/plates/plates.config.json`:

- `style`: `printed` for EU-style plates printed from the generator (default), `tiles` for the 3D
  tile frame. **Znajdź tablicę** / **Wytnij i wyprostuj** and the generated level images follow it.

- `font.file` and `font.sha256`: the tile font in `public/plates/fonts/` (TTF or OTF). The build
  (`npm run verify:plates`) checks the checksum and prints the new one on a mismatch.
- `charset`: the characters printed on tiles; recognition only considers these.
- `slots`, `sampleText`, `colors`: frame layout and the level 1 plate.
- `tile`: tile width and height, gap between tiles, frame border and capital letter height, in
  any unit. **Wytnij i wyprostuj** uses these proportions to straighten tilted plates, and the
  generated level images use them.

Templates, level images, practice images and the test plates are all generated from this file,
so replacing the font or the character set needs no code change. The bundled fallback font is
**Barlow Semi Condensed SemiBold** (SIL Open Font License 1.1, free to bundle, modify and print;
see `public/plates/fonts/LICENSE-Barlow-OFL.txt`): a DIN-like plate face whose 0/O, 1/I, 8/B and
5/S stay apart in template matching (Barlow Condensed and Fjalla One mixed up 0 and O). The
generator prints with the same font, so printed plates match the reader's templates.

## Technical notes

- OpenCV.js 4.12 (`@techstark/opencv-js`, Apache-2.0) runs in a module Web Worker, in a separate
  lazily loaded chunk (~11 MB, about 3.5 MB with gzip). TFJS and Phaser are not loaded by part 1.
  The build verifies the OpenCV.js file against `src/features/plates/worker/opencv.checksum.json`.
- **CSP**: the page policy only needs `'wasm-unsafe-eval'`. Embind inside OpenCV.js normally
  builds functions with `new Function()` (`'unsafe-eval'`); `scripts/opencv-patch.ts` replaces
  those four generators with equivalent closures at build time and fails the build if a future
  OpenCV.js release changes them. `vite preview` sends the same CSP as Caddy.
- The worker processes at most one frame at a time, at most 15 per second, at 640 px width
  (320 px automatically when a pass takes over 60 ms). Every `cv.Mat` is created in a scope and
  released in `finally`; results for a frozen frame are cached per block fingerprint.
- The plate module uses the full, **unmirrored** frame and an unmirrored preview.
- Frames, the frozen frame and generated images stay in the tab's memory; **Nowa grupa**
  terminates the worker, which frees its WebAssembly memory.

## Facilitator tools

Ctrl+Shift+D while part 1 is open shows processing fps, pass time, working width, live/cached
`cv.Mat` counts (live must stay 0), OpenCV WebAssembly memory and per-block timings. **Wczytaj
rozwiązanie poziomu N** loads the reference solution (undoable); **Wszystkie bloki w palecie**
offers every block on every level. **Test wydajności czytnika tablic** (available on every
screen) runs the phase-0 benchmark: camera → worker → eight OpenCV operations at 640 and 320 px,
with a verdict and **Kopiuj wyniki** (JSON) for the room survey.

## Third-party components

| Component | Version | License | Use |
| --- | --- | --- | --- |
| OpenCV.js (`@techstark/opencv-js`) | 4.12.0-release.1 | Apache-2.0 | Image operations in the worker |
| React Flow (`@xyflow/react`, `@xyflow/system`) | 12.12.1 | MIT | Node editor (with d3-zoom/drag: ISC, d3-ease: BSD-3-Clause, zustand, classcat: MIT) |
| opentype.js | 1.3.4 | MIT | Reading the tile font to draw templates and plate images |
| Barlow Semi Condensed SemiBold | 1.408 | SIL OFL 1.1 | Plate font (reader templates and generator) |

## Plate generator (facilitator mode)

Random plate numbers in the Polish style (district code of 2–3 letters, a space, 7–8 characters in
total; like real plates, the distinguishing part avoids B, D, I, O and Z), editable before
printing, exported as a vector PDF:

- EU-style plate: 520 × 114 mm proportions, black outline, one row of characters, and on the left
  a blue band with the **SCI logo and "SCI"** instead of the EU stars and "PL".
- A faint grey **"EDU" watermark** runs behind the characters, and under the plate's right edge
  a small line reads "© <year> DM · For Educational Purposes Only · Not a valid registration
  plate". The watermark is light enough for the reader to ignore it (tested with plain and
  adaptive thresholding).
- **Format wydruku**: **A5 w poziomie** (200 × 44 mm plate, two pieces per portrait A4 sheet,
  with an optional dashed cut line between them) or **A4 w poziomie** (277 × 61 mm plate, one
  landscape A4 sheet per plate).
- **Do złożenia na pół** (default on): each piece is folded in half into a card that stands on
  the table like a tent. The upper half stays blank, the plate is centred in the lower half and a
  dotted line marks the fold. Turned off, the plate is centred in its piece.
- **Podgląd kartki** shows the first sheet exactly as it goes into the PDF.
- Each plate can be typed over (capitals, plate characters only, at most 8), re-rolled or removed.
- The PDF is written in the browser (`src/features/generator/pdf.ts`): only filled outlines, so it
  prints sharp at any size. Print at 100 % ("actual size").

The logo is `src/features/generator/sciLogo.ts`, traced from the 1024 px logo SVG into outlines.
Unit tests render printed plates and read them back through the reader (head-on, and after
**Znajdź tablicę** + **Wytnij i wyprostuj**).
