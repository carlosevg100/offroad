import {createHash} from "node:crypto";
import type {ProposedHypothesis} from "@offroad/financial-model";

/** A basis as the method's own reader receives it. */
export type BoundBasis = {envelope: {canonical: string; fingerprint: string}; scope: {workId: string; purpose: string; versionId: string}};

const sequential = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
/** A refusal message as a gap key: lower case, letters, digits and underscores only. */
const code = (message: string) => message.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "unknown";

/** Before a card is offered, the proposed hypotheses are adopted in memory exactly as a confirmation adopts them
 * (one entry per slot, in proposal order) and handed to the method's own reader and packet. Two hypotheses for
 * the same slot with different values, or anything the reader or the packet refuses, become named gaps now,
 * instead of a card that fails after confirmation. Gaps the method reports inside its packet are its own output
 * and are not refusals. */
export function readerGaps(hypotheses: readonly ProposedHypothesis[], run: (basis: BoundBasis) => unknown): string[] {
  const slots = new Map<string, string>(), conflicts = new Set<string>(), kept: ProposedHypothesis[] = [];
  for (const h of hypotheses) {
    const slot = `${h.fieldPath}\u0000${h.dimensions.scenario}`, value = JSON.stringify(h.value);
    if (!slots.has(slot)) {slots.set(slot, value); kept.push(h);}
    else if (slots.get(slot) !== value) conflicts.add(`conflictingSlot.${h.fieldPath.split(".").slice(2).join(".")}`);
  }
  if (conflicts.size) return [...conflicts];
  const workId = sequential(900001), versionId = sequential(900002), purpose = "premise-check";
  const entries = kept.map((h, n) => ({decisionId: sequential(n + 1), slotKey: createHash("sha256").update(h.fieldPath + h.dimensions.scenario).digest("hex"),
    kind: "hypothesis", fieldPath: h.fieldPath, dimensions: {...h.dimensions}, value: h.value, observationId: null, referenceValue: null, referenceDimensions: null,
    definitionKind: "managerial", actorId: sequential(900003), reason: h.reason}));
  const canonical = JSON.stringify({schemaVersion: "contextual-adoption.v1", versionId, setId: sequential(900004), workId, purpose, contextKey: purpose, revision: 1,
    previousVersionId: null, classification: "working_basis", entries});
  try { run({envelope: {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")}, scope: {workId, purpose, versionId}}); }
  catch (error) { return [`readerRefused.${code(error instanceof Error ? error.message : String(error))}`]; }
  return [];
}
