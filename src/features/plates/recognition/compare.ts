export type Verdict = 'ok' | 'wrong' | 'missing' | 'extra';

export interface Comparison {
  position: number;
  read: string;
  expected: string;
  verdict: Verdict;
}

/** Normalises what a student typed: capitals, no spaces or dashes. */
export function cleanPlate(text: string) {
  return text.toUpperCase().replace(/[\s-]/g, '');
}

/**
 * Splits a read plate the Polish way for display: the leading letters (at most 3, the district)
 * and the rest, e.g. "WE12345" → "WE 12345", "KOT2026" → "KOT 2026".
 */
export function formatPlate(text: string) {
  const plain = cleanPlate(text);
  const district = Math.min(3, plain.match(/^[A-Z]+/)?.[0].length ?? 0);
  return district && district < plain.length
    ? `${plain.slice(0, district)} ${plain.slice(district)}`
    : plain;
}

/**
 * Compares the reader's text with the plate the student assembled, position by position.
 * Every slot gets a verdict, so the screen can highlight misread characters.
 */
export function compareReading(read: string, typed: string): Comparison[] {
  const expected = cleanPlate(typed);
  const length = Math.max(read.length, expected.length);
  return Array.from({ length }, (_, position) => {
    const r = read[position] ?? '';
    const e = expected[position] ?? '';
    const verdict: Verdict = !r ? 'missing' : !e ? 'extra' : r === e ? 'ok' : 'wrong';
    return { position, read: r, expected: e, verdict };
  });
}
