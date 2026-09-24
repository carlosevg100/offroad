import {
  BASELINE_SYSTEM_PROMPT,
  baselineGeneralistResultSchema,
  baselineOutputSchema,
  informationBaseHash,
  renderInformationBase,
  renderTurnMessage,
  sha256Hex,
  type BaselineGeneralistRun,
  type BaselineGeneralistSnapshot,
  type BaselineInformationBase,
  type BaselineModelRoute,
  type BaselineModelSettings,
} from "@offroad/agent-contracts";
import {
  estimateRequestInputTokens,
  estimateTextTokens,
  listPrices,
  modelLimits,
  redactPersonalIdentifiers,
  reservationForTokensUsd,
  type AdapterRequest,
  type ModelLimits,
  type ModelPrice,
} from "@offroad/model-gateway";

/**
 * Fair baseline for a gold case (gold-cases/README.md §5). The contract of the baseline family,
 * from the information base to the per-turn loop, the run record and the published result, lives
 * in `@offroad/agent-contracts`, shared with the worker that runs it under the governed evaluation
 * transport. This module keeps the names the evals scripts and tests import, plus the helpers
 * that only the script needs: assembling the information base from the case files and reading
 * back the result the worker committed.
 */
export {
  BASELINE_SYSTEM_PROMPT,
  baselineDocumentSchema,
  baselineGeneralistResultSchema,
  baselineGeneralistSnapshotSchema,
  baselineInformationBaseSchema,
  baselineModelRouteSchema,
  baselineModelSettingsSchema,
  baselineOutputSchema,
  baselineRunRecordSchema,
  baselineSnapshotContentHashes,
  baselineSourceSchema,
  baselineTurnSchema,
  informationBaseHash,
  renderInformationBase,
  renderTurnMessage,
  runBaselineGeneralist,
  sha256Hex,
  type BaselineDocument,
  type BaselineGateway,
  type BaselineGeneralistResult,
  type BaselineGeneralistRun,
  type BaselineGeneralistSnapshot,
  type BaselineInformationBase,
  type BaselineModelRoute,
  type BaselineModelSettings,
  type BaselineOutput,
  type BaselineRunRecord,
  type BaselineSource,
  type BaselineTurn,
  type BaselineTurnRequest,
} from "@offroad/agent-contracts";

/** Keeps only the header and the rows of a CSV that mention the company; large registries stay readable. */
export function filterCsvRows(csv: string, pattern: RegExp, maxRows = 200): {text: string; kept: number; total: number} {
  const lines = csv.split(/\r?\n/).filter((line) => line.length > 0);
  const [header, ...rows] = lines;
  const kept = rows.filter((row) => pattern.test(row)).slice(0, maxRows);
  return {text: [header ?? "", ...kept].join("\n"), kept: kept.length, total: rows.length};
}

/**
 * The declared priority of the pack's sources in a baseline request, the same for every case
 * (gold-cases/README.md §5.1): the order in which a DCM analyst reads a data room to prepare a
 * first meeting, from the company's latest reported numbers to the full contracts that are
 * consulted for specific clauses.
 */
export const baselineSourcePriority = [
  /** The company's own results releases, presentations and financial statements. */
  "periodic_report",
  /** Reference rates and curves as of the case date. */
  "market_data",
  /** Board minutes, notices to the market, event calendars and offering notices. */
  "corporate_event",
  /** The public company registry and filing indexes. */
  "registry",
  /** Trustee and securitizer reports on the outstanding issues. */
  "debt_status_report",
  /** Indentures of the company's outstanding debentures and their amendments. */
  "debt_indenture",
  /** Securitization terms of certificates backed by the company's debt, and their amendments. */
  "securitization_terms",
] as const;
export type BaselineSourceCategory = (typeof baselineSourcePriority)[number];

/**
 * Room each earlier deliverable takes in a later request, as a multiple of the output ceiling: a
 * deliverable is at most the ceiling in real tokens (thinking shares it), and the estimator reads
 * generated Portuguese Markdown at about 1.16 times its real count (the gc01 run of 4 Sep 2026).
 */
export const BASELINE_DELIVERABLE_ALLOWANCE_FACTOR = 1.5;

export type BaselineRoutePlan = {
  provider: BaselineModelRoute["provider"];
  model: string;
  /** Upper bound of the request's input by the gateway's own estimator, earlier deliverables at their allowance. */
  estimatedInputTokens: number;
  /** The largest input this route takes with room for the whole answer, and within the declared budget. */
  ceilingInputTokens: number;
  /** What the gateway reserves for this attempt at most, at list price. */
  reservationUsd: number;
};
export type BaselineSelection = {
  requestInputTokenBudget: number;
  deliverableAllowanceTokens: number;
  sources: Array<{id: string; category: BaselineSourceCategory; estimatedTokens: number; included: boolean}>;
  turns: Array<{turnId: string; routes: BaselineRoutePlan[]}>;
  /** Every attempt the evaluation may make (each turn on each route) at its reservation. */
  maxCostUsd: number;
};

const redacted = (text: string) => redactPersonalIdentifiers(text, {}).text;

/**
 * The request of turn `index` as the gateway receives it (personal identifiers already masked),
 * earlier deliverables reduced to their headings. `redactedBase` is the rendered base, masked once.
 */
function turnRequest(base: BaselineInformationBase, redactedBase: string, index: number, route: BaselineModelRoute, maxOutputTokens: number): AdapterRequest {
  const parts: string[] = [];
  base.turns.slice(0, index + 1).forEach((turn, position) => {
    parts.push(renderTurnMessage(turn, position));
    if (position < index) parts.push(`## Resposta ao turno ${position + 1} (sua entrega anterior)\n\n`);
  });
  return {model: route.model, effort: route.effort, system: BASELINE_SYSTEM_PROMPT,
    input: [{type: "text", text: redactedBase}, ...parts.map((text) => ({type: "text" as const, text: redacted(text)}))],
    schema: baselineOutputSchema, schemaName: "baseline_deliverable", maxOutputTokens, timeoutMs: 1};
}

/** Every turn of the base on every route: its estimated input, its ceiling and the reservation of the attempt. */
export function planBaselineRequests(base: BaselineInformationBase, model: BaselineModelSettings, options: {
  requestInputTokenBudget: number;
  limits?: Record<string, ModelLimits>;
  prices?: Record<string, ModelPrice>;
}): Pick<BaselineSelection, "turns" | "maxCostUsd" | "deliverableAllowanceTokens"> {
  const limits = options.limits ?? modelLimits;
  const allowance = Math.ceil(model.maxOutputTokens * BASELINE_DELIVERABLE_ALLOWANCE_FACTOR);
  const routes = model.fallback ? [model.primary, model.fallback] : [model.primary];
  const redactedBase = redacted(renderInformationBase(base));
  let micro = 0;
  const turns = base.turns.map((turn, index) => ({turnId: turn.id, routes: routes.map((route): BaselineRoutePlan => {
    const routeLimits = limits[route.model];
    if (!routeLimits) throw new Error(`baseline_route_limits_unknown: ${route.model}`);
    const estimate = estimateRequestInputTokens(route.provider, turnRequest(base, redactedBase, index, route, model.maxOutputTokens));
    const estimatedInputTokens = estimate.inputTokens + index * allowance;
    const wholePromptWritable = estimate.cacheWritableInputTokens === estimate.inputTokens;
    const reservationUsd = reservationForTokensUsd({model: route.model, inputTokens: estimatedInputTokens, maxOutputTokens: model.maxOutputTokens,
      cacheWritableInputTokens: wholePromptWritable ? estimatedInputTokens : estimate.cacheWritableInputTokens, prices: options.prices ?? listPrices});
    micro += Math.ceil(reservationUsd * 1_000_000);
    return {provider: route.provider, model: route.model, estimatedInputTokens, reservationUsd,
      ceilingInputTokens: Math.min(options.requestInputTokenBudget, routeLimits.maxInputTokens, routeLimits.contextWindowTokens - model.maxOutputTokens)};
  })}));
  return {turns, maxCostUsd: Math.ceil(micro / 10_000) / 100, deliverableAllowanceTokens: allowance};
}

/**
 * Makes every request of the baseline fit: the attached documents always go whole, and the pack's
 * sources follow in the declared category order, most recent first within a category, each one
 * whole if the largest request (the last turn, earlier deliverables at their allowance) still fits
 * the declared budget and every route's ceiling by the gateway's own estimator, otherwise kept as
 * a reference only. Deterministic: the same inputs select the same sources.
 */
export function selectBaselineInformationBase(input: {
  base: BaselineInformationBase;
  categories: Readonly<Record<string, BaselineSourceCategory>>;
  model: BaselineModelSettings;
  requestInputTokenBudget: number;
  limits?: Record<string, ModelLimits>;
  prices?: Record<string, ModelPrice>;
}): {base: BaselineInformationBase; selection: BaselineSelection} {
  const {base, categories, model, requestInputTokenBudget} = input;
  if (!Number.isSafeInteger(requestInputTokenBudget) || requestInputTokenBudget <= 0) throw new Error("baseline_request_budget_invalid");
  for (const source of base.sources) if (!Object.hasOwn(categories, source.id)) throw new Error(`baseline_source_uncategorized: ${source.id}`);
  const routes = model.fallback ? [model.primary, model.fallback] : [model.primary];
  const estimated = new Map(base.sources.flatMap((source) => source.text === null ? [] :
    [[source.id, Math.max(...routes.map((route) => estimateTextTokens(route.provider, redacted(source.text!))))] as const]));
  const rank = (id: string) => baselineSourcePriority.indexOf(categories[id]!);
  const order = base.sources.filter((source) => source.text !== null)
    .sort((a, b) => rank(a.id) - rank(b.id) || b.asOfDate.localeCompare(a.asOfDate) || a.id.localeCompare(b.id));
  const included = new Set<string>();
  const assemble = (): BaselineInformationBase => ({...base, sources: base.sources.map((source) => source.text === null || included.has(source.id) ? source : {
    ...source, text: null, rendering: "omitted_for_budget" as const,
    note: `Cerca de ${estimated.get(source.id)} tokens estimados; não coube no limite de ${requestInputTokenBudget} tokens estimados por pedido.`,
  })});
  const plan = (candidate: BaselineInformationBase) => planBaselineRequests(candidate, model, {requestInputTokenBudget, ...(input.limits ? {limits: input.limits} : {}), ...(input.prices ? {prices: input.prices} : {})});
  const fits = (candidate: BaselineInformationBase) => plan(candidate).turns.every((turn) => turn.routes.every((route) => route.estimatedInputTokens <= route.ceilingInputTokens));
  if (!fits(assemble())) throw new Error("baseline_documents_exceed_request_budget");
  for (const source of order) {
    included.add(source.id);
    if (!fits(assemble())) included.delete(source.id);
  }
  const selected = assemble();
  const planned = plan(selected);
  return {base: selected, selection: {requestInputTokenBudget, ...planned,
    sources: order.map((source) => ({id: source.id, category: categories[source.id]!, estimatedTokens: estimated.get(source.id)!, included: included.has(source.id)}))}};
}

/** The caveat every run record of a selected base repeats, in the reviewers' language. */
export function baselineSelectionCaveat(selection: BaselineSelection): string {
  const omitted = selection.sources.filter((source) => !source.included).length;
  return `Cada pedido ao modelo ficou limitado a ${selection.requestInputTokenBudget} tokens estimados: documentos anexados por inteiro; fontes do pack na ordem declarada de categorias, da mais recente para a mais antiga, cada uma inteira ou só pela referência; ${omitted} de ${selection.sources.length} fontes com conteúdo ficaram só com a referência.`;
}

/**
 * The committed result of a governed baseline, read strictly and bound to the snapshot this
 * process sent: the same case, the same rendered base and system prompt, one deliverable per turn
 * in order, each file named after its turn and each hash matching the text it names. Anything else
 * is not the run of these inputs, and nothing of it is written.
 */
export function readBaselineGovernedResult(value: unknown, snapshot: BaselineGeneralistSnapshot): BaselineGeneralistRun {
  const {record, outputs} = baselineGeneralistResultSchema.parse(value);
  const base = snapshot.informationBase;
  const mismatch = (what: string) => new Error(`baseline_result_mismatch: ${what}`);
  if (record.caseId !== base.caseId || record.caseVersion !== base.caseVersion || record.asOfDate !== base.asOfDate) throw mismatch("case");
  if (record.informationBaseSha256 !== informationBaseHash(base)) throw mismatch("information base");
  if (record.systemPromptSha256 !== sha256Hex(BASELINE_SYSTEM_PROMPT)) throw mismatch("system prompt");
  if (record.caveats.length !== snapshot.caveats.length || record.caveats.some((caveat, index) => caveat !== snapshot.caveats[index])) throw mismatch("caveats");
  if (outputs.length !== base.turns.length || record.turns.length !== base.turns.length) throw mismatch("turns");
  base.turns.forEach((turn, index) => {
    const output = outputs[index]!, entry = record.turns[index]!, file = `${turn.id}.output.md`;
    if (output.turnId !== turn.id || output.file !== file || entry.id !== turn.id || entry.outputFile !== file
      || entry.messageSha256 !== sha256Hex(renderTurnMessage(turn, index)) || entry.outputSha256 !== sha256Hex(output.deliverable)) {
      throw mismatch(`turn ${turn.id}`);
    }
  });
  return {record, outputs};
}
