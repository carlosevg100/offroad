import {createHash} from "node:crypto";
import {describe, expect, it} from "vitest";
import {executionCanonicalText, type ExecutionGates} from "@offroad/agent-contracts";
import {evaluateConventionsGate, MD_TEST_RUBRIC, selectMethod} from "@offroad/credit-playbook";
import {
  capitalMdTestGatesSchema, composeBoundCapitalPacketV2, deriveBoundCapitalScope, deriveCapitalChartSeries, evaluateMdTest, prepareCapitalProcedurePacketV2, prepareInvestmentDecisionPacket,
} from "@offroad/financial-model";
import {readContextualBasis} from "@offroad/reconciliation";
import {adoptedCapitalPeriodFixture, capitalStructureDecisionFixture} from "@offroad/testing-fixtures/capital-structure-decision";
import {formatDecimal} from "./format";
import {buildExecutionGates} from "@offroad/execution-request";
import {capitalProcedurePacketBlocks, investmentDecisionPacketBlocks, readCapitalProcedurePacketBlocks, readInvestmentDecisionPacketBlocks, type CapitalProcedurePacketLike, type InvestmentDecisionPacketLike} from "@offroad/domain-contracts";
import {covenantHeadroomPacketBlocks, readCovenantHeadroomPacketBlocks, type CovenantHeadroomPacketLike} from "@offroad/domain-contracts";
import {prepareCovenantHeadroomPacket, prepareDebtTablePacket, prepareWeeklyCashPacket} from "@offroad/financial-model";
import {auroraCovenantBasis} from "../../../../../packages/financial-model/src/covenant-headroom.test-support";
import {auroraDebtTableBasis} from "../../../../../packages/financial-model/src/debt-table.test-support";
import {auroraWeeklyCashBasis} from "../../../../../packages/financial-model/src/weekly-cash.test-support";
import {operatingProjectionPacketBlocks, readOperatingProjectionPacketBlocks, type OperatingProjectionPacketLike} from "@offroad/domain-contracts";
import {prepareOperatingProjectionPacket, prepareProjectionChallengePacket, prepareQuarterUpdatePacket, prepareReceivablesFundingPacket} from "@offroad/financial-model";
import {auroraProjectionBasis} from "../../../../../packages/financial-model/src/operating-projection.test-support";
import {auroraProjectionBasis as auroraChallengeBasis} from "../../../../../packages/financial-model/src/projection-challenge.test-support";
import {auroraReceivablesFundingBasis} from "../../../../../packages/financial-model/src/receivables-funding.test-support";
import {auroraQuarterUpdateBasis} from "../../../../../packages/financial-model/src/quarter-update.test-support";
import {c32PacketInput} from "../../../../../packages/financial-model/src/investment-decision-packet.test-support";
import lote4DocumentFolderPacket from "../../../../../packages/domain-contracts/src/fixtures/document-folder-result-packet.json";
import lote4ReceivedProposalPacket from "../../../../../packages/domain-contracts/src/fixtures/received-proposal-result-packet.json";
import lote4FinancingPathsPacket from "../../../../../packages/domain-contracts/src/fixtures/financing-paths-result-packet.json";
import lote4BoardMaterialPacket from "../../../../../packages/domain-contracts/src/fixtures/board-material-result-packet.json";
import {mdTestGatesOf, projectWorkExecution, projectWorkExecutionList, readCommittedResult, workExecutionState} from "./read";
import type {ExecutionRevisionState} from "./revision";

const id = (n: number) => `a4180000-0000-4000-9000-${String(n).padStart(12, "0")}`;
const hex = (c: string) => c.repeat(64);
function packetText(fixture: {snapshot: {workId: string; purpose: string; versionId: string}} = capitalStructureDecisionFixture(), asOf = "2027-12-31") {
  const canonical = JSON.stringify(fixture.snapshot);
  const envelope = {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")};
  const scope = {workId: fixture.snapshot.workId, purpose: fixture.snapshot.purpose, versionId: fixture.snapshot.versionId};
  const packet = composeBoundCapitalPacketV2({envelope, scope, question: "Does the current structure hold?", objectives: ["Measure liquidity"], asOf, ...deriveBoundCapitalScope(readContextualBasis(envelope, scope), asOf)});
  return executionCanonicalText(prepareCapitalProcedurePacketV2(packet));
}
const calculatedText = () => packetText(adoptedCapitalPeriodFixture(), "2026-12-31");
const method = {methodId: "prepare-capital-structure-decision", methodVersion: "2026.09.21-v4"};
function gates(overrides: {research?: "recorded" | "abstained" | "missing"; situationIds?: string[]} = {}): ExecutionGates {
  return buildExecutionGates({company: {registration: "registered", research: overrides.research ?? "recorded"}, method,
    selection: selectMethod({situationIds: overrides.situationIds ?? ["refinancing", "near-covenant"], ...method}),
    conventions: evaluateConventionsGate(["policy.capital.iof", "policy.capital.anbima-b3-conventions", "policy.capital.tax-regime"], "2026-10-01"), findings: []});
}
/** The receipt as the v2 reader returns it: the stored text as jsonb, the server's SHA-256 of the text. */
function receipt(value: ExecutionGates = gates()) {
  const text = executionCanonicalText(value);
  return {gatesVersion: value.gatesVersion, blocked: value.blocked, fingerprint: createHash("sha256").update(text, "utf8").digest("hex"), canonical: JSON.parse(text), createdAt: "2026-09-24T12:00:01+00:00"};
}
const committedResult = (canonicalResult: string) => ({outcome: "succeeded", reason: "calculated", resultFingerprint: hex("d"), canonicalResult, committedAt: "2026-09-24T12:05:00+00:00"});
const base = {schemaVersion: "work-execution-read.v2", executionId: id(1), workId: id(2), requestId: id(3), processingRunId: id(4), createdAt: "2026-09-24T12:00:00+00:00",
  job: {status: "queued", attempts: 0, lastErrorCode: null, availableAt: "2026-09-24T12:00:00+00:00", updatedAt: "2026-09-24T12:00:00+00:00"},
  run: {status: "queued", completedAt: null, usage: {}},
  manifest: {contractFingerprint: hex("a"), inputFingerprint: hex("b"), purpose: "prepare-capital-structure-decision", method: {methodId: "prepare-capital-structure-decision", methodVersion: "2026.09.21-v4", manifestHash: hex("c")}, budget: {maxModelCalls: 0}, requestedAt: "2026-09-24T12:00:00+00:00"},
  operation: null, result: null, inputsCurrent: true, gates: null};

describe("work execution read projection", () => {
  it("shows a queued execution without a result", () => {
    const view = projectWorkExecution(base);
    expect(view).toMatchObject({state: "queued", outcome: null, reason: null, inputsCurrent: true, result: null, gates: null, manifest: {methodId: "prepare-capital-structure-decision", methodVersion: "2026.09.21-v4"}});
    expect(projectWorkExecution({...base, job: {...base.job, status: "leased"}}).state).toBe("leased");
    expect(projectWorkExecution({...base, job: {...base.job, status: "failed", lastErrorCode: "execution_calculation_failed"}}).state).toBe("failed");
    expect(projectWorkExecution({...base, job: null}).state).toBe("unknown");
  });
  it("reads the published packet out of committed bytes and lists gaps and requirements", () => {
    const text = packetText();
    const view = projectWorkExecution({...base, job: {...base.job, status: "succeeded"}, result: committedResult(text)});
    expect(view.state).toBe("succeeded"); expect(view.reason).toBe("calculated");
    if (!view.result || view.result.withheld) throw new Error("result expected");
    expect(view.result.packet?.status).toBe("partial"); expect(view.result.marker).toBeNull();
    expect(view.result.packet?.alternatives).toEqual([{id: "current", label: "Current structure as recorded in the working basis", kind: "maintain", calculated: false}]);
    expect(view.result.packet?.informationGaps.filter(g => g.code === "projection_input_missing")).toHaveLength(26);
    expect(view.result.packet?.nextRequirements).toEqual(["source", "assumption", "contract", "market", "implementation", "recommendation"]);
    expect(view.result.packet?.contributions).toBe(0);
  });
  it("keeps the worker's partial marker distinct from a packet and never narrates unknown bytes", () => {
    expect(readCommittedResult(executionCanonicalText({status: "partial", reason: "invalid_input"}))).toEqual({packet: null, marker: {status: "partial", reason: "invalid_input"}});
    expect(readCommittedResult("{\"approved\":true}")).toEqual({packet: null, marker: null});
    expect(readCommittedResult("not json")).toEqual({packet: null, marker: null});
    const view = projectWorkExecution({...base, gates: receipt(), result: {...committedResult(executionCanonicalText({status: "partial", reason: "budget_exhausted"})), outcome: "partial", reason: "budget_exhausted"}});
    expect(view.state).toBe("partial"); expect(view.result).toMatchObject({withheld: false, packet: null, marker: {reason: "budget_exhausted"}, mdTest: null, decisiveNumbers: null});
  });
  it("reads authorized historical bytes while preserving the not-current input status", () => {
    const view = projectWorkExecution({...base, inputsCurrent: false, result: committedResult(packetText())});
    expect(view).toMatchObject({state: "succeeded", inputsCurrent: false, result: {withheld: false, source: "packet"}});
  });
  it("withholds bytes the database withheld and says why", () => {
    const view = projectWorkExecution({...base, inputsCurrent: false, gates: receipt(), result: {withheld: "inputs_not_current", outcome: "succeeded", reason: "calculated", resultFingerprint: hex("d"), committedAt: "2026-09-24T12:05:00+00:00"}});
    expect(view.state).toBe("withheld"); expect(view.inputsCurrent).toBe(false);
    expect(view.result).toEqual({withheld: true, reason: "inputs_not_current", resultFingerprint: hex("d"), committedAt: "2026-09-24T12:05:00+00:00"});
    expect(JSON.stringify(view)).not.toContain("canonicalResult");
  });
  it("fails closed on a shape it does not recognize", () => {
    expect(() => projectWorkExecution({...base, schemaVersion: "other"})).toThrow();
    expect(() => projectWorkExecution({...base, schemaVersion: "work-execution-read.v1"})).toThrow();
    expect(() => projectWorkExecution({...base, result: {outcome: "approved", reason: "x", resultFingerprint: hex("d"), canonicalResult: "{}", committedAt: "now"}})).toThrow();
    expect(() => projectWorkExecution({...base, gates: {...receipt(), fingerprint: "not-a-hash"}})).toThrow();
    const withoutGates: Record<string, unknown> = {...base}; delete withoutGates.gates;
    expect(() => projectWorkExecution(withoutGates)).toThrow();
    expect(() => projectWorkExecution({...base, job: {...base.job, leaseId: id(9)}})).not.toThrow();
  });
  it("projects the list with a cursor only when more rows exist", () => {
    const row = (n: number, jobStatus: string | null, outcome: string | null) => ({executionId: id(n), requestId: id(n), processingRunId: id(n), createdAt: `2026-09-24T12:00:${String(n % 60).padStart(2, "0")}+00:00`, jobStatus, runStatus: null, outcome, reason: outcome ? "calculated" : null, purpose: "prepare-capital-structure-decision"});
    const short = projectWorkExecutionList([row(1, "queued", null), row(2, "succeeded", "succeeded")]);
    expect(short.nextCursor).toBeNull(); expect(short.items.map(i => i.state)).toEqual(["queued", "succeeded"]);
    const long = projectWorkExecutionList(Array.from({length: 26}, (_, n) => row(n + 1, "queued", null)));
    expect(long.items).toHaveLength(25); expect(long.nextCursor).toBe(id(25));
    expect(workExecutionState({outcome: null, jobStatus: "mystery"})).toBe("unknown");
  });
});

describe("gate receipt, MD test and decisive numbers in the detail", () => {
  it("shows every gate of a receipt whose bytes match the stored fingerprint", () => {
    const value = gates({research: "missing"});
    const view = projectWorkExecution({...base, gates: receipt(value)});
    expect(view.gates).toEqual({verified: true, fingerprint: receipt(value).fingerprint, createdAt: "2026-09-24T12:00:01+00:00", gatesVersion: value.gatesVersion, blocked: false,
      companyRegistration: "registered", research: "missing", methodSelection: value.methodSelection, conventions: value.conventions, voice: value.voice});
    if (!view.gates?.verified) throw new Error("verified gates expected");
    expect(view.gates.methodSelection.situationIds).toEqual(["refinancing", "near-covenant"]);
    expect(view.gates.conventions.filter(entry => entry.effective === "gap").map(entry => entry.key)).toEqual(["policy.capital.iof", "policy.capital.anbima-b3-conventions", "policy.capital.tax-regime"]);
  });
  it("keeps only the fingerprint of a receipt whose bytes do not match it", () => {
    const good = receipt();
    for (const tampered of [
      {...good, fingerprint: hex("0")},
      {...good, canonical: {...good.canonical, research: "missing"}},
      {...good, canonical: {...good.canonical, note: "free text"}},
      {...good, gatesVersion: "2026.09.25-v1"},
      {...good, blocked: true},
      {...good, canonical: "{}"},
    ]) {
      const view = projectWorkExecution({...base, gates: tampered, result: committedResult(packetText())});
      expect(view.gates).toEqual({verified: false, fingerprint: tampered.fingerprint, createdAt: good.createdAt});
      expect(view.result && !view.result.withheld && view.result.mdTest).toEqual({evaluated: false, reason: "gates_unverified"});
    }
  });
  it("says that no gates were recorded for an execution requested through v1, and does not run the MD test without them", () => {
    const view = projectWorkExecution({...base, gates: null, result: committedResult(packetText())});
    expect(view.gates).toBeNull();
    if (!view.result || view.result.withheld) throw new Error("result expected");
    expect(view.result.packet).not.toBeNull();
    expect(view.result.mdTest).toEqual({evaluated: false, reason: "gates_not_recorded"});
    expect(view.result.decisiveNumbers).toEqual([]);
  });
  it("evaluates the ten MD test questions over the packet and the receipt, each with its status and code, with no verdict", () => {
    const text = packetText();
    const view = projectWorkExecution({...base, gates: receipt(), result: committedResult(text)});
    if (!view.result || view.result.withheld || !view.result.mdTest?.evaluated) throw new Error("evaluated MD test expected");
    const expected = evaluateMdTest({packet: JSON.parse(text), gates: mdTestGatesOf(gates())});
    expect(view.result.mdTest.questions.map(question => question.id)).toEqual(MD_TEST_RUBRIC.map(question => question.id));
    expect(view.result.mdTest.questions.map(question => question.status)).toEqual(expected.questions.map(question => question.status));
    const byId = Object.fromEntries(view.result.mdTest.questions.map(question => [question.id, question]));
    expect(byId.q1).toEqual({id: "q1", status: "pass"});
    expect(byId.q5).toEqual({id: "q5", status: "not_applicable", scopeCode: "packet_status_partial"});
    expect(byId.q7).toEqual({id: "q7", status: "not_applicable", scopeCode: "single_alternative_without_maintenance_exclusion"});
    expect(byId.q8).toEqual({id: "q8", status: "human_required", reasonCode: "comprehension_requires_senior_judgment"});
    expect(byId.q10).toEqual({id: "q10", status: "human_required", reasonCode: "rubric_human_required"});
    expect(Object.keys(view.result.mdTest).sort()).toEqual(["evaluated", "questions"]);
    expect(JSON.stringify(view)).not.toMatch(/overall|verdict|deterministicPass|humanRequired|notApplicable/);
    for (const question of view.result.mdTest.questions) expect(question).not.toHaveProperty("paths");
  });
  it("fails a question on the gate states the receipt carries", () => {
    const view = projectWorkExecution({...base, gates: receipt(gates({research: "missing"})), result: committedResult(packetText())});
    if (!view.result || view.result.withheld || !view.result.mdTest?.evaluated) throw new Error("evaluated MD test expected");
    expect(view.result.mdTest.questions.find(question => question.id === "q2")).toEqual({id: "q2", status: "fail", reasonCodes: ["research_missing"]});
  });
  it("derives each piece's decisive number and its period from the series, as text", () => {
    const text = calculatedText();
    const view = projectWorkExecution({...base, gates: receipt(), result: committedResult(text)});
    if (!view.result || view.result.withheld) throw new Error("result expected");
    const series = deriveCapitalChartSeries(JSON.parse(text));
    expect(series.pieces.length).toBeGreaterThan(0);
    expect(view.result.decisiveNumbers).toEqual(series.pieces.map(piece => ({pieceId: piece.pieceId, questionCode: piece.questionCode, alternativeId: piece.alternativeId,
      unit: piece.unit, value: piece.decisiveNumber.value, periodLabel: piece.conclusion.values.periodLabel})));
    expect(view.result.decisiveNumbers!.map(entry => entry.questionCode).sort()).toEqual(["largest_net_financing_outflow_by_period", "lowest_available_cash_by_period"]);
    expect(view.result.packet?.alternatives[0]?.calculated).toBe(true);
    expect(JSON.stringify(view.result.decisiveNumbers)).not.toMatch(/points|conclusion|evidenceState|color|colour/);
  });
  it("maps the receipt to the MD test gates: states and counts, never versions or registry metadata", () => {
    const mapped = mdTestGatesOf(gates());
    expect(capitalMdTestGatesSchema.parse(mapped)).toEqual(mapped);
    expect(mapped).toEqual({companyRegistration: "registered", research: "recorded", methodSelection: {situationIds: ["refinancing", "near-covenant"]},
      conventions: [{key: "policy.capital.iof", effective: "gap"}, {key: "policy.capital.anbima-b3-conventions", effective: "gap"}, {key: "policy.capital.tax-regime", effective: "gap"}],
      voice: {blockCount: 0, warnCount: 0}});
  });
  it("formats a decimal for the locale without losing a digit", () => {
    expect(formatDecimal("1234567.891234567891", "pt-BR")).toBe("1.234.567,891234567891");
    expect(formatDecimal("1234567.891234567891", "en-US")).toBe("1,234,567.891234567891");
    expect(formatDecimal("-123", "pt-BR")).toBe("-123");
    expect(formatDecimal("-1000", "en-US")).toBe("-1,000");
    expect(formatDecimal("0.5", "pt-BR")).toBe("0,5");
    expect(formatDecimal("not a number", "pt-BR")).toBe("not a number");
  });
});

/** The registered revision of a committed packet, as the page hands it over: the contract's blocks of
 * that packet and the pins the commit writes (the receipt's result fingerprint, the packet's own
 * fingerprint and the gate receipt). */
function registered(text: string, overrides: {pins?: Partial<{resultFingerprint: string; packetFingerprint: string | null; gatesFingerprint: string | null}>; freshness?: "current" | "stale" | "unknown"} = {}): ExecutionRevisionState {
  const packet = JSON.parse(text) as CapitalProcedurePacketLike;
  const blocks = readCapitalProcedurePacketBlocks(capitalProcedurePacketBlocks(packet));
  if (!blocks) throw new Error("blocks expected");
  return {state: "ready", revision: {revisionId: "30000000-0000-4000-8000-000000000001", revisionNo: 1, recordedAt: "2026-09-24T12:05:00.5+00:00", freshness: overrides.freshness ?? "current", blocks,
    pins: {resultFingerprint: hex("d"), packetFingerprint: packet.fingerprint, gatesFingerprint: receipt().fingerprint, ...overrides.pins}}};
}

describe("a result read from its registered revision", () => {
  it("shows the alternatives, gaps and requirements of the blocks and the same decisive numbers as the series", () => {
    const text = calculatedText();
    const fromBytes = projectWorkExecution({...base, gates: receipt(), result: committedResult(text)});
    const fromBlocks = projectWorkExecution({...base, gates: receipt(), result: committedResult(text)}, registered(text));
    if (!fromBytes.result || fromBytes.result.withheld || !fromBlocks.result || fromBlocks.result.withheld) throw new Error("results expected");
    expect(fromBytes.result.source).toBe("packet"); expect(fromBytes.result.revision).toBeNull();
    expect(fromBlocks.result.source).toBe("revision");
    expect(fromBlocks.result.revision).toEqual({revisionNo: 1, recordedAt: "2026-09-24T12:05:00.5+00:00", freshness: "current"});
    // What the screen lists is the same whether it came from the bytes or from the blocks.
    const listed = (packet: NonNullable<typeof fromBytes.result.packet>) => ({status: packet.status, question: packet.question, asOf: packet.asOf, alternatives: packet.alternatives,
      informationGaps: packet.informationGaps, contractualGaps: packet.contractualGaps, nextRequirements: packet.nextRequirements, contributions: packet.contributions});
    expect(listed(fromBlocks.result.packet!)).toEqual(listed(fromBytes.result.packet!));
    expect(fromBlocks.result.packet!.unresolved).toEqual([]);
    expect(fromBlocks.result.decisiveNumbers).toEqual(fromBytes.result.decisiveNumbers);
    expect(fromBlocks.result.decisiveNumbers!.length).toBeGreaterThan(0);
    // The MD test is the same evaluation over the pinned packet and receipt.
    expect(fromBlocks.result.mdTest).toEqual(fromBytes.result.mdTest);
    expect(fromBlocks.result.mdTest?.evaluated).toBe(true);
  });
  it("does not evaluate the MD test over a packet or a receipt the revision did not pin", () => {
    const text = packetText();
    const read = {...base, gates: receipt(), result: committedResult(text)};
    for (const pins of [{resultFingerprint: hex("e")}, {packetFingerprint: hex("f")}, {gatesFingerprint: hex("0")}, {gatesFingerprint: null}]) {
      const view = projectWorkExecution(read, registered(text, {pins}));
      expect(view.result && !view.result.withheld && view.result.mdTest).toEqual({evaluated: false, reason: "pins_mismatch"});
    }
    // A receipt the revision pinned whose bytes no longer match it stays unverified, as before.
    const tampered = {...receipt(), canonical: {...receipt().canonical, research: "missing"}};
    const view = projectWorkExecution({...read, gates: tampered}, registered(text));
    expect(view.result && !view.result.withheld && view.result.mdTest).toEqual({evaluated: false, reason: "gates_unverified"});
  });
  it("keeps the rule of current inputs and shows nothing of a revision the database withheld", () => {
    const text = packetText();
    const withheldBytes = projectWorkExecution({...base, inputsCurrent: false, gates: receipt(), result: {withheld: "inputs_not_current", outcome: "succeeded", reason: "calculated",
      resultFingerprint: hex("d"), committedAt: "2026-09-24T12:05:00+00:00"}}, registered(text));
    expect(withheldBytes.result).toEqual({withheld: true, reason: "inputs_not_current", resultFingerprint: hex("d"), committedAt: "2026-09-24T12:05:00+00:00"});
    const restricted = projectWorkExecution({...base, gates: receipt(), result: committedResult(text)}, {state: "withheld"});
    expect(restricted.result).toEqual({withheld: true, reason: "revision_restricted", resultFingerprint: hex("d"), committedAt: "2026-09-24T12:05:00+00:00"});
    expect(restricted.state).toBe("withheld");
    expect(JSON.stringify(restricted)).not.toContain("canonicalResult");
  });
  it("shows historical evidence only when absence of a revision is established", () => {
    const text = packetText();
    const before = projectWorkExecution({...base, gates: receipt(), result: committedResult(text)});
    for (const state of ["absent"] as const) {
      expect(projectWorkExecution({...base, gates: receipt(), result: committedResult(text)}, {state})).toEqual(before);
    }
  });
  it.each(["unavailable", "mismatch"] as const)("never falls back to raw bytes for %s revision", state => {
    const view=projectWorkExecution({...base,gates:receipt(),result:committedResult(packetText())},{state});
    expect(view.result?.withheld).toBe(true);
    expect(JSON.stringify(view)).not.toContain("canonicalResult");
    expect(view.result).not.toHaveProperty("packet");
  });
  it("carries the freshness of the revision", () => {
    const text = packetText();
    const view = projectWorkExecution({...base, gates: receipt(), result: committedResult(text)}, registered(text, {freshness: "stale"}));
    expect(view.result && !view.result.withheld && view.result.revision?.freshness).toBe("stale");
  });
});

describe("an investment analysis result", () => {
  const full = () => {const f = c32PacketInput({quantum: "10000"}); f.seal(); return prepareInvestmentDecisionPacket(f.input);};
  it("reads the case comparison from committed bytes of an execution without a revision, and runs no capital test over it", () => {
    const packet = full();
    const view = projectWorkExecution({...base, result: committedResult(JSON.stringify(packet))});
    expect(view.result && !view.result.withheld && view.result.packet).toBeNull();
    expect(view.result && !view.result.withheld && view.result.mdTest).toBeNull();
    const investment = view.result && !view.result.withheld ? view.result.investment : null;
    expect(investment?.conclusionChangingCaseIds).toEqual(["economy-4", "capex-120", "slower-start"]);
    expect(investment?.metrics.find(m => m.caseId === "base")?.netPresentValue).toBe(packet.comparison.metrics[0]!.netPresentValue);
  });
  it("takes the comparison from the registered revision when there is one", () => {
    const packet = full();
    const investment = readInvestmentDecisionPacketBlocks(investmentDecisionPacketBlocks(packet as unknown as InvestmentDecisionPacketLike))!;
    const view = projectWorkExecution({...base, result: committedResult(JSON.stringify(packet))}, {state: "ready", revision: {revisionId: "30000000-0000-4000-8000-000000000001",
      revisionNo: 2, recordedAt: "2026-10-18T12:00:00+00:00", freshness: "current", kind: "investment", investment,
      pins: {resultFingerprint: hex("d"), packetFingerprint: packet.fingerprint, gatesFingerprint: null}}});
    expect(view.result).toMatchObject({withheld: false, source: "revision", packet: null, investment, revision: {revisionNo: 2}});
  });
  it("does not read a capital packet or unknown bytes as an investment result", () => {
    const view = projectWorkExecution({...base, result: committedResult(JSON.stringify({schemaVersion: "investment-decision-packet.v1"}))});
    expect(view.result && !view.result.withheld && view.result.investment).toBeNull();
  });
});

describe("the lote 2 debt results", () => {
  const debtTable = () => prepareDebtTablePacket({schemaVersion: "debt-table-packet-input.v1", question: "Monta a tabela de dívida com tudo que temos.", analysis: auroraDebtTableBasis().seal()});
  const covenant = () => prepareCovenantHeadroomPacket({schemaVersion: "covenant-headroom-packet-input.v1", question: "Como estamos contra os covenants?", headlineMeasurementId: "dez26-base",
    analysis: auroraCovenantBasis().seal()});
  const weekly = () => prepareWeeklyCashPacket({schemaVersion: "weekly-cash-packet-input.v1", question: "Como fica o caixa até dezembro?", analysis: auroraWeeklyCashBasis().seal()});
  it("reads each from committed bytes of an execution without a revision, through its blocks, and nothing else from them", () => {
    const table = projectWorkExecution({...base, result: committedResult(JSON.stringify(debtTable()))});
    const tableResult = table.result && !table.result.withheld ? table.result : null;
    expect(tableResult?.debtTable?.views.length).toBeGreaterThan(0);
    expect([tableResult?.packet, tableResult?.mdTest, tableResult?.investment, tableResult?.capacity, tableResult?.covenantHeadroom, tableResult?.weeklyCash]).toEqual([null, null, null, null, null, null]);
    const headroom = projectWorkExecution({...base, result: committedResult(JSON.stringify(covenant()))});
    const headroomResult = headroom.result && !headroom.result.withheld ? headroom.result : null;
    expect(headroomResult?.covenantHeadroom?.framing.readings?.headline.measurementId).toBe("dez26-base");
    expect(headroomResult?.debtTable).toBeNull();
    const cash = projectWorkExecution({...base, result: committedResult(JSON.stringify(weekly()))});
    const cashResult = cash.result && !cash.result.withheld ? cash.result : null;
    expect(cashResult?.weeklyCash?.cases.some((c) => c.role === "informed")).toBe(true);
    expect(cashResult?.covenantHeadroom).toBeNull();
  });
  it("takes the result from the registered revision when there is one", () => {
    const packet = covenant();
    const view = readCovenantHeadroomPacketBlocks(covenantHeadroomPacketBlocks(packet as unknown as CovenantHeadroomPacketLike))!;
    const projected = projectWorkExecution({...base, result: committedResult(JSON.stringify(packet))}, {state: "ready", revision: {revisionId: "30000000-0000-4000-8000-000000000001",
      revisionNo: 1, recordedAt: "2026-10-23T12:00:00+00:00", freshness: "current", kind: "covenant_headroom", covenantHeadroom: view,
      pins: {resultFingerprint: hex("d"), packetFingerprint: packet.fingerprint, gatesFingerprint: null}}});
    expect(projected.result).toMatchObject({withheld: false, source: "revision", packet: null, covenantHeadroom: view, revision: {revisionNo: 1}});
  });
  it("does not read unknown bytes as a debt result", () => {
    for (const schemaVersion of ["debt-table-packet.v1", "covenant-headroom-packet.v1", "weekly-cash-packet.v1"]) {
      const view = projectWorkExecution({...base, result: committedResult(JSON.stringify({schemaVersion}))});
      const result = view.result && !view.result.withheld ? view.result : null;
      expect([result?.debtTable, result?.covenantHeadroom, result?.weeklyCash]).toEqual([null, null, null]);
    }
  });
});

describe("the lote 3 results", () => {
  const projection = () => prepareOperatingProjectionPacket({schemaVersion: "operating-projection-packet-input.v1", question: "Não temos projeção pronta. Ajuda a construir uma.",
    analysis: auroraProjectionBasis({informed: true}).seal()});
  const challenge = () => prepareProjectionChallengePacket({schemaVersion: "projection-challenge-packet-input.v1", question: "Que premissas você questionaria nessa projeção?",
    analysis: auroraChallengeBasis().seal()});
  const funding = () => prepareReceivablesFundingPacket({schemaVersion: "receivables-funding-packet-input.v1", question: "Dá para financiar a safra com os recebíveis?",
    analysis: auroraReceivablesFundingBasis().seal()});
  const quarter = () => prepareQuarterUpdatePacket({schemaVersion: "quarter-update-packet-input.v1", question: "Fechou o trimestre. Atualiza tudo.", analysis: auroraQuarterUpdateBasis().seal()});
  const fields = ["operatingProjection", "projectionChallenge", "receivablesFunding", "quarterUpdate"] as const;
  const read = (packet: unknown) => {
    const view = projectWorkExecution({...base, result: committedResult(JSON.stringify(packet))});
    return view.result && !view.result.withheld ? view.result : null;
  };
  it("reads each from committed bytes of an execution without a revision, through its blocks, and nothing else from them", () => {
    const cases = [[projection(), "operatingProjection"], [challenge(), "projectionChallenge"], [funding(), "receivablesFunding"], [quarter(), "quarterUpdate"]] as const;
    for (const [packet, field] of cases) {
      const result = read(packet)!;
      expect(result[field], field).not.toBeNull();
      for (const other of fields.filter((f) => f !== field)) expect(result[other], `${field} as ${other}`).toBeNull();
      expect([result.packet, result.mdTest, result.investment, result.weeklyCash, result.covenantHeadroom]).toEqual([null, null, null, null, null]);
    }
    expect(read(projection())!.operatingProjection!.framing.calibration?.reproduces).toBe(true);
    expect(read(challenge())!.projectionChallenge!.framing.largestAssumptionId).toBe("preco");
    expect(read(funding())!.receivablesFunding!.framing.assignable).toBe("25");
    expect(read(quarter())!.quarterUpdate!.framing.tightestWeek?.updated.weekStart).toBe("2026-12-21");
  });
  it("takes the result from the registered revision when there is one", () => {
    const packet = projection();
    const view = readOperatingProjectionPacketBlocks(operatingProjectionPacketBlocks(packet as unknown as OperatingProjectionPacketLike))!;
    const projected = projectWorkExecution({...base, result: committedResult(JSON.stringify(packet))}, {state: "ready", revision: {revisionId: "30000000-0000-4000-8000-000000000001",
      revisionNo: 1, recordedAt: "2026-10-26T12:00:00+00:00", freshness: "current", kind: "operating_projection", operatingProjection: view,
      pins: {resultFingerprint: hex("d"), packetFingerprint: packet.fingerprint, gatesFingerprint: null}}});
    expect(projected.result).toMatchObject({withheld: false, source: "revision", packet: null, operatingProjection: view, revision: {revisionNo: 1}});
  });
  it("does not read unknown bytes as a lote 3 result", () => {
    for (const schemaVersion of ["operating-projection-packet.v1", "projection-challenge-packet.v1", "receivables-funding-packet.v1", "quarter-update-packet.v1"]) {
      const result = read({schemaVersion});
      expect(fields.map((f) => result?.[f])).toEqual([null, null, null, null]);
    }
  });
});

describe("the lote 4 results", () => {
  const fields = ["documentFolder", "receivedProposal", "financingPaths", "boardMaterial"] as const;
  const read = (packet: unknown) => {
    const view = projectWorkExecution({...base, result: committedResult(JSON.stringify(packet))});
    return view.result && !view.result.withheld ? view.result : null;
  };
  it("reads each from committed bytes of an execution without a revision, through its blocks, and nothing else from them", () => {
    const cases = [[lote4DocumentFolderPacket, "documentFolder"], [lote4ReceivedProposalPacket, "receivedProposal"], [lote4FinancingPathsPacket, "financingPaths"],
      [lote4BoardMaterialPacket, "boardMaterial"]] as const;
    for (const [packet, field] of cases) {
      const result = read(packet)!;
      expect(result[field], field).not.toBeNull();
      for (const other of fields.filter((f) => f !== field)) expect(result[other], `${field} as ${other}`).toBeNull();
      expect([result.packet, result.mdTest, result.investment, result.quarterUpdate, result.receivablesFunding]).toEqual([null, null, null, null, null]);
    }
  });
});
