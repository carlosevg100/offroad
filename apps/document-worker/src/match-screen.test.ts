import type {CaseEngineState} from "@offroad/case-engine";
import {describe, expect, it} from "vitest";

import {buildGovernedMatchScreen} from "./match-screen";

const hash = (character: string) => character.repeat(64);

describe("governed match screen", () => {
  it("preserves criterion-level explanations without inventing a match score", () => {
    const providerId = "10000000-0000-4000-8000-000000000001";
    const matching = {
      screened: true,
      structuralExclusions: [],
      fits: [{
        fundId: providerId,
        fundName: "Financiadora Ágil",
        verdict: "fits",
        criteria: [{
          id: "ticket",
          labels: {pt: "Ticket", en: "Ticket"},
          outcome: "fits",
          hard: true,
          mandate: "R$ 10 milhões a R$ 80 milhões",
          request: "R$ 40 milhões",
          explanation: {pt: "O valor está dentro do mandato confirmado.", en: "The amount is within the confirmed mandate."},
          divergent: false,
        }],
        exclusions: [],
        unlockedBy: [],
        ourGaps: [],
        staleMonths: 1,
        divergences: [],
      }],
      marketTruth: {
        shortlist: [{
          fundId: providerId,
          fundName: "Financiadora Ágil",
          verdict: "fits",
          eligibleForShortlist: true,
          mandateFingerprint: hash("a"),
          sourceClasses: ["direct_confirmation"],
          rationale: "Mandato compatível em ticket.",
          confirmations: [],
          blockers: [],
        }],
      },
    } as unknown as CaseEngineState["matching"];
    const screen = buildGovernedMatchScreen({
      matching,
      packageReviewFingerprint: hash("b"),
      materialArtifactFingerprint: hash("c"),
      materialTruthFingerprint: hash("d"),
      providerContext: {[providerId]: {
        providerKind: "finance_company",
        providerSource: "directory",
        fundDirectoryId: providerId,
        providerOrganizationId: null,
        providerFundId: null,
      }},
    });

    expect(screen.status).toBe("ready_for_review");
    expect(screen.candidates[0]).toMatchObject({
      providerKind: "finance_company",
      providerSource: "directory",
      eligibleForShortlist: true,
      criteria: [{id: "ticket", outcome: "fits"}],
    });
    expect(JSON.stringify(screen)).not.toContain("score");
    expect(screen.noContactAuthorized).toBe(true);
  });

  it("does not promote a possible provider with stale mandate fields", () => {
    const providerId = "20000000-0000-4000-8000-000000000002";
    const matching = {
      screened: true,
      structuralExclusions: [],
      fits: [{fundId: providerId, fundName: "Fundo B", verdict: "possible", criteria: [], exclusions: [], unlockedBy: [], ourGaps: ["term"], staleMonths: 18, divergences: []}],
      marketTruth: {shortlist: [{fundId: providerId, fundName: "Fundo B", verdict: "possible", eligibleForShortlist: false, mandateFingerprint: hash("e"), sourceClasses: ["unconfirmed"], rationale: "Nenhum critério de aderência foi confirmado.", confirmations: ["Prazo"], blockers: ["mandate_stale:term"]}]},
    } as unknown as CaseEngineState["matching"];
    const screen = buildGovernedMatchScreen({
      matching,
      packageReviewFingerprint: hash("b"),
      materialArtifactFingerprint: hash("c"),
      materialTruthFingerprint: hash("d"),
      providerContext: {[providerId]: {
        providerKind: "credit_fund",
        providerSource: "registered",
        fundDirectoryId: null,
        providerOrganizationId: "00000000-0000-4000-8000-000000000001",
        providerFundId: providerId,
      }},
    });
    expect(screen.status).toBe("needs_mandate_refresh");
    expect(screen.summary.eligible).toBe(0);
    expect(screen.candidates[0]?.governanceBlockers).toContain("mandate_stale:term");
  });
});
