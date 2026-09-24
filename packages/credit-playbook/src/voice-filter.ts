/**
 * Deterministic voice filter compiled from two sources:
 *
 * - Source A: procedure section "N4. Voz e três níveis de afirmação", lines 207 to 219 of
 *   `knowledge/procedures/capital/prepare-capital-structure-decision.md`, plus the T1 sentence
 *   (line 227) that keeps the composition labels off the interface.
 * - Source B: the founder's banker filter, the list of constructions a banker never writes.
 *
 * It inspects strings that reach a reader and reports the patterns the house refuses. It never
 * rewrites a string and never judges the substance behind it: N4 and Q2 both say that a clean
 * lexical pass does not certify a good opinion. Every rule is data (what it matches, how severe
 * it is, which paragraph justifies it), so a reviewer can read the policy without reading code.
 *
 * The characters the rules ban are built from their code points on purpose: the house style
 * test walks every package for the literal, and the rule that names a character must not be an
 * offender.
 * The offending example words live in the test corpus, as N4 asks, not here.
 */

export const VOICE_FILTER_VERSION = "2026.09.24-v1";

export type VoiceChannel = "packet" | "screen" | "catalogue";
export type VoiceSeverity = "block" | "warn";
export type VoiceRuleId = `VF-${string}`;
/** The slice of a string a rule is tested against; also the unit a finding reports. */
export type VoiceScope = "text" | "line" | "sentence";
export type VoiceLevel = "fato" | "leitura" | "recomendacao" | "indeterminado";

export type VoiceString = {id: string; text: string};

export type VoiceRule = {
  id: VoiceRuleId;
  /** Stable snake_case code, in the style of the conduct policy findings. */
  code: string;
  severity: VoiceSeverity;
  /** The source paragraph that justifies the rule, quoting the phrase where the source names it. */
  origin: string;
  description: string;
  scope: VoiceScope;
  /** The unit fires when any pattern matches it; a string pattern is a case-sensitive literal. */
  patterns: readonly (RegExp | string)[];
  /** A unit that also matches this is exempt: the number that turns "não fecha" into a calculation. */
  unless?: RegExp;
  /** What the reader sees next to the finding, in pt-BR like the conduct policy messages. */
  message: string;
};

/**
 * Shaped after `ConductFinding` (ruleId, code, severity, message) so both audits can be listed
 * together. The severity vocabulary is the one the voice brief fixes, `block` or `warn`; a
 * consumer merging into a conduct audit maps `warn` to `review`.
 */
export type VoiceFinding = {
  ruleId: VoiceRuleId;
  code: string;
  severity: VoiceSeverity;
  message: string;
  channel: VoiceChannel;
  /** The id given with the string, or its index when the caller passed plain strings. */
  stringId: string;
  /** The matched text with a little context, so a reader can locate it without the rule. */
  excerpt: string;
};

const EM_DASH = String.fromCodePoint(0x2014);
const EN_DASH = String.fromCodePoint(0x2013);
const N4 = "prepare-capital-structure-decision.md, N4";
const T1 = "prepare-capital-structure-decision.md, T1";
const FOUNDER = "founder's banker filter";

/**
 * `\b` in a JavaScript regex only knows ASCII letters, so "ótimo" and "quê" never sit on a
 * word boundary. These lookarounds are the Unicode-aware equivalent.
 */
const NOT_WORD_BEFORE = "(?<![\\p{L}\\p{N}_])";
const NOT_WORD_AFTER = "(?![\\p{L}\\p{N}_])";

function words(source: string, flags: "u" | "iu" = "iu"): RegExp {
  return new RegExp(`${NOT_WORD_BEFORE}(?:${source})${NOT_WORD_AFTER}`, flags);
}

/** A digit anywhere in the unit: the account behind "não fecha" or behind a verdict. */
const HAS_NUMBER = /\d/u;

export const voiceRules: readonly VoiceRule[] = [
  {
    id: "VF-01",
    code: "em_dash",
    severity: "block",
    origin: `${N4} line 219: "travessões em qualquer texto entregue"; ${FOUNDER}: U+2014`,
    description: "The em dash (U+2014) anywhere in a delivered string.",
    scope: "text",
    patterns: [EM_DASH],
    message: "Travessão (U+2014) proibido em qualquer texto entregue.",
  },
  {
    id: "VF-02",
    code: "en_dash",
    severity: "block",
    origin: `${FOUNDER}: U+2013`,
    description: "The en dash (U+2013) anywhere in a delivered string.",
    scope: "text",
    patterns: [EN_DASH],
    message: "Meia-risca (U+2013) proibida em qualquer texto entregue.",
  },
  {
    id: "VF-03",
    code: "emoji",
    severity: "block",
    origin: `${N4} line 219: "emoji"; ${FOUNDER}: emoji`,
    description: "A character with default emoji presentation, or a pictograph forced into emoji presentation by U+FE0F.",
    scope: "text",
    patterns: [/\p{Emoji_Presentation}/u, /\p{Extended_Pictographic}\u{FE0F}/u],
    message: "Emoji proibido em texto entregue.",
  },
  {
    id: "VF-04",
    code: "ai_self_reference",
    severity: "block",
    origin: `${N4} line 219: "como IA"; ${FOUNDER}: "como IA", "como modelo de linguagem"`,
    description: "The system speaking as an AI or as a language model, in pt-BR or en-US. The acronym is matched case-sensitively so that the verb form \"como ia\" is left alone.",
    scope: "text",
    patterns: [
      words("[Cc]omo\\s+(?:uma\\s+)?IA", "u"),
      words("como\\s+(?:um\\s+)?modelo\\s+de\\s+linguagem"),
      words("[Aa]s\\s+an\\s+AI", "u"),
      words("as\\s+a\\s+language\\s+model"),
    ],
    message: "O texto fala como IA ou como modelo de linguagem.",
  },
  {
    id: "VF-05",
    code: "filler",
    severity: "block",
    origin: `${N4} line 219: "vale destacar", "ótima pergunta"; ${FOUNDER}: "vale destacar", "ótima pergunta"`,
    description: "Conversational filler the house refuses, with the en-US equivalent of the compliment.",
    scope: "text",
    patterns: [words("vale\\s+destacar|ótima\\s+pergunta|great\\s+question")],
    message: "Preenchimento de conversa proibido pela voz da casa.",
  },
  {
    id: "VF-06",
    code: "third_party_certainty",
    severity: "block",
    origin: `${N4} line 219: "certeza sobre o comportamento do banco", "Usar probabilidade para terceiros"; ${FOUNDER}: "o banco vai", "o investidor vai aceitar", "o mercado vai"`,
    description: "A bank, investor or market announced as certain to act (\"vai\" and its plural and future forms), in pt-BR or en-US. Possibility (\"pode\") and probability pass.",
    scope: "text",
    patterns: [
      words("(?:o|os)\\s+(?:bancos?|investidor(?:es)?|mercados?)\\s+(?:não\\s+)?(?:vai|vão|irá|irão)"),
      words("the\\s+(?:banks?|investors?|market)\\s+will"),
    ],
    message: "Certeza sobre o comportamento de terceiro; usar probabilidade.",
  },
  {
    id: "VF-07",
    code: "bad_faith_framing",
    severity: "block",
    origin: `${N4} line 219: "linguagem de ocultar restrições"; ${FOUNDER}: "antes que a diligência", "antes que descubram"`,
    description: "Framing that treats a restriction as something to hide from the counterparty.",
    scope: "text",
    patterns: [words("antes\\s+que\\s+(?:a\\s+diligência|descubram)")],
    message: "Enquadramento de má-fé: a restrição se declara, não se esconde.",
  },
  {
    id: "VF-08",
    code: "not_x_but_y",
    severity: "warn",
    origin: `${N4} line 219: a construção "não é X, é Y"; ${FOUNDER}: the construction "não é X, é Y"`,
    description: "The rhetorical contrast \"não é X, é Y\" inside one sentence, in pt-BR or en-US.",
    scope: "sentence",
    patterns: [
      /(?<![\p{L}\p{N}_])não\s+(?:é|são)\s+[^.;:!?\n]{1,80}?,\s*(?:é|são)\s+/iu,
      /(?:is\s+not|isn't|'s\s+not)\s+[^.;:!?\n]{1,80}?,\s*(?:it's|it\s+is)\s+/iu,
    ],
    message: "Construção \"não é X, é Y\" recusada pela voz da casa.",
  },
  {
    id: "VF-09",
    code: "does_not_close_without_number",
    severity: "warn",
    origin: `${N4} line 219: Não usar "não fecha" sem a conta; ${FOUNDER}: "não fecha" (or "não para em pé") without a number in the same sentence`,
    description: "\"Não fecha\" or \"não para em pé\" in a sentence that carries no number.",
    scope: "sentence",
    patterns: [words("não\\s+(?:fecha|fecham|para\\s+em\\s+pé|param\\s+em\\s+pé)")],
    unless: HAS_NUMBER,
    message: "\"Não fecha\" sem a conta na mesma frase.",
  },
  {
    id: "VF-10",
    code: "verdict_without_number",
    severity: "warn",
    origin: `${N4} line 219: "Não dar veredito aceitar/recusar por padrão; usá-lo quando a decisão solicitada exigir, com sustentação"; ${FOUNDER}: binary verdicts without the number behind them`,
    description: "A sentence that opens with the verdict, or recommends it, without a number behind it.",
    scope: "sentence",
    patterns: [
      /^[\s"'“”‘’(*•-]*(?:aceitar|recusar|aceite|recuse)(?![\p{L}\p{N}_])/iu,
      words("(?:recomend(?:o|amos)|convém|deve(?:m|ria|riam)?|vale)\\s+(?:aceitar|recusar)"),
    ],
    unless: HAS_NUMBER,
    message: "Veredito aceitar/recusar sem o número que o sustenta.",
  },
  {
    id: "VF-11",
    code: "superlative",
    severity: "warn",
    origin: `${FOUNDER}: "ótimo", "excelente", "perfeito", "incrível"; ${N4} line 219: "adjetivo sem fundamento", "número ou lógica no lugar de ênfase"`,
    description: "Superlatives as emphasis, with their en-US equivalents.",
    scope: "text",
    patterns: [words("ótim[oa]s?|excelentes?|perfeit[oa]s?|incrív(?:el|eis)|excellent|perfect|incredible|amazing")],
    message: "Superlativo no lugar de número ou lógica.",
  },
  {
    id: "VF-12",
    code: "exclamation",
    severity: "warn",
    origin: `${N4} line 219: "slogans, manchetes artificiais"; ${FOUNDER}: slogans and marketing metaphors`,
    description: "An exclamation mark, the lexical trace of a slogan or headline. The sources name no metaphor vocabulary, so competition and catastrophe metaphors stay with semantic review.",
    scope: "text",
    patterns: [/!(?!=)/u],
    message: "Ponto de exclamação: marca de slogan ou manchete.",
  },
  {
    id: "VF-13",
    code: "stamped_label",
    severity: "warn",
    origin: `${N4} line 217: "não precisam virar etiquetas em cada linha da tela"; ${T1} line 227: "esses rótulos não são estampados na interface"; ${FOUNDER}: "what matters", "why", "implication", "o que importa", "por quê", "implicação" used as labels`,
    description: "A line that consists only of a composition label and a colon.",
    scope: "line",
    patterns: [/^[\s#*_>-]*(?:what\s+matters|why|implication|o\s+que\s+importa|por\s+qu[eê]|implicação)[\s*_]*:[\s*_]*$/iu],
    message: "Rótulo de composição estampado na tela.",
  },
];

export type AuditVoiceOptions = {channel: VoiceChannel};

/**
 * Audits every string in order and returns the findings in order: by string, then by rule, then
 * by unit. Pure and deterministic: the same input always yields the same list.
 */
export function auditVoice(strings: readonly string[] | readonly VoiceString[], options: AuditVoiceOptions): VoiceFinding[] {
  const findings: VoiceFinding[] = [];
  strings.forEach((entry, index) => {
    const {id, text} = typeof entry === "string" ? {id: String(index), text: entry} : entry;
    for (const rule of voiceRules) {
      for (const unit of unitsOf(text, rule.scope)) {
        if (rule.unless?.test(unit)) continue;
        const match = firstMatch(rule.patterns, unit);
        if (!match) continue;
        findings.push({
          ruleId: rule.id,
          code: rule.code,
          severity: rule.severity,
          message: rule.message,
          channel: options.channel,
          stringId: id,
          excerpt: excerpt(unit, match),
        });
      }
    }
  });
  return findings;
}

const LEVEL_MARKERS: Readonly<Record<Exclude<VoiceLevel, "indeterminado">, readonly RegExp[]>> = {
  // The action verbs of a recommendation, plus the first-person conditional of the N4 example.
  recomendacao: [words("recomend(?:o|amos)|convém|deve(?:m|ria|riam)?|vale|tentaria")],
  // Interpretation with an owner, as in the N4 example "Minha leitura é que".
  leitura: [words("parece(?:m)?|sugere(?:m)?|indica(?:m)?|lê-se|(?:minha|nossa)\\s+leitura")],
  // Numbers, units and dates: the marks of a statement with an origin.
  fato: [HAS_NUMBER, /R\$|US\$|%/u, words("bps")],
};

/**
 * Lexical reading of the three N4 levels. Informational only: it never blocks, and a sentence
 * with markers of more than one level takes the most committed one, since the words of a
 * recommendation or of a reading are chosen while numbers are everywhere.
 */
export function classifyLevel(sentence: string): VoiceLevel {
  for (const level of ["recomendacao", "leitura", "fato"] as const) {
    if (LEVEL_MARKERS[level].some((pattern) => pattern.test(sentence))) return level;
  }
  return "indeterminado";
}

type Match = {index: number; length: number};

function unitsOf(text: string, scope: VoiceScope): string[] {
  if (scope === "text") return [text];
  const lines = text.split(/\r?\n/u);
  const units = scope === "line" ? lines : lines.flatMap((line) => line.split(/(?<=[.!?;])\s+/u));
  return units.filter((unit) => unit.trim().length > 0);
}

function firstMatch(patterns: readonly (RegExp | string)[], unit: string): Match | null {
  for (const pattern of patterns) {
    if (typeof pattern === "string") {
      const index = unit.indexOf(pattern);
      if (index >= 0) return {index, length: pattern.length};
      continue;
    }
    const found = pattern.exec(unit);
    if (found) return {index: found.index, length: found[0].length};
  }
  return null;
}

const CONTEXT = 40;

function excerpt(unit: string, match: Match): string {
  const start = Math.max(0, match.index - CONTEXT);
  const end = Math.min(unit.length, match.index + match.length + CONTEXT);
  const body = unit.slice(start, end).replace(/\s+/gu, " ").trim();
  return `${start > 0 ? "..." : ""}${body}${end < unit.length ? "..." : ""}`;
}
