import {fingerprintJson} from "@offroad/case-understanding";
import {z} from "zod";

export const dependencyNodeKindSchema = z.enum(["source", "fact", "calculation", "claim", "artifact", "approval", "lender_match"]);
export type DependencyNodeKind = z.infer<typeof dependencyNodeKindSchema>;

export const dependencyNodeSchema = z.object({
  id: z.string().min(1),
  kind: dependencyNodeKindSchema,
  dependsOn: z.array(z.string().min(1)),
  version: z.string().min(1),
});
export type DependencyNode = z.infer<typeof dependencyNodeSchema>;

export const invalidationRecordSchema = z.object({
  nodeId: z.string().min(1),
  kind: dependencyNodeKindSchema,
  direct: z.boolean(),
  changedRoots: z.array(z.string().min(1)),
});
export type InvalidationRecord = z.infer<typeof invalidationRecordSchema>;

export const invalidationResultSchema = z.object({
  invalidated: z.array(invalidationRecordSchema),
  invalidatedIds: z.array(z.string().min(1)),
  graphFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  resultFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
});
export type InvalidationResult = z.infer<typeof invalidationResultSchema>;

/** Propagates changed evidence through every derived object, including approvals and matches. */
export function invalidateDependencyGraph(input: {
  nodes: DependencyNode[];
  changedNodeIds: string[];
}): InvalidationResult {
  const nodes = z.array(dependencyNodeSchema).parse(input.nodes);
  const changedNodeIds = z.array(z.string().min(1)).parse(input.changedNodeIds);
  const byId = new Map<string, DependencyNode>();
  for (const node of nodes) {
    if (byId.has(node.id)) throw new Error(`duplicate_dependency_node:${node.id}`);
    byId.set(node.id, node);
  }
  for (const node of nodes) {
    for (const dependency of node.dependsOn) {
      if (!byId.has(dependency)) throw new Error(`unknown_dependency:${node.id}:${dependency}`);
    }
  }
  for (const changed of changedNodeIds) {
    if (!byId.has(changed)) throw new Error(`unknown_changed_node:${changed}`);
  }
  assertAcyclic(nodes, byId);

  const children = new Map<string, string[]>();
  for (const node of nodes) {
    for (const dependency of node.dependsOn) {
      const entries = children.get(dependency) ?? [];
      entries.push(node.id);
      children.set(dependency, entries);
    }
  }
  for (const entries of children.values()) entries.sort();

  const rootsByNode = new Map<string, Set<string>>();
  const queue = [...new Set(changedNodeIds)].sort().map((id) => ({id, root: id}));
  for (const id of new Set(changedNodeIds)) rootsByNode.set(id, new Set([id]));
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const child of children.get(current.id) ?? []) {
      const roots = rootsByNode.get(child) ?? new Set<string>();
      const before = roots.size;
      roots.add(current.root);
      rootsByNode.set(child, roots);
      if (roots.size !== before) queue.push({id: child, root: current.root});
    }
  }

  const direct = new Set(changedNodeIds);
  const invalidated = [...rootsByNode.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([nodeId, roots]) => ({
      nodeId,
      kind: byId.get(nodeId)!.kind,
      direct: direct.has(nodeId),
      changedRoots: [...roots].sort(),
    }));
  const graphFingerprint = fingerprintJson(nodes.slice().sort((left, right) => left.id.localeCompare(right.id)));
  const payload = {invalidated, invalidatedIds: invalidated.map((entry) => entry.nodeId), graphFingerprint};
  return invalidationResultSchema.parse({...payload, resultFingerprint: fingerprintJson(payload)});
}

function assertAcyclic(nodes: DependencyNode[], byId: Map<string, DependencyNode>): void {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) throw new Error(`dependency_cycle:${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id)?.dependsOn ?? []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const node of nodes) visit(node.id);
}
