import {z} from "zod";
import type {DocumentKind} from "@offroad/credit-ontology";

/**
 * The desk's knowledge, as data.
 *
 * Everything a credit desk "just knows" about a kind of operation — what it refuses to look at
 * without, what it needs to price, what it reads first, what usually goes wrong, and what
 * shape the paper takes — lives here as versioned, reviewable structure rather than inside a
 * prompt. Three consequences, and all three are the point:
 *
 *   - It can be **argued with**. A credit professional can read this file and say "that tenor
 *     band is wrong for this sector", and the fix is a diff, not a re-prompt.
 *   - It can be **tested**. Requirements resolve to document kinds the ontology actually
 *     defines; a typo is a failing test, not a silently missing checklist item.
 *   - It **accumulates**. Every recurring correction becomes a requirement, a risk or a
 *     synonym here — which is what "the system learns" has to mean when the alternative is a
 *     model that forgets.
 *
 * What is deliberately NOT here: anything that decides an outcome. The playbook says what to
 * look at and what usually matters. Whether a specific deal works is arithmetic over verified
 * facts, done by `financial-core`, and the endpoint is a qualified introduction — never an
 * approval.
 */

export const archetypeIdSchema = z.enum([
  "working_capital",
  "growth_expansion",
  "acquisition",
  "refinance",
  "equipment_finance",
  "venture_debt",
  "other",
]);
export type ArchetypeId = z.infer<typeof archetypeIdSchema>;

export const requirementLevelSchema = z.enum(["minimum", "ideal"]);
export type RequirementLevel = z.infer<typeof requirementLevelSchema>;

/**
 * What an item is *for*. Four purposes, because a company deserves to know which part of the
 * work its effort unblocks — and because the four are genuinely different jobs.
 *
 *   - `investor_case` — an investor will ask for it, and its absence is a question mark on the
 *     first call.
 *   - `financials` — the spreads and the ratios cannot be built without it.
 *   - `structure` — it sizes the operation or defines the security package.
 *   - `storytelling` — it is what turns a set of numbers into a business a reader understands.
 *     Underrated and usually missing: two identical credit profiles raise different amounts
 *     depending on whether anyone can explain what the company does and why now.
 */
export const requirementPurposeSchema = z.enum(["investor_case", "financials", "structure", "storytelling"]);
export type RequirementPurpose = z.infer<typeof requirementPurposeSchema>;

/**
 * How an item gets satisfied.
 *
 * `document` items are discharged by a file the pipeline classifies. `information` items are
 * discharged by the company answering — a number, a date, a paragraph. A desk asks for both,
 * and a request that only asks for files leaves the qualitative half of the case unwritten:
 * nobody uploads a document that explains why now, who the customers are, or what happens if
 * the biggest one leaves.
 *
 * `notice` is neither. It is something the company should know is coming and must not be asked
 * to do — the corporate approvals, the registrations, the certificates dated at signing. Making
 * it a source rather than a test exemption means nothing can accidentally start requesting one:
 * a notice has no file to send and no question to answer, and the type says so.
 */
export const requirementSourceSchema = z.enum(["document", "information", "notice"]);
export type RequirementSource = z.infer<typeof requirementSourceSchema>;

export const answerFormatSchema = z.enum(["text", "number", "date", "list", "currency", "percentage"]);
export type AnswerFormat = z.infer<typeof answerFormatSchema>;

/**
 * When the desk needs it — which is a different question from how much it matters.
 *
 * A company opening a request sees a list and reads it as the price of admission. If that list
 * is everything a fund will ever want, the company closes the tab; if it is only what we need
 * today and says nothing about what comes next, the company is ambushed in diligence three
 * weeks later and blames us for the surprise. Both failures come from the same omission: a
 * request with no time axis.
 *
 * So every item carries one. `now` is the deliberately small set needed to understand the
 * company and open the case. `structuring` is requested progressively, only after the initial
 * base has been read, and supports the proposed alternatives and institutional materials.
 * `diligence` is what a fund may ask once it is interested; shown, explained, and **not
 * requested yet**. `closing` is what only exists if the operation happens — named so nobody
 * is surprised, never a task.
 *
 * The stages map onto the market's own P0/P1/P2 vocabulary, but they are not labelled that way
 * for the company. "P1" tells a banker when something is needed and tells a founder nothing.
 */
export const requirementStageSchema = z.enum(["now", "structuring", "diligence", "closing"]);
export type RequirementStage = z.infer<typeof requirementStageSchema>;

/**
 * How a company can close an item without a file.
 *
 * A checklist whose only two states are "sent" and "missing" makes a company look delinquent
 * for things that genuinely do not apply to it — a business with no receivables facility has
 * no receivables ageing, and marking that permanently red trains people to ignore the whole
 * list. It also has nowhere to put "I sent last year's, this year's is with the auditor",
 * which is the single most common real answer.
 *
 * `not_applicable` requires a reason. Without one it is a way to make the list go away, and
 * an investor reading "not applicable" with no explanation learns nothing except that somebody
 * wanted the red mark gone.
 */
export const requirementResponseSchema = z.enum(["provided", "partial", "not_applicable", "after_nda", "unavailable"]);
export type RequirementResponse = z.infer<typeof requirementResponseSchema>;

/**
 * One thing the desk needs to see.
 *
 * `minimum` is the refusal line: without it the case cannot be opened, because no amount of
 * analysis compensates for not knowing whether the company has audited numbers or what it
 * already owes. `ideal` is the pricing line: with it the operation can be structured and
 * defended to an investor instead of merely described.
 *
 * `satisfiedBy` lists the document kinds that discharge the requirement — several, because a
 * company may have a trial balance where another has an ERP export, and both answer the same
 * question. `rationale` is shown to whoever is assembling the package: a checklist that says
 * *why* is a desk explaining itself; one that only says *what* is a form.
 */
export type Requirement = {
  id: string;
  level: RequirementLevel;
  /** Empty for information items; the document kinds that discharge a document item. */
  satisfiedBy: readonly DocumentKind[];
  labels: {pt: string; en: string};
  rationale: {pt: string; en: string};
  /** True when one document of any listed kind is enough; false when the desk expects coverage of a period. */
  singleDocument: boolean;
  /** What this item unblocks. At least one; usually two. */
  purposes: readonly RequirementPurpose[];
  /** A file, or an answer from the company. Defaults to `document` when omitted. */
  source?: RequirementSource;
  /**
   * When it is needed. Omitted means derived from `level`: minimum is `now`, ideal is
   * `structuring`. Set explicitly for true diligence or closing items, which are shown as a
   * roadmap and not turned into a current task.
   */
  stage?: RequirementStage;
  /**
   * The period and granularity expected, in the company's words.
   *
   * "Demonstrações financeiras" is not a request; "demonstrações auditadas dos últimos três
   * exercícios" is. Without the period a company sends the most recent year and both sides
   * discover the gap a week later.
   */
  period?: {pt: string; en: string};
  /** For information items: the shape of the answer expected. */
  answerFormat?: AnswerFormat;
  /** For information items: the question, phrased the way a banker would ask it. */
  question?: {pt: string; en: string};
  /** For information items: what a good answer looks like, so nobody guesses the format. */
  example?: {pt: string; en: string};
  /**
   * For document items: **what file to actually send**, named the way the company calls it.
   *
   * A requirement labelled "Historical financial statements" is a category, and a company
   * staring at a category sends the wrong thing or nothing at all. What unblocks people is the
   * concrete artifact — "the audited PDF signed by the auditor, one per year", "the ERP export
   * in .xlsx with one tab per account", "the deck you already use with investors" — because
   * they know exactly which file on which drive that is.
   *
   * Each entry is one artifact, with its usual format in parentheses. Several because a company
   * may hold the same information in different shapes, and the desk takes whichever exists.
   */
  accepts?: readonly {pt: string; en: string}[];
};

/** What the desk reads first, and what it is reading for. */
export type AnalysisFocus = {
  id: string;
  labels: {pt: string; en: string};
  /** The question this focus exists to answer. */
  question: {pt: string; en: string};
  /** Field paths and calculations that carry the answer. Resolved against the ontology. */
  evidence: readonly string[];
};

/** A way this kind of operation usually goes wrong. Stated as a hypothesis to test, never as a verdict. */
export type ArchetypeRisk = {
  id: string;
  labels: {pt: string; en: string};
  /** What the desk looks at to confirm or dismiss it. */
  test: {pt: string; en: string};
  severity: "critical" | "high" | "medium";
};

/**
 * The shape the paper usually takes. Bands, not promises: they frame a conversation with an
 * investor and are never quoted to a company as terms.
 */
export type StructureMenu = {
  tenorMonths: {typical: [number, number]; outer: [number, number]};
  gracePeriodMonths: {typical: [number, number]};
  amortization: readonly string[];
  collateral: readonly string[];
  covenants: readonly string[];
  /**
   * What the market will carry for this kind of operation, as a decimal string.
   *
   * `leverageCeiling` is net debt / adjusted EBITDA at closing — the level above which this
   * paper stops finding buyers, not a covenant and not a target. `minimumDscr` is the coverage
   * a lender underwrites to. Both are the conservative end of what the desk has seen clear;
   * they size the operation, and they are the numbers a credit professional will argue with
   * first, which is why they are data rather than a constant buried in a function.
   */
  leverageCeiling: string;
  minimumDscr: string;
  notes: {pt: string; en: string};
};

/** A question the desk asks the company before it can go further. */
export type StandardQuestion = {
  id: string;
  labels: {pt: string; en: string};
  /** Which analysis focus it unblocks. */
  focusId: string;
  materiality: "material" | "supporting";
};

export type Archetype = {
  id: ArchetypeId;
  labels: {pt: string; en: string};
  description: {pt: string; en: string};
  requirements: readonly Requirement[];
  focus: readonly AnalysisFocus[];
  risks: readonly ArchetypeRisk[];
  structure: StructureMenu;
  questions: readonly StandardQuestion[];
};
