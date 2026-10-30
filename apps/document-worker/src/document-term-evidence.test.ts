import {describe, expect, it} from "vitest";
import type {FactCandidate} from "@offroad/reconciliation";
import {documentTermEvidence} from "./document-term-evidence";

const candidate = (unit = "days", quote = "Prazo de até 120 dias.", value = "120"): FactCandidate => ({fieldPath: "transaction.desired_term_months", normalizedValue: value, valueType: "number", sourceDocument: "synthetic-source", evidenceRank: 1, informationClass: "document_fact", confidence: 0.99, anchorVerified: true, unit, anchor: {quote}});
describe("documentary term unit, independent of a historical field name", () => {
  it("preserves 120 quoted days and never projects them as months", () => {expect(documentTermEvidence([candidate()])).toEqual({days: 120, months: null});});
  it("preserves an explicit month count without a calendar convention", () => {expect(documentTermEvidence([candidate("months", "Prazo: 18 meses.", "18")])).toEqual({days: null, months: 18});});
  it("refuses a months label over a days quote", () => {expect(documentTermEvidence([candidate("months")])).toEqual({days: null, months: null});});
  it("does not infer a unit when extraction omitted it", () => {expect(documentTermEvidence([candidate("")])).toEqual({days: null, months: null});});
  it("does not convert years to months without a declared convention", () => {expect(documentTermEvidence([candidate("months", "Prazo de 10 anos.")])).toEqual({days: null, months: null});});
  it("requires the exact complete number next to its unit", () => {expect(documentTermEvidence([candidate("days", "Prazo: 1120 dias.")])).toEqual({days: null, months: null});});
  it("refuses coexisting conflicting durations rather than choosing one by rank", () => {expect(documentTermEvidence([candidate(), candidate("months", "Prazo: 120 meses.")])).toEqual({days: null, months: null});});
  it("allows corroboration of the same quoted duration", () => {expect(documentTermEvidence([candidate(), candidate()])).toEqual({days: 120, months: null});});
  it("requires verified anchors and an explicit quoted unit", () => {const c = candidate(); c.anchorVerified = false; expect(documentTermEvidence([c])).toEqual({days: null, months: null}); expect(documentTermEvidence([candidate("days", "Valor: 120")])).toEqual({days: null, months: null});});
});
