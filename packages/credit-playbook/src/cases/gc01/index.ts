/**
 * The frozen evidence of Case 01 (Camil Alimentos S.A., banker preparing a meeting), as the nine
 * executors consume it. Every input was curated from the review corpus of the case with an anchor
 * on each value, and the builders return fresh objects so callers may mutate what they receive.
 *
 * This is what the product's integration_preview binds to the project instead of a live extraction.
 * That substitution is declared on every artifact it produces: the preview validates the pipeline
 * around the methods, not the extraction of the documents.
 */
import {camil as buildDebtLedgerInput} from "./build-debt-ledger";
import {camil as buildInterestScheduleInput} from "./build-interest-and-indexation-schedule";
import {camil as buildBeforeAfterInput} from "./compare-refinancing-before-after";
import {camil as buildScenarioInput, gold as buildScenarioGoldInput} from "./declare-scenarios";
import {camil as buildMaturityWallInput} from "./diagnose-maturity-wall";
import {camil as buildExitCostInput} from "./estimate-exit-cost-by-series";
import {turn1 as buildMeetingBriefInput} from "./plan-meeting-brief";
import {camil as buildCovenantInput} from "./reconcile-covenant-definitions";
import {camil as buildStatementsInput} from "./reconcile-financial-statements";

export const case01EvidenceManifest = {
  caseId: "gc01-analista-ib-camil",
  company: "Camil Alimentos S.A.",
  referenceDate: "2026-05-31",
  /** The frozen corpus every anchor points into; hashes live in the manifest file itself. */
  corpusManifest: "docs/product/gold-cases/runs/gc01/ai-review-corpus/manifest.json",
  basis: "curated_from_frozen_corpus" as const,
  note: "Inputs curated by hand from the frozen public corpus of the case, one anchor per value; the product does not extract them live in integration_preview.",
  version: "2026.09.05-v1",
} as const;

/** One fresh copy of every executor input of the case, keyed by method id. */
export function case01Evidence() {
  return {
    "build-debt-ledger": buildDebtLedgerInput(),
    "reconcile-financial-statements": buildStatementsInput(),
    "reconcile-covenant-definitions": buildCovenantInput("unknown"),
    "diagnose-maturity-wall": buildMaturityWallInput(),
    "build-interest-and-indexation-schedule": buildInterestScheduleInput(),
    "estimate-exit-cost-by-series": buildExitCostInput(),
    "declare-scenarios": buildScenarioGoldInput(),
    "declare-scenarios-hypothetical": buildScenarioInput(),
    "compare-refinancing-before-after": buildBeforeAfterInput(),
    "plan-meeting-brief": buildMeetingBriefInput(),
  };
}
export type Case01Evidence = ReturnType<typeof case01Evidence>;
