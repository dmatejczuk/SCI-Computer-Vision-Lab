/**
 * Random plate numbers in the Polish style: a district code (2–3 letters), a space and a
 * distinguishing part, 7–8 characters in total. As on real plates, the distinguishing part
 * avoids B, D, I, O and Z, which are easily confused with 8, 0, 1 and 2.
 */
const VOIVODESHIPS = 'BCDEFGKLNOPRSTWZ';
const LETTERS = 'ABCDEFGHJKLMNPRSTUVWXYZ';
const SAFE_LETTERS = 'ACEFGHJKLMNPRSTUVWXY';
const DIGITS = '0123456789';

// D = digit, L = letter (distinguishing part).
const TWO_LETTER_DISTRICT = ['DDDDD', 'DDDDL', 'DDDLL', 'DLDDD', 'DLLDD'];
const THREE_LETTER_DISTRICT = [
  'LDDD',
  'DDLL',
  'DLDD',
  'DLLD',
  'LLDD',
  'DDDDD',
  'DDDDL',
  'DDDLL',
  'DLDDD',
  'DLLDD',
];

export type Random = () => number;

const pick = (from: string, random: Random, allowed: Set<string>) => {
  const options = [...from].filter((char) => allowed.has(char));
  return options[Math.floor(random() * options.length)] ?? '';
};

/** One random plate number, restricted to the characters in `charset`. */
export function randomPlate(charset: string, random: Random = Math.random): string {
  const allowed = new Set([...charset]);
  const threeLetters = random() < 0.4;
  const district =
    pick(VOIVODESHIPS, random, allowed) +
    pick(LETTERS, random, allowed) +
    (threeLetters ? pick(LETTERS, random, allowed) : '');
  const patterns = threeLetters ? THREE_LETTER_DISTRICT : TWO_LETTER_DISTRICT;
  const pattern = patterns[Math.floor(random() * patterns.length)];
  const rest = [...pattern]
    .map((kind) => pick(kind === 'D' ? DIGITS : SAFE_LETTERS, random, allowed))
    .join('');
  return `${district} ${rest}`;
}

/** `count` different random plates. */
export function randomPlates(count: number, charset: string, random: Random = Math.random) {
  const plates = new Set<string>();
  for (let tries = 0; plates.size < count && tries < count * 50; tries++)
    plates.add(randomPlate(charset, random));
  return [...plates];
}
