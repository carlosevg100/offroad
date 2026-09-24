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
const evaluate = (packet: unknown, overrides: Partial<CapitalMdTestGates> = {}) => evaluateMdTest({packet, gates: gates(overrides)});
const base = () => capitalPacketFixtures[2][1]();

const projectionPaths = (suffix: string) => [
  `packet.decision.alternatives[0].projection.${suffix}`,
  `packet.decision.alternatives[1].projection.${suffix}`,
  `packet.decision.sensitivities[0].projection.${suffix}`,
];
const gapListPaths = ["packet.status", "packet.decision.informationGaps", "packet.contractualGaps", "packet.decision.unresolved", "packet.decision.pendingReviewDomains"];
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
const settled = {q1: "pass", q2: "pass", q3: "pass", q4: "pass", q5: "not_applicable", q6: "pass", q7: "pass", q8: "human_required", q9: "pass", q10: "human_required"};

describe("capital MD test", () => {
  it("evaluates every rubric question of the base packet with its status and the paths it read", () => {
    const packet = base();
    const result = evaluate(packet);
    expect(result.questions.map((entry) => entry.id)).toEqual(MD_TEST_RUBRIC.map((entry) => entry.id));
    expect(result.questions).toEqual([
      {id: "q1", status: "pass", paths: ["packet.decision.question", "packet.decision.objectives", "gates.methodSelection.situationIds"]},
      {id: "q2", status: "pass", paths: ["gates.companyRegistration", "gates.research", ...projectionPaths("basisFingerprint")]},
      {id: "q3", status: "pass", paths: ["packet.decision.alternatives[0].disconfirmers", "packet.decision.alternatives[1].disconfirmers"]},
      {id: "q4", status: "pass", paths: ["packet.status", "packet.decision.recommendation", "packet.decision.nextRequirements"]},
      {id: "q5", status: "not_applicable", scopeCode: "packet_status_partial", paths: ["packet.status"]},
      {id: "q6", status: "pass", paths: [
        ...gapListPaths, "gates.conventions", "gates.conventions[0]",
        "packet.decision.alternatives[0].projection.rows", "packet.decision.alternatives[1].projection.rows",
        "packet.decision.sensitivities[0].baseAlternativeId", "packet.decision.sensitivities[0].projection.rows",
      ]},
      {id: "q7", status: "pass", paths: ["packet.decision.alternatives", "packet.decision.maintenanceExclusion"]},
      {id: "q8", status: "human_required", reasonCode: "comprehension_requires_senior_judgment",
        paths: ["gates.voice.blockCount", "packet.status", "packet.decision.recommendation"]},
      {id: "q9", status: "pass", paths: provenancePaths},
      {id: "q10", status: "human_required", reasonCode: "rubric_human_required", paths: []},
    ]);
    expect(result.overall).toEqual({deterministicPass: 7, fail: 0, notApplicable: 1, humanRequired: 2});
    expect(result.packet).toEqual({schemaVersion: "capital-procedure-packet.v2", status: "partial", fingerprint: packet.fingerprint});
    expect(result.evaluator).toEqual({kind: "deterministic", exportName: "evaluateMdTest", version: capitalMdTestVersion});
    expect(result.rubricVersion).toBe(MD_TEST_RUBRIC_VERSION);
    expect(result.gates).toEqual(gates());
  });

  it.each(capitalPacketFixtures)("evaluates the %s packet with every path rooted in the packet or the gates", (_name, build) => {
    const result = evaluate(build());
    expect(statuses(result)).toEqual(settled);
    expect(question(result, "q2").paths).toEqual(expect.arrayContaining(build().contracts.length ? ["packet.contracts", "packet.contractSourceVersionIds"] : []));
    for (const entry of result.questions) for (const path of entry.paths) expect(path).toMatch(/^(packet|gates)\./);
  });

  it("passes q3 on disconfirmers alone, whatever the gap list holds, and scopes it out without alternatives", () => {
    const packet = base();
    expect(packet.decision.informationGaps).toEqual([]);
    expect(question(evaluate(packet), "q3").status).toBe("pass");
    expect(question(evaluate(partialPacketWithoutProjection()), "q3").status).toBe("pass");
    for (const disconfirmers of [[], [" "]]) {
      const edited = base();
      edited.decision.alternatives[1]!.disconfirmers = disconfirmers;
      expect(question(evaluate(edited), "q3")).toEqual({id: "q3", status: "fail", reasonCodes: ["disconfirmers_missing"],
        paths: ["packet.decision.alternatives[0].disconfirmers", "packet.decision.alternatives[1].disconfirmers"]});
    }
    expect(question(evaluate(framedPacket()), "q3")).toEqual({id: "q3", status: "not_applicable", scopeCode: "no_alternatives", paths: ["packet.decision.alternatives"]});
  });

  it("requires a registered company next to research recorded or abstained in q2", () => {
    expect(question(evaluate(base(), {companyRegistration: "missing"}), "q2")).toMatchObject({status: "fail", reasonCodes: ["company_registration_missing"]});
    expect(question(evaluate(base(), {companyRegistration: "missing", research: "missing"}), "q2"))
      .toMatchObject({status: "fail", reasonCodes: ["company_registration_missing", "research_missing"]});
    expect(question(evaluate(base(), {research: "missing"}), "q2")).toMatchObject({status: "fail", reasonCodes: ["research_missing"]});
    expect(question(evaluate(base(), {research: "abstained"}), "q2").status).toBe("pass");
  });

  it("cites every convention the gate reports as a gap among the material gaps of q6", () => {
    const conventions = [
      {key: "policy.capital.iof", effective: "gap"},
      {key: "policy.capital.anbima-b3-conventions", effective: "approved"},
      {key: "policy.capital.tax-regime", effective: "gap"},
    ] as const;
    const cited = question(evaluate(base(), {conventions: [...conventions]}), "q6");
    expect(cited.status).toBe("pass");
    expect(cited.paths).toEqual(expect.arrayContaining(["gates.conventions", "gates.conventions[0]", "gates.conventions[2]"]));
    expect(cited.paths).not.toContain("gates.conventions[1]");
    expect(question(evaluate(base(), {conventions: []}), "q6").paths.filter((path) => path.startsWith("gates."))).toEqual(["gates.conventions"]);
  });

  it("leaves q8 to senior judgment unless the voice blocks or a needed summary is missing", () => {
    expect(question(evaluate(base(), {voice: null}), "q8"))
      .toEqual({id: "q8", status: "human_required", reasonCode: "comprehension_requires_senior_judgment", paths: ["gates.voice", "packet.status", "packet.decision.recommendation"]});
    expect(question(evaluate(base(), {voice: {blockCount: 2, warnCount: 0}}), "q8"))
      .toEqual({id: "q8", status: "fail", reasonCodes: ["voice_blocked"], paths: ["gates.voice.blockCount", "packet.status", "packet.decision.recommendation"]});
    expect(question(evaluate(base(), {voice: {blockCount: 0, warnCount: 5}}), "q8").status).toBe("human_required");
    // A partial packet without a recommendation states its essential through status and gaps.
    expect(question(evaluate(partialPacketWithoutProjection()), "q8").status).toBe("human_required");
    const prepared = preparedPacket();
    const summaries = ["packet.decision.alternatives[0].projection.summary", "packet.decision.alternatives[1].projection.summary"];
    expect(question(evaluate(prepared), "q8")).toMatchObject({status: "human_required", paths: ["gates.voice.blockCount", "packet.status", "packet.decision.recommendation", ...summaries]});
    prepared.decision.alternatives[1]!.projection.summary = null;
    expect(question(evaluate(prepared), "q8")).toMatchObject({status: "fail", reasonCodes: ["summary_missing"]});
    const recommended = recommendedPacket("change");
    expect(question(evaluate(recommended), "q8"))
      .toMatchObject({status: "human_required", paths: ["gates.voice.blockCount", "packet.status", "packet.decision.recommendation", summaries[1]]});
    recommended.decision.alternatives[1]!.projection.summary = null;
    expect(question(evaluate(recommended), "q8")).toMatchObject({status: "fail", reasonCodes: ["summary_missing"]});
  });

  it("passes q4 without a recommendation through the next requirements, and fails it when none is named", () => {
    expect(question(evaluate(base()), "q4")).toEqual({id: "q4", status: "pass", paths: ["packet.status", "packet.decision.recommendation", "packet.decision.nextRequirements"]});
    const prepared = preparedPacket();
    expect(prepared.decision.recommendation).toBeNull();
    expect(prepared.decision.nextRequirements).toEqual([]);
    expect(question(evaluate(prepared), "q4"))
      .toEqual({id: "q4", status: "fail", reasonCodes: ["next_requirements_missing"], paths: ["packet.status", "packet.decision.recommendation", "packet.decision.nextRequirements"]});
    expect(question(evaluate(recommendedPacket("change")), "q4"))
      .toEqual({id: "q4", status: "pass", paths: ["packet.status", "packet.decision.recommendation", "packet.decision.recommendation.wouldChangeIf"]});
  });

  it("checks the projection only when the packet is prepared for human review", () => {
    const packet = preparedPacket();
    const rows = ["packet.decision.alternatives[0].projection.rows", "packet.decision.alternatives[0].projection.summary",
      "packet.decision.alternatives[1].projection.rows", "packet.decision.alternatives[1].projection.summary"];
    expect(question(evaluate(packet), "q5")).toEqual({id: "q5", status: "pass", paths: ["packet.status", ...rows]});
    packet.decision.alternatives[1]!.projection.rows = null;
    packet.decision.alternatives[1]!.projection.summary = null;
    expect(question(evaluate(packet), "q5")).toEqual({id: "q5", status: "fail", reasonCodes: ["projection_rows_missing"], paths: ["packet.status", ...rows]});
    expect(question(evaluate(framedPacket()), "q5")).toEqual({id: "q5", status: "not_applicable", scopeCode: "packet_status_framed", paths: ["packet.status"]});
  });

  it("frames a packet without alternatives without failing questions that have nothing to hold", () => {
    const result = evaluate(framedPacket());
    expect(statuses(result)).toEqual({...settled, q3: "not_applicable", q7: "not_applicable"});
    expect(question(result, "q7")).toEqual({id: "q7", status: "not_applicable", scopeCode: "no_alternatives", paths: ["packet.decision.alternatives", "packet.decision.maintenanceExclusion"]});
    expect(result.overall).toEqual({deterministicPass: 5, fail: 0, notApplicable: 3, humanRequired: 2});
  });

  it("requires two alternatives or a maintenance exclusion, otherwise scopes q7 out with a code", () => {
    expect(question(evaluate(singleAlternativePacket(false)), "q7"))
      .toEqual({id: "q7", status: "not_applicable", scopeCode: "single_alternative_without_maintenance_exclusion", paths: ["packet.decision.alternatives", "packet.decision.maintenanceExclusion"]});
    const excluded = singleAlternativePacket(true);
    expect(excluded.decision.maintenanceExclusion).not.toBeNull();
    expect(question(evaluate(excluded), "q7").status).toBe("pass");
  });

  it("requires a calculated adverse sensitivity when the alternatives are calculated", () => {
    expect(question(evaluate(packetWithoutSensitivity()), "q6")).toEqual({id: "q6", status: "fail", reasonCodes: ["adverse_sensitivity_missing"], paths: [
      ...gapListPaths, "gates.conventions", "gates.conventions[0]",
      "packet.decision.alternatives[0].projection.rows", "packet.decision.alternatives[1].projection.rows",
    ]});
    // The volume sensitivity closes above a base that went below zero: it is not an adverse case.
    const negative = negativeCashPacket();
    expect(negative.decision.alternatives[0]!.projection.summary!.closingAvailable).toBe("-237");
    expect(question(evaluate(negative), "q6")).toMatchObject({status: "fail", reasonCodes: ["adverse_sensitivity_missing"]});
    expect(question(evaluate(partialPacketWithoutProjection()), "q6").status).toBe("pass");
  });

  it("names the gaps behind a partial status", () => {
    const packet = base();
    packet.decision.pendingReviewDomains = [];
    expect(question(evaluate(packet), "q6")).toMatchObject({status: "fail", reasonCodes: ["partial_status_without_named_gap"]});
  });

  it("reads the method selection gate against the R3 catalogue", () => {
    expect(question(evaluate(base(), {methodSelection: null}), "q1"))
      .toEqual({id: "q1", status: "fail", reasonCodes: ["situation_not_selected"], paths: ["packet.decision.question", "packet.decision.objectives", "gates.methodSelection"]});
    expect(question(evaluate(base(), {methodSelection: {situationIds: []}}), "q1")).toMatchObject({status: "fail", reasonCodes: ["situation_not_selected"]});
    expect(question(evaluate(base(), {methodSelection: {situationIds: ["refinancing", "not-a-situation"]}}), "q1")).toMatchObject({status: "fail", reasonCodes: ["situation_unknown"]});
  });

  it("fails q9 alone when the packet does not list the observations its numbers rest on", () => {
    const [, integrated] = capitalPacketFixtures[3];
    const incomplete = integrated();
    expect(incomplete.decision.provenance.observationIds.length).toBeGreaterThan(0);
    incomplete.observationIds = incomplete.observationIds.filter((id) => id !== incomplete.decision.provenance.observationIds[0]);
    const result = evaluate(incomplete);
    expect(question(result, "q9")).toMatchObject({status: "fail", reasonCodes: ["observation_ids_incomplete"]});
    expect(question(result, "q8").status).toBe("human_required");
    const unlisted = base();
    unlisted.decision.alternatives[0]!.projection.hypothesisIds = [];
    expect(question(evaluate(unlisted), "q9")).toMatchObject({status: "fail", reasonCodes: ["observation_ids_missing"]});
    expect(question(evaluate(unlisted), "q8").status).toBe("human_required");
  });

  it("always leaves q10 to a human and never returns an overall verdict", () => {
    const packets = [...capitalPacketFixtures.map(([, build]) => build()), preparedPacket(), recommendedPacket("maintain"), framedPacket(), partialPacketWithoutProjection()];
    const variants: Partial<CapitalMdTestGates>[] = [{}, {companyRegistration: "missing", research: "missing", methodSelection: null, voice: {blockCount: 1, warnCount: 1}}];
    for (const packet of packets) for (const overrides of variants) {
      const result = evaluate(packet, overrides);
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
    const paths = packets.flatMap((packet) => [evaluate(packet, {methodSelection: null, voice: null}), evaluate(packet)])
      .flatMap((result) => result.questions.flatMap((entry) => entry.paths));
    expect(paths.length).toBeGreaterThan(0);
    expect(auditVoice(paths, {channel: "packet"}).filter((finding) => finding.severity === "block")).toEqual([]);
  });
});
