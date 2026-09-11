import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";

import {
  case01,
  deterministicRunEvidenceFingerprint,
  executors,
  loadMethodLibrary,
  preview,
  type DeterministicMethodRun,
  type DeterministicMethodRunCase,
} from "@offroad/credit-playbook";

/**
 * The recorded gold, adversarial and consistency runs of the ten Case 01 methods.
 *
 * Nine of them declare zero model calls and one (write-meeting-synthesis) has a deterministic
 * skeleton under a model-assisted prose step; the honest evidence for the `tested` rung is an
 * execution, not a transcript. This harness executes the published executor over the frozen Case 01
 * evidence, over the adversarial mutations the methods declare in their own frontmatter, and over
 * ten deterministic permutations of each input. The records committed under
 * `packages/credit-playbook/knowledge/reviews/runs/` are compared against a fresh execution by
 * `case01-method-runs.test.ts`, so a stale record fails instead of aging quietly.
 *
 * Nothing here calls a model and nothing here writes files.
 */
const here = resolve(fileURLToPath(new URL(".", import.meta.url)));
const knowledge = resolve(here, "../../credit-playbook/knowledge");

/** The ten methods, in the order their runs are recorded. */
export const case01MethodIds = [
  "build-debt-ledger",
  "reconcile-financial-statements",
  "build-interest-and-indexation-schedule",
  "reconcile-covenant-definitions",
  "diagnose-maturity-wall",
  "compare-refinancing-before-after",
  "estimate-exit-cost-by-series",
  "declare-scenarios",
  "plan-meeting-brief",
  "write-meeting-synthesis",
] as const;
export type Case01MethodId = (typeof case01MethodIds)[number];

/** The recorded run ids, by method and kind. */
export function case01MethodRunId(methodId: Case01MethodId, kind: "gold" | "adversarial" | "consistency"): string {
  return `${methodId}-2026-09-10-${kind}`;
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort(compare).map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
};
const sha256 = (value: unknown): string => createHash("sha256").update(stableJson(value)).digest("hex");

/**
 * Arrays whose order is meaning, never presentation, and are therefore never permuted: the operands
 * of a `difference` derivation are `first - rest`, and a covenant's tiers are the ladder the
 * indenture writes, reported by index. Objects under `content` are signed by their own fingerprint,
 * so a permutation inside them is a forgery the executor must refuse, not a consistency check.
 */
const orderIsMeaning = new Set(["operands", "tiers"]);
const signedContent = new Set(["content"]);

function shuffle<T>(items: readonly T[], seed: number): T[] {
  const copy = [...items];
  let state = (seed * 2654435761) % 2147483647;
  for (let index = copy.length - 1; index > 0; index -= 1) {
    state = (state * 1103515245 + 12345) % 2147483648;
    const swap = state % (index + 1);
    [copy[index], copy[swap]] = [copy[swap]!, copy[index]!];
  }
  return copy;
}

/** Row order is presentation, never economics: the permutations must not move a single fingerprint. */
export function permuteCase01Input<T>(value: T, seed: number, key = ""): T {
  if (signedContent.has(key)) return value;
  // A Map of signed objects: the order they arrive in is presentation, their content is signed, so
  // only the entry order moves.
  if (value instanceof Map) return new Map(shuffle([...value.entries()], seed)) as unknown as T;
  if (Array.isArray(value)) {
    const copy = value.map((entry) => permuteCase01Input(entry, seed, key));
    if (orderIsMeaning.has(key)) return copy as unknown as T;
    return shuffle(copy, seed) as unknown as T;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).map(([name, inner]) => [name, permuteCase01Input(inner, seed, name)] as const);
    return Object.fromEntries(seed % 2 === 0 ? [...entries].reverse() : entries) as unknown as T;
  }
  return value;
}

type Executed = {state: string; inputFingerprint: string; outputFingerprint: string; output: Record<string, unknown>};

/** One execution of a Case 01 executor, reduced to what a run record holds. */
export function executeCase01Method(methodId: Case01MethodId, input: unknown): Executed {
  const output = runExecutor(methodId, input);
  const trace = (output.trace ?? {}) as {inputFingerprint?: string; outputFingerprint?: string};
  return {
    state: typeof output.state === "string" ? output.state : "unknown",
    // The synthesis signs its output only; its input fingerprint is the preview's own canonical
    // form of the objects it read, computed here and declared as such.
    inputFingerprint: trace.inputFingerprint ?? sha256(input),
    outputFingerprint: trace.outputFingerprint ?? sha256(output),
    output,
  };
}

function runExecutor(methodId: Case01MethodId, input: unknown): Record<string, unknown> {
  switch (methodId) {
    case "build-debt-ledger": return executors.buildDebtLedger(input as Parameters<typeof executors.buildDebtLedger>[0]) as unknown as Record<string, unknown>;
    case "reconcile-financial-statements": return executors.reconcileFinancialStatements(input as Parameters<typeof executors.reconcileFinancialStatements>[0]) as unknown as Record<string, unknown>;
    case "build-interest-and-indexation-schedule": return executors.buildInterestAndIndexationSchedule(input as Parameters<typeof executors.buildInterestAndIndexationSchedule>[0]) as unknown as Record<string, unknown>;
    case "reconcile-covenant-definitions": return executors.reconcileCovenantDefinitions(input as Parameters<typeof executors.reconcileCovenantDefinitions>[0]) as unknown as Record<string, unknown>;
    case "diagnose-maturity-wall": return executors.diagnoseMaturityWall(input as Parameters<typeof executors.diagnoseMaturityWall>[0]) as unknown as Record<string, unknown>;
    case "compare-refinancing-before-after": return executors.compareRefinancingBeforeAfter(input as Parameters<typeof executors.compareRefinancingBeforeAfter>[0]) as unknown as Record<string, unknown>;
    case "estimate-exit-cost-by-series": return executors.estimateExitCostBySeries(input as Parameters<typeof executors.estimateExitCostBySeries>[0]) as unknown as Record<string, unknown>;
    case "declare-scenarios": return executors.declareScenarios(input as Parameters<typeof executors.declareScenarios>[0]) as unknown as Record<string, unknown>;
    case "plan-meeting-brief": return executors.planMeetingBrief(input as Parameters<typeof executors.planMeetingBrief>[0]) as unknown as Record<string, unknown>;
    case "write-meeting-synthesis": return preview.synthesisSkeleton(input as Parameters<typeof preview.synthesisSkeleton>[0]) as unknown as Record<string, unknown>;
  }
}

/** The frozen Case 01 evidence each method runs on, one fresh copy per call. */
export function case01MethodInput(methodId: Case01MethodId): unknown {
  const evidence = case01.case01Evidence();
  if (methodId === "write-meeting-synthesis") return synthesisInput(evidence);
  return (evidence as Record<string, unknown>)[methodId];
}

/**
 * The synthesis reads the objects the other steps signed. The chain is executed here exactly as the
 * preview executes it, so the synthesis is evidence of the same objects the product would show.
 */
function synthesisInput(evidence: ReturnType<typeof case01.case01Evidence>): Parameters<typeof preview.synthesisSkeleton>[0] {
  const request = {turn: 1, composition: "prepare_meeting" as const, audience: {primary: "vp"}, form: "first_deliverable" as const, pages: null, sponsorInstruction: null, undefinedAspects: []};
  const outputs = new Map<string, preview.PreviewStepOutput>();
  const context: preview.PreviewRunContext = {evidence, premises: {}, outputs, request, previousBrief: null};
  for (const step of preview.case01PreviewSteps) {
    if (step.methodId === "write-meeting-synthesis") continue;
    outputs.set(step.taskId, preview.runPreviewStep(step, context).output);
  }
  return {outputs, request, locale: "pt-BR", objectFingerprints: preview.briefObjectFingerprints(outputs), previous: null};
}

/**
 * What the gold case asserts, declared from the answer key of Case 01
 * (`docs/product/gold-cases/gc01-gabarito-rascunho.md`) and from the frozen corpus, never read back
 * from the result. `observed` is built by the same reader over the execution.
 */
type GoldCase = {expectation: string; read: (executed: Executed) => string};

const leaf = (output: Record<string, unknown>, path: string): unknown =>
  path.split(".").reduce<unknown>((current, key) => (current && typeof current === "object" ? (current as Record<string, unknown>)[key] : undefined), output);
const decimal = (output: Record<string, unknown>, path: string): string => {
  const found = leaf(output, path);
  return typeof found === "string" || typeof found === "number" || typeof found === "boolean" ? String(found) : "ausente";
};
const count = (output: Record<string, unknown>, path: string): number => {
  const found = leaf(output, path);
  return Array.isArray(found) ? found.length : -1;
};

const goldCases: Record<Case01MethodId, GoldCase> = {
  "build-debt-ledger": {
    expectation: "divida bruta 5670186 (4988383 em 28/02/2026), conciliacao com o balanco 0, primeiro periodo 1229828 igual ao circulante, divida liquida contratual 4228477 e do release 4214377, estado incomplete",
    read: ({output, state}) => `divida bruta ${decimal(output, "gross_debt")} (${decimal(output, "gross_debt_prior")} em 28/02/2026), conciliacao com o balanco ${decimal(output, "reconciliation.total.difference")}, primeiro periodo ${decimal(output, "schedule.currentPeriod.amount")} igual ao circulante, divida liquida contratual ${decimal(output, "net_debt_views.contractual.value")} e do release ${decimal(output, "net_debt_views.release.value")}, estado ${state}`,
  },
  "reconcile-financial-statements": {
    expectation: "5 contas conciliadas, 3 divergencias abertas, ponte de juros registrada e nao fechada, estado incomplete",
    read: ({output, state}) => `${count(output, "reconciliations")} contas conciliadas, ${count(output, "open_divergences")} divergencias abertas, ponte de juros ${Array.isArray(output.incomplete_reasons) && (output.incomplete_reasons as string[]).some((reason) => reason.includes("interest bridge")) ? "registrada e nao fechada" : "fechada"}, estado ${state}`,
  },
  "build-interest-and-indexation-schedule": {
    expectation: "3 series com nominal contratual projetadas em 4 periodos, 13 sem nominal na base, nominal projetado 1122152 sobre o ledger de 5670186, estado partial",
    read: ({output, state}) => `${count(output, "schedule_by_series")} series com nominal contratual projetadas em ${count(output, "schedule_aggregate.by_period")} periodos, ${count(output, "uncovered_series")} sem nominal na base, nominal projetado ${decimal(output, "ledger_coverage.projected_nominal")} sobre o ledger de ${decimal(output, "ledger_coverage.ledger")}, estado ${state}`,
  },
  "reconcile-covenant-definitions": {
    expectation: "4 instrumentos, divida liquida 4228477 pela definicao de cada escritura, EBITDA implicito 895863.77118644 do indice reportado 4.72, nenhum limite resolvido, estado conditioned",
    read: ({output, state}) => {
      const covenants = (output.covenants ?? []) as Array<{netDebtByDefinition?: {value?: string} | null; applicableLimit: unknown}>;
      const sameNetDebt = covenants.every((covenant) => covenant.netDebtByDefinition?.value === covenants[0]?.netDebtByDefinition?.value);
      return `${covenants.length} instrumentos, divida liquida ${sameNetDebt ? decimal(output, "covenants.0.netDebtByDefinition.value") : "diferente por escritura"} pela definicao de cada escritura, EBITDA implicito ${decimal(output, "covenants.0.index.ebitda.value")} do indice reportado ${decimal(output, "covenants.0.index.value")}, ${covenants.every((covenant) => covenant.applicableLimit === null) ? "nenhum limite resolvido" : "algum limite resolvido"}, estado ${state}`;
    },
  },
  "diagnose-maturity-wall": {
    expectation: "2 paredes acima de 20% (2026/27, 2028/29), pico 2026/27 de 1229828 com 0.21689377 da divida bruta, estado incomplete",
    read: ({output, state}) => {
      const walls = Array.isArray(output.walls) ? (output.walls as Array<{period: string; is_wall: boolean}>).filter((wall) => wall.is_wall).map((wall) => wall.period) : [];
      return `${walls.length} paredes acima de 20% (${walls.join(", ")}), pico ${decimal(output, "peak.period")} de ${decimal(output, "peak.amount")} com ${decimal(output, "peak.share_of_gross")} da divida bruta, estado ${state}`;
    },
  },
  "compare-refinancing-before-after": {
    expectation: "status-quo lidera por peak_concentration com 0.21689377 contra 0.21807226 de extend-di, retire-ipca bloqueada por saida nao precificada, estado compared",
    read: ({output, state}) => {
      const order = (((output.ranking ?? {}) as Record<string, unknown>).order ?? []) as Array<{id: string; value: string}>;
      const blocked = Array.isArray(output.alternatives) ? (output.alternatives as Array<{id: string; state: string}>).filter((alternative) => alternative.state === "blocked").map((alternative) => alternative.id) : [];
      return `${order[0]?.id ?? "sem ranking"} lidera por ${decimal(output, "ranking.discriminator")} com ${order[0]?.value ?? "ausente"} contra ${order[1]?.value ?? "ausente"} de ${order[1]?.id ?? "ausente"}, ${blocked.join(", ") || "nenhuma"} bloqueada por saida nao precificada, estado ${state}`;
    },
  },
  "estimate-exit-cost-by-series": {
    expectation: "12 series sem nominal, remuneracao corrida e encargos na data de saida, 0 precificadas, premio estimado 0, estado partial",
    read: ({output, state}) => `${count(output, "exit_costs")} series sem nominal, remuneracao corrida e encargos na data de saida, ${decimal(output, "totals.series_estimated")} precificadas, premio estimado ${decimal(output, "totals.estimated_premium")}, estado ${state}`,
  },
  "declare-scenarios": {
    expectation: "o corpus congelado nao sustenta choque de juros nem haircut de EBITDA, o cenario adverso bloqueia, 1 premissa no registro, estado blocked",
    read: ({output, state}) => {
      const reasons = Array.isArray(output.block_reasons) ? (output.block_reasons as string[]) : [];
      const shock = reasons.some((reason) => reason.includes("rate shock")) && reasons.some((reason) => reason.includes("EBITDA haircut"));
      const scenarios = (output.scenarios ?? []) as Array<{id: string; state: string}>;
      return `o corpus congelado nao sustenta ${shock ? "choque de juros nem haircut de EBITDA" : "o que o cenario declara"}, o cenario ${scenarios.filter((scenario) => scenario.state === "blocked").map((scenario) => scenario.id).join(", ") === "adverse" ? "adverso bloqueia" : "adverso nao bloqueia"}, ${count(output, "assumption_register")} premissa no registro, estado ${state}`;
    },
  },
  "plan-meeting-brief": {
    expectation: "turno 1 com 3 perguntas de alinhamento e 4 recusadas, plano de paginas not_requested, producao nao liberada, estado planned",
    read: ({output, state}) => `turno ${decimal(output, "turn")} com ${count(output, "alignment_questions")} perguntas de alinhamento e ${count(output, "refused_questions")} recusadas, plano de paginas ${decimal(output, "page_plan.state")}, producao ${decimal(output, "page_plan.production_allowed") === "false" ? "nao liberada" : "liberada"}, estado ${state}`,
  },
  "write-meeting-synthesis": {
    expectation: "esqueleto sem modelo com 5 secoes escritas so pelas manchetes assinadas, 0 numeros proprios verificados, 0 frases removidas, estado skeleton",
    read: ({output, state}) => `esqueleto sem modelo com ${count(output, "sections")} secoes escritas so pelas manchetes assinadas, ${decimal(output, "numbers.verified")} numeros proprios verificados, ${count(output, "numbers.removed")} frases removidas, estado ${state}`,
  },
};

/**
 * The adversarial mutations each method declares in its own frontmatter, each one applied to the
 * frozen Case 01 input. The expectation is written from the method's Adversarial section, not from
 * the executor, and an input the executor refuses at its schema is recorded as a structured refusal.
 */
type AdversarialCase = {id: string; expectation: string; mutate: (input: never) => unknown; read: (outcome: Outcome) => string};
type Outcome = {refused: true; message: string; inputFingerprint: string} | (Executed & {refused: false});

function applyAdversarial(methodId: Case01MethodId, mutated: unknown): Outcome {
  try {
    return {...executeCase01Method(methodId, mutated), refused: false};
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {refused: true, message, inputFingerprint: sha256(mutated)};
  }
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const refusalNames = (outcome: Outcome, fragment: string): string => (outcome.refused ? (outcome.message.includes(fragment) ? "recusado no contrato de entrada" : "recusado por outro motivo") : `aceito com estado ${outcome.state}`);
const stateOf = (outcome: Outcome): string => (outcome.refused ? "recusado no contrato de entrada" : outcome.state);

const adversarialCases: Record<Case01MethodId, AdversarialCase[]> = {
  "build-debt-ledger": [
    {
      id: "adversarial:gc01:scale-mutation-blocks-ledger",
      expectation: "a conciliacao com o balanco bloqueia o ledger",
      mutate: (input: never) => {
        const mutation = clone(input as ReturnType<typeof case01.case01Evidence>["build-debt-ledger"]);
        for (const row of mutation.rows) row.balance = `${row.balance}000`.replace(/^-(\d)/, "-$1");
        return mutation;
      },
      read: (outcome) => (stateOf(outcome) === "blocked" ? "a conciliacao com o balanco bloqueia o ledger" : `o ledger segue em ${stateOf(outcome)}`),
    },
    {
      id: "adversarial:gc01:compensating-split-swap-blocks-ledger",
      expectation: "a conciliacao por prazo bloqueia o ledger",
      mutate: (input: never) => {
        const mutation = clone(input as ReturnType<typeof case01.case01Evidence>["build-debt-ledger"]);
        const anchor = {document: "01_ITR_1T26_31mai2026.pdf", page: 39, note: "15, classificacao por prazo (hipotese do teste adversarial)"};
        // Every row carries its split, so the split reconciliation is possible; then one pair swaps
        // a hundred thousand between current and non-current, which the total never sees.
        let current = 1229828;
        for (const row of mutation.rows) {
          const balance = Number(row.balance);
          const rowCurrent = row.contra ? Math.max(balance, Math.min(0, current)) : Math.max(0, Math.min(balance, current));
          current -= rowCurrent;
          row.classification = {current: String(rowCurrent), nonCurrent: String(balance - rowCurrent)};
          row.anchors = {...row.anchors, classification: anchor};
        }
        const first = mutation.rows[0]!;
        first.classification = {current: String(Number(first.classification!.current) - 100000), nonCurrent: String(Number(first.classification!.nonCurrent) + 100000)};
        return mutation;
      },
      read: (outcome) => (stateOf(outcome) === "blocked" ? "a conciliacao por prazo bloqueia o ledger" : `o ledger segue em ${stateOf(outcome)}`),
    },
    {
      id: "adversarial:gc01:definition-text-contradicts-formula",
      expectation: "a visao contratual nao e calculada e o ledger bloqueia",
      mutate: (input: never) => {
        const mutation = clone(input as ReturnType<typeof case01.case01Evidence>["build-debt-ledger"]);
        mutation.definitions!.contractual!.text = "somatoria da rubrica de estoques e da rubrica de fornecedores, menos a soma das disponibilidades";
        return mutation;
      },
      read: (outcome) => (stateOf(outcome) === "blocked" ? "a visao contratual nao e calculada e o ledger bloqueia" : `o ledger segue em ${stateOf(outcome)}`),
    },
    {
      id: "adversarial:gc01:current-period-by-end-date-not-label",
      expectation: "o periodo corrente continua sendo o de 1229828, pela data de fim e nao pelo rotulo",
      mutate: (input: never) => {
        const mutation = clone(input as ReturnType<typeof case01.case01Evidence>["build-debt-ledger"]);
        const periods = mutation.schedule!.periods;
        const first = periods[0]!;
        const later = periods[4]!;
        const label = first.period;
        first.period = later.period;
        later.period = label;
        return mutation;
      },
      read: (outcome) => (outcome.refused ? `recusado: ${outcome.message.slice(0, 80)}` : `o periodo corrente continua sendo o de ${decimal(outcome.output, "schedule.currentPeriod.amount")}, pela data de fim e nao pelo rotulo`),
    },
    {
      id: "adversarial:gc01:row-split-must-add-up",
      expectation: "recusado no contrato de entrada",
      mutate: (input: never) => {
        const mutation = clone(input as ReturnType<typeof case01.case01Evidence>["build-debt-ledger"]);
        const row = mutation.rows[0]!;
        row.classification = {current: "1", nonCurrent: "1"};
        row.anchors = {...row.anchors, classification: {document: "01_ITR_1T26_31mai2026.pdf", page: 39, note: "15, classificacao inventada pelo teste adversarial"}};
        return mutation;
      },
      read: (outcome) => refusalNames(outcome, "does not add up to its balance"),
    },
    {
      id: "adversarial:gc01:contractual-only-row-out-of-balance-identity",
      expectation: "a linha so contratual entra na divida bruta, fica fora da reportada e a conciliacao segue em 0",
      mutate: (input: never) => {
        const mutation = clone(input as ReturnType<typeof case01.case01Evidence>["build-debt-ledger"]);
        mutation.definitions!.contractual!.text = `${mutation.definitions!.contractual!.text}, incluindo as obrigacoes de arrendamento`;
        mutation.rows.push({
          id: "lease-contractual", instrument: "Arrendamentos incluidos pela escritura",
          obligation: {kind: "lease", disbursed: true, views: ["contractual"]},
          balance: "276768", priorBalance: "276768", currency: "BRL",
          anchors: {balance: {document: "01_ITR_1T26_31mai2026.pdf", page: 12, note: "passivo de arrendamento"}, viewInclusion: {document: "escritura_13a_emissao.pdf", clause: "1.1", page: 7, note: "inclusao hipotetica do teste adversarial"}},
        } as (typeof mutation)["rows"][number]);
        return mutation;
      },
      read: (outcome) => (outcome.refused ? `recusado: ${outcome.message.slice(0, 80)}` : `a linha so contratual entra na divida bruta, fica fora da reportada e a conciliacao segue em ${decimal(outcome.output, "reconciliation.total.difference")}`.replace("entra na divida bruta", decimal(outcome.output, "gross_debt") === "5946954" ? "entra na divida bruta" : "nao entra na divida bruta").replace("fica fora da reportada", decimal(outcome.output, "gross_debt_reported") === "5670186" ? "fica fora da reportada" : "entra na reportada")),
    },
    {
      id: "adversarial:gc01:definition-polarity-swapped",
      expectation: "a visao do release nao e calculada e o ledger bloqueia",
      mutate: (input: never) => {
        const mutation = clone(input as ReturnType<typeof case01.case01Evidence>["build-debt-ledger"]);
        mutation.definitions!.release!.text = "Caixa e aplicacoes financeiras (-) Divida bruta = Divida liquida (linhas rotuladas da tabela Endividamento e Caixa)";
        return mutation;
      },
      read: (outcome) => (stateOf(outcome) === "blocked" ? "a visao do release nao e calculada e o ledger bloqueia" : `o ledger segue em ${stateOf(outcome)}`),
    },
  ],
  "reconcile-financial-statements": [
    {
      id: "adversarial:gc01:scale-mutation-breaks-roll-forward",
      expectation: "a ponte da divida deixa de fechar e a conciliacao vai para identity_failed",
      mutate: (input: never) => {
        const mutation = clone(input as ReturnType<typeof case01.case01Evidence>["reconcile-financial-statements"]);
        const bridge = mutation.debtBridge;
        if (!bridge) throw new Error("the case declares no debt bridge to mutate");
        // The note's opening read in units instead of thousands: every other line stays as published.
        bridge.opening.value = `${bridge.opening.value}000`;
        return mutation;
      },
      read: (outcome) => {
        if (outcome.refused) return refusalNames(outcome, "identity");
        const identities = (outcome.output.identities ?? []) as Array<{id: string; state: string}>;
        const debt = identities.find((entry) => entry.id === "debt_bridge");
        return `a ponte da divida ${debt && debt.state !== "closed" ? "deixa de fechar" : "continua fechando"} e a conciliacao vai para ${outcome.state}`;
      },
    },
  ],
  "build-interest-and-indexation-schedule": [
    {
      id: "adversarial:gc01:curve-without-source-refused",
      expectation: "recusado no contrato de entrada",
      mutate: (input: never) => {
        const mutation = clone(input as ReturnType<typeof case01.case01Evidence>["build-interest-and-indexation-schedule"]);
        const curve = mutation.curves![0]! as Record<string, unknown>;
        delete curve.source;
        return mutation;
      },
      read: (outcome) => refusalNames(outcome, "source"),
    },
  ],
  "reconcile-covenant-definitions": [
    {
      id: "adversarial:gc01:different-net-debt-definition-not-comparable",
      expectation: "sem os derivativos a divida liquida da 11a e 4214377, nao os 4228477 das outras 3: os nomes coincidem, as definicoes nao",
      mutate: (input: never) => {
        const mutation = clone(input as ReturnType<typeof case01.case01Evidence>["reconcile-covenant-definitions"]);
        const instrument = mutation.instruments[0]! as Record<string, unknown>;
        instrument.netDebtComponents = (instrument.netDebtComponents as string[]).filter((component) => component !== "derivative_liabilities" && component !== "derivative_assets");
        instrument.netDebtDefinition = "somatoria da rubrica de emprestimos, financiamentos e debentures no passivo circulante e nao circulante, bem como qualquer outra rubrica que se refira a divida onerosa, menos a soma de disponibilidades e aplicacoes financeiras (circulante e nao circulante), com base no balanco patrimonial consolidado";
        return mutation;
      },
      read: (outcome) => {
        if (outcome.refused) return `recusado: ${outcome.message.slice(0, 80)}`;
        const covenants = (outcome.output.covenants ?? []) as Array<{netDebtByDefinition?: {value?: string} | null}>;
        const others = [...new Set(covenants.slice(1).map((covenant) => covenant.netDebtByDefinition?.value ?? "ausente"))];
        return `sem os derivativos a divida liquida da 11a e ${covenants[0]?.netDebtByDefinition?.value ?? "ausente"}, nao os ${others.join(" e ")} das outras ${covenants.length - 1}: os nomes coincidem, as definicoes nao`;
      },
    },
    {
      id: "adversarial:gc01:leases-in-other-onerous-debt-changes-net-debt",
      expectation: "com o arrendamento contado como outra divida onerosa a divida liquida sobe de 4228477 para 4505245",
      mutate: (input: never) => {
        const mutation = clone(input as ReturnType<typeof case01.case01Evidence>["reconcile-covenant-definitions"]);
        const lines = mutation.componentValues ?? [];
        const lease = lines.find((line) => line.component === "leases");
        if (!lease) throw new Error("the case declares no lease line to reclassify");
        // The legal question the base cannot answer, answered the other way: the lease liability is
        // enumerated as the indentures' "qualquer outra divida onerosa". What it costs is 276.768.
        mutation.componentValues = [...lines.filter((line) => line.component !== "leases"), {...lease, component: "other_onerous_debt", covers: ["other_onerous_debt"]}];
        return mutation;
      },
      read: (outcome) => {
        if (outcome.refused) return `recusado: ${outcome.message.slice(0, 80)}`;
        const value = decimal(outcome.output, "covenants.0.netDebtByDefinition.value");
        return `com o arrendamento contado como outra divida onerosa a divida liquida sobe de 4228477 para ${value}`;
      },
    },
    {
      id: "adversarial:gc01:ebitda-flag-is-not-an-opening",
      expectation: "sem EBITDA aberto nenhum headroom e medido",
      mutate: (input: never) => clone(input as ReturnType<typeof case01.case01Evidence>["reconcile-covenant-definitions"]),
      read: (outcome) => {
        if (outcome.refused) return `recusado: ${outcome.message.slice(0, 80)}`;
        const covenants = (outcome.output.covenants ?? []) as Array<{headroom?: unknown}>;
        return `sem EBITDA aberto ${covenants.every((covenant) => covenant.headroom === null || covenant.headroom === undefined) ? "nenhum headroom e medido" : "algum headroom e medido"}`;
      },
    },
    {
      id: "adversarial:gc01:opening-must-reproduce-reported-index",
      expectation: "a abertura que nao reproduz 4,72x deixa a comparabilidade em not_comparable em cada escritura e nenhum headroom e medido",
      mutate: (input: never) => {
        const mutation = clone(input as ReturnType<typeof case01.case01Evidence>["reconcile-covenant-definitions"]);
        // An EBITDA presented as the opening behind 4,72x that does not reproduce it on the reported
        // net debt: 4.228.477 / 700.000 is 6,04x, not 4,72x.
        mutation.reported!.ebitdaOpening = {value: "700000", unit: mutation.unit, asOf: mutation.asOfDate, months: 12, anchor: {document: "01_ITR_1T26_31mai2026.pdf", page: 40, note: "abertura hipotetica do teste adversarial"}};
        return mutation;
      },
      read: (outcome) => {
        if (outcome.refused) return `recusado: ${outcome.message.slice(0, 80)}`;
        const covenants = (outcome.output.covenants ?? []) as Array<{comparability?: string; headroom?: unknown}>;
        const states = [...new Set(covenants.map((covenant) => covenant.comparability ?? "ausente"))];
        return `a abertura que nao reproduz 4,72x deixa a comparabilidade em ${states.join(" e ")} em cada escritura e ${covenants.every((covenant) => covenant.headroom === null || covenant.headroom === undefined) ? "nenhum headroom e medido" : "algum headroom e medido"}`;
      },
    },
    {
      id: "adversarial:gc01:numerator-obligation-never-folded-into-ebitda",
      expectation: "o sellers finance continua como obrigacao de numerador sem valor, nunca somado ao EBITDA",
      mutate: (input: never) => clone(input as ReturnType<typeof case01.case01Evidence>["reconcile-covenant-definitions"]),
      read: (outcome) => {
        if (outcome.refused) return `recusado: ${outcome.message.slice(0, 80)}`;
        const covenants = (outcome.output.covenants ?? []) as Array<{legalConditions?: string[]; definitions?: {ebitdaAdjustments?: Array<{id: string; kind: string; obligation: unknown}>}}>;
        const eleventh = covenants[0];
        const sellers = (eleventh?.definitions?.ebitdaAdjustments ?? []).find((adjustment) => adjustment.id === "sellers-finance");
        return `o sellers finance ${sellers && sellers.kind === "numerator_obligation" && sellers.obligation === null ? "continua como obrigacao de numerador sem valor, nunca somado ao EBITDA" : "mudou de natureza"}`;
      },
    },
  ],
  "diagnose-maturity-wall": [
    {
      id: "adversarial:gc01:board-approvals-are-not-sources",
      expectation: "as 2 captacoes aprovadas em ata ficam sem prova de contrato e desembolso, 0 entra como fonte contratada em periodo nenhum",
      // The frozen base already carries the mutation: two board approvals of 251.000 and 535.000
      // with no contract and no disbursement. The case asserts that they never reach the cover.
      mutate: (input: never) => clone(input as ReturnType<typeof case01.case01Evidence>["diagnose-maturity-wall"]),
      read: (outcome) => {
        if (outcome.refused) return `recusado: ${outcome.message.slice(0, 80)}`;
        const claimed = (outcome.output.sources ?? []) as Array<{state?: string}>;
        const periods = ((leaf(outcome.output, "coverage.by_period") ?? []) as Array<{contracted_sources: string}>);
        const contracted = [...new Set(periods.map((period) => period.contracted_sources).filter((value) => value !== null && value !== undefined))];
        const unproven = claimed.filter((source) => source.state === "unproven").length;
        return `as ${unproven} captacoes aprovadas em ata ficam sem prova de contrato e desembolso, ${contracted.join(" e ")} entra como fonte contratada em periodo nenhum`;
      },
    },
  ],
  "compare-refinancing-before-after": [
    {
      id: "adversarial:gc01:unpriced-exit-blocks-alternative",
      expectation: "a alternativa sem saida precificada bloqueia e carrega o termo nao coberto, as outras seguem comparadas",
      mutate: (input: never) => clone(input as ReturnType<typeof case01.case01Evidence>["compare-refinancing-before-after"]),
      read: (outcome) => {
        if (outcome.refused) return `recusado: ${outcome.message.slice(0, 80)}`;
        const alternatives = (outcome.output.alternatives ?? []) as Array<{id: string; state: string; uncovered_terms?: string[] | null}>;
        const blocked = alternatives.filter((alternative) => alternative.state === "blocked");
        const carries = blocked.every((alternative) => (alternative.uncovered_terms ?? []).length > 0);
        const rest = alternatives.filter((alternative) => alternative.state !== "blocked").every((alternative) => alternative.state === "compared");
        return `a alternativa sem saida precificada ${blocked.length === 1 ? "bloqueia" : "nao bloqueia"} e ${carries ? "carrega o termo nao coberto" : "nao carrega o termo nao coberto"}, as outras ${rest ? "seguem comparadas" : "nao seguem comparadas"}`;
      },
    },
  ],
  "estimate-exit-cost-by-series": [
    {
      id: "adversarial:gc01:make-whole-without-quote-is-insufficient",
      expectation: "as 14 rotas de make-whole das seis series IPCA e da prefixada ficam sem premio calculado e o premio estimado do caso e 0",
      // The frozen base carries the mutation: the indentures write the make-whole and no NTN-B or
      // Pre x DI quote of the exit day is in the corpus, so no route may be priced.
      mutate: (input: never) => clone(input as ReturnType<typeof case01.case01Evidence>["estimate-exit-cost-by-series"]),
      read: (outcome) => {
        if (outcome.refused) return `recusado: ${outcome.message.slice(0, 80)}`;
        const series = (outcome.output.exit_costs ?? []) as Array<{routes?: Array<{mechanism: string; premium: unknown; quote: unknown}>}>;
        const makeWhole = series.flatMap((entry) => (entry.routes ?? []).filter((route) => /(_ipca|_pre)$/.test(route.mechanism)));
        const unpriced = makeWhole.filter((route) => route.quote === null && route.premium === null).length;
        return `as ${unpriced} rotas de make-whole das seis series IPCA e da prefixada ficam sem premio calculado e o premio estimado do caso e ${decimal(outcome.output, "totals.estimated_premium")}`;
      },
    },
  ],
  "declare-scenarios": [
    {
      id: "adversarial:gc01:parameter-without-origin-refused",
      expectation: "recusado no contrato de entrada",
      mutate: (input: never) => {
        const mutation = clone(input as ReturnType<typeof case01.case01Evidence>["declare-scenarios"]);
        const assumption = mutation.assumptions[0]! as Record<string, unknown>;
        delete assumption.origin;
        delete assumption.anchor;
        return mutation;
      },
      read: (outcome) => refusalNames(outcome, "origin"),
    },
  ],
  "plan-meeting-brief": [
    {
      id: "adversarial:gc01:question-answered-by-documents-refused",
      expectation: "a pergunta que os documentos ja respondem e recusada com a ancora da resposta e nao vai para a reuniao",
      mutate: (input: never) => clone(input as ReturnType<typeof case01.case01Evidence>["plan-meeting-brief"]),
      read: (outcome) => {
        if (outcome.refused) return `recusado: ${outcome.message.slice(0, 80)}`;
        const refused = (outcome.output.refused_questions ?? []) as Array<{id: string; answered_by: {document?: string} | null}>;
        const asked = (outcome.output.alignment_questions ?? []) as Array<{id: string}>;
        const answered = refused.find((question) => question.answered_by?.document);
        return `a pergunta que os documentos ja respondem ${answered ? "e recusada com a ancora da resposta" : "nao e recusada"} e ${answered && !asked.some((question) => question.id === answered.id) ? "nao vai para a reuniao" : "vai para a reuniao"}`;
      },
    },
  ],
  "write-meeting-synthesis": [
    {
      id: "adversarial:gc01:sentence-with-unsupported-number-removed",
      expectation: "a frase com um numero que os objetos nao sustentam e removida e listada, as outras duas ficam",
      mutate: () => null,
      read: () => "not used",
    },
  ],
};

/** The synthesis' adversarial case runs on its own validator, which is what removes the sentence. */
function synthesisAdversarialCase(): DeterministicMethodRunCase {
  const input = case01MethodInput("write-meeting-synthesis") as Parameters<typeof preview.synthesisSkeleton>[0];
  const vocabulary = preview.numberVocabulary(input.outputs);
  const sections = [{
    id: "situation",
    title: "Situacao atual da divida",
    paragraphs: [{text: "A divida bruta e de 5.670.186. A divida liquida contratual e de 4.228.477. O EBITDA cresceu 12,3% no ano.", references: ["c05.gross_debt"]}],
  }];
  const validated = preview.validateSynthesisNumbers(sections, vocabulary);
  const expectation = "a frase com um numero que os objetos nao sustentam e removida e listada, as outras duas ficam";
  const removed = validated.removed.length === 1 && validated.removed[0]!.numbers.includes("12,3%");
  const kept = (validated.sections[0]?.paragraphs[0]?.text ?? "").split(". ").length === 2;
  const observed = `a frase com um numero que os objetos nao sustentam ${removed ? "e removida e listada" : "fica no texto"}, as outras ${kept ? "duas ficam" : "nao ficam"}`;
  return {
    id: "adversarial:gc01:sentence-with-unsupported-number-removed",
    expectation,
    observed,
    inputFingerprint: sha256({sections, vocabulary: [...vocabulary].sort(compare)}),
    outputFingerprint: sha256(validated),
    passed: observed === expectation,
  };
}

function goldRunCases(methodId: Case01MethodId): DeterministicMethodRunCase[] {
  const gold = goldCases[methodId];
  const executed = executeCase01Method(methodId, case01MethodInput(methodId));
  const observed = gold.read(executed);
  return [{
    id: "gc01-analista-ib-camil",
    expectation: gold.expectation,
    observed,
    inputFingerprint: executed.inputFingerprint,
    outputFingerprint: executed.outputFingerprint,
    passed: observed === gold.expectation,
  }];
}

function adversarialRunCases(methodId: Case01MethodId): DeterministicMethodRunCase[] {
  if (methodId === "write-meeting-synthesis") return [synthesisAdversarialCase()];
  return adversarialCases[methodId].map((entry) => {
    const mutated = entry.mutate(case01MethodInput(methodId) as never);
    const outcome = applyAdversarial(methodId, mutated);
    const observed = entry.read(outcome);
    return {
      id: entry.id,
      expectation: entry.expectation,
      observed,
      inputFingerprint: outcome.refused ? outcome.inputFingerprint : outcome.inputFingerprint,
      outputFingerprint: outcome.refused ? sha256({refused: outcome.message}) : outcome.outputFingerprint,
      passed: observed === entry.expectation,
    };
  });
}

function consistencyRunCases(methodId: Case01MethodId): DeterministicMethodRunCase[] {
  const canonical = executeCase01Method(methodId, case01MethodInput(methodId));
  return Array.from({length: 10}, (_unused, index) => {
    const seed = index + 1;
    const permuted = executeCase01Method(methodId, permuteCase01Input(case01MethodInput(methodId), seed));
    const expectation = `permutacao ${seed} de gc01-analista-ib-camil reproduz ${canonical.outputFingerprint}`;
    const observed = `permutacao ${seed} de gc01-analista-ib-camil reproduz ${permuted.outputFingerprint}`;
    return {
      id: `gc01-permutation-${String(seed).padStart(2, "0")}`,
      expectation,
      observed,
      inputFingerprint: permuted.inputFingerprint,
      outputFingerprint: permuted.outputFingerprint,
      passed: permuted.outputFingerprint === canonical.outputFingerprint && permuted.inputFingerprint === canonical.inputFingerprint,
    };
  });
}

const notes: Record<"gold" | "adversarial" | "consistency", string> = {
  gold: "Evidencia congelada do Caso 01 (Camil) executada pelo executor publicado. Os valores esperados vem do gabarito do caso, nao do resultado.",
  adversarial: "Mutacoes adversariais declaradas no frontmatter do metodo. A maioria e aplicada a evidencia congelada; onde a propria base do Caso 01 ja carrega a condicao (aprovacoes de conselho sem contrato, make-whole sem cotacao, EBITDA sem abertura), o caso afirma sobre ela em vez de inventar uma mutacao. Uma entrada que o contrato de entrada recusa e registrada como recusa estruturada.",
  consistency: "Dez permutacoes profundas da entrada (ordem de linhas, de listas e de chaves). Ordem que e significado (operandos de uma diferenca, degraus de covenant) e conteudo assinado nao sao permutados.",
};

export type Case01MethodRunEvidence = Pick<
  DeterministicMethodRun,
  "runId" | "kind" | "method" | "executor" | "harness" | "modelCalls" | "cases" | "result"
> & {evidenceFingerprint: string; notes: string};

/** The method version and executor binding, read from the Markdown library that owns them. */
function methodBinding(methodId: Case01MethodId): {method: {id: string; version: string}; executor: {module: string; exportName: string}} {
  const library = loadMethodLibrary(resolve(knowledge, "procedures"), resolve(knowledge, "reviews"));
  const found = library.methods.find((entry) => entry.procedure.id === methodId);
  if (!found) throw new Error(`method ${methodId} is not in the library`);
  const implementation = found.procedure.implementation;
  if (!implementation) throw new Error(`method ${methodId} declares no executable implementation`);
  return {
    method: {id: found.procedure.id, version: found.procedure.version},
    executor: {module: implementation.executor.module, exportName: implementation.executor.exportName},
  };
}

const harness = {module: "@offroad/evals/src/case01-method-runs.ts", exportName: "buildCase01MethodRuns"} as const;

/** Executes the thirty recorded runs. Nothing here calls a model and nothing here writes files. */
export function buildCase01MethodRuns(): Case01MethodRunEvidence[] {
  return case01MethodIds.flatMap((methodId) => {
    const binding = methodBinding(methodId);
    const kinds = [
      {kind: "gold" as const, cases: goldRunCases(methodId)},
      {kind: "adversarial" as const, cases: adversarialRunCases(methodId)},
      {kind: "consistency" as const, cases: consistencyRunCases(methodId)},
    ];
    return kinds.map((entry) => {
      const evidence = {
        runId: case01MethodRunId(methodId, entry.kind),
        kind: entry.kind,
        method: binding.method,
        executor: binding.executor,
        harness,
        modelCalls: 0 as const,
        cases: entry.cases,
        result: entry.cases.every((item) => item.passed) ? "pass" as const : "fail" as const,
      };
      return {...evidence, evidenceFingerprint: deterministicRunEvidenceFingerprint(evidence), notes: notes[entry.kind]};
    });
  });
}
