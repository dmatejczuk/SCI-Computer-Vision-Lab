import opentype from 'opentype.js';
import { useEffect, useState } from 'react';
import { plateConfig } from '../plates/plateConfig';
import { svgPath, type Drawing } from './plateDesign';

let shared: Promise<opentype.Font> | null = null;

/** Loads the plate font once per page (the same font the reader's templates use). */
export function usePlateFont() {
  const [font, setFont] = useState<opentype.Font | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    shared ??= fetch(plateConfig.font.file)
      .then((response) => {
        if (!response.ok) throw new Error(`${response.status}`);
        return response.arrayBuffer();
      })
      .then((buffer) => opentype.parse(buffer));
    shared
      .then((loaded) => !cancelled && setFont(loaded))
      .catch((error) => {
        console.error('[plates] font', error);
        shared = null;
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return { font, failed };
}

/** A drawing (mm units) as inline SVG: plates, pieces and print sheets on screen. */
export function DrawingSvg({
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
