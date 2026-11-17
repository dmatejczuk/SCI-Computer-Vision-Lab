import { useId, useMemo, useSyncExternalStore } from 'react';
import { MiniPlate } from '../../../components/MiniPlate';
import { plates as text } from '../../../i18n/plates';
import { DrawingSvg, usePlateFont } from '../../generator/PlateArt';
import { drawPlate } from '../../generator/plateDesign';
import { BitmapCanvas } from '../BitmapCanvas';
import type { PlateSession } from '../PlateSession';
import { cleanPlate, compareReading, formatPlate } from '../recognition/compare';
import { CONFIRM_CONFIDENCE } from '../recognition/confirm';
import type { ProcessResult } from '../worker/protocol';

const t = text.reader;

/** Draws the plate outline found by "Znajdź tablicę" over the camera picture. */
function drawRegion(context: CanvasRenderingContext2D, result: ProcessResult) {
  const quad = result.region;
  if (!quad) return;
  const sx = context.canvas.width / result.size.width;
  const sy = context.canvas.height / result.size.height;
  context.strokeStyle = '#3cdc5a';
  context.lineWidth = Math.max(2, context.canvas.width / 200);
  context.beginPath();
  quad.forEach((point, index) =>
    index ? context.lineTo(point.x * sx, point.y * sy) : context.moveTo(point.x * sx, point.y * sy),
  );
  context.closePath();
  context.stroke();
}

/** How sure the reader is of one character: drives its colour. */
const certainty = (confidence: number) =>
  confidence >= CONFIRM_CONFIDENCE ? 'sure' : confidence >= 55 ? 'unsure' : 'doubtful';

/**
 * The plate reader: the image before and after processing, the reading drawn as a printed
 * plate, how sure the reader is of every character, and the plates read so far.
 */
export function ReaderView({ plates }: { plates: PlateSession }) {
  const state = useSyncExternalStore(plates.subscribe, plates.getSnapshot);
  const { font } = usePlateFont();
  const inputId = useId();
  const read = state.reading.map((c) => c.char).join('');
  const typed = cleanPlate(state.myPlate);
  const comparison = typed ? compareReading(read, typed) : [];
  const mistakes = comparison.filter((item) => item.verdict !== 'ok');
  const { min, max } = state.expected;
  const complete = plates.complete;
  const sample = !!state.sample;
  const status = !read
    ? 'empty'
    : !complete
      ? 'incomplete'
      : sample
        ? read === cleanPlate(state.sample!.text)
          ? 'read'
          : 'checking'
        : state.confirmed === read
          ? 'read'
          : 'checking';
  const drawing = useMemo(
    () => (font ? drawPlate(font, formatPlate(read), 520) : null),
    [font, read],
  );
  return (
    <section className="reader" aria-label={t.title}>
      <div className="reader-images">
        <figure>
          <BitmapCanvas
            plates={plates}
            pick={(result) => result.source}
            label={t.before}
            overlay={drawRegion}
          />
          <figcaption>{t.before}</figcaption>
        </figure>
        <figure>
          <BitmapCanvas plates={plates} pick={(result) => result.output} label={t.after} />
          <figcaption>{t.after}</figcaption>
        </figure>
      </div>

      <div className="reader-result">
        <h2>{t.result}</h2>
        <div className={`reader-plate status-${status}`}>
          {drawing && (
            <DrawingSvg
              drawing={drawing}
              label={read ? `${t.readText}: ${read}` : t.nothing}
              className="reader-plate-svg"
            />
          )}
          <p className="reader-status" role="status" aria-live="polite">
            {status === 'empty' && t.statusEmpty}
            {status === 'incomplete' &&
              t.statusIncomplete(state.reading.length, min === max ? `${min}` : `${min}–${max}`)}
            {status === 'checking' && (sample ? t.statusMismatch : t.statusChecking)}
            {status === 'read' && t.statusRead}
          </p>
        </div>

        {state.reading.length > 0 && (
          <ol className="reader-chars" aria-label={t.certaintyLabel}>
            {state.reading.map((character, index) => (
              <li
                key={index}
                className={`${certainty(character.confidence)} ${comparison[index]?.verdict ?? ''}`}
                title={character.alternatives
                  .map((item) => `${item.char} ${item.confidence}%`)
                  .join(', ')}
              >
                <strong>{character.char}</strong>
                <span>{character.confidence}%</span>
              </li>
            ))}
          </ol>
        )}
        {state.reading.length > 0 && <p className="note">{t.certaintyHint(CONFIRM_CONFIDENCE)}</p>}

        <label className="my-plate" htmlFor={inputId}>
          <span>{t.myPlate}</span>
          <input
            id={inputId}
            type="text"
            autoComplete="off"
            spellCheck={false}
            maxLength={12}
            value={state.myPlate}
            placeholder={t.myPlateHint}
            onChange={(event) => plates.setMyPlate(event.target.value)}
          />
        </label>
        {typed && read && (
          <div
            className={`reader-feedback ${mistakes.length ? 'bad' : 'good'}`}
            role="status"
            aria-live="polite"
          >
            <p>{mistakes.length ? t.mistakes(mistakes.length) : t.allOk}</p>
            {mistakes.length > 0 && (
              <ul>
                {mistakes.map((item) => (
                  <li key={item.position}>
                    {item.position + 1}.{' '}
                    {item.verdict === 'extra'
                      ? t.extra(item.read)
                      : t.misread(item.read, item.expected)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {!sample && (
          <section className="reader-collected" aria-label={t.collected}>
            <h3>
              {t.collected} <span>{state.collected.length}</span>
            </h3>
            {state.collected.length ? (
              <ol>
                {state.collected.map((item) => (
                  <li key={item.text} className={item.text === state.confirmed ? 'current' : ''}>
                    <MiniPlate text={formatPlate(item.text)} />
                    {item.count > 1 && <span>×{item.count}</span>}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="note">{t.collectedEmpty}</p>
            )}
          </section>
        )}
      </div>

      {state.reading.length > 0 && (
        <details className="reader-details">
          <summary>{t.details}</summary>
          <table>
            <thead>
              <tr>
                <th>{t.position}</th>
                <th>{t.character}</th>
                <th>{t.confidence}</th>
                <th>{t.alternatives}</th>
              </tr>
            </thead>
            <tbody>
              {state.reading.map((character, index) => (
                <tr key={index}>
                  <td>{index + 1}</td>
                  <td className="reader-char">{character.char}</td>
                  <td>
                    <meter min={0} max={100} value={character.confidence} /> {character.confidence}%
                  </td>
                  <td>
                    {character.alternatives
                      .map((alternative) => `${alternative.char} ${alternative.confidence}%`)
                      .join(', ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </section>
  );
}
