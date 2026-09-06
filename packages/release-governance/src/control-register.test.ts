import {describe, expect, it} from "vitest";
import {
  evaluateTrustControlCatalogue,
  masterTrustControlCatalogue,
  trustControlIdsByDomain,
  type TrustControlCatalogue,
} from "./index";

describe("master trust control catalogue", () => {
  it("covers every trust domain and the four mandatory mapping frameworks", () => {
    const decision = evaluateTrustControlCatalogue(masterTrustControlCatalogue);

    expect(decision.complete).toBe(true);
    expect(decision.blockers).toEqual([]);
    expect(decision.controlCount).toBe(24);
    expect(decision.activityCount).toBe(124);
    expect(decision.representedDomains).toHaveLength(11);
    expect(decision.representedFrameworks).toEqual(expect.arrayContaining([
      "soc2_tsc_2022",
      "iso27001_2022",
      "nist_csf_2_0",
      "lgpd",
    ]));
    expect(Object.values(trustControlIdsByDomain).every((ids) => ids.length > 0)).toBe(true);
  });

  it("keeps every initial framework mapping explicitly provisional", () => {
    const mappings = masterTrustControlCatalogue.controls.flatMap((control) => control.frameworkMappings);
    expect(mappings.every((mapping) => mapping.assurance === "internal_working_map"
      && mapping.validatedBy === null
      && mapping.validatedAt === null)).toBe(true);
  });

  it("fails closed when a domain or mandatory mapping is silently removed", () => {
    const weakened: TrustControlCatalogue = {
      ...masterTrustControlCatalogue,
      controls: masterTrustControlCatalogue.controls
        .filter((control) => control.domain !== "documents")
        .map((control) => control.controlId === "TRUST-AI-01"
          ? {...control, frameworkMappings: control.frameworkMappings.filter((mapping) => mapping.framework !== "nist_csf_2_0")}
          : control),
      activities: masterTrustControlCatalogue.activities,
    };
    const decision = evaluateTrustControlCatalogue(weakened);

    expect(decision.complete).toBe(false);
    expect(decision.blockers).toEqual(expect.arrayContaining([
      {code: "control_domain_missing:documents", controlId: null},
      {code: "nist_mapping_missing", controlId: "TRUST-AI-01"},
    ]));
  });

  it("rejects false external validation and exposes controls not yet bound to implementation", () => {
    const first = masterTrustControlCatalogue.controls[0]!;
    const falseValidation: TrustControlCatalogue = {
      ...masterTrustControlCatalogue,
      controls: [
        {
          ...first,
          frameworkMappings: first.frameworkMappings.map((mapping, index) => index === 0
            ? {...mapping, assurance: "externally_validated" as const, validatedBy: null, validatedAt: null}
            : mapping),
        },
        ...masterTrustControlCatalogue.controls.slice(1),
      ],
      activities: masterTrustControlCatalogue.activities,
    };
    const decision = evaluateTrustControlCatalogue(falseValidation);

    expect(decision.complete).toBe(false);
    expect(decision.blockers).toContainEqual({code: "external_mapping_validation_evidence_missing", controlId: "TRUST-GOV-01"});
    expect(evaluateTrustControlCatalogue(masterTrustControlCatalogue).warnings)
      .toContainEqual({code: "implementation_reference_not_yet_bound", controlId: "TRUST-ID-01"});
  });
});
