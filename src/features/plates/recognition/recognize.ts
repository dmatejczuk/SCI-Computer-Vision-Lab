import { segmentCharacters, type BinaryImage } from './segment';
import { recognizeBox, type Recognized, type Template } from './templates';

export type { Recognized } from './templates';

/**
 * Reads the characters in an Output image (white characters on black): segmentation,
 * normalisation to 24×40 and comparison with the font templates.
 */
export function recognize(image: BinaryImage, templates: Template[], maxCharacters = 12) {
  const { boxes, labels } = segmentCharacters(image, maxCharacters);
  const characters: Recognized[] = boxes.map((box) => recognizeBox(image, labels, box, templates));
  return { characters, text: characters.map((c) => c.char).join('') };
}

export interface VotedCharacter {
  char: string;
  confidence: number;
  alternatives: { char: string; confidence: number }[];
  /** How many of the recent frames agreed on this character. */
  agreement: number;
}

/**
 * Stabilises the reading over the last frames so it does not flicker: the most common
 * character count wins, then each position takes its most frequent character.
 */
export class Voter {
  private frames: Recognized[][] = [];
  constructor(private size = 7) {}
  push(characters: Recognized[]) {
    this.frames = [...this.frames.slice(-(this.size - 1)), characters];
  }
  clear() {
    this.frames = [];
  }
  get count() {
    return this.frames.length;
  }
  result(): VotedCharacter[] {
    const withText = this.frames.filter((frame) => frame.length > 0);
    if (!withText.length) return [];
    const lengths = new Map<number, number>();
    for (const frame of withText) lengths.set(frame.length, (lengths.get(frame.length) ?? 0) + 1);
    const length = [...lengths].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
    const frames = withText.filter((frame) => frame.length === length);
    return Array.from({ length }, (_, position) => {
      const votes = new Map<string, { count: number; confidence: number; last: Recognized }>();
      for (const frame of frames) {
        const item = frame[position];
        const vote = votes.get(item.char) ?? { count: 0, confidence: 0, last: item };
        vote.count++;
        vote.confidence += item.confidence;
        vote.last = item;
        votes.set(item.char, vote);
      }
      const [char, vote] = [...votes].sort(
        (a, b) => b[1].count - a[1].count || b[1].confidence - a[1].confidence,
      )[0];
      return {
        char,
        confidence: Math.round(vote.confidence / vote.count),
        alternatives: vote.last.alternatives,
        agreement: vote.count / frames.length,
      };
    });
  }
}
