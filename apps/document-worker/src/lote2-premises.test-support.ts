import {composeBoundCovenantHeadroom, composeBoundWeeklyCash, proposeCovenantHeadroomHypotheses, proposeWeeklyCashHypotheses, type ProposedHypothesis} from "@offroad/financial-model";
import {inMemoryBasis} from "./lote3-reader-check";

/** Loads a financial-model test fixture by path, outside this package's compiled sources. */
export async function financialModelFixture<T>(file: string): Promise<T> {
  return await import(new URL(`../../../packages/financial-model/src/${file}`, import.meta.url).href) as T;
}

/** The hypotheses as the adopted reader reads them (path, unit, scenario, value), with this worker's
 * item keys renamed to the fixture's, ordered by path. Reasons are left out: an origin the
 * extraction cannot state (house) changes only the reason. */
type Comparable = {fieldPath: string; dimensions: {unit: string; scenario: string; periodStart: string; periodEnd: string}; value: ProposedHypothesis["value"]};
export function comparableHypotheses(hypotheses: readonly Comparable[], rename: ReadonlyMap<string, string> = new Map()) {
  const r = (x: string) => rename.get(x) ?? x;
  const value = (v: ProposedHypothesis["value"]) => Array.isArray(v.value) ? {...v, value: v.value.map(r)} : v.type === "text" && typeof v.value === "string" ? {...v, value: r(v.value)} : v;
  return hypotheses.map((h) => ({fieldPath: h.fieldPath.split(".").map(r).join("."), unit: h.dimensions.unit, scenario: h.dimensions.scenario,
    periodStart: h.dimensions.periodStart, periodEnd: h.dimensions.periodEnd, value: value(h.value)}))
    .sort((a, b) => a.fieldPath.localeCompare(b.fieldPath) || a.scenario.localeCompare(b.scenario));
}

export const summaryGroups = ["instrument", "credit_line", "obligation", "view", "limit", "measurement", "stream", "action", "case", "premise",
  "driver", "scenario", "version", "assumption", "item", "option", "line", "cause", "facility", "dependent"];
export const summaryOrigins = ["document", "informed", "house", "estimate", "market"];

type TurnInput = {message: string; hasAttachments: boolean; recentUserMessages: string[]; projectId: string | null;
  loadEvidence: () => Promise<unknown>; extract: (text: string) => Promise<unknown>; log: (event: string, detail: Record<string, unknown>) => void};
/** Runs one turn's premise step with a mocked extraction and reports whether a card was proposed and what was logged. */
export async function turnWithIntent(propose: (input: TurnInput) => Promise<{proposal: unknown; forAdvisor: {status: string}} | null>, extraction: object,
  turnIntent: string, message: string, earlier: string[]) {
  const events: string[] = [];
  let extracted = false;
  const result = await propose({message, hasAttachments: false, recentUserMessages: earlier, projectId: "a0000000-0000-4000-8000-000000000001",
    loadEvidence: async () => [], extract: async () => {extracted = true; return {...extraction, turnIntent};}, log: (event) => {events.push(event);}});
  return {extracted, status: result?.forAdvisor.status ?? null, events};
}
export const nonAnswering = ["defers", "other_request", "unrelated"] as const;

/** The Aurora prior weekly cash and covenant results as the worker reads them: each adopted on its own basis,
 * its stored input composed as the earlier request composed it, and the packets the card reads. */
export async function auroraQuarterUpdatePriors(weeklyPacket: Record<string, unknown>) {
  const {auroraWeeklyCashFacts} = await financialModelFixture<{auroraWeeklyCashFacts: () => never}>("weekly-cash.test-support.ts");
  const {auroraPriorCovenantFacts} = await financialModelFixture<{auroraPriorCovenantFacts: () => never}>("quarter-update.test-support.ts");
  const weekly = inMemoryBasis(proposeWeeklyCashHypotheses(auroraWeeklyCashFacts()), 900101), covenant = inMemoryBasis(proposeCovenantHeadroomHypotheses(auroraPriorCovenantFacts()), 900102);
  const hex = (c: string) => c.repeat(64);
  return {
    weeklyCash: {executionId: "a0000000-0000-4000-8000-000000000071", resultFingerprint: hex("1"), envelopeFingerprint: weekly.envelope.fingerprint, packet: weeklyPacket,
      streamIds: ["recebimentos", "insumos", "linha-17", "folha"], inputSnapshot: JSON.stringify(composeBoundWeeklyCash({...weekly, question: "Como fica o caixa até dezembro e o que vence?"}))},
    covenant: {executionId: "a0000000-0000-4000-8000-000000000072", resultFingerprint: hex("2"), envelopeFingerprint: covenant.envelope.fingerprint, packet: {
      readings: {headline: {measurementId: "dez26-base"}},
      result: {headroom: {measurements: [{id: "dez26-adverso", label: "Adverso", role: "test", date: "2026-12-31"}, {id: "dez26-base", label: "Escritura", role: "test", date: "2026-12-31"},
        {id: "junho-gerencial", label: "Junho gerencial", role: "contrast", date: "2026-06-30"}, {id: "dez26-gerencial", label: "Gerencial", role: "test", date: "2026-12-31"},
        {id: "dez27-base", label: "Dezembro de 2027", role: "test", date: "2027-12-31"}]}}},
      inputSnapshot: JSON.stringify(composeBoundCovenantHeadroom({...covenant, question: "Como estamos contra os covenants?", headlineMeasurementId: "dez26-base"}))},
  };
}
