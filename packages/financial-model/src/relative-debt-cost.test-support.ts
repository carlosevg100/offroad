import {createHash} from "node:crypto";
import type {AdoptionBasisEntry, AdoptionBasisSnapshot} from "@offroad/reconciliation";
import type {AdoptedRelativeDebtCostInput} from "./adopted-relative-debt-cost";
import type {AdoptedRelativeCostLensInput} from "./adopted-relative-cost-lens";
import type {RelativeDebtCostPacketInput} from "./relative-debt-cost-packet";

export const c03Id = (n: number) => `ac300000-0000-4000-9000-${String(n).padStart(12, "0")}`;
const id = c03Id;
/** Synthetic adopted basis of ficha C03 (fictitious Aurora and Serra Verde): calibration only,
 * never production parameters. Market adjustments carry the scenario's market object as anchor. */
export function c03PacketInput() {
  const entries: AdoptionBasisEntry[] = []; let n = 20;
  const comparisonId = id(4), prefix = `relative_cost.${comparisonId}.`;
  function contribute(name: string, unit: string, value: AdoptionBasisEntry["value"], peer = false) {
    const decisionId = id(n++);
    entries.push({decisionId, slotKey: createHash("sha256").update(name).digest("hex"), kind: "hypothesis", fieldPath: prefix + name,
      dimensions: {entityId: peer ? id(2) : id(1), perimeter: "standalone", periodStart: "2024-01-01", periodEnd: "2027-06-01", currency: "BRL", unit, scale: "1", scenario: "synthetic-comparison", definitionVersionId: id(3)},
      value, observationId: null, referenceValue: null, referenceDimensions: null, definitionKind: "managerial", actorId: id(5), reason: "Synthetic explicitly adopted comparison operand"});
    return {decisionId, definitionVersionId: id(3), definitionKind: "managerial" as const, missingReason: null};
  }
  const number = (name: string, unit: string, value: string, peer = false) => contribute(name, unit, {type: "number", value}, peer);
  const text = (name: string, unit: string, value: string, peer = false) => contribute(name, unit, {type: "text", value}, peer);
  const list = (name: string, unit: string, value: string[]) => contribute(name, unit, {type: "list", value});
  const snapshot: AdoptionBasisSnapshot = {schemaVersion: "contextual-adoption.v1", versionId: id(500), setId: id(6), workId: id(7), purpose: "explain relative debt cost", contextKey: "synthetic-comparison", revision: 1, previousVersionId: null, classification: "working_basis", entries};
  const context = {envelope: {canonical: "", fingerprint: ""}, scope: {workId: id(7), purpose: snapshot.purpose, versionId: snapshot.versionId},
    entityId: id(1), peerEntityId: id(2), perimeter: "standalone", peerPerimeter: "standalone", currency: "BRL", scenario: "synthetic-comparison", openingDate: "2024-01-01", endDate: "2027-06-01", comparisonId};
  const analysis: AdoptedRelativeDebtCostInput = {...context, asOfDate: "2026-05-01", numericInterpretations: [],
    own: {spreadBps: number("own.spreadBps", "basis_points", "260"), indexer: text("own.indexer", "convention", "CDI"), pricingDate: contribute("own.pricingDate", "date", {type: "date", value: "2024-09-01"})},
    peer: {spreadBps: number("peer.spreadBps", "basis_points", "135", true), indexer: text("peer.indexer", "convention", "CDI", true), pricingDate: contribute("peer.pricingDate", "date", {type: "date", value: "2026-05-01"}, true)},
    pricingBasis: text("pricingBasis", "convention", "same_indexer_quoted_spread"), curveVersion: text("curveVersion", "reference_id", "not_applicable"), coverage: text("coverage", "convention", "complete_scoped_bridge"),
    adjustments: [], actions: []};
  const families = ["pricing_date", "tenor", "guarantee", "instrument_distribution", "scale"];
  analysis.adjustments = ["60", "-10", "-15", "20", "15"].map((bps, i) => {
    const adjustmentId = id(300 + i), p = `adjustment.${adjustmentId}.`;
    return {id: adjustmentId, terms: {bps: number(p + "bps", "basis_points", bps), family: text(p + "family", "convention", families[i]!),
      evidenceAnchor: text(p + "evidenceAnchor", "reference_id", "synthetic-market-object:" + i), methodologyVersion: text(p + "methodologyVersion", "reference_id", "synthetic-market-v1"),
      independentEffectGroup: text(p + "independentEffectGroup", "reference_id", families[i]!)}};
  });
  const action = (k: number, current: string, proposed: string, principal: string, fraction: string, start: string, end: string, costs: string[], anchor: string) => {
    const actionId = id(350 + k), p = `action.${actionId}.`;
    analysis.actions.push({id: actionId, terms: {convention: text(p + "convention", "convention", "marginal_spread_budget_estimate"),
      currentSpreadBps: number(p + "currentSpreadBps", "basis_points", current), proposedSpreadBps: number(p + "proposedSpreadBps", "basis_points", proposed),
      starts: list(p + "starts", "date", [start]), ends: list(p + "ends", "date", [end]), affectedPrincipal: list(p + "affectedPrincipal", "currency", [principal]),
      yearFractions: list(p + "yearFractions", "ratio", [fraction]), timeBases: list(p + "timeBases", "convention", ["adopted_month_fraction"]),
      annualIndices: list(p + "annualIndices", "ratio", ["not_applicable"]), exposureAnchors: list(p + "exposureAnchors", "reference_id", [anchor]),
      costDates: list(p + "costDates", "date", costs.map(() => start)), costAmounts: list(p + "costAmounts", "currency", costs),
      costAnchors: list(p + "costAnchors", "reference_id", costs.map((_, c) => `${anchor}:cost:${c}`)), costCoverage: text(p + "costCoverage", "convention", "complete_for_stated_horizon")}});
    return actionId;
  };
  // Prepay the Bradesco CCB at today's CDI + 1.90 or + 2.20 for the 13 remaining months; fee 1% and IOF of a new CCB.
  const refinance190 = action(0, "260", "190", "40000000", "1.08333333333333333333", "2026-05-01", "2027-06-01", ["400000", "1349200"], "bradesco-contract");
  const refinance220 = action(1, "260", "220", "40000000", "1.08333333333333333333", "2026-05-01", "2027-06-01", ["400000", "1349200"], "bradesco-contract");
  // Rating on the R$ 90 mi raise of the C32 route: 15 to 25 bps a year against R$ 0.2 to 0.3 mi a year (low pairs the smaller gain with the higher cost).
  const ratingLow = action(2, "190", "175", "90000000", "1", "2026-05-01", "2027-05-01", ["300000"], "rating-market-object");
  const ratingHigh = action(3, "190", "165", "90000000", "1", "2026-05-01", "2027-05-01", ["200000"], "rating-market-object");
  const lp = (rowId: string, name: string) => `lens.${rowId}.${name}`;
  const numeric = (k: number, label: string, definition: string, unit: "ratio" | "multiple" | "currency", own: string, peer: string, direction: "higher_is_better" | "higher_is_worse") => {
    const rowId = id(400 + k);
    return {id: rowId, kind: "numeric" as const, label: text(lp(rowId, "label"), "explanation", label), definition: text(lp(rowId, "definition"), "explanation", definition),
      peerDefinition: text(lp(rowId, "peerDefinition"), "explanation", definition, true), unit,
      own: number(lp(rowId, "own"), unit, own), peer: number(lp(rowId, "peer"), unit, peer, true), direction: text(lp(rowId, "direction"), "convention", direction)};
  };
  const qualitative = (k: number, label: string, own: string, peer: string, classification: string) => {
    const rowId = id(400 + k);
    return {id: rowId, kind: "qualitative" as const, label: text(lp(rowId, "label"), "explanation", label), own: text(lp(rowId, "own"), "explanation", own),
      peer: text(lp(rowId, "peer"), "explanation", peer, true), classification: text(lp(rowId, "classification"), "convention", classification)};
  };
  const lens: AdoptedRelativeCostLensInput = {...context,
    rows: [numeric(0, "Receita 2025", "Receita líquida consolidada", "currency", "420000000", "1100000000", "higher_is_better"),
      numeric(1, "Margem EBITDA 2025", "EBITDA CVM 156 sobre receita líquida", "ratio", "0.124", "0.15", "higher_is_better"),
      numeric(2, "Dívida líquida / EBITDA", "Sem IFRS 16, dezembro de 2025", "multiple", "1.9", "1.9", "higher_is_worse"),
      numeric(3, "EBITDA / juros", "EBITDA CVM 156 sobre juros pagos", "multiple", "2.9", "3.3", "higher_is_better"),
      numeric(4, "Conversão do EBITDA em caixa", "Fluxo operacional sobre EBITDA, média de 3 anos", "ratio", "0.55", "0.72", "higher_is_better"),
      qualitative(5, "Concentração de clientes", "2 maiores: 38%", "5 maiores: 14%", "weighs_against"),
      numeric(6, "Dívida vencendo em 12 meses", "Sobre a dívida total", "ratio", "0.26", "0.09", "higher_is_worse"),
      numeric(7, "Prazo médio da dívida", "Em anos, ponderado pelo principal", "multiple", "1.9", "4.2", "higher_is_better"),
      qualitative(8, "Rating e divulgação", "Sem rating; capital fechado", "AA(bra); companhia aberta", "weighs_against"),
      qualitative(9, "Histórico de crédito", "Sem eventos", "Sem eventos", "neutral")],
    materialityThreshold: number("lens.materialityThreshold", "ratio", "0.15"),
    notch: {bpsLow: number("lens.notch.bpsLow", "basis_points", "25"), bpsHigh: number("lens.notch.bpsHigh", "basis_points", "30"), peerRating: text("lens.notch.peerRating", "explanation", "AA(bra)", true)}};
  const input: RelativeDebtCostPacketInput = {schemaVersion: "relative-debt-cost-packet-input.v1", question: "Por que pagamos mais que a Serra Verde?", analysis, lens,
    levers: [{actionId: refinance190, role: "refinance_existing", label: "Pré-pagar o Bradesco a CDI + 1,90", scenario: "low"},
      {actionId: refinance220, role: "refinance_existing", label: "Pré-pagar o Bradesco a CDI + 2,20", scenario: "high"},
      {actionId: ratingLow, role: "rating", label: "Rating, ganho menor e custo maior", scenario: "low"},
      {actionId: ratingHigh, role: "rating", label: "Rating, ganho maior e custo menor", scenario: "high"}]};
  function seal() {const canonical = JSON.stringify(snapshot); const envelope = {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")};
    input.analysis.envelope = envelope; input.lens.envelope = envelope; return input;}
  return {input, entries, seal, contribute, ids: {refinance190, refinance220, ratingLow, ratingHigh}};
}
