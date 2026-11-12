import { useEffect, useRef } from 'react';
import type { PlateSession } from './PlateSession';
import type { ProcessResult } from './worker/protocol';

/**
 * Draws one image of each worker result into a canvas without re-rendering React.
 * `pick` selects the bitmap (or returns null to keep the last picture).
 */
export function BitmapCanvas({
  plates,
  pick,
  label,
  className,
  onDoubleClick,
}: {
  plates: PlateSession;
  pick: (result: ProcessResult) => ImageBitmap | null | undefined;
  label: string;
  className?: string;
  onDoubleClick?: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const pickRef = useRef(pick);
  useEffect(() => {
    pickRef.current = pick;
  });
  useEffect(() => {
    const draw = (result: ProcessResult) => {
      const bitmap = pickRef.current(result);
      const element = canvas.current;
      if (!bitmap || !element || !bitmap.width) return;
      if (element.width !== bitmap.width || element.height !== bitmap.height) {
        element.width = bitmap.width;
        element.height = bitmap.height;
      }
      element.getContext('2d')?.drawImage(bitmap, 0, 0);
    };
    if (plates.latest) draw(plates.latest);
    return plates.onResult(draw);
  }, [plates]);
  return (
    <canvas
      ref={canvas}
      className={className}
      role="img"
      aria-label={label}
      width={160}
      height={120}
      onDoubleClick={onDoubleClick}
    />
  );
}
