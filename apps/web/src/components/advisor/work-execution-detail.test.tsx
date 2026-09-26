import {createHash} from "node:crypto";
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";
import {executionCanonicalText} from "@offroad/agent-contracts";
import {evaluateConventionsGate, selectMethod} from "@offroad/credit-playbook";
import {composeBoundCapitalPacketV2, deriveBoundCapitalScope, prepareCapitalProcedurePacketV2} from "@offroad/financial-model";
import {readContextualBasis} from "@offroad/reconciliation";
import {adoptedCapitalPeriodFixture, capitalStructureDecisionFixture} from "@offroad/testing-fixtures/capital-structure-decision";
import en from "../../../messages/en-US.json";
import pt from "../../../messages/pt-BR.json";
import {formatDecimal} from "@/lib/execution/format";
import {buildExecutionGates} from "@offroad/execution-request";
import {projectWorkExecution} from "@/lib/execution/read";
import type {ExecutionRevisionState} from "@/lib/execution/revision";
import {capitalProcedurePacketBlocks, readCapitalProcedurePacketBlocks, type CapitalProcedurePacketLike} from "@offroad/domain-contracts";
import {WorkExecutionDetail} from "./work-execution-detail";

vi.mock("next-intl/server", async () => {
  const {createTranslator} = await import("next-intl");
  const catalogues = {"pt-BR": (await import("../../../messages/pt-BR.json")).default, "en-US": (await import("../../../messages/en-US.json")).default};
  const translator = createTranslator as unknown as (config: {locale: string; messages: unknown; namespace: string}) => unknown;
  return {getTranslations: async ({locale, namespace}: {locale: "pt-BR" | "en-US"; namespace: string}) => translator({locale, messages: catalogues[locale], namespace})};
});
vi.mock("next/navigation", () => ({useRouter: () => ({refresh: vi.fn(), push: vi.fn()})}));

const id = (n: number) => `a4200000-0000-4000-9000-${String(n).padStart(12, "0")}`;
const hex = (c: string) => c.repeat(64);
const dashes = new RegExp(`[${String.fromCodePoint(0x2014)}${String.fromCodePoint(0x2013)}]`);
const keys = ["policy.capital.iof", "policy.capital.anbima-b3-conventions", "policy.capital.tax-regime"];
function packetText(fixture: {snapshot: {workId: string; purpose: string; versionId: string}}, asOf: string) {
  const canonical = JSON.stringify(fixture.snapshot);
  const envelope = {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")};
  const scope = {workId: fixture.snapshot.workId, purpose: fixture.snapshot.purpose, versionId: fixture.snapshot.versionId};
  const packet = composeBoundCapitalPacketV2({envelope, scope, question: "Does the current structure hold?", objectives: ["Measure liquidity"], asOf, ...deriveBoundCapitalScope(readContextualBasis(envelope, scope), asOf)});
  return executionCanonicalText(prepareCapitalProcedurePacketV2(packet));
}
function receipt() {
  const method = {methodId: "prepare-capital-structure-decision", methodVersion: "2026.09.21-v4"};
  const value = buildExecutionGates({company: {registration: "registered", research: "recorded"}, method, selection: selectMethod({situationIds: ["refinancing", "near-covenant"], ...method}),
    conventions: evaluateConventionsGate(keys, "2026-10-01"), findings: []});
  const text = executionCanonicalText(value);
  return {gatesVersion: value.gatesVersion, blocked: false, fingerprint: createHash("sha256").update(text, "utf8").digest("hex"), canonical: JSON.parse(text), createdAt: "2026-09-24T12:00:01+00:00"};
}
function view(gates: ReturnType<typeof receipt> | null, canonicalResult: string, registered?: ExecutionRevisionState) {
  return projectWorkExecution({schemaVersion: "work-execution-read.v2", executionId: id(1), workId: id(2), requestId: id(3), processingRunId: id(4), createdAt: "2026-09-24T12:00:00+00:00",
    job: {status: "succeeded", attempts: 1, lastErrorCode: null, availableAt: null, updatedAt: "2026-09-24T12:05:00+00:00"}, run: null,
    manifest: {contractFingerprint: hex("a"), inputFingerprint: hex("b"), purpose: "prepare-capital-structure-decision", method: {methodId: "prepare-capital-structure-decision", methodVersion: "2026.09.21-v4"}, budget: {}, requestedAt: "2026-09-24T12:00:00+00:00"},
    operation: null, inputsCurrent: true, gates,
    result: {outcome: "succeeded", reason: "calculated", resultFingerprint: hex("d"), canonicalResult, committedAt: "2026-09-24T12:05:00+00:00"}}, registered);
}
/** The revision the commit registers for this packet: the contract's blocks and the commit's pins. */
function registered(canonicalResult: string, freshness: "current" | "stale" | "unknown" = "current"): ExecutionRevisionState {
  const packet = JSON.parse(canonicalResult) as CapitalProcedurePacketLike;
  const blocks = readCapitalProcedurePacketBlocks(capitalProcedurePacketBlocks(packet));
  if (!blocks) throw new Error("blocks expected");
  return {state: "ready", revision: {revisionNo: 1, recordedAt: "2026-09-24T12:05:00.5+00:00", freshness, blocks,
    pins: {resultFingerprint: hex("d"), packetFingerprint: packet.fingerprint, gatesFingerprint: receipt().fingerprint}}};
}
const render = async (locale: "pt-BR" | "en-US", value: ReturnType<typeof view>) => renderToStaticMarkup(await WorkExecutionDetail({locale, projectId: id(2), view: value}));
const partial = () => packetText(capitalStructureDecisionFixture(), "2027-12-31");

describe("execution detail screen", () => {
  it("shows the receipt gates, the ten MD test questions with their statuses and the Q2 line, with no verdict", async () => {
    const html = await render("pt-BR", view(receipt(), partial()));
    const w = pt.App.workExecutions;
    for (const text of [w.gates.title, w.gates.registrationStates.registered, w.gates.researchStates.recorded, w.situations.refinancing, w.situations["near-covenant"],
      "nenhum bloqueio e nenhum alerta nos textos do sistema", w.mdTest.title, w.mdTest.note, w.mdTest.statuses.pass, w.mdTest.statuses.not_applicable, w.mdTest.statuses.human_required,
      w.mdTest.scopeCodes.packet_status_partial, "<code>packet_status_partial</code>", w.decisive.title, w.decisive.none]) expect(html).toContain(text);
    for (const question of Object.values(w.mdTest.questions)) expect(html).toContain(question);
    for (const key of keys) expect(html).toContain(`<code>${key}</code>: ${w.gates.conventionGap}`);
    expect(html).toContain("estado registrado em");
    expect(html).not.toMatch(/overall|verdict|veredito|aprovad[ao] no teste/i);
    expect(html).not.toMatch(dashes);
  });
  it("says that an execution requested through v1 recorded no gates and was not MD tested", async () => {
    const html = await render("en-US", view(null, partial()));
    const w = en.App.workExecutions;
    expect(html).toContain(w.gates.none); expect(html).toContain(w.mdTest.notEvaluated.gates_not_recorded);
    expect(html).not.toContain(w.mdTest.questions.q1);
    expect(html).not.toMatch(dashes);
  });
  it("keeps the evidence it always showed for an execution without a registered revision", async () => {
    const html = await render("pt-BR", view(receipt(), partial()));
    const w = pt.App.workExecutions;
    for (const shown of [w.detail.contractFingerprint, w.detail.inputFingerprint, w.detail.execution, w.gates.fingerprint, w.detail.resultFingerprint, w.detail.packetFingerprint, id(1), hex("a"), hex("d")]) {
      expect(html).toContain(shown);
    }
    expect(html).not.toContain("execution-result--recorded");
  });
  it("keeps only the fingerprint of a receipt that does not match it", async () => {
    const tampered = {...receipt(), fingerprint: hex("0")};
    const html = await render("pt-BR", view(tampered, partial()));
    expect(html).toContain(pt.App.workExecutions.gates.unverified); expect(html).toContain(hex("0"));
    expect(html).toContain(pt.App.workExecutions.mdTest.notEvaluated.gates_unverified);
    expect(html).not.toContain(pt.App.workExecutions.situations.refinancing);
  });
  it("writes each piece's decisive number and its period as text, grouped for the locale", async () => {
    const value = view(receipt(), packetText(adoptedCapitalPeriodFixture(), "2026-12-31"));
    if (!value.result || value.result.withheld || !value.result.decisiveNumbers?.length) throw new Error("decisive numbers expected");
    const html = await render("pt-BR", value);
    const w = pt.App.workExecutions;
    expect(html).toContain(w.decisive.questions.lowest_available_cash_by_period); expect(html).toContain(w.decisive.questions.largest_net_financing_outflow_by_period);
    for (const entry of value.result.decisiveNumbers) {
      expect(html).toContain(`<strong>${formatDecimal(entry.value, "pt-BR")} ${entry.unit}</strong>`);
      expect(html).toContain(`período ${entry.periodLabel}`);
    }
    expect(html).not.toMatch(/<svg|<canvas/);
  });
  it("reads a registered result from its blocks, with no identifier or fingerprint in the text of the result", async () => {
    const canonical = packetText(adoptedCapitalPeriodFixture(), "2026-12-31");
    const value = view(receipt(), canonical, registered(canonical));
    if (!value.result || value.result.withheld || value.result.source !== "revision" || !value.result.packet || !value.result.decisiveNumbers?.length) throw new Error("registered result expected");
    const w = pt.App.workExecutions;
    const html = await render("pt-BR", value);
    const result = html.slice(html.indexOf('<section class="execution-result execution-result--recorded">'), html.indexOf(`<h2>${w.mdTest.title}</h2>`));
    expect(result).toContain("Resultado registrado na revisão 1, em ");
    expect(result).toContain(w.detail.freshness.current);
    for (const alternative of value.result.packet.alternatives) expect(result).toContain(alternative.label);
    expect(result).toContain(w.detail.gaps); expect(result).toContain(w.detail.requirements);
    // The result section names neither the result nor the packet by fingerprint or identifier.
    expect(result).not.toContain(w.detail.resultFingerprint); expect(result).not.toContain(w.detail.packetFingerprint);
    expect(result).not.toMatch(/[a-f0-9]{64}/); expect(result).not.toContain(id(1));
    for (const entry of value.result.decisiveNumbers) expect(html).toContain(`<strong>${formatDecimal(entry.value, "pt-BR")} ${entry.unit}</strong>`);
    for (const question of Object.values(w.mdTest.questions)) expect(html).toContain(question);
    // Nowhere on the screen of a registered result: the execution, contract, input and gate identifiers.
    for (const hidden of [w.detail.contractFingerprint, w.detail.inputFingerprint, w.detail.execution, w.gates.fingerprint, id(1), hex("a"), hex("b")]) expect(html).not.toContain(hidden);
    expect(html).not.toMatch(/[a-f0-9]{64}/);
    expect(html).toContain(w.gates.registrationStates.registered);
    expect(html).not.toMatch(dashes);
    const stale = await render("en-US", view(receipt(), canonical, registered(canonical, "stale")));
    expect(stale).toContain("Result recorded as revision 1 on "); expect(stale).toContain(en.App.workExecutions.detail.freshness.stale);
    expect(stale).not.toMatch(dashes);
  });
  it("says why a registered result is not shown, without its fingerprint, and when the MD test was not run over the pinned packet", async () => {
    const canonical = partial();
    const restricted = await render("pt-BR", view(receipt(), canonical, {state: "withheld"}));
    const w = pt.App.workExecutions;
    expect(restricted).toContain(w.detail.withheldTitle); expect(restricted).toContain(w.detail.revisionWithheldBody);
    expect(restricted).not.toContain(hex("d")); expect(restricted).not.toContain(w.decisive.title);
    expect(restricted).not.toMatch(/[a-f0-9]{64}/); expect(restricted).not.toContain(id(1));
    const state = registered(canonical);
    if (state.state !== "ready") throw new Error("ready expected");
    const mismatch = await render("pt-BR", view(receipt(), canonical, {state: "ready", revision: {...state.revision, pins: {...state.revision.pins, gatesFingerprint: hex("0")}}}));
    expect(mismatch).toContain(w.mdTest.notEvaluated.pins_mismatch);
    expect(mismatch).not.toContain(w.mdTest.questions.q1);
    for (const html of [restricted, mismatch]) expect(html).not.toMatch(dashes);
  });
});
