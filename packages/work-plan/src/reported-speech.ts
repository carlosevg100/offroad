/**
 * Reported speech, one detector for every reader of a person's request (the lote 4 router, lote4-request.ts, and the
 * folder wait's withdrawal, apps/document-worker/src/document-folder-premises-proposal.ts), so the two never diverge.
 *
 * A segment is reported when a third-party subject with a speech or writing verb introduces it with "que", a colon, an
 * opening quote (any quote mark) or a dash; "segundo", "de acordo com" and "conforme" introduce one too. Attribution
 * carries to the closing quote of a quoted segment, otherwise to the end of the message. A first person introducer
 * ("eu disse:", "falei: pode cancelar") is the person's own and is never reported; a verb with no subject before it
 * is read as the person's.
 *
 * The text is folded (NFKD, combining marks removed, lower case) before it reaches these patterns.
 */

const speechVerbs = String.raw`disse|disseram|diz|dizem|falou|falaram|fala|falam|acha|acham|achou|acharam|afirmou|afirmaram|afirma|pediu|pediram|pede|`
  + String.raw`sugeriu|sugeriram|sugere|comentou|comentaram|informou|informaram|mencionou|mencionaram|garantiu|garantiram|garante|explicou|explicaram|`
  + String.raw`contou|contaram|escreveu|escreveram|escreve|respondeu|responderam|perguntou|perguntaram|avisou|avisaram|recomendou|recomendaram|`
  + String.raw`orientou|declarou|observou|alertou|ponderou|mandou|mandaram|avaliou|considera|consideram|considerou`;
/** The persons who speak for themselves: never a third party. */
const ownSpeakers = new Set(["eu", "nos", "gente", "voce", "voces", "vc"]);
/** Quote marks and dashes, by code point (the folded text keeps them). */
const opening = String.raw`["'“”‘’«»—–]|-\s`;
const introducer = new RegExp(String.raw`\b([a-z]+)\s+(?:(?:me|nos|lhe|lhes|ja|tambem|entao)\s+)?(?:${speechVerbs})\s*(?:\bque\b|:|(${opening}))`, "g");
const according = /\b(?:segundo|conforme|de acordo com)\b/g;
const closing = /["'“”‘’«»]/;

/** The reported segments of a folded message, as [start, end) offsets. */
export function reportedSegments(folded: string): [number, number][] {
  const out: [number, number][] = [];
  for (const m of folded.matchAll(introducer)) {
    if (ownSpeakers.has(m[1]!)) continue;
    const start = m.index! + m[0].length;
    // A quoted segment ends at its closing quote; anything else carries to the end of the message.
    const close = m[2] && m[2] !== "-" && !/[—–-]/.test(m[2]) ? closing.exec(folded.slice(start)) : null;
    out.push([m.index!, close ? start + close.index : folded.length]);
  }
  for (const m of folded.matchAll(according)) out.push([m.index!, folded.length]);
  return out;
}

/** Whether the folded message reports, at `index`, what a third party said. */
export function isReportedAt(folded: string, index: number): boolean {
  return reportedSegments(folded).some(([start, end]) => index >= start && index < end);
}
