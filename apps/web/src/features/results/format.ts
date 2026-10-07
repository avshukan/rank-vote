/** "1 point", "4 points" — a score as a sentence reads it. */
export function pointsLabel(score: number): string {
  return score === 1 ? '1 point' : `${score} points`;
}

const ORDINAL_RULES = new Intl.PluralRules('en-US', { type: 'ordinal' });
const ORDINAL_SUFFIXES: Partial<Record<Intl.LDMLPluralRule, string>> = {
  one: 'st',
  two: 'nd',
  few: 'rd',
};

/** A ballot place as an ordinal: 1st, 2nd, 3rd, 4th … 11th, 12th, 21st. */
export function ordinal(place: number): string {
  return `${place}${ORDINAL_SUFFIXES[ORDINAL_RULES.select(place)] ?? 'th'}`;
}
