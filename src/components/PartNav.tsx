import { plates } from '../i18n/plates';

/** Parts of the workshop: plate reader and gestures (AI Challenge). */
export type Part = 'plates' | 'gestures';

const PARTS: { part: Part; number: string; label: string }[] = [
  { part: 'plates', number: '1', label: plates.parts.platesShort },
  { part: 'gestures', number: '2', label: plates.parts.gesturesShort },
];

/** Switches between the workshop parts without losing the camera or a paired phone. */
export function PartNav({
  current,
  onChange,
  compact = false,
}: {
  current: Part;
  onChange: (part: Part) => void;
  compact?: boolean;
}) {
  return (
    <div
      className={compact ? 'part-nav compact' : 'part-switcher'}
      role="group"
      aria-label={plates.parts.label}
    >
      {PARTS.map(({ part, number, label }) => (
        <button
          key={part}
          aria-pressed={current === part}
          aria-label={`${plates.parts.part} ${number}: ${label}`}
          title={`${plates.parts.part} ${number}: ${label}`}
          onClick={() => onChange(part)}
        >
          {compact ? (
            <span className="part-number">{number}</span>
          ) : (
            `${plates.parts.part} ${number}: `
          )}
          {label}
        </button>
      ))}
    </div>
  );
}
