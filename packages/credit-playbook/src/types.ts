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
  "other",
]);
export type ArchetypeId = z.infer<typeof archetypeIdSchema>;

export const requirementLevelSchema = z.enum(["minimum", "ideal"]);
export type RequirementLevel = z.infer<typeof requirementLevelSchema>;

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
  satisfiedBy: readonly DocumentKind[];
  labels: {pt: string; en: string};
  rationale: {pt: string; en: string};
  /** True when one document of any listed kind is enough; false when the desk expects coverage of a period. */
  singleDocument: boolean;
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
