import { useId, useSyncExternalStore } from 'react';
import { plates as text } from '../../../i18n/plates';
import { BitmapCanvas } from '../BitmapCanvas';
import type { PlateSession } from '../PlateSession';
import { cleanPlate, compareReading } from '../recognition/compare';
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

/** The plate reader: image before and after processing and the text that was read. */
export function ReaderView({ plates }: { plates: PlateSession }) {
  const state = useSyncExternalStore(plates.subscribe, plates.getSnapshot);
  const inputId = useId();
  const read = state.reading.map((c) => c.char).join('');
  const typed = cleanPlate(state.myPlate);
  const comparison = typed ? compareReading(read, typed) : [];
  const mistakes = comparison.filter((item) => item.verdict !== 'ok');
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
        {state.reading.length ? (
          <ol className="plate-tiles" aria-label={`${t.readText}: ${read}`}>
            {state.reading.map((character, index) => (
              <li
                key={index}
                className={`plate-tile ${comparison[index] ? comparison[index].verdict : ''}`}
                title={`${character.char} ${character.confidence}%`}
              >
                {character.char}
              </li>
            ))}
          </ol>
        ) : (
          <p className="reader-empty">{t.nothing}</p>
        )}
        <p className="note">{t.stable}</p>
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
        {typed && (
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
      </div>
      {state.reading.length > 0 && (
        <details className="reader-details" open>
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
