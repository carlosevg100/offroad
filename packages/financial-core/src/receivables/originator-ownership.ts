import {decimal, full, requireUnitInterval, sum, ZERO, ONE, type ReceivablesPoolKernelTrace} from "./pool-shared";

export type OriginatorOwnershipNode = {
  id: string; kind: "person" | "entity";
  /** Null is an unknown ownership chain. A person has no shareholders. */
  shareholders: ReadonlyArray<{holderId: string; share: string}> | null;
};
export type OriginatorOwnershipResult = {
  version: "2026.10.30-v1"; status: "complete" | "partial";
  resolvedPersons: Array<{personId: string; resolvedShare: string}>;
  unresolved: Array<{entityId: string; share: string; reason: "ownership_missing" | "identity_missing" | "cycle" | "unallocated_share" | "depth_limit"}>;
  traces: ReceivablesPoolKernelTrace[];
};

/** Multiplies the supplied ownership paths. A partial graph is not a final beneficial-owner list. */
export function calculateOriginatorOwnership(input: {rootEntityId: string; nodes: readonly OriginatorOwnershipNode[]}): OriginatorOwnershipResult {
  if (!input.rootEntityId.trim() || input.nodes.length > 1000) throw new RangeError("originator_ownership_scope_invalid");
  const nodes = new Map<string, OriginatorOwnershipNode>();
  for (const node of input.nodes) {
    if (!node.id.trim() || nodes.has(node.id) || !["person", "entity"].includes(node.kind)) throw new RangeError("originator_ownership_identity_invalid");
    if (node.kind === "person" && node.shareholders?.length) throw new RangeError("originator_person_has_shareholders");
    const holders = new Set<string>();
    for (const edge of node.shareholders ?? []) {
      if (!edge.holderId.trim() || holders.has(edge.holderId)) throw new RangeError("originator_ownership_holder_duplicate");
      holders.add(edge.holderId); requireUnitInterval("originator_ownership_share", edge.share);
    }
    if (sum((node.shareholders ?? []).map(s => s.share)).gt(1)) throw new RangeError("originator_ownership_exceeds_one");
    nodes.set(node.id, node);
  }
  if (nodes.get(input.rootEntityId)?.kind !== "entity") throw new RangeError("originator_root_entity_missing");
  const persons = new Map<string, ReturnType<typeof decimal>>();
  const unresolved: OriginatorOwnershipResult["unresolved"] = [], traces: ReceivablesPoolKernelTrace[] = [];
  let traversed = 0;
  function visit(id: string, share: ReturnType<typeof decimal>, path: readonly string[]) {
    if (share.isZero()) return;
    if (++traversed > 100000) throw new RangeError("originator_ownership_path_budget_exceeded");
    const node = nodes.get(id);
    if (!node) {unresolved.push({entityId: id, share: full(share), reason: "identity_missing"}); return;}
    if (path.includes(id)) {unresolved.push({entityId: id, share: full(share), reason: "cycle"}); return;}
    if (path.length > 64) {unresolved.push({entityId: id, share: full(share), reason: "depth_limit"}); return;}
    if (node.kind === "person") {persons.set(id, (persons.get(id) ?? ZERO).plus(share)); return;}
    if (node.shareholders === null) {unresolved.push({entityId: id, share: full(share), reason: "ownership_missing"}); return;}
    for (const edge of [...node.shareholders].sort((a, b) => a.holderId.localeCompare(b.holderId))) {
      const inherited = share.times(edge.share);
      traces.push({id: "receivables.originator.ownership_path", formula: "share along prior path * supplied direct share", operands: {path: [...path, id, edge.holderId].join("/"), priorPathShare: full(share), directShare: edge.share}, result: full(inherited)});
      visit(edge.holderId, inherited, [...path, id]);
    }
    const remainder = ONE.minus(sum(node.shareholders.map(s => s.share)));
    if (remainder.gt(0)) unresolved.push({entityId: id, share: full(share.times(remainder)), reason: "unallocated_share"});
  }
  visit(input.rootEntityId, ONE, []);
  const resolvedPersons = [...persons].map(([personId, share]) => ({personId, resolvedShare: full(share)})).sort((a, b) => a.personId.localeCompare(b.personId));
  unresolved.sort((a, b) => a.entityId.localeCompare(b.entityId) || a.reason.localeCompare(b.reason) || a.share.localeCompare(b.share));
  const total = sum([...resolvedPersons.map(p => p.resolvedShare), ...unresolved.map(p => p.share)]);
  // Forty-digit arithmetic can leave a final digit on very deep fractional graphs.
  if (total.minus(1).abs().gt("0.000000000000000000000000000000000001")) throw new Error("originator_ownership_does_not_reconcile");
  traces.push({id: "receivables.originator.ownership_reconciliation", formula: "resolved path shares + unresolved path shares", operands: {resolved: full(sum(resolvedPersons.map(p => p.resolvedShare))), unresolved: full(sum(unresolved.map(p => p.share)))}, result: full(total)});
  return {version: "2026.10.30-v1", status: unresolved.length ? "partial" : "complete", resolvedPersons, unresolved, traces};
}
