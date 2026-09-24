import {describe, expect, it} from "vitest";
import {auditVoice, MD_TEST_RUBRIC, MD_TEST_RUBRIC_VERSION} from "@offroad/credit-playbook";
import {
  capitalMdTestFailCodes, capitalMdTestHumanCodes, capitalMdTestResultSchema, capitalMdTestScopeCodes, capitalMdTestStatuses,
  capitalMdTestVersion, evaluateMdTest, type CapitalMdTestGates, type CapitalMdTestResult,
} from "./capital-md-test";
import {
  capitalPacketFixtures, framedPacket, negativeCashPacket, packetWithoutSensitivity, partialPacketWithoutProjection, preparedPacket,
  recommendedPacket, singleAlternativePacket,
} from "./capital-packet-variants.test-support";

const gates = (overrides: Partial<CapitalMdTestGates> = {}): CapitalMdTestGates => ({
  companyRegistration: "registered",
  research: "recorded",
  methodSelection: {situationIds: ["refinancing"]},
  conventions: [{key: "policy.capital.iof", effective: "gap"}],
  voice: {blockCount: 0, warnCount: 0},
  ...overrides,
});
const question = (result: CapitalMdTestResult, id: string) => result.questions.find((entry) => entry.id === id)!;
const statuses = (result: CapitalMdTestResult) => Object.fromEntries(result.questions.map((entry) => [entry.id, entry.status]));
const base = () => capitalPacketFixtures[2][1]();

const projectionPaths = (suffix: string) => [
  `packet.decision.alternatives[0].projection.${suffix}`,
  `packet.decision.alternatives[1].projection.${suffix}`,
  `packet.decision.sensitivities[0].projection.${suffix}`,
];
const provenancePaths = [
  "packet.fingerprint", "packet.inputFingerprint", "packet.decision.fingerprint",
  "packet.decision.provenance.inputFingerprint", "packet.decision.provenance.reviewFingerprint",
  ...projectionPaths("calculationFingerprint"),
  "packet.observationIds", "packet.decision.provenance.observationIds",
  "packet.decision.alternatives[0].projection.contributionIds", "packet.decision.alternatives[0].projection.hypothesisIds",
  "packet.decision.alternatives[1].projection.contributionIds", "packet.decision.alternatives[1].projection.hypothesisIds",
  "packet.decision.sensitivities[0].projection.contributionIds", "packet.decision.sensitivities[0].projection.hypothesisIds",
  "packet.requiresPinnedInputAndManifest", "packet.decision.provenance.requiresPinnedInputAndManifest",
];

describe("capital MD test", () => {
  it("evaluates every rubric question of the base packet with its status and the paths it read", () => {
    const packet = base();
    const result = evaluateMdTest({packet, gates: gates()});
    expect(result.questions.map((entry) => entry.id)).toEqual(MD_TEST_RUBRIC.map((entry) => entry.id));
    expect(result.questions).toEqual([
      {id: "q1", status: "pass", paths: ["packet.decision.question", "packet.decision.objectives", "gates.methodSelection.situationIds"]},
      {id: "q2", status: "pass", paths: ["gates.research", ...projectionPaths("basisFingerprint")]},
      {id: "q3", status: "fail", reasonCodes: ["information_gaps_empty"],
        paths: ["packet.decision.alternatives[0].disconfirmers", "packet.decision.alternatives[1].disconfirmers", "packet.decision.informationGaps"]},
      {id: "q4", status: "pass", paths: ["packet.status", "packet.decision.recommendation", "packet.decision.nextRequirements"]},
      {id: "q5", status: "not_applicable", scopeCode: "packet_status_partial", paths: ["packet.status"]},
      {id: "q6", status: "pass", paths: [
        "packet.status", "packet.decision.informationGaps", "packet.contractualGaps", "packet.decision.unresolved", "packet.decision.pendingReviewDomains",
        "packet.decision.alternatives[0].projection.rows", "packet.decision.alternatives[1].projection.rows",
        "packet.decision.sensitivities[0].baseAlternativeId", "packet.decision.sensitivities[0].projection.rows",
      ]},
      {id: "q7", status: "pass", paths: ["packet.decision.alternatives", "packet.decision.maintenanceExclusion"]},
      {id: "q8", status: "pass", paths: provenancePaths},
      {id: "q9", status: "pass", paths: provenancePaths},
      {id: "q10", status: "human_required", reasonCode: "rubric_human_required", paths: []},
    ]);
    expect(result.overall).toEqual({deterministicPass: 7, fail: 1, notApplicable: 1, humanRequired: 1});
    expect(result.packet).toEqual({schemaVersion: "capital-procedure-packet.v2", status: "partial", fingerprint: packet.fingerprint});
    expect(result.evaluator).toEqual({kind: "deterministic", exportName: "evaluateMdTest", version: capitalMdTestVersion});
    expect(result.rubricVersion).toBe(MD_TEST_RUBRIC_VERSION);
    expect(result.gates).toEqual(gates());
  });

  it.each(capitalPacketFixtures)("evaluates the %s packet with every path resolvable and q10 left to a human", (_name, build) => {
    const result = evaluateMdTest({packet: build(), gates: gates()});
    expect(statuses(result)).toEqual({q1: "pass", q2: "pass", q3: "fail", q4: "pass", q5: "not_applicable", q6: "pass", q7: "pass", q8: "pass", q9: "pass", q10: "human_required"});
    expect(question(result, "q2").paths).toEqual(expect.arrayContaining(build().contracts.length ? ["packet.contracts", "packet.contractSourceVersionIds"] : []));
    for (const entry of result.questions) for (const path of entry.paths) expect(path).toMatch(/^(packet|gates)\./);
  });

  it("passes q4 without a recommendation through the next requirements, and fails it when none is named", () => {
    const partial = evaluateMdTest({packet: base(), gates: gates()});
    expect(question(partial, "q4")).toEqual({id: "q4", status: "pass", paths: ["packet.status", "packet.decision.recommendation", "packet.decision.nextRequirements"]});
    const prepared = preparedPacket();
    expect(prepared.decision.recommendation).toBeNull();
    expect(prepared.decision.nextRequirements).toEqual([]);
    expect(question(evaluateMdTest({packet: prepared, gates: gates()}), "q4"))
      .toEqual({id: "q4", status: "fail", reasonCodes: ["next_requirements_missing"], paths: ["packet.status", "packet.decision.recommendation", "packet.decision.nextRequirements"]});
    expect(question(evaluateMdTest({packet: recommendedPacket("change"), gates: gates()}), "q4"))
      .toEqual({id: "q4", status: "pass", paths: ["packet.status", "packet.decision.recommendation", "packet.decision.recommendation.wouldChangeIf"]});
  });

  it("checks the projection only when the packet is prepared for human review", () => {
    const packet = preparedPacket();
    const rows = ["packet.decision.alternatives[0].projection.rows", "packet.decision.alternatives[0].projection.summary",
      "packet.decision.alternatives[1].projection.rows", "packet.decision.alternatives[1].projection.summary"];
    expect(question(evaluateMdTest({packet, gates: gates()}), "q5")).toEqual({id: "q5", status: "pass", paths: ["packet.status", ...rows]});
    packet.decision.alternatives[1]!.projection.rows = null;
    packet.decision.alternatives[1]!.projection.summary = null;
    expect(question(evaluateMdTest({packet, gates: gates()}), "q5")).toEqual({id: "q5", status: "fail", reasonCodes: ["projection_rows_missing"], paths: ["packet.status", ...rows]});
    expect(question(evaluateMdTest({packet: framedPacket(), gates: gates()}), "q5"))
      .toEqual({id: "q5", status: "not_applicable", scopeCode: "packet_status_framed", paths: ["packet.status"]});
  });

  it("frames a packet without alternatives without failing questions that have nothing to hold", () => {
    const result = evaluateMdTest({packet: framedPacket(), gates: gates()});
    expect(statuses(result)).toEqual({q1: "pass", q2: "pass", q3: "pass", q4: "pass", q5: "not_applicable", q6: "pass", q7: "not_applicable", q8: "pass", q9: "pass", q10: "human_required"});
    expect(question(result, "q7")).toEqual({id: "q7", status: "not_applicable", scopeCode: "no_alternatives", paths: ["packet.decision.alternatives", "packet.decision.maintenanceExclusion"]});
    expect(question(result, "q3").paths).toEqual(["packet.decision.informationGaps"]);
    expect(result.overall).toEqual({deterministicPass: 7, fail: 0, notApplicable: 2, humanRequired: 1});
  });

  it("requires two alternatives or a maintenance exclusion, otherwise scopes q7 out with a code", () => {
    expect(question(evaluateMdTest({packet: singleAlternativePacket(false), gates: gates()}), "q7"))
      .toEqual({id: "q7", status: "not_applicable", scopeCode: "single_alternative_without_maintenance_exclusion", paths: ["packet.decision.alternatives", "packet.decision.maintenanceExclusion"]});
    const excluded = singleAlternativePacket(true);
    expect(excluded.decision.maintenanceExclusion).not.toBeNull();
    expect(question(evaluateMdTest({packet: excluded, gates: gates()}), "q7").status).toBe("pass");
  });

  it("requires a calculated adverse sensitivity when the alternatives are calculated", () => {
    const failed = (packet: unknown) => question(evaluateMdTest({packet, gates: gates()}), "q6");
    expect(failed(packetWithoutSensitivity())).toEqual({id: "q6", status: "fail", reasonCodes: ["adverse_sensitivity_missing"], paths: [
      "packet.status", "packet.decision.informationGaps", "packet.contractualGaps", "packet.decision.unresolved", "packet.decision.pendingReviewDomains",
      "packet.decision.alternatives[0].projection.rows", "packet.decision.alternatives[1].projection.rows",
    ]});
    // The volume sensitivity closes above a base that went below zero: it is not an adverse case.
    const negative = negativeCashPacket();
    expect(negative.decision.alternatives[0]!.projection.summary!.closingAvailable).toBe("-237");
    expect(failed(negative).status).toBe("fail");
    const withoutProjection = evaluateMdTest({packet: partialPacketWithoutProjection(), gates: gates()});
    expect(question(withoutProjection, "q6").status).toBe("pass");
    expect(question(withoutProjection, "q3").status).toBe("pass");
  });

  it("names the gaps behind a partial status", () => {
    const packet = base();
    packet.decision.pendingReviewDomains = [];
    expect(question(evaluateMdTest({packet, gates: gates()}), "q6"))
      .toMatchObject({status: "fail", reasonCodes: ["partial_status_without_named_gap"]});
  });

  it("reads the research and method selection gates", () => {
    const q = (id: string, overrides: Partial<CapitalMdTestGates>) => question(evaluateMdTest({packet: base(), gates: gates(overrides)}), id);
    expect(q("q2", {research: "missing"})).toMatchObject({status: "fail", reasonCodes: ["research_missing"]});
    expect(q("q2", {research: "abstained"}).status).toBe("pass");
    expect(q("q1", {methodSelection: null}))
      .toEqual({id: "q1", status: "fail", reasonCodes: ["situation_not_selected"], paths: ["packet.decision.question", "packet.decision.objectives", "gates.methodSelection"]});
    expect(q("q1", {methodSelection: {situationIds: []}})).toMatchObject({status: "fail", reasonCodes: ["situation_not_selected"]});
    expect(q("q1", {methodSelection: {situationIds: ["refinancing", "not-a-situation"]}})).toMatchObject({status: "fail", reasonCodes: ["situation_unknown"]});
    const unread = evaluateMdTest({packet: base(), gates: gates({companyRegistration: "missing", conventions: [], voice: null})});
    expect(statuses(unread)).toEqual(statuses(evaluateMdTest({packet: base(), gates: gates()})));
    expect(unread.gates).toEqual(gates({companyRegistration: "missing", conventions: [], voice: null}));
  });

  it("fails q8 and q9 when the packet does not list the observations its numbers rest on", () => {
    const [, integrated] = capitalPacketFixtures[3];
    const incomplete = integrated();
    expect(incomplete.decision.provenance.observationIds.length).toBeGreaterThan(0);
    incomplete.observationIds = incomplete.observationIds.filter((id) => id !== incomplete.decision.provenance.observationIds[0]);
    const result = evaluateMdTest({packet: incomplete, gates: gates()});
    for (const id of ["q8", "q9"]) expect(question(result, id)).toMatchObject({status: "fail", reasonCodes: ["observation_ids_incomplete"]});
    const unlisted = base();
    unlisted.decision.alternatives[0]!.projection.hypothesisIds = [];
    for (const id of ["q8", "q9"]) {
      expect(question(evaluateMdTest({packet: unlisted, gates: gates()}), id)).toMatchObject({status: "fail", reasonCodes: ["observation_ids_missing"]});
    }
  });

  it("always leaves q10 to a human and never returns an overall verdict", () => {
    const packets = [...capitalPacketFixtures.map(([, build]) => build()), preparedPacket(), recommendedPacket("maintain"), framedPacket(), partialPacketWithoutProjection()];
    for (const packet of packets) for (const gateStates of [gates(), gates({research: "missing", methodSelection: null})]) {
      const result = evaluateMdTest({packet, gates: gateStates});
      expect(question(result, "q10")).toEqual({id: "q10", status: "human_required", reasonCode: "rubric_human_required", paths: []});
      expect(Object.keys(result.overall)).toEqual(["deterministicPass", "fail", "notApplicable", "humanRequired"]);
      expect(Object.values(result.overall).reduce((sum, value) => sum + value, 0)).toBe(MD_TEST_RUBRIC.length);
      expect(Object.keys(result).filter((name) => /verdict|approv|accept|signed/i.test(name))).toEqual([]);
      expect(capitalMdTestResultSchema.safeParse({...result, verdict: "pass"}).success).toBe(false);
    }
  });

  it("reproduces the same bytes for equal input and never mutates it", () => {
    for (const [, build] of capitalPacketFixtures) {
      const input = {packet: build(), gates: gates()};
      const before = structuredClone(input);
      const first = JSON.stringify(evaluateMdTest(input));
      expect(JSON.stringify(evaluateMdTest(JSON.parse(JSON.stringify(input))))).toBe(first);
      expect(JSON.stringify(evaluateMdTest({packet: build(), gates: gates()}))).toBe(first);
      expect(input).toEqual(before);
    }
  });

  it("refuses unknown gate states and anything but a procedure packet", () => {
    expect(() => evaluateMdTest({packet: base(), gates: {...gates(), research: "assumed"} as unknown as CapitalMdTestGates})).toThrow();
    expect(() => evaluateMdTest({packet: base(), gates: {...gates(), approved: true} as unknown as CapitalMdTestGates})).toThrow();
    expect(() => evaluateMdTest({packet: base().decision, gates: gates()})).toThrow();
  });

  it("emits codes and paths that carry no blocked voice pattern", () => {
    const codes = [
      ...capitalMdTestFailCodes, ...capitalMdTestScopeCodes, ...capitalMdTestHumanCodes, ...capitalMdTestStatuses,
      "capital-md-test.v1", "deterministic", "evaluateMdTest", capitalMdTestVersion,
    ];
    expect(auditVoice(codes, {channel: "packet"})).toEqual([]);
    const packets = [...capitalPacketFixtures.map(([, build]) => build()), preparedPacket(), recommendedPacket("change"), framedPacket(),
      partialPacketWithoutProjection(), singleAlternativePacket(false), packetWithoutSensitivity()];
    const paths = packets.flatMap((packet) => evaluateMdTest({packet, gates: gates({methodSelection: null})}).questions.flatMap((entry) => entry.paths));
    expect(paths.length).toBeGreaterThan(0);
    expect(auditVoice(paths, {channel: "packet"}).filter((finding) => finding.severity === "block")).toEqual([]);
  });
});
