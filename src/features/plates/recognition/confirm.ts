import type { VotedCharacter } from './recognize';

/** A plate the reader confirmed, with how many times it was read. */
export interface CollectedPlate {
  text: string;
  count: number;
  /** When it was last read (ms since epoch). */
  at: number;
}

/** Every character must be at least this similar to its template for a confirmed reading. */
export const CONFIRM_CONFIDENCE = 75;
/** The same complete reading must come back this many passes in a row. */
export const CONFIRM_PASSES = 5;

/**
 * Decides when a reading is certain enough to count as "plate read": complete (as many
 * characters as a plate has), every character clearly recognised, and the same text for several
 * passes in a row. A plate is confirmed once while it stays in view; it can be confirmed again
 * after it has left the picture for a moment.
 */
export class Confirmer {
  private candidate = '';
  private streak = 0;
  private gone = 0;
  /** The plate confirmed and still in view, or '' when none. */
  current = '';

  constructor(
    private passes = CONFIRM_PASSES,
    private minConfidence = CONFIRM_CONFIDENCE,
  ) {}

  /** Feeds one stabilised reading; returns the text when it has just been confirmed. */
  push(reading: VotedCharacter[], range: { min: number; max: number }): string | null {
    const text = reading.map((c) => c.char).join('');
    const certain =
      reading.length >= range.min &&
      reading.length <= range.max &&
      reading.every((c) => c.confidence >= this.minConfidence);
    if (!certain) {
      if (++this.gone >= this.passes) this.clear();
      return null;
    }
    this.gone = 0;
    this.streak = text === this.candidate ? this.streak + 1 : 1;
    this.candidate = text;
    if (this.streak < this.passes || text === this.current) return null;
    this.current = text;
    return text;
  }

  clear() {
    this.candidate = '';
    this.streak = 0;
    this.gone = 0;
    this.current = '';
  }
}

/**
 * Most plates kept in the collection. The phone rejects feeds with more than 200 entries,
 * so the list must stay well below that or the phone would silently stop updating.
 */
export const MAX_COLLECTED = 50;

/** Adds a confirmed plate to the collection: newest first, repeated plates counted. */
export function collect(list: CollectedPlate[], text: string, at = Date.now()): CollectedPlate[] {
  const previous = list.find((item) => item.text === text);
  return [
    { text, count: (previous?.count ?? 0) + 1, at },
    ...list.filter((item) => item.text !== text),
  ].slice(0, MAX_COLLECTED);
}
