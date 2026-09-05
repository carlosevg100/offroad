/**
 * Execution of one preview step: which executor runs, on which input, with which premises, and
 * what the artifact records. Every number comes from the executor; this module only binds inputs,
 * applies the declared premises of the turn and derives the facts the material planner may cite,
 * each one read back from the signed output it points to.
 */
import {createHash} from "node:crypto";
import Decimal from "decimal.js";
import {z} from "zod";

import {case01Evidence, case01EvidenceManifest, type Case01Evidence} from "../cases/gc01";
import * as executors from "../executors";
import type {BriefInput} from "../executors/plan-meeting-brief";
import {case01PreviewSteps, previewStepByTask, type PreviewComposition, type PreviewWorkflowStep} from "./workflow";

export const previewPremisesSchema = z.object({
  /** Annual rate of the new debt of every alternative that raises one, as a decimal ("0.1425"). */
  newDebtAnnualRate: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  newDebtTermMonths: z.number().int().positive().max(360).optional(),
  newDebtGraceMonths: z.number().int().nonnegative().max(120).optional(),
}).strict();
export type PreviewPremises = z.infer<typeof previewPremisesSchema>;

export type PreviewStepOutput = Record<string, unknown> & {state?: string; trace?: {inputFingerprint?: string; outputFingerprint?: string}};

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
/** The same canonical form the meeting brief executor uses to sign object content. */
export const stableStringify = (value: unknown): string => JSON.stringify(value, (_key, inner: unknown) => (inner && typeof inner === "object" && !Array.isArray(inner) ? Object.fromEntries(Object.entries(inner as Record<string, unknown>).sort(([a], [b]) => compare(a, b))) : inner));
export const fingerprintOf = (value: unknown): string => createHash("sha256").update(stableStringify(value)).digest("hex");

export type PreviewRequest = {
  turn: number;
  composition: PreviewComposition;
  audience: {primary: string; others?: string[]} | null;
  form: BriefInput["request"]["form"];
  pages: number | null;
  sponsorInstruction: string | null;
  undefinedAspects: BriefInput["request"]["undefinedAspects"];
};

export type PreviewRunContext = {
  evidence: Case01Evidence;
  premises: PreviewPremises;
  /** Outputs of the steps already executed in this run or replayed from prior artifacts, by TaskSpec id. */
  outputs: Map<string, PreviewStepOutput>;
  request: PreviewRequest;
  /** The prior meeting brief, when one was planned before: its output and the fingerprints of the objects it saw, so the new plan names what changed. */
  previousBrief: {output: PreviewStepOutput; objectFingerprints: Record<string, string>} | null;

  /** Questions generated from the objects' gaps for the brief planner; when absent, the fixed alignment points of the first readout. */
  candidateQuestions?: BriefInput["candidateQuestions"];
  /** Answers the person gave to earlier questions, carried into the sponsor instruction the planner reads. */
  answers?: Array<{questionId: string; answer: string}>;
};

/** Which premises a step consumes: they enter its input fingerprint, so a changed premise recomputes exactly the steps it touches. */
export function premisesFor(step: PreviewWorkflowStep, premises: PreviewPremises): Partial<PreviewPremises> {
  if (step.methodId === "compare-refinancing-before-after" || step.methodId === "plan-meeting-brief") return premises;
  return {};
}

/** The input a step runs on, with the premises of the turn applied where they belong. */
export function previewStepInput(step: PreviewWorkflowStep, context: PreviewRunContext): unknown {
  const evidence = context.evidence;
  switch (step.methodId) {
    case "build-debt-ledger": return evidence["build-debt-ledger"];
    case "reconcile-financial-statements": return evidence["reconcile-financial-statements"];
    case "reconcile-covenant-definitions": return evidence["reconcile-covenant-definitions"];
    case "diagnose-maturity-wall": return evidence["diagnose-maturity-wall"];
    case "build-interest-and-indexation-schedule": return evidence["build-interest-and-indexation-schedule"];
    case "estimate-exit-cost-by-series": return evidence["estimate-exit-cost-by-series"];
    case "declare-scenarios": return evidence["declare-scenarios"];
    case "compare-refinancing-before-after": {
      const base = evidence["compare-refinancing-before-after"];
      const premises = context.premises;
      if (!premises.newDebtAnnualRate && premises.newDebtTermMonths === undefined && premises.newDebtGraceMonths === undefined) return base;
      return {
        ...base,
        alternatives: base.alternatives.map((alternative) => (alternative.newDebt ? {
          ...alternative,
          newDebt: {
            ...alternative.newDebt,
            ...(premises.newDebtAnnualRate ? {annualRate: premises.newDebtAnnualRate} : {}),
            ...(premises.newDebtTermMonths !== undefined ? {termMonths: premises.newDebtTermMonths} : {}),
            ...(premises.newDebtGraceMonths !== undefined ? {graceMonths: premises.newDebtGraceMonths} : {}),
            origin: `${alternative.newDebt.origin}; premissa alterada na conversa (integration_preview): ${describePremises(premises)}`,
          },
        } : alternative)),
      };
    }
    case "plan-meeting-brief": return meetingBriefInput(context);
    default: throw new Error(`no input binding for method ${step.methodId}`);
  }
}

export function describePremises(premises: PreviewPremises): string {
  const parts: string[] = [];
  if (premises.newDebtAnnualRate) parts.push(`taxa da nova dívida ${new Decimal(premises.newDebtAnnualRate).times(100).toFixed(2)}% a.a.`);
  if (premises.newDebtTermMonths !== undefined) parts.push(`prazo ${premises.newDebtTermMonths} meses`);
  if (premises.newDebtGraceMonths !== undefined) parts.push(`carência ${premises.newDebtGraceMonths} meses`);
  return parts.join(", ") || "nenhuma";
}

/** Runs the executor bound to the step. Deterministic: same input, same output, same fingerprints. */
export function runPreviewStep(step: PreviewWorkflowStep, context: PreviewRunContext): {input: unknown; output: PreviewStepOutput} {
  const input = previewStepInput(step, context);
  const output = (() => {
    switch (step.methodId) {
      case "build-debt-ledger": return executors.buildDebtLedger(input as Parameters<typeof executors.buildDebtLedger>[0]);
      case "reconcile-financial-statements": return executors.reconcileFinancialStatements(input as Parameters<typeof executors.reconcileFinancialStatements>[0]);
      case "reconcile-covenant-definitions": return executors.reconcileCovenantDefinitions(input as Parameters<typeof executors.reconcileCovenantDefinitions>[0]);
      case "diagnose-maturity-wall": return executors.diagnoseMaturityWall(input as Parameters<typeof executors.diagnoseMaturityWall>[0]);
      case "build-interest-and-indexation-schedule": return executors.buildInterestAndIndexationSchedule(input as Parameters<typeof executors.buildInterestAndIndexationSchedule>[0]);
      case "estimate-exit-cost-by-series": return executors.estimateExitCostBySeries(input as Parameters<typeof executors.estimateExitCostBySeries>[0]);
      case "declare-scenarios": return executors.declareScenarios(input as Parameters<typeof executors.declareScenarios>[0]);
      case "compare-refinancing-before-after": return executors.compareRefinancingBeforeAfter(input as Parameters<typeof executors.compareRefinancingBeforeAfter>[0]);
      case "plan-meeting-brief": return executors.planMeetingBrief(input as BriefInput);
      default: throw new Error(`no executor bound to method ${step.methodId}`);
    }
  })();
  return {input, output: output as unknown as PreviewStepOutput};
}

const objectKindByMethod: Record<string, BriefInput["objects"][number]["kind"]> = {
  "build-debt-ledger": "debt_ledger",
  "reconcile-financial-statements": "reconciliation",
  "reconcile-covenant-definitions": "covenants",
  "diagnose-maturity-wall": "maturity_wall",
  "build-interest-and-indexation-schedule": "interest_schedule",
  "estimate-exit-cost-by-series": "exit_costs",
  "declare-scenarios": "scenarios",
  "compare-refinancing-before-after": "before_after",
};

const objectStates = ["complete", "resolved", "closes", "declared", "compared", "diagnosed", "conditioned", "incomplete", "partial", "open_divergences", "identity_failed", "blocked"] as const;
type ObjectState = (typeof objectStates)[number];

/** The state the brief planner understands, from the state the executor emitted. */
export function briefObjectState(output: PreviewStepOutput): ObjectState {
  const state = typeof output.state === "string" ? output.state : "blocked";
  return (objectStates as readonly string[]).includes(state) ? (state as ObjectState) : "blocked";
}

type Headline = NonNullable<BriefInput["objects"][number]["headlines"]>[number];

const ptNumber = (value: string): string => {
  const decimal = new Decimal(value);
  const [integer, fraction] = decimal.toFixed().replace(/^-/, "").split(".") as [string, string | undefined];
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${decimal.isNegative() ? "-" : ""}${grouped}${fraction ? `,${fraction}` : ""}`;
};
const leaf = (value: unknown, path: string): unknown => path.split(".").reduce<unknown>((current, key) => (current && typeof current === "object" ? (current as Record<string, unknown>)[key] : undefined), value);
const decimalLeaf = (value: unknown, path: string): string | null => {
  const found = leaf(value, path);
  if (typeof found !== "string" && typeof found !== "number") return null;
  try { return new Decimal(found).toFixed(); } catch { return null; }
};

/**
 * Facts the material may cite, each read back from the signed output. A fact is only emitted when
 * the field it quotes exists; nothing is restated by hand.
 */
export function headlinesFor(step: PreviewWorkflowStep, output: PreviewStepOutput, fingerprint: string): Headline[] {
  const unit = typeof output.unit === "string" ? output.unit : null;
  const headlines: Headline[] = [];
  const fact = (headline: Omit<Headline, "objectFingerprint">) => headlines.push({...headline, objectFingerprint: fingerprint} as Headline);
  switch (step.methodId) {
    case "build-debt-ledger": {
      const gross = decimalLeaf(output, "gross_debt");
      if (gross && unit) fact({text: `Dívida bruta de ${ptNumber(gross)} (${unit}) em ${String(output.reference_date ?? "")}`, stance: "neutral", unit, objectPath: "gross_debt", value: {amount: gross, unit}, stanceBasis: null});
      break;
    }
    case "reconcile-financial-statements": {
      const open = Array.isArray(output.open_divergences) ? output.open_divergences.length : 0;
      if (open > 0) fact({text: `${open} divergências ficam abertas entre demonstrações, notas e release; nenhuma foi fechada por arredondamento silencioso`, stance: "against", unit: null, objectPath: "open_divergences", value: null, stanceBasis: {path: "open_divergences", comparator: "nonempty", threshold: null, whenTrue: "against"}});
      break;
    }
    case "diagnose-maturity-wall": {
      const peakPeriod = leaf(output, "peak.period");
      const peakAmount = decimalLeaf(output, "peak.amount");
      if (typeof peakPeriod === "string" && peakAmount && unit) fact({text: `Pico de vencimentos em ${peakPeriod}: ${ptNumber(peakAmount)} (${unit})`, stance: "against", unit, objectPath: "peak", value: {amount: peakAmount, unit}, stanceBasis: {path: "walls", comparator: "nonempty", threshold: null, whenTrue: "against"}});
      break;
    }
    case "compare-refinancing-before-after": {
      const first = leaf(output, "ranking.order.0.id") ?? leaf(output, "ranking.order.0.alternative_id");
      if (typeof first === "string") fact({text: `A alternativa ${first} lidera a comparação antes e depois; o ranking vale só sobre o que foi precificado`, stance: "for", unit: null, objectPath: "ranking", value: null, stanceBasis: {path: "ranking.order", comparator: "nonempty", threshold: null, whenTrue: "for"}});
      break;
    }
    case "declare-scenarios": {
      const count = Array.isArray(output.scenarios) ? output.scenarios.length : 0;
      if (count > 0) fact({text: `${count} cenários declarados, cada um com a origem de cada premissa`, stance: "neutral", unit: null, objectPath: "scenarios", value: null, stanceBasis: null});
      break;
    }
    default:
      break;
  }
  return headlines;
}

/** The meeting brief input, built from the outputs of the other steps: signed content, states and facts. */
export function meetingBriefInput(context: PreviewRunContext): BriefInput {
  const objects = case01PreviewSteps.filter((step) => step.methodId !== "plan-meeting-brief").flatMap((step) => {
    const output = context.outputs.get(step.taskId);
    if (!output) return [];
    const content = {...output};
    const fingerprint = fingerprintOf(content);
    return [{
      id: step.taskId.toLowerCase(),
      kind: objectKindByMethod[step.methodId]!,
      state: briefObjectState(output),
      fingerprint,
      content,
      unit: typeof output.unit === "string" ? output.unit : null,
      headlines: headlinesFor(step, output, fingerprint),
    }];
  });
  const documents = [...new Set(case01Evidence()["declare-scenarios"].documents.map((document) => document.name))].sort(compare);
  const previous = context.previousBrief;
  const previousOutput = previous?.output;
  const previousVersion = previous && previousOutput && typeof previousOutput.trace === "object" && previousOutput.trace && typeof previousOutput.trace.outputFingerprint === "string" && previousOutput.deliverable && typeof previousOutput.deliverable === "object"
    ? {
        outputFingerprint: previousOutput.trace.outputFingerprint,
        blocks: ((previousOutput.deliverable as Record<string, unknown>).blocks as Array<{id: string; state: "filled" | "gap"; object_ids: string[]}>).map((block) => ({id: block.id, state: block.state, objectIds: block.object_ids})),
        objectFingerprints: previous.objectFingerprints,
      }
    : null;
  const {turn, audience, form, pages, sponsorInstruction, undefinedAspects} = context.request;
  return {
    documents,
    caseId: case01EvidenceManifest.caseId,
    request: {turn, audience: audience ? {primary: audience.primary, others: audience.others ?? []} : null, form, pages, sponsorInstruction: context.answers?.length ? `${sponsorInstruction ?? ""}\n${context.answers.map((answer) => `Resposta a ${answer.questionId}: ${answer.answer}`).join("\n")}`.trim().slice(0, 4_000) : sponsorInstruction, undefinedAspects, confirmedPlanId: null},
    objects,
    candidateQuestions: context.candidateQuestions ?? (context.request.composition === "prepare_meeting" ? [
      {id: "q-angle", text: "Leitura de refinanciamento ou alternativas mais amplas?", changesTheWork: "define o universo de alternativas", coverage: {searched: documents, answeredBy: null, answer: null}, priority: 0},
      {id: "q-meeting", text: "Reunião exploratória ou produto a testar?", changesTheWork: "define profundidade e forma", coverage: {searched: documents, answeredBy: null, answer: null}, priority: 1},
      {id: "q-format", text: "Briefing interno, páginas de pitch ou análise com cenários?", changesTheWork: "define o material", coverage: {searched: documents, answeredBy: null, answer: null}, priority: 2},
    ] : []),
    previousVersion,
  };
}

/** The fingerprints the brief planner saw for each object, keyed as the planner keys them; the next turn's change note compares against these. */
export function briefObjectFingerprints(outputs: Map<string, PreviewStepOutput>): Record<string, string> {
  return Object.fromEntries(case01PreviewSteps.filter((step) => step.methodId !== "plan-meeting-brief" && outputs.has(step.taskId)).map((step) => [step.taskId.toLowerCase(), fingerprintOf({...outputs.get(step.taskId)!})]));
}

/** What the artifact of a step records around the executor's output. */
export function previewArtifactContent(step: PreviewWorkflowStep, output: PreviewStepOutput, premises: PreviewPremises): Record<string, unknown> {
  return {
    preview: {
      mode: "integration_preview",
      methodId: step.methodId,
      methodVersion: step.methodVersion,
      methodMaturity: "implemented",
      evidence: {caseId: case01EvidenceManifest.caseId, basis: case01EvidenceManifest.basis, version: case01EvidenceManifest.version, note: case01EvidenceManifest.note},
      premisesApplied: premisesFor(step, premises),
      disclaimer: "Validação interna. Método em estágio implemented, sem revisão independente aprovada; nada aqui é liberação, parecer ou aprovação.",
    },
    output,
  };
}

export {previewStepByTask};
