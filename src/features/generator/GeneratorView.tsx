import opentype from 'opentype.js';
import { useEffect, useMemo, useState } from 'react';
import { generator as t } from '../../i18n/generator';
import { plateConfig } from '../plates/plateConfig';
import { buildPdf } from './pdf';
import { cleanPlateText, MAX_CHARACTERS, svgPath, type Drawing } from './plateDesign';
import { randomPlate, randomPlates } from './randomPlate';
import {
  drawPiece,
  FORMATS,
  layoutSheets,
  plateSize,
  sheetCount,
  type SheetFormat,
  type SheetOptions,
} from './sheet';
import './generator.css';

interface PlateEntry {
  id: number;
  text: string;
}

let nextId = 1;
const entries = (texts: string[]): PlateEntry[] => texts.map((text) => ({ id: nextId++, text }));
const charset = plateConfig.charset;
const characterCount = (text: string) => text.replace(/\s/g, '').length;

/** Loads the plate font once (the same font the reader's templates use). */
function usePlateFont() {
  const [font, setFont] = useState<opentype.Font | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch(plateConfig.font.file)
      .then((response) => {
        if (!response.ok) throw new Error(`${response.status}`);
        return response.arrayBuffer();
      })
      .then((buffer) => !cancelled && setFont(opentype.parse(buffer)))
      .catch((error) => {
        console.error('[generator] font', error);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return { font, failed };
}

/** A drawing as inline SVG (mm units), used for the on-screen previews. */
function DrawingSvg({
  drawing,
  label,
  className = 'plate-svg',
}: {
  drawing: Drawing;
  label: string;
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox={`0 0 ${drawing.width} ${drawing.height}`}
      role="img"
      aria-label={label}
    >
      {drawing.shapes.map((shape, i) => (
        <path
          key={i}
          d={svgPath(shape.commands)}
          fill={shape.fill ?? 'none'}
          fillRule={shape.evenOdd ? 'evenodd' : 'nonzero'}
          stroke={shape.stroke?.color}
          strokeWidth={shape.stroke?.width}
          strokeDasharray={shape.stroke?.dash?.join(' ')}
        />
      ))}
    </svg>
  );
}

/** Facilitator tool: random EU-style plates with the SCI band, edited and exported as a print PDF. */
export function GeneratorView() {
  const { font, failed } = usePlateFont();
  const [count, setCount] = useState(10);
  const [plates, setPlates] = useState<PlateEntry[]>(() => entries(randomPlates(10, charset)));
  const [format, setFormat] = useState<SheetFormat>('a5');
  const [cutLines, setCutLines] = useState(true);
  const [fold, setFold] = useState(true);
  const options: SheetOptions = { format, cutLines: cutLines && format === 'a5', fold };
  const valid = plates.filter((plate) => {
    const chars = characterCount(plate.text);
    return chars > 0 && chars <= MAX_CHARACTERS;
  });
  const sheets = valid.length ? sheetCount(valid.length, format) : 0;

  const previews = useMemo(
    () =>
      font ? new Map(plates.map((plate) => [plate.id, drawPiece(font, plate.text, 520)])) : null,
    [font, plates],
  );
  // The first printed sheet, drawn exactly as it goes into the PDF.
  const perSheet = FORMATS[format].perSheet;
  const firstTexts = valid
    .slice(0, perSheet)
    .map((plate) => plate.text.trim())
    .join('|');
  const firstSheet = useMemo(
    () =>
      font
        ? layoutSheets(font, firstTexts ? firstTexts.split('|') : [''], {
            format,
            cutLines: cutLines && format === 'a5',
            fold,
          })[0]
        : null,
    [font, firstTexts, format, cutLines, fold],
  );

  const update = (id: number, text: string) =>
    setPlates((list) =>
      list.map((plate) =>
        plate.id === id ? { ...plate, text: cleanPlateText(text, charset) } : plate,
      ),
    );

  const download = () => {
    if (!font || !valid.length) return;
    const sheets = layoutSheets(
      font,
      valid.map((plate) => plate.text.trim()),
      options,
    );
    const bytes = buildPdf(sheets, t.title);
    const url = URL.createObjectURL(
      new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `${t.fileName}-${valid.length}.pdf`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  return (
    <main className="generator" aria-labelledby="generator-title">
      <div className="part-topbar">
        <span className="part-brand" aria-hidden="true">
          SCI<span>_</span>
        </span>
        <h1 id="generator-title" className="generator-title">
          {t.title}
        </h1>
        <a className="generator-back" href="/">
          {t.back}
        </a>
      </div>
      <div className="generator-body">
        <aside className="generator-settings">
          <form
            className="generator-section"
            onSubmit={(event) => {
              event.preventDefault();
              setPlates(entries(randomPlates(count, charset)));
            }}
          >
            <h2>{t.platesLegend}</h2>
            <div className="generator-draw">
              <label>
                <span className="visually-hidden">{t.count}</span>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={count}
                  aria-label={t.count}
                  onChange={(event) =>
                    setCount(Math.max(1, Math.min(60, +event.target.value || 1)))
                  }
                />
              </label>
              <button type="submit" className="primary">
                {t.draw}
              </button>
            </div>
          </form>
          <fieldset className="generator-section">
            <legend>{t.format}</legend>
            <div className="format-options">
              {(Object.keys(FORMATS) as SheetFormat[]).map((key) => {
                const size = plateSize(key);
                return (
                  <label key={key} className="format-option">
                    <input
                      type="radio"
                      name="format"
                      checked={format === key}
                      onChange={() => setFormat(key)}
                    />
                    <span className={`format-icon format-icon-${key}`} aria-hidden="true">
                      <i />
                    </span>
                    <span className="format-text">
                      <strong>{t.formats[key]}</strong>
                      <small>{t.formatInfo(size.width, size.height, FORMATS[key].perSheet)}</small>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          <fieldset className="generator-section">
            <legend>{t.finish}</legend>
            <label className="generator-check">
              <input
                type="checkbox"
                checked={fold}
                onChange={(event) => setFold(event.target.checked)}
              />
              {t.fold}
            </label>
            {format === 'a5' && (
              <label className="generator-check">
                <input
                  type="checkbox"
                  checked={cutLines}
                  onChange={(event) => setCutLines(event.target.checked)}
                />
                {t.cutLines}
              </label>
            )}
          </fieldset>
          <section className="generator-section" aria-label={t.sheetPreview}>
            <h2>{t.sheetPreview}</h2>
            {firstSheet && (
              <DrawingSvg
                drawing={firstSheet}
                label={t.sheetPreview}
                className={`sheet-svg sheet-${format}`}
              />
            )}
          </section>
          <div className="generator-export">
            <p className="generator-summary">{t.summary(valid.length, sheets)}</p>
            <button className="primary" disabled={!font || !valid.length} onClick={download}>
              {t.download}
            </button>
          </div>
        </aside>
        <section className="generator-list" aria-label={t.title}>
          {failed && (
            <p className="error" role="alert">
              {t.fontFailed}
            </p>
          )}
          {!font && !failed && <p role="status">{t.loadingFont}</p>}
          {!plates.length && <p className="generator-empty">{t.empty}</p>}
          <ol>
            {plates.map((plate, index) => {
              const chars = characterCount(plate.text);
              const problem = !chars ? t.emptyText : chars > MAX_CHARACTERS ? t.tooLong : null;
              const drawing = previews?.get(plate.id);
              return (
                <li key={plate.id} className={problem ? 'has-problem' : ''}>
                  {drawing && (
                    <DrawingSvg
                      drawing={drawing}
                      label={`${t.plateLabel(index + 1)}: ${plate.text}`}
                    />
                  )}
                  <div className="generator-row">
                    <label>
                      <span className="visually-hidden">
                        {t.plateLabel(index + 1)} – {t.textLabel}
                      </span>
                      <input
                        value={plate.text}
                        maxLength={MAX_CHARACTERS + 3}
                        spellCheck={false}
                        autoCapitalize="characters"
                        onChange={(event) => update(plate.id, event.target.value)}
                      />
                    </label>
                    <button
                      title={t.reroll}
                      aria-label={`${t.reroll}: ${t.plateLabel(index + 1)}`}
                      onClick={() => update(plate.id, randomPlate(charset))}
                    >
                      🎲
                    </button>
                    <button
                      title={t.remove}
                      aria-label={`${t.remove}: ${t.plateLabel(index + 1)}`}
                      onClick={() =>
                        setPlates((list) => list.filter((item) => item.id !== plate.id))
                      }
                    >
                      ✕
                    </button>
                  </div>
                  {problem && <p className="generator-problem">{problem}</p>}
                </li>
              );
            })}
          </ol>
          <button
            className="generator-add"
            onClick={() => setPlates((list) => [...list, ...entries([randomPlate(charset)])])}
          >
            {t.add}
          </button>
        </section>
      </div>
    </main>
  );
}
