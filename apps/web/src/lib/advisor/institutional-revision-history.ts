import {institutionalRevisionDifference, type InstitutionalRevisionDifference} from "@offroad/financial-model";
import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";

import type {Database} from "@/types/database";

/**
 * The revision history a project shows, and the difference between the last two revisions.
 *
 * The artifacts never reach the browser. They are megabytes each, they are the record the
 * downloads replay from, and the only thing a reader needs from them is what moved. So the
 * difference is computed here, on the server, from the two verified snapshots, and what crosses
 * to the component is the movement itself.
 */

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const revisionComponents = ["assumptions", "data", "receivablesScope", "documentaryRevision"] as const;
export type RevisionComponent = typeof revisionComponents[number];

const resultSchema = z.object({
  id: z.uuid(),
  status: z.enum(["queued", "completed", "blocked"]),
  configurationId: z.uuid(),
  configurationFingerprint: hash,
  sourceManifestFingerprint: hash,
  producedAt: z.iso.datetime({offset: true}).nullable(),
  createdAt: z.iso.datetime({offset: true}),
  supersededBy: z.uuid().nullable(),
  isCurrent: z.boolean(),
  artifact: z.unknown().nullable(),
});
const revisionSchema = z.object({
  id: z.uuid(),
  revisionNumber: z.number().int().positive(),
  parentRevisionId: z.uuid().nullable(),
  inputsFingerprint: hash,
  changeSummary: z.array(z.enum(revisionComponents)),
  approvalKind: z.enum(["initial", "institutional_configuration", "receivables_scope", "documentary_revision"]),
  approvalReference: z.uuid().nullable(),
  approvedBy: z.uuid(),
  approvedAt: z.iso.datetime({offset: true}),
  isCurrent: z.boolean(),
  results: z.array(resultSchema),
});
const historySchema = z.object({
  projectId: z.uuid(),
  currentRevisionId: z.uuid().nullable(),
  currentRevisionNumber: z.number().int().positive().nullable(),
  pendingChange: z.boolean(),
  revisions: z.array(revisionSchema).max(12),
});

export type ProjectRevisionResult = Omit<z.infer<typeof resultSchema>, "artifact"> & {standing: "current" | "previous" | "pending"};
export type ProjectRevision = Omit<z.infer<typeof revisionSchema>, "results"> & {results: ProjectRevisionResult[]};
export type ProjectRevisionHistory = {
  projectId: string;
  currentRevisionId: string | null;
  currentRevisionNumber: number | null;
  /** An approved component has moved and no result has been produced from it yet. */
  pendingChange: boolean;
  revisions: ProjectRevision[];
  difference: InstitutionalRevisionDifference | null;
};

/** A result of an older revision is previous, never current, whatever its own status says. */
function standing(result: z.infer<typeof resultSchema>): ProjectRevisionResult["standing"] {
  if (result.isCurrent) return "current";
  return result.status === "queued" ? "pending" : "previous";
}

const completedOf = (revision: z.infer<typeof revisionSchema> | undefined) =>
  revision?.results.find(result => result.status === "completed" && result.artifact !== null) ?? null;

export function parseProjectRevisionHistory(value: unknown, projectId: string): ProjectRevisionHistory | null {
  const parsed = historySchema.safeParse(value);
  if (!parsed.success || parsed.data.projectId !== projectId) return null;
  const [current, previous] = parsed.data.revisions;
  const currentResult = completedOf(current);
  const previousResult = completedOf(previous);
  const difference = currentResult && previousResult
    ? institutionalRevisionDifference({id: previousResult.id, artifact: previousResult.artifact}, {id: currentResult.id, artifact: currentResult.artifact})
    : null;
  return {
    projectId: parsed.data.projectId,
    currentRevisionId: parsed.data.currentRevisionId,
    currentRevisionNumber: parsed.data.currentRevisionNumber,
    pendingChange: parsed.data.pendingChange,
    revisions: parsed.data.revisions.map(revision => ({
      ...revision,
      // Listed field by field on purpose: the artifact is read above and deliberately left behind.
      results: revision.results.map(result => ({
        id: result.id, status: result.status, configurationId: result.configurationId,
        configurationFingerprint: result.configurationFingerprint, sourceManifestFingerprint: result.sourceManifestFingerprint,
        producedAt: result.producedAt, createdAt: result.createdAt, supersededBy: result.supersededBy,
        isCurrent: result.isCurrent, standing: standing(result),
      })),
    })),
    difference,
  };
}

/** The RPC checks project access; the history never crosses a tenant boundary. */
export async function loadProjectRevisionHistory(client: SupabaseClient<Database>, projectId: string) {
  const {data, error} = await client.rpc("read_project_revision_history_v1", {p_project_id: projectId});
  return error ? null : parseProjectRevisionHistory(data, projectId);
}
