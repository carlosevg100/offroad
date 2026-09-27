/**
 * What a person reads on an intake screen, and what must never be in it (stage 19, second polish):
 * a field path, an internal identifier, an em dash or an en dash, or a division printed as a number.
 * Test support only.
 */

/** The markup without its tags and attributes, one text per line. */
export const visible = (markup: string) =>
  markup.replace(/<[^>]+>/g, "\n").replace(/&#x27;/g, "'").replace(/&quot;/g, "\"").replace(/&amp;/g, "&");

// Word edges that know accented letters: "sa" is not a word inside "saída".
const word = (pattern: string) => new RegExp(`(?<![\\p{L}\\p{N}_])(?:${pattern})(?![\\p{L}\\p{N}_])`, "gu");

/** Every leak in a visible text: dashes, snake_case identifiers, dotted field paths, division text, keys printed as labels. */
export function leaks(text: string): string[] {
  return [
    ...(text.match(/[\u2013\u2014]/g) ?? []).map(() => "dash"),
    ...(text.match(word("[a-z]+_[a-z0-9_]+")) ?? []),
    ...(text.match(word("[a-z_]{2,}\\.[a-z0-9_{}]{2,}(?:\\.[a-z0-9_{}]+)*")) ?? []),
    ...(text.match(word("Infinity|NaN|undefined|null")) ?? []),
    // An identifier printed as a label: a legal form by its key, or a module number as a kicker.
    ...(text.match(word("M[2-8]|sa|ltda")) ?? []),
  ];
}
