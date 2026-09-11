import {describe, expect, it} from "vitest";

import {
  adherenceSubjects,
  candidateEvidenceSource,
  classifyCandidate,
  type CandidateCriterion,
  type CandidateMandateRecord,
} from "./candidate-fit";

const confirmed: CandidateMandateRecord = {
  versionNumber: 3,
  effectiveStatus: "confirmed",
  confirmedAt: "2026-03-01T12:00:00+00:00",
  channel: "official_document",
};

function criterion(overrides: Partial<CandidateCriterion> & {id: string}): CandidateCriterion {
  return {
    hard: true,
    outcome: "fits",
    mandate: "debenture, nota_comercial",
    request: "debenture",
    origin: "declared",
    observedAt: "2026-03-01T12:00:00+00:00",
    ...overrides,
  };
}

/** Every hard criterion a case fit produces, all answered from a confirmed mandate. */
const complete: CandidateCriterion[] = [
  criterion({id: "active"}),
  criterion({id: "instrument"}),
  criterion({id: "ticket"}),
  criterion({id: "term"}),
  criterion({id: "sector"}),
  criterion({id: "geography"}),
  criterion({id: "currency"}),
  criterion({id: "collateral", hard: false}),
  criterion({id: "leverage", hard: false}),
  criterion({id: "dscr", hard: false}),
];

describe("candidate classification", () => {
  it("calls a confirmed, complete, compatible mandate eligible and names its version and date", () => {
    const fit = classifyCandidate({criteria: complete, record: confirmed, sourceClass: "registered"});
    expect(fit.classification).toBe("eligible");
    expect(fit.evidenceSource).toBe("confirmed_mandate");
    expect(fit.mandateVersion).toBe(3);
    expect(fit.confirmedAt).toBe("2026-03-01T12:00:00+00:00");
    expect(fit.mandateStatus).toBe("confirmed");
    expect(fit.incompatibilities).toEqual([]);
    expect(fit.adherence.map((item) => item.subject)).toEqual([...adherenceSubjects]);
    expect(fit.adherence.every((item) => item.outcome === "fits")).toBe(true);
  });

  it("excludes an incompatible instrument whatever the rest of the mandate says", () => {
    const fit = classifyCandidate({
      criteria: complete.map((item) => (item.id === "instrument" ? {...item, outcome: "excluded" as const} : item)),
      record: confirmed,
      sourceClass: "registered",
    });
    expect(fit.classification).toBe("excluded");
    expect(fit.incompatibilities).toEqual(["instrument"]);
    expect(fit.adherence.find((item) => item.subject === "instrument")?.outcome).toBe("excluded");
  });

  it("never lets a soft mismatch or an open company question exclude or downgrade", () => {
    const fit = classifyCandidate({
      criteria: complete.map((item) => (item.id === "collateral" ? {...item, outcome: "excluded" as const} : item)),
      record: confirmed,
      sourceClass: "registered",
    });
    expect(fit.classification).toBe("eligible");
    expect(fit.incompatibilities).toEqual([]);

    const withQuestion = classifyCandidate({
      criteria: complete.map((item) => (item.id === "leverage" ? {...item, outcome: "unknown" as const} : item)),
      record: confirmed,
      sourceClass: "registered",
    });
    expect(withQuestion.classification).toBe("eligible");
    expect(withQuestion.openQuestions).toEqual(["leverage"]);
  });

  it("holds a candidate at hypothesis while a hard criterion cannot be read from the mandate", () => {
    const fit = classifyCandidate({
      criteria: complete.map((item) => (item.id === "ticket" ? {...item, outcome: "not_assessed" as const} : item)),
      record: confirmed,
      sourceClass: "registered",
    });
    expect(fit.classification).toBe("hypothesis");
    expect(fit.unverified).toEqual(["ticket"]);
  });

  it("keeps a fund with no confirmed mandate as a research hypothesis, whatever its evidence", () => {
    const published = complete.map((item) => ({...item, origin: "published" as const}));
    expect(classifyCandidate({criteria: published, record: null, sourceClass: "registered"})).toMatchObject({
      classification: "hypothesis",
      evidenceSource: "public_record",
      mandateVersion: null,
      confirmedAt: null,
    });

    const behaviour = complete.map((item) => ({...item, origin: "observed" as const}));
    expect(classifyCandidate({criteria: behaviour, record: null, sourceClass: "registered"})).toMatchObject({
      classification: "hypothesis",
      evidenceSource: "historical_activity",
    });
  });

  it("treats an unconfirmed declaration as a record we hold, never as confirmed interest", () => {
    const fit = classifyCandidate({criteria: complete, record: null, sourceClass: "registered"});
    expect(fit.evidenceSource).toBe("public_record");
    expect(fit.classification).toBe("hypothesis");
    // The exact provenance survives on the item, so nothing is lost by the conservative label.
    expect(fit.adherence.find((item) => item.subject === "instrument")?.origin).toBe("declared");
  });

  it("refuses a draft, expired or withdrawn record as current interest", () => {
    for (const effectiveStatus of ["draft", "expired", "withdrawn"] as const) {
      const fit = classifyCandidate({
        criteria: complete.map((item) => ({...item, outcome: "not_assessed" as const, origin: null, observedAt: null})),
        record: {...confirmed, effectiveStatus},
        sourceClass: "registered",
      });
      expect(fit.evidenceSource).toBe("public_record");
      expect(fit.classification).toBe("hypothesis");
      expect(fit.mandateStatus).toBe(effectiveStatus);
    }
  });

  it("reads a directory identity as a public record even when observations came with it", () => {
    expect(candidateEvidenceSource(complete, confirmed, "directory")).toBe("public_record");
    expect(candidateEvidenceSource([], null, "registered")).toBe("public_record");
  });

  it("answers the credit profile with the worse of leverage and DSCR, in one line", () => {
    const fit = classifyCandidate({
      criteria: complete.map((item) =>
        item.id === "dscr" ? {...item, outcome: "excluded" as const, mandate: "1.30", request: "1.05"} : item,
      ),
      record: confirmed,
      sourceClass: "registered",
    });
    const creditProfile = fit.adherence.find((item) => item.subject === "credit_profile");
    expect(creditProfile).toMatchObject({outcome: "excluded", mandate: "1.30", request: "1.05"});
    // DSCR is not a hard criterion, so the candidate is not excluded by it.
    expect(fit.classification).toBe("eligible");
  });

  it("reports a subject with no criterion at all as ours to resolve", () => {
    const fit = classifyCandidate({
      criteria: complete.filter((item) => item.id !== "leverage" && item.id !== "dscr"),
      record: confirmed,
      sourceClass: "registered",
    });
    expect(fit.adherence.find((item) => item.subject === "credit_profile")).toEqual({
      subject: "credit_profile", outcome: "not_assessed", mandate: null, request: null, origin: null, observedAt: null,
    });
  });

  it("is deterministic and independent of criterion order", () => {
    const forward = classifyCandidate({criteria: complete, record: confirmed, sourceClass: "registered"});
    const reversed = classifyCandidate({criteria: [...complete].reverse(), record: confirmed, sourceClass: "registered"});
    expect(reversed).toEqual(forward);
  });
});
