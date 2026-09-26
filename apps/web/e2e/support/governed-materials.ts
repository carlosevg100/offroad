import {randomUUID} from "node:crypto";

import {
  buildInitialInstitutionalConfigurationCandidate,
  buildInstitutionalFinancialModel,
  buildInstitutionalWorkbookArtifact,
  prepareInstitutionalModelInput,
  reviewInstitutionalFinancialModel,
} from "@offroad/financial-model";

import {institutionalInputFixture} from "../../../../packages/financial-model/src/institutional-input.fixture";

/**
 * Object keys in the order Postgres jsonb returns them (shorter keys first, then bytewise). The
 * worker builds the workbook from facts it reads back from the database, so their anchors arrive in
 * this order; the workbook prints each anchor as JSON, and a producer that kept another key order
 * would record bytes that no longer replay once the artifact is stored as jsonb.
 */
function asReadFromPostgres<T>(value: T): T {
  const order = (inner: unknown): unknown => Array.isArray(inner) ? inner.map(order)
    : inner && typeof inner === "object"
      ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0)).map(([key, item]) => [key, order(item)]))
      : inner;
  return order(value) as T;
}

/**
 * A fresh institutional workbook for the governed materials journey, built by the real reviewed
 * source, configuration and calculation producer (the same steps as the committed SQL fixture) and
 * bound to the synthetic source document of this run, so the model route replays it against the
 * approved hash of each locale.
 */
export async function institutionalWorkbookFor(documentId: string, actorId: string) {
  const fixture = asReadFromPostgres(JSON.parse(JSON.stringify(institutionalInputFixture()).replaceAll("synthetic-accounts", documentId)) as ReturnType<typeof institutionalInputFixture>);
  const stamp = "2026-09-20T10:00:00Z";
  const sources = fixture.sources.map((source) => ({...source, metadataEvidence: {locator: "Financials", rationale: "Reviewed normalized base units"}, reviewedBy: actorId, reviewedAt: stamp}));
  const candidate = buildInitialInstitutionalConfigurationCandidate({
    ...fixture, reviewedSources: sources, currentSources: fixture.sources.map((source) => ({...source, hashVerified: true})),
    actorId, submittedAt: stamp, submissionId: randomUUID(),
  });
  if (candidate.status !== "review_required") throw new Error("Synthetic institutional configuration is not reviewable");
  const prepared = prepareInstitutionalModelInput({configuration: candidate.configuration, facts: fixture.facts, sources});
  if (!prepared.input) throw new Error("Synthetic institutional input is incomplete");
  const model = buildInstitutionalFinancialModel(prepared.input);
  return buildInstitutionalWorkbookArtifact([{
    configurationId: randomUUID(), revision: 1, configurationFingerprint: candidate.configurationFingerprint, reviewedBy: actorId, reviewedAt: stamp,
    prepared, model, review: reviewInstitutionalFinancialModel(prepared.input, model),
    sourceBindings: sources.map((source) => ({...source, currency: "BRL", amountScale: "units" as const})),
  }], "a".repeat(64));
}

/** Two materials of the approved plan, labeled synthetic; their citations point at the reviewed revenue. */
export const syntheticGovernedMaterials = [
  {kind: "term_sheet", title: {pt: "Termos indicativos sintéticos", en: "Synthetic indicative terms"}, dependsOn: [], blocks: [
    {type: "heading", text: {pt: "Estrutura proposta", en: "Proposed structure"}},
    {type: "paragraph", text: {pt: "Montante indicativo sintético, sustentado pela receita revisada de 2026.", en: "Synthetic indicative amount, backed by the reviewed 2026 revenue."},
      supportIds: ["historical_financials.2026.revenue (2026-12-31)"]},
    {type: "disclaimer", text: {pt: "Material sintético para teste; não é oferta nem aprovação.", en: "Synthetic test material; not an offer or an approval."}},
  ]},
  {kind: "teaser", title: {pt: "Resumo sintético da operação", en: "Synthetic transaction summary"}, dependsOn: [], blocks: [
    {type: "paragraph", text: {pt: "Empresa sintética em busca de financiamento indicativo.", en: "Synthetic company seeking indicative financing."}},
    {type: "disclaimer", text: {pt: "Material sintético para teste; não é oferta nem aprovação.", en: "Synthetic test material; not an offer or an approval."}},
  ]},
] as const;
