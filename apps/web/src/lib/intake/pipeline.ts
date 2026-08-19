import type {SupabaseClient} from "@supabase/supabase-js";

import type {Database} from "@/types/database";

/**
 * Reads of the processing pipeline for the Documents tab and the processing screen
 * (P1 plan §12, F1-4).
 *
 * Two constraints from the schema shape everything here:
 *
 *   1. `processing_jobs` is granted to members **column by column** — `payload` is excluded
 *      on purpose, because it carries the short-lived signed URLs. A `select *` is rejected
 *      by Postgres, so every query below lists its columns explicitly.
 *   2. Runs and jobs are read-only for tenants. Progress is written by the worker through
 *      its commands; the UI only observes.
 */
export const processingJobColumns =
  "id, organization_id, processing_run_id, intake_session_id, source_document_id, kind, status, attempts, max_attempts, available_at, lease_expires_at, created_at, updated_at" as const;

export type PipelineStage = {
  stage: string;
  status: "started" | "succeeded" | "failed" | "skipped";
  at: string;
  jobId?: string;
  sourceDocumentId?: string;
  detail?: Record<string, unknown>;
};

export type PipelineRun = {
  id: string;
  runNo: number;
  trigger: string;
  status: "queued" | "running" | "succeeded" | "partial" | "failed" | "cancelled";
  pipelineVersion: string;
  stages: PipelineStage[];
  usage: Record<string, number>;
  error: Record<string, unknown> | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

export type PipelineJob = {
  id: string;
  sourceDocumentId: string | null;
  status: "queued" | "leased" | "succeeded" | "failed" | "poison" | "cancelled";
  attempts: number;
  maxAttempts: number;
  updatedAt: string;
};

export type DocumentProfileView = {
  id: string;
  sourceDocumentId: string;
  documentKind: string;
  title: string | null;
  entityName: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  fiscalYear: number | null;
  currency: string | null;
  informationClass: string;
  evidenceRank: number;
  confidence: number;
  suggestedFolder: string | null;
  suggestedName: string | null;
  reviewState: "proposed" | "accepted" | "edited" | "rejected";
  quality: Record<string, unknown>;
  summary: Record<string, unknown>;
};

export type PipelineView = {
  run: PipelineRun | null;
  jobs: PipelineJob[];
  profiles: DocumentProfileView[];
};

/**
 * The state of the current run of a session, plus the profiles proposed so far. Returns
 * empty rather than throwing when the session has never been processed: a session with no run
 * is a normal state, not an error.
 */
export async function loadPipelineView(
  supabase: SupabaseClient<Database>,
  input: {organizationId: string; sessionId: string},
): Promise<PipelineView> {
  const {data: runRow} = await supabase
    .from("processing_runs")
    .select("id, run_no, trigger, status, pipeline_version, stages, usage, error, started_at, completed_at, created_at")
    .eq("organization_id", input.organizationId)
    .eq("intake_session_id", input.sessionId)
    .order("run_no", {ascending: false})
    .limit(1)
    .maybeSingle();

  const run = runRow ? toRun(runRow) : null;

  const [jobsResult, profilesResult] = await Promise.all([
    run
      ? supabase
          .from("processing_jobs")
          .select(processingJobColumns)
          .eq("organization_id", input.organizationId)
          .eq("processing_run_id", run.id)
          .order("created_at", {ascending: true})
      : Promise.resolve({data: [] as never[]}),
    supabase
      .from("document_profiles")
      .select(
        "id, source_document_id, document_kind, title, entity_name, period_start, period_end, fiscal_year, currency, information_class, evidence_rank, confidence, suggested_folder, suggested_name, review_state, quality, summary",
      )
      .eq("organization_id", input.organizationId)
      .order("evidence_rank", {ascending: true}),
  ]);

  return {
    run,
    jobs: (jobsResult.data ?? []).map((row) => ({
      id: row.id,
      sourceDocumentId: row.source_document_id,
      status: row.status as PipelineJob["status"],
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      updatedAt: row.updated_at,
    })),
    profiles: (profilesResult.data ?? []).map(toProfile),
  };
}

function toRun(row: {
  id: string;
  run_no: number;
  trigger: string;
  status: string;
  pipeline_version: string;
  stages: unknown;
  usage: unknown;
  error: unknown;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}): PipelineRun {
  return {
    id: row.id,
    runNo: row.run_no,
    trigger: row.trigger,
    status: row.status as PipelineRun["status"],
    pipelineVersion: row.pipeline_version,
    stages: Array.isArray(row.stages) ? (row.stages as PipelineStage[]) : [],
    usage: isRecord(row.usage) ? (row.usage as Record<string, number>) : {},
    error: isRecord(row.error) ? (row.error as Record<string, unknown>) : null,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

function toProfile(row: {
  id: string;
  source_document_id: string;
  document_kind: string;
  title: string | null;
  entity_name: string | null;
  period_start: string | null;
  period_end: string | null;
  fiscal_year: number | null;
  currency: string | null;
  information_class: string;
  evidence_rank: number;
  confidence: number;
  suggested_folder: string | null;
  suggested_name: string | null;
  review_state: string;
  quality: unknown;
  summary: unknown;
}): DocumentProfileView {
  return {
    id: row.id,
    sourceDocumentId: row.source_document_id,
    documentKind: row.document_kind,
    title: row.title,
    entityName: row.entity_name,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    fiscalYear: row.fiscal_year,
    currency: row.currency,
    informationClass: row.information_class,
    evidenceRank: row.evidence_rank,
    confidence: Number(row.confidence),
    suggestedFolder: row.suggested_folder,
    suggestedName: row.suggested_name,
    reviewState: row.review_state as DocumentProfileView["reviewState"],
    quality: isRecord(row.quality) ? (row.quality as Record<string, unknown>) : {},
    summary: isRecord(row.summary) ? (row.summary as Record<string, unknown>) : {},
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The folders of the organised index, in the order a credit analyst reads them. */
export const documentFolderOrder = [
  "financial",
  "debt_and_collateral",
  "project_and_plan",
  "contracts",
  "institutional_and_corporate",
  "other",
] as const;

export type DocumentFolderId = (typeof documentFolderOrder)[number];

/**
 * Groups the proposed profiles into the folders the Documents tab shows. A document the
 * classifier could not place lands in `other` — visible and reviewable, never hidden.
 */
export function groupByFolder(profiles: readonly DocumentProfileView[]): {
  folder: DocumentFolderId;
  documents: DocumentProfileView[];
}[] {
  const buckets = new Map<DocumentFolderId, DocumentProfileView[]>();
  for (const folder of documentFolderOrder) buckets.set(folder, []);

  for (const profile of profiles) {
    const folder = (documentFolderOrder as readonly string[]).includes(profile.suggestedFolder ?? "")
      ? (profile.suggestedFolder as DocumentFolderId)
      : "other";
    buckets.get(folder)?.push(profile);
  }

  return documentFolderOrder
    .map((folder) => ({folder, documents: buckets.get(folder) ?? []}))
    .filter((group) => group.documents.length > 0);
}

/**
 * The stage timeline, collapsed to the latest state per stage so the screen shows one line
 * per step instead of a growing log. Order follows the pipeline, not the clock, so a retried
 * stage does not jump to the end.
 */
export const pipelineStageOrder = ["download", "gate", "parse", "store_layer", "profile", "usage"] as const;

export function collapseStages(stages: readonly PipelineStage[]): PipelineStage[] {
  const latest = new Map<string, PipelineStage>();
  for (const entry of stages) {
    const current = latest.get(entry.stage);
    if (!current || entry.at >= current.at) latest.set(entry.stage, entry);
  }

  const known = pipelineStageOrder.filter((stage) => latest.has(stage)).map((stage) => latest.get(stage)!);
  const extra = [...latest.values()].filter(
    (entry) => !(pipelineStageOrder as readonly string[]).includes(entry.stage),
  );
  return [...known, ...extra];
}

/** 0–1 progress for the whole run, used by the bar on the processing screen. */
export function runProgress(run: PipelineRun | null, jobs: readonly PipelineJob[]): number {
  if (!run) return 0;
  if (run.status === "succeeded") return 1;
  if (jobs.length === 0) return run.status === "queued" ? 0 : 0.1;

  const finished = jobs.filter((job) => job.status === "succeeded" || job.status === "failed" || job.status === "poison").length;
  return Math.min(0.99, finished / jobs.length);
}
