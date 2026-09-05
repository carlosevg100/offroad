/**
 * integration_preview runtime: the Case 01 workflow running inside the product for an organization
 * that holds the grant. Two halves:
 *
 *   1. the turn router: reads the person's message and decides, with zero model calls, whether it
 *      starts the analysis, prepares the material, changes a premise, answers a question about a
 *      number, or just replies; the reply and the activation are compiled from the objects;
 *   2. the run processor: executes the workflow steps in dependency order on the frozen evidence
 *      of the case, records one task run and one artifact per step (unchanged steps replay by
 *      fingerprint), and publishes the completion into the same conversation.
 *
 * Everything it writes carries the preview mark. Methods stay in the implemented rung.
 */
import {randomUUID} from "node:crypto";

import {fingerprintJson} from "@offroad/case-understanding";
import {case01, executors, preview} from "@offroad/credit-playbook";

const {
  briefObjectFingerprints,
  case01PreviewSteps,
  compileIntegrationPreviewPlan,
  describePremises,
  fingerprintOf,
  premisesFor,
  previewArtifactContent,
  previewPremisesSchema,
  previewWorkflowIdentity,
  runPreviewStep,
} = preview;
type PreviewComposition = preview.PreviewComposition;
type PreviewPremises = preview.PreviewPremises;
type PreviewRequest = preview.PreviewRequest;
type PreviewRunContext = preview.PreviewRunContext;
type PreviewStepOutput = preview.PreviewStepOutput;
type PreviewWorkflowStep = preview.PreviewWorkflowStep;
import {offroadTaskRegistryVersion} from "@offroad/work-plan";
import {z} from "zod";

import type {CapitalProjectAnalysisJob, QueueClient} from "./queue";
import {describeJobFailure} from "./job-failure";

export const PREVIEW_MARK = "[Validação interna, integration_preview]";
export const PREVIEW_MARK_EN = "[Internal validation, integration_preview]";

// ---------------------------------------------------------------------------------------------
// 1. The turn router
// ---------------------------------------------------------------------------------------------

export type PreviewTurnInput = {
  locale: "pt-BR" | "en-US";
  message: string;
  recentMessages: Array<{role: "user" | "assistant"; content: string}>;
  /** Artifact types already produced in the project; empty before the first run. */
  artifactTypes: string[];
  /** Whether a preview run is still queued or running. */
  runActive: boolean;
  /** The latest preview outputs by TaskSpec id, for questions about numbers. */
  priorOutputs: Map<string, PreviewStepOutput>;
  entryJob: string;
  registryVersion?: string;
  /** The user message that opened this turn: every activation compiles its own plan. */
  messageId?: string;
};

export type PreviewActivation = {
  job: "integration_preview";
  composition: PreviewComposition;
  caseId: string;
  workflow: {id: string; version: string; fingerprint: string};
  brief: Record<string, unknown> & {premises: PreviewPremises; request: PreviewRequest};
  plan: ReturnType<typeof compileIntegrationPreviewPlan>;
};

export type PreviewTurnDecision = {
  kind: "activate" | "answer" | "wait" | "converse";
  reply: string;
  activation: PreviewActivation | null;
};

const patterns = {
  material: /\b(vamos\s+preparar\s+o\s+material|prepar(?:ar|e)\s+(?:o\s+)?material|p[aá]ginas?\s+de\s+pitch|pitch\s+pages?|monte\s+o\s+material|prepare\s+the\s+material)\b/i,
  premise: /\b(altere|altera|mude|muda|troque|troca|considere|considera|assuma|assume|com\s+taxa|change|assume|set)\b[\s\S]*\b(taxa|juros|rate|prazo|tenor|term|car[eê]ncia|grace)\b/i,
  question: /\b(de\s+onde\s+(?:saiu|veio|vem)|qual\s+(?:a\s+)?(?:origem|fonte)|como\s+(?:chegou|calculou|chegaram)|where\s+(?:did|does).*come\s+from|how\s+(?:did|was).*(?:calculated|computed))\b/i,
  leverage: /\b(alavancagem|leverage|4[,.]7\d?x?|d[ií]vida\s+l[ií]quida\s*\/\s*ebitda|net\s+debt\s*\/\s*ebitda)\b/i,
  deepen: /\b(aprofund|detalh|explore|deepen|drill)\b/i,
  pages: /\b(uma|duas|tr[eê]s|quatro|cinco|seis|one|two|three|four|five|six|\d{1,2})\s+p[aá]ginas?\b|\b(uma|duas|tr[eê]s|quatro|cinco|seis|one|two|three|four|five|six|\d{1,2})\s+pages?\b/i,
  percent: /(\d{1,2}(?:[.,]\d{1,4})?)\s*%/,
  cdiSpread: /cdi\s*\+\s*(\d{1,2}(?:[.,]\d{1,4})?)\s*%?/i,
  months: /(\d{1,3})\s*meses|(\d{1,3})\s*months/i,
  years: /(\d{1,2})\s*anos|(\d{1,2})\s*years/i,
  grace: /car[eê]ncia\s+(?:de\s+)?(\d{1,3})\s*(meses|anos)|grace\s+(?:of\s+)?(\d{1,3})\s*(months|years)/i,
};

const wordNumbers: Record<string, number> = {uma: 1, duas: 2, tres: 3, "três": 3, quatro: 4, cinco: 5, seis: 6, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6};

function decimalFromPercent(text: string): string {
  const normalized = text.replace(",", ".");
  const value = Number(normalized) / 100;
  return value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

/** Premises a person states in one message; only what the sentence says, nothing inferred. */
export function parsePremises(message: string): PreviewPremises {
  const premises: PreviewPremises = {};
  const spread = patterns.cdiSpread.exec(message);
  const percent = patterns.percent.exec(message);
  if (spread) {
    // "CDI + x%": the case evidence prices new debt on a CDI of 13,25% (the pack's reference); the
    // absolute rate is the reference plus the spread, declared as such in the artifact.
    const cdiReference = 13.25;
    premises.newDebtAnnualRate = decimalFromPercent(String(cdiReference + Number(spread[1]!.replace(",", "."))));
  } else if (percent && /\b(taxa|juros|rate|a\.a\.|ao\s+ano|per\s+year)\b/i.test(message)) {
    premises.newDebtAnnualRate = decimalFromPercent(percent[1]!);
  }
  const grace = patterns.grace.exec(message);
  if (grace) {
    const amount = Number(grace[1] ?? grace[3]);
    const unit = (grace[2] ?? grace[4] ?? "").toLowerCase();
    premises.newDebtGraceMonths = unit.startsWith("ano") || unit.startsWith("year") ? amount * 12 : amount;
  }
  const withoutGrace = message.replace(patterns.grace, " ");
  const years = patterns.years.exec(withoutGrace);
  const months = patterns.months.exec(withoutGrace);
  if (/\b(prazo|tenor|term)\b/i.test(withoutGrace)) {
    if (years) premises.newDebtTermMonths = Number(years[1] ?? years[2]) * 12;
    else if (months) premises.newDebtTermMonths = Number(months[1] ?? months[2]);
  }
  return previewPremisesSchema.parse(premises);
}

function audienceFrom(message: string): {primary: string; others: string[]} | null {
  const text = message.toLowerCase();
  const found: string[] = [];
  if (/\bvp\b|vice[- ]?presidente|vice[- ]?president/.test(text)) found.push("vp");
  if (/\bcfo\b|diretor(?:a)?\s+financeir[oa]/.test(text)) found.push("cfo");
  if (/tesouraria|treasury/.test(text)) found.push("tesouraria");
  if (/\bcompanhia\b|\bempresa\b|\bcamil\b|the\s+company/.test(text)) found.push("companhia");
  if (/\bmd\b|managing\s+director|diretor\s+executivo/.test(text)) found.push("md");
  if (found.length === 0) return null;
  return {primary: found[0]!, others: found.slice(1)};
}

function pagesFrom(message: string): number | null {
  const match = patterns.pages.exec(message);
  if (!match) return null;
  const token = (match[1] ?? match[2] ?? "").toLowerCase();
  if (!token) return null;
  return wordNumbers[token] ?? (Number.isFinite(Number(token)) ? Number(token) : null);
}

const alignmentPoints = {
  "pt-BR": [
    "leitura de refinanciamento ou alternativas mais amplas",
    "reunião exploratória ou produto a testar",
    "briefing interno, páginas de pitch ou análise com cenários",
  ],
  "en-US": [
    "a refinancing read or broader alternatives",
    "an exploratory meeting or a product to test",
    "an internal briefing, pitch pages or an analysis with scenarios",
  ],
} as const;

/** The activation of a preview run: the composition, the frozen base, the brief and the plan compiled for this turn. */
export function buildPreviewActivation(composition: PreviewComposition, request: PreviewRequest, premises: PreviewPremises, input: PreviewTurnInput): PreviewActivation {
  return {
    job: "integration_preview",
    composition,
    caseId: case01.case01EvidenceManifest.caseId,
    workflow: previewWorkflowIdentity(composition),
    brief: {
      sponsorInstruction: request.sponsorInstruction,
      premises,
      request,
      evidence: {caseId: case01.case01EvidenceManifest.caseId, basis: case01.case01EvidenceManifest.basis, version: case01.case01EvidenceManifest.version},
    },
    plan: compileIntegrationPreviewPlan({composition, entryJob: input.entryJob, locale: input.locale, registryVersion: input.registryVersion ?? offroadTaskRegistryVersion, ...(input.messageId ? {turn: {messageId: input.messageId}} : {})}),
  };
}

const t = (locale: "pt-BR" | "en-US", pt: string, en: string) => (locale === "en-US" ? en : pt);

/**
 * Decides what one turn does in preview. Zero model calls; the reply is compiled from the objects
 * and the composition is what the person asked for, never a guess beyond the sentence.
 */
export function routeIntegrationPreviewTurn(input: PreviewTurnInput): PreviewTurnDecision {
  const locale = input.locale;
  const mark = locale === "en-US" ? PREVIEW_MARK_EN : PREVIEW_MARK;
  const hasAnalysis = input.artifactTypes.includes("preview_alternatives");
  const priorUserTurns = input.recentMessages.filter((message) => message.role === "user").map((message) => message.content);
  const sponsorInstruction = [...priorUserTurns, input.message].join("\n").slice(0, 4_000);

  if (input.runActive) {
    return {kind: "wait", reply: `${mark} ${t(locale, "A corrida anterior ainda está em andamento; vou incorporar este pedido assim que ela terminar.", "The previous run is still in progress; I will take this request as soon as it finishes.")}`, activation: null};
  }

  if (patterns.question.test(input.message) && hasAnalysis) {
    return {kind: "answer", reply: `${mark} ${answerFromObjects(input)}`, activation: null};
  }

  if (patterns.material.test(input.message) && hasAnalysis) {
    const pages = pagesFrom(input.message);
    const audience = audienceFrom(input.message) ?? {primary: "vp", others: []};
    const request: PreviewRequest = {turn: priorUserTurns.length + 1, composition: "prepare_material", audience, form: "pitch_pages", pages, sponsorInstruction, undefinedAspects: pages === null ? ["depth"] : []};
    return {
      kind: "activate",
      reply: `${mark} ${t(locale,
        `Vou planejar o material a partir dos objetos já assinados: ${pages ? `${pages} páginas` : "número de páginas a confirmar"}, audiência ${audience.primary}. Números e premissas da devolutiva anterior entram por referência, nunca copiados à mão; o plano das páginas vem antes de qualquer arquivo.`,
        `I will plan the material from the signed objects: ${pages ? `${pages} pages` : "page count to confirm"}, audience ${audience.primary}. Numbers and premises of the previous readout enter by reference, never retyped; the page plan comes before any file.`)}`,
      activation: buildPreviewActivation("prepare_material", request, {}, input),
    };
  }

  if (patterns.premise.test(input.message) && hasAnalysis) {
    const premises = parsePremises(input.message);
    if (Object.keys(premises).length === 0) {
      return {kind: "converse", reply: `${mark} ${t(locale, "Entendi que quer mudar uma premissa, mas não reconheci taxa, prazo ou carência na frase. Diga, por exemplo, \"considere taxa de 15,50% a.a.\" ou \"prazo de 7 anos com carência de 24 meses\".", "I understood you want to change a premise, but I did not recognise a rate, a term or a grace in the sentence. Say, for example, \"assume a rate of 15.50% per year\" or \"a 7-year term with 24 months of grace\".")}`, activation: null};
    }
    const request: PreviewRequest = {turn: priorUserTurns.length + 1, composition: "change_premise", audience: {primary: "vp", others: []}, form: "first_deliverable", pages: null, sponsorInstruction, undefinedAspects: []};
    return {
      kind: "activate",
      reply: `${mark} ${t(locale,
        `Premissa registrada (${describePremises(premises)}). Só os nós cujas entradas mudam recalculam: a comparação antes e depois e o plano da devolutiva; ledger, conciliação, covenants, vencimentos, juros, custo de saída e cenários ficam como estavam, por fingerprint.`,
        `Premise recorded (${describePremises(premises)}). Only the nodes whose inputs change recompute: the before-and-after comparison and the readout plan; ledger, reconciliation, covenants, maturities, interest, exit cost and scenarios stay as they were, by fingerprint.`)}`,
      activation: buildPreviewActivation("change_premise", request, premises, input),
    };
  }

  if (!hasAnalysis) {
    const audience = audienceFrom(input.message) ?? {primary: "vp", others: []};
    const request: PreviewRequest = {turn: 1, composition: "prepare_meeting", audience, form: "first_deliverable", pages: null, sponsorInstruction, undefinedAspects: ["thesis", "format"]};
    const points = alignmentPoints[locale];
    return {
      kind: "activate",
      reply: `${mark} ${t(locale,
        `Entendi: material para a reunião com a Camil, com a instrução do VP em aberto quanto à tese e ao formato. Começo o trabalho de base agora, sobre a evidência congelada do Caso 01 (ITR de 31/05/2026, escrituras, relatórios do agente fiduciário): dívida instrumento a instrumento, conciliação, covenants pelas escrituras, vencimentos e cobertura, juros e correção, custo de saída, cenários e a comparação antes e depois. Em paralelo, três pontos para alinhar com o VP: ${points.map((point, index) => `(${index + 1}) ${point}`).join("; ")}. Não pergunto nada que o ITR já responda.`,
        `Understood: material for the Camil meeting, with the VP's instruction open on thesis and format. I start the groundwork now on the frozen evidence of Case 01 (ITR of 31/05/2026, indentures, trustee reports): debt instrument by instrument, reconciliation, covenants from the indentures, maturities and coverage, interest and indexation, exit cost, scenarios and the before-and-after comparison. In parallel, three points to align with the VP: ${points.map((point, index) => `(${index + 1}) ${point}`).join("; ")}. I ask nothing the ITR already answers.`)}`,
      activation: buildPreviewActivation("prepare_meeting", request, {}, input),
    };
  }

  if (patterns.deepen.test(input.message)) {
    const request: PreviewRequest = {turn: priorUserTurns.length + 1, composition: "deepen", audience: {primary: "vp", others: []}, form: "first_deliverable", pages: null, sponsorInstruction, undefinedAspects: []};
    return {kind: "activate", reply: `${mark} ${t(locale, "Vou reexecutar a análise com o mesmo estado; o que não mudou replica por fingerprint e o que estiver bloqueado continua declarado como lacuna.", "I will rerun the analysis on the same state; whatever is unchanged replays by fingerprint and whatever is blocked stays declared as a gap.")}`, activation: buildPreviewActivation("deepen", request, {}, input)};
  }

  return {kind: "converse", reply: `${mark} ${t(locale,
    "A análise do Caso 01 já está no projeto. Posso preparar o material (\"vamos preparar o material: três páginas de pitch\"), alterar uma premissa (\"considere taxa de 15,50% a.a.\") ou explicar de onde saiu um número (\"de onde saiu a alavancagem?\").",
    "The Case 01 analysis is already in the project. I can prepare the material (\"let's prepare the material: three pitch pages\"), change a premise (\"assume a rate of 15.50% per year\") or explain where a number came from (\"where did the leverage come from?\").")}`, activation: null};
}

/** A question about a number is answered from the signed objects, with the definition and the anchors they carry. */
export function answerFromObjects(input: PreviewTurnInput): string {
  const locale = input.locale;
  if (patterns.leverage.test(input.message)) {
    const covenants = input.priorOutputs.get("C09");
    const entries = Array.isArray(covenants?.covenants) ? (covenants!.covenants as Array<Record<string, unknown>>) : [];
    const lines = entries.slice(0, 4).map((entry) => {
      const index = entry.index && typeof entry.index === "object" ? (entry.index as Record<string, unknown>) : {};
      const value = typeof index.value === "string" ? index.value.replace(".", ",") : null;
      const state = typeof index.state === "string" ? index.state : typeof entry.state === "string" ? entry.state : "";
      const definitions = entry.definitions && typeof entry.definitions === "object" ? (entry.definitions as Record<string, unknown>) : {};
      const netDebt = typeof definitions.netDebt === "string" ? definitions.netDebt.slice(0, 160) : null;
      return `${String(entry.instrument)}: ${value ? `${value}x` : t(locale, "sem índice medido", "no measured index")}${state ? ` (${state})` : ""}${netDebt ? `; ${t(locale, "dívida líquida pela escritura", "net debt per the indenture")}: ${netDebt}`: ""}`;
    });
    const asOf = typeof covenants?.as_of_date === "string" ? covenants.as_of_date : "";
    return t(locale,
      `A alavancagem sai do objeto de covenants (método reconcile-covenant-definitions, estágio implemented), calculada pela definição de cada escritura sobre as linhas datadas de ${asOf}, com âncora por operando no próprio objeto. ${lines.length ? lines.join(" | ") : "Nenhum instrumento medido."} O painel de trabalho mostra os operandos, as âncoras e as condições jurídicas registradas.`,
      `Leverage comes from the covenants object (method reconcile-covenant-definitions, implemented rung), computed by each indenture's definition on the dated lines of ${asOf}, with an anchor per operand inside the object. ${lines.length ? lines.join(" | ") : "No instrument measured."} The work panel shows the operands, the anchors and the recorded legal conditions.`);
  }
  const steps = case01PreviewSteps.filter((step) => input.priorOutputs.has(step.taskId));
  return t(locale,
    `Cada número vem de um objeto assinado: ${steps.map((step) => `${step.label.pt} (${step.methodId} ${step.methodVersion})`).join("; ")}. Pergunte pelo número que quer rastrear, como a alavancagem, e eu trago definição, período, contas e âncoras.`,
    `Every number comes from a signed object: ${steps.map((step) => `${step.label.en} (${step.methodId} ${step.methodVersion})`).join("; ")}. Ask for the number you want to trace, such as leverage, and I bring the definition, period, accounts and anchors.`);
}

// ---------------------------------------------------------------------------------------------
// 2. The run processor
// ---------------------------------------------------------------------------------------------

const contextSchema = z.object({
  mode: z.literal("integration_preview"),
  preview: z.object({
    mode: z.literal("integration_preview"),
    composition: z.enum(["prepare_meeting", "prepare_material", "change_premise", "deepen"]),
    caseId: z.string(),
    workflow: z.object({id: z.string(), version: z.string(), fingerprint: z.string()}),
    premises: z.record(z.string(), z.unknown()).default({}),
  }),
  project: z.object({id: z.uuid(), organization_id: z.uuid(), project_name: z.string(), entry_job: z.string(), access_basis: z.string(), current_phase: z.string()}),
  session: z.object({id: z.uuid(), locale: z.enum(["pt-BR", "en-US"]), company_profile: z.record(z.string(), z.unknown()).default({})}),
  brief: z.object({id: z.uuid(), kind: z.string(), version: z.number(), content: z.record(z.string(), z.unknown()), content_fingerprint: z.string()}),
  plan: z.object({id: z.uuid(), version: z.number(), fingerprint: z.string()}),
  tasks: z.array(z.object({id: z.string(), ordinal: z.number(), batch: z.number(), label: z.string(), dependencies: z.array(z.string()), execution_class: z.string(), effect: z.string(), maturity_at_compile: z.string()})),
  prior_artifacts: z.array(z.object({task_id: z.string(), id: z.uuid(), artifact_type: z.string(), artifact_version: z.number(), artifact_fingerprint: z.string(), input_fingerprint: z.string().nullable(), status: z.string(), content: z.record(z.string(), z.unknown())})).default([]),
  recent_messages: z.array(z.object({id: z.uuid(), role: z.string(), content: z.string(), created_at: z.string()})).default([]),
});
export type PreviewRunContextRow = z.infer<typeof contextSchema>;

export type IntegrationPreviewDependencies = {
  queue: QueueClient;
  log?: (event: string, detail?: Record<string, unknown>) => void;
  now?: () => Date;
};

const requestSchema = z.object({
  turn: z.number().int().positive(),
  composition: z.enum(["prepare_meeting", "prepare_material", "change_premise", "deepen"]),
  audience: z.object({primary: z.string(), others: z.array(z.string()).default([])}).nullable(),
  form: z.enum(["first_deliverable", "internal_briefing", "pitch_pages", "analysis_with_scenarios", "board_deck"]).nullable(),
  pages: z.number().int().positive().nullable(),
  sponsorInstruction: z.string().nullable(),
  undefinedAspects: z.array(z.enum(["thesis", "meeting_type", "format", "audience", "depth"])).default([]),
});

function outputOf(artifact: PreviewRunContextRow["prior_artifacts"][number]): PreviewStepOutput | null {
  const output = artifact.content.output;
  return output && typeof output === "object" && !Array.isArray(output) ? (output as PreviewStepOutput) : null;
}

/** Runs the preview workflow for the claimed job: one task run and one artifact per step, unchanged steps replayed. */
export async function processIntegrationPreviewRunJob(job: CapitalProjectAnalysisJob, dependencies: IntegrationPreviewDependencies): Promise<{status: "succeeded" | "failed"; artifactId?: string}> {
  const {queue} = dependencies;
  const log = dependencies.log ?? (() => {});
  const stage = "integration_preview";
  await queue.writeStage(job, stage, "started", {summary_pt: "Validação interna: rodando os métodos do Caso 01 sobre a evidência congelada", summary_en: "Internal validation: running the Case 01 methods on the frozen evidence"});
  try {
    const context = contextSchema.parse(await queue.loadCapitalProjectContext(job));
    const premises = previewPremisesSchema.parse(context.preview.premises);
    const request = requestSchema.parse({...(context.brief.content.request as Record<string, unknown> | undefined ?? {}), composition: context.preview.composition});
    const locale = context.session.locale;
    const priorByTask = new Map(context.prior_artifacts.map((artifact) => [artifact.task_id, artifact]));
    const outputs = new Map<string, PreviewStepOutput>();
    const artifactByTask = new Map<string, {id: string; artifactFingerprint: string; replayed: boolean}>();
    const previousBriefArtifact = priorByTask.get("A01");
    const previousBriefOutput = previousBriefArtifact ? outputOf(previousBriefArtifact) : null;
    const runContext: PreviewRunContext = {
      evidence: case01.case01Evidence(),
      premises,
      outputs,
      request,
      previousBrief: previousBriefOutput ? {output: previousBriefOutput, objectFingerprints: Object.fromEntries(context.prior_artifacts.filter((artifact) => artifact.task_id !== "A01").flatMap((artifact) => { const output = outputOf(artifact); return output ? [[artifact.task_id.toLowerCase(), fingerprintOf({...output})]] : []; }))} : null,
    };
    const planTaskIds = new Set(context.tasks.map((task) => task.id));
    for (const step of case01PreviewSteps) {
      if (!planTaskIds.has(step.taskId)) throw new Error(`the preview plan does not hold TaskSpec ${step.taskId}`);
    }

    let replayedCount = 0;
    for (const step of case01PreviewSteps) {
      const dependencyFingerprints = Object.fromEntries(step.dependencies.map((dependency) => [dependency, artifactByTask.get(dependency)?.artifactFingerprint ?? "missing"]));
      const inputFingerprint = fingerprintJson({
        taskId: step.taskId, executorKey: step.executorKey, methodVersion: step.methodVersion,
        evidence: {caseId: case01.case01EvidenceManifest.caseId, version: case01.case01EvidenceManifest.version},
        premises: premisesFor(step, premises),
        dependencies: dependencyFingerprints,
        // The plan's identity is its request and the objects it plans over (through the dependency
        // fingerprints); an identical request replays the same plan.
        ...(step.methodId === "plan-meeting-brief" ? {request: {turn: request.turn, audience: request.audience, form: request.form, pages: request.pages, sponsorInstruction: request.sponsorInstruction, undefinedAspects: request.undefinedAspects}} : {}),
      });
      const prior = priorByTask.get(step.taskId);
      if (prior && prior.input_fingerprint === inputFingerprint && prior.status !== "superseded") {
        const output = outputOf(prior);
        if (output) {
          outputs.set(step.taskId, output);
          artifactByTask.set(step.taskId, {id: prior.id, artifactFingerprint: prior.artifact_fingerprint, replayed: true});
          replayedCount += 1;
          // The replay is a run of this plan too: the plan's dependency gate reads the runs of its
          // own plan, and the screen shows the step as done. No artifact is written; the run's
          // output points at the object it replayed.
          const replayRunId = await queue.startCapitalTask(job, {
            taskId: step.taskId, executorKey: step.executorKey, executorVersion: step.methodVersion, inputFingerprint,
            contextManifest: {
              schemaVersion: "capital-context-manifest.v1", projectId: context.project.id, planId: context.plan.id, briefId: context.brief.id,
              mode: "integration_preview", methodId: step.methodId, methodVersion: step.methodVersion, methodMaturity: "implemented",
              replayOf: prior.id, sourceClasses: ["prior_preview_artifacts"], excludedContext: ["live_extraction", "public_research", "private_documents", "model_calls"],
            },
          });
          // No artifact is written for a replay: the run's output points at the object it replayed
          // (the preview job does not require an artifact per run; computed steps still write theirs).
          await queue.finishCapitalTask(job, {
            taskRunId: replayRunId, status: "succeeded",
            outputReference: {type: "capital_project_artifact", id: prior.id, replayed: true},
            outputFingerprint: prior.artifact_fingerprint,
            qualityResults: [{id: "replayed_by_fingerprint", passed: true, detail: `input fingerprint unchanged since artifact ${prior.id}; the object was replayed, not recomputed`}],
            usage: {modelCalls: 0, costUsd: 0},
          });
          await queue.writeStage(job, `${stage}:${step.taskId}`, "succeeded", {summary_pt: `${step.label.pt}: replicada por fingerprint (sem recálculo)`, summary_en: `${step.label.en}: replayed by fingerprint (no recomputation)`, task_spec_id: step.taskId, replayed: true});
          log("integration_preview.step_replayed", {job: job.job_id, task: step.taskId, method: step.methodId, replayOf: prior.id});
          continue;
        }
      }
      await queue.writeStage(job, `${stage}:${step.taskId}`, "started", {summary_pt: `${step.label.pt} (${step.methodId}, estágio implemented)`, summary_en: `${step.label.en} (${step.methodId}, implemented rung)`, task_spec_id: step.taskId});
      const taskRunId = await queue.startCapitalTask(job, {
        taskId: step.taskId, executorKey: step.executorKey, executorVersion: step.methodVersion, inputFingerprint,
        contextManifest: {
          schemaVersion: "capital-context-manifest.v1", projectId: context.project.id, planId: context.plan.id, briefId: context.brief.id,
          mode: "integration_preview", methodId: step.methodId, methodVersion: step.methodVersion, methodMaturity: "implemented",
          sourceClasses: ["frozen_case_evidence", "prior_preview_artifacts"], excludedContext: ["live_extraction", "public_research", "private_documents", "model_calls"],
        },
      });
      let stepResult: {output: PreviewStepOutput};
      try {
        stepResult = runPreviewStep(step, runContext);
      } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 500) : "unknown";
        await queue.finishCapitalTask(job, {taskRunId, status: "failed", qualityResults: [], error: {code: "integration_preview_step_failed", method: step.methodId, message}}).catch(() => undefined);
        await queue.writeStage(job, `${stage}:${step.taskId}`, "failed", {task_spec_id: step.taskId, code: "integration_preview_step_failed"});
        throw error;
      }
      const output = stepResult.output;
      outputs.set(step.taskId, output);
      const artifact = await queue.recordCapitalProjectArtifact(job, {
        taskRunId, artifactType: step.artifactType, schemaVersion: `method.${step.methodId}.${step.methodVersion.split("-").at(-1)}`, status: "draft", inputFingerprint,
        content: previewArtifactContent(step, output, premises),
        evidenceRefs: [{sourceType: "frozen_case_evidence", sourceId: case01.case01EvidenceManifest.caseId, accessBasis: "public", version: case01.case01EvidenceManifest.version, note: case01.case01EvidenceManifest.note}],
        dependencies: step.dependencies.map((dependency) => ({artifactId: artifactByTask.get(dependency)!.id, artifactFingerprint: artifactByTask.get(dependency)!.artifactFingerprint})),
      });
      await queue.finishCapitalTask(job, {
        taskRunId, status: "succeeded", outputReference: {type: "capital_project_artifact", id: artifact.id}, outputFingerprint: artifact.artifactFingerprint,
        qualityResults: [{id: "executor_state", passed: true, detail: `state ${String(output.state)} declared by the executor; nothing filled by default`}, {id: "deterministic", passed: true, detail: "no model call; every number from financial-core or the executor"}],
        usage: {modelCalls: 0, costUsd: 0},
      });
      artifactByTask.set(step.taskId, {id: artifact.id, artifactFingerprint: artifact.artifactFingerprint, replayed: artifact.replayed});
      await queue.writeStage(job, `${stage}:${step.taskId}`, "succeeded", {summary_pt: `${step.label.pt}: ${stateLabel(String(output.state), "pt-BR")}`, summary_en: `${step.label.en}: ${stateLabel(String(output.state), "en-US")}`, task_spec_id: step.taskId, state: output.state});
    }

    const final = artifactByTask.get("A01")!;
    const content = completionMessage({locale, composition: context.preview.composition, outputs, premises, replayedCount, request});
    const completionMessageId = randomUUID();
    if (!queue.completeIntegrationPreviewRun) throw new Error("the queue cannot complete an integration_preview run");
    await queue.writeStage(job, stage, "succeeded", {summary_pt: "Validação interna concluída: devolutiva publicada na conversa", summary_en: "Internal validation finished: readout published in the conversation", artifactId: final.id});
    await queue.completeIntegrationPreviewRun(job, {
      completionMessageId, artifactId: final.id, artifactFingerprint: final.artifactFingerprint, content,
      result: {mode: "integration_preview", composition: context.preview.composition, artifact_fingerprint: final.artifactFingerprint, steps: case01PreviewSteps.map((step) => ({taskId: step.taskId, methodId: step.methodId, state: outputs.get(step.taskId)?.state ?? null, replayed: artifactByTask.get(step.taskId)?.replayed ?? false})), replayedCount, modelCalls: 0, costUsd: 0},
    });
    log("integration_preview.run_completed", {job: job.job_id, composition: context.preview.composition, replayed: replayedCount});
    return {status: "succeeded", artifactId: final.id};
  } catch (error) {
    log("integration_preview.run_failed", {job: job.job_id, message: error instanceof Error ? error.message.slice(0, 300) : "unknown"});
    await queue.writeStage(job, stage, "failed", {code: "integration_preview_run_failed"}).catch(() => undefined);
    await queue.fail(job, describeJobFailure(error, {code: "integration_preview_run_failed", stage, retryable: false}), {retryable: false});
    return {status: "failed"};
  }
}

const stateLabels: Record<string, [string, string]> = {
  complete: ["completo", "complete"], resolved: ["resolvido", "resolved"], closes: ["fecha", "closes"], declared: ["declarado", "declared"],
  compared: ["comparado", "compared"], diagnosed: ["diagnosticado", "diagnosed"], conditioned: ["condicionado", "conditioned"],
  incomplete: ["incompleto", "incomplete"], partial: ["parcial", "partial"], open_divergences: ["divergências abertas", "open divergences"],
  identity_failed: ["identidade não fecha", "identity failed"], blocked: ["bloqueado", "blocked"], planned: ["planejado", "planned"], awaiting_confirmation: ["aguardando confirmação", "awaiting confirmation"],
};
export function stateLabel(state: string, locale: "pt-BR" | "en-US"): string {
  const label = stateLabels[state];
  return label ? label[locale === "en-US" ? 1 : 0] : state;
}

/** The readout the conversation receives: states, facts and gaps read from the objects, never written by hand. */
export function completionMessage(input: {locale: "pt-BR" | "en-US"; composition: PreviewComposition; outputs: Map<string, PreviewStepOutput>; premises: PreviewPremises; replayedCount: number; request: PreviewRequest}): string {
  const {locale, outputs} = input;
  const mark = locale === "en-US" ? PREVIEW_MARK_EN : PREVIEW_MARK;
  const lines: string[] = [];
  const brief = outputs.get("A01");
  const deliverable = brief?.deliverable && typeof brief.deliverable === "object" ? (brief.deliverable as {blocks: Array<{id: string; label: string; state: string; object_ids: string[]; gap: string | null; headlines: Array<{text: string}>}>; objects_pending: Array<{id: string; state: string; reason?: string}>}) : null;
  const states = case01PreviewSteps.filter((step) => step.methodId !== "plan-meeting-brief").map((step) => `${step.label[locale === "en-US" ? "en" : "pt"]}: ${stateLabel(String(outputs.get(step.taskId)?.state ?? "blocked"), locale)}`);
  if (input.composition === "prepare_material") {
    const plan = brief?.page_plan && typeof brief.page_plan === "object" ? (brief.page_plan as {state: string; pages: Array<{title: string; blocks: string[]}>; reason?: string | null}) : null;
    lines.push(t(locale, "Plano do material a partir dos objetos assinados.", "Material plan from the signed objects."));
    if (plan) {
      lines.push(t(locale, `Estado do plano: ${stateLabel(plan.state, locale)}.`, `Plan state: ${stateLabel(plan.state, locale)}.`));
      for (const [index, page] of (plan.pages ?? []).entries()) lines.push(`${index + 1}. ${page.title}: ${page.blocks.join(", ")}`);
      if (plan.reason) lines.push(plan.reason);
    }
    const change = brief?.change_note && typeof brief.change_note === "object" ? (brief.change_note as {changes: string[]}) : null;
    if (change?.changes?.length) lines.push(t(locale, `O que mudou desde a devolutiva anterior: ${change.changes.join("; ")}.`, `What changed since the previous readout: ${change.changes.join("; ")}.`));
    else lines.push(t(locale, "Números e premissas da devolutiva anterior preservados por referência; nada foi copiado à mão.", "Numbers and premises of the previous readout preserved by reference; nothing retyped."));
  } else {
    lines.push(input.composition === "change_premise"
      ? t(locale, `Análise atualizada com a premissa (${describePremises(input.premises)}); ${input.replayedCount} de ${case01PreviewSteps.length} etapas replicaram sem recálculo, por fingerprint.`, `Analysis updated with the premise (${describePremises(input.premises)}); ${input.replayedCount} of ${case01PreviewSteps.length} steps replayed without recomputation, by fingerprint.`)
      : t(locale, "Primeira devolutiva do Caso 01, compilada dos objetos assinados. Estado de cada método:", "First readout of Case 01, compiled from the signed objects. State of each method:"));
    lines.push(states.join("; ") + ".");
    if (deliverable) {
      // Facts once each, from the blocks that cite objects; the open questions are listed apart.
      const filled = deliverable.blocks.filter((block) => block.state === "filled" && block.id !== "open_questions");
      const facts = [...new Set(filled.flatMap((block) => block.headlines.map((headline) => headline.text)))];
      if (facts.length) lines.push(t(locale, `Achados citáveis: ${facts.join(" | ")}.`, `Citable findings: ${facts.join(" | ")}.`));
      const gaps = deliverable.blocks.filter((block) => block.state === "gap" && block.gap);
      if (gaps.length) lines.push(t(locale, `Lacunas declaradas: ${gaps.map((block) => `${block.label} (${block.gap})`).join("; ")}.`, `Declared gaps: ${gaps.map((block) => `${block.label} (${block.gap})`).join("; ")}.`));
    }
    const questions = Array.isArray(brief?.alignment_questions) ? (brief!.alignment_questions as Array<{text?: string; question?: string}>) : [];
    if (questions.length) lines.push(t(locale, `Para alinhar com o VP: ${questions.map((question, index) => `(${index + 1}) ${question.text ?? question.question ?? ""}`).join(" ")}`, `To align with the VP: ${questions.map((question, index) => `(${index + 1}) ${question.text ?? question.question ?? ""}`).join(" ")}`));
  }
  lines.push(t(locale, "Os objetos completos, com âncoras, operandos e lacunas, estão no painel de trabalho. Métodos em estágio implemented; validação interna, sem liberação.", "The full objects, with anchors, operands and gaps, are in the work panel. Methods in the implemented rung; internal validation, no release."));
  return `${mark} ${lines.join("\n")}`.slice(0, 4_000);
}

export type {PreviewWorkflowStep, PreviewStepOutput, PreviewComposition, PreviewPremises, PreviewRequest};
export {executors as previewExecutors};
