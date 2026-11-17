import { plateConfig } from '../features/plates/plateConfig';

// The plate font, so small plates on screen look like the printed ones ("Plate" font family).
if (typeof FontFace !== 'undefined' && !document.fonts.check('12px Plate'))
  void new FontFace('Plate', `url(${plateConfig.font.file})`)
    .load()
    .then((face) => document.fonts.add(face))
    .catch(() => {});

/** A small plate in the style of the printed ones: SCI band and black characters. */
export function MiniPlate({ text, className = '' }: { text: string; className?: string }) {
  return (
    <span className={`mini-plate ${className}`} aria-label={text}>
      <span className="mini-plate-band" aria-hidden="true">
        SCI
      </span>
      <span className="mini-plate-text" aria-hidden="true">
        {text}
      </span>
    </span>
  );
}
