import {describe, expect, it, vi} from "vitest";
import {fingerprintJson} from "@offroad/case-understanding";
import {documentWorkProductSchema} from "@offroad/domain-contracts";
import {syntheticDocumentWorkProduct} from "@offroad/testing-fixtures/document-work-product";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database} from "@/types/database";
import {loadDocumentWorkProduct} from "./document-work-product-reader";

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const organizationId = id(1), projectId = id(2), sessionId = id(3), jobId = id(4), runId = id(5);
const binding = {projectId, jobId, briefId: id(6), planId: id(7), version: 1, objective: "Prepare the meeting", proposedDeliverable: "Meeting briefing", inputFingerprint: "a".repeat(64), requestFingerprint: "a".repeat(64)};
const product = documentWorkProductSchema.parse(syntheticDocumentWorkProduct);
const {fingerprint: _fingerprint, ...unsigned} = product;
void _fingerprint;
product.fingerprint = fingerprintJson(unsigned);
const reference = {id: id(8), fingerprint: "e".repeat(64), input_fingerprint: "f".repeat(64)};
const state = {fingerprint: reference.input_fingerprint, manifestFingerprint: reference.fingerprint, documentWorkProduct: {binding, product}};
const session = {id: sessionId, current_run_id: runId, updated_at: "2026-09-08T12:05:00Z", result_summary: {case_state: state, case_manifest: reference}};
const manifest = {processing_run_id: runId, created_at: "2026-09-08T12:05:00Z", manifest_fingerprint: reference.fingerprint, input_fingerprint: reference.input_fingerprint};
const job = {id: jobId, status: "succeeded", created_at: "2026-09-08T12:03:00Z"};
const source = {id: product.sources[0].documentId, document_version: 1, sha256: product.sources[0].hash, processing_status: "ready"};
type Query = {table: string; calls: Array<[string, ...unknown[]]>};
function db(change: Record<string, unknown> = {}, failedTable?: string) {
  const data = {document_intake_sessions: session, case_artifact_manifests: manifest, processing_jobs: [job], source_documents: [source], ...change} as Record<string, unknown>;
  const queries: Query[] = [];
  let sessionReads = 0;
  const rpc = vi.fn().mockResolvedValueOnce({data: change.binding ?? binding, error: failedTable === "rpc" ? {} : null}).mockResolvedValueOnce({data: change.freshBinding ?? binding, error: null});
  const client = {rpc, from(table: string) {
    const record: Query = {table, calls: []}; queries.push(record);
    const value = table === "document_intake_sessions" && sessionReads++ > 0 ? (change.freshSession ?? session) : data[table];
    const result = {data: value, error: failedTable === table ? {} : null};
    const query: Record<string, unknown> = {};
    for (const method of ["select", "eq", "order", "limit"]) query[method] = (...args: unknown[]) => {record.calls.push([method, ...args]); return query;};
    query.maybeSingle = () => Promise.resolve(result);
    query.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
    return query;
  }} as unknown as SupabaseClient<Database>;
  return {client, queries, rpc};
}
const load = (client: SupabaseClient<Database>) => loadDocumentWorkProduct(client, organizationId, projectId);

describe("document work product reader", () => {
  it("scopes every query to the organization and exact project/session/run and checks binding twice", async () => {
    const mock = db();
    expect(await load(mock.client)).toEqual({product, binding, publishedAt: manifest.created_at});
    for (const query of mock.queries) expect(query.calls).toContainEqual(["eq", "organization_id", organizationId]);
    expect(mock.queries[0].calls).toContainEqual(["eq", "capital_project_id", projectId]);
    for (const query of mock.queries.filter(q => ["case_artifact_manifests", "processing_jobs", "source_documents"].includes(q.table))) expect(query.calls).toContainEqual(["eq", "intake_session_id", sessionId]);
    const jobs = mock.queries.find(q => q.table === "processing_jobs")!;
    expect(jobs.calls).toContainEqual(["eq", "processing_run_id", runId]);
    expect(jobs.calls).toContainEqual(["eq", "kind", "case_analysis"]);
    expect(jobs.calls).toContainEqual(["order", "created_at", {ascending: false}]);
    expect(jobs.calls).toContainEqual(["limit", 1]);
    expect(mock.queries.at(-1)?.calls).toContainEqual(["eq", "id", sessionId]);
    expect(mock.rpc).toHaveBeenCalledTimes(2);
    expect(mock.rpc).toHaveBeenNthCalledWith(1, "read_advisor_document_work_binding_v1", {p_project_id: projectId, p_job_id: jobId});
  });
  it.each([
    ["different project binding", {document_intake_sessions: {...session, result_summary: {...session.result_summary, case_state: {...state, documentWorkProduct: {product, binding: {...binding, projectId: id(20)}}}}}}],
    ["changed approved version", {binding: {...binding, version: 2}}],
    ["changed approval during reads", {freshBinding: {...binding, version: 2}}],
    ["changed source version", {source_documents: [{...source, document_version: 2}]}],
    ["changed source hash", {source_documents: [{...source, sha256: "9".repeat(64)}]}],
    ["unfinished source", {source_documents: [{...source, processing_status: "processing"}]}],
    ["missing source", {source_documents: []}],
    ["wrong run manifest", {case_artifact_manifests: {...manifest, processing_run_id: id(20)}}],
    ["wrong manifest fingerprint", {case_artifact_manifests: {...manifest, manifest_fingerprint: "9".repeat(64)}}],
    ["older manifest than latest job", {case_artifact_manifests: {...manifest, created_at: "2026-09-08T12:00:00Z"}}],
    ["newer job in same run", {processing_jobs: [{...job, id: id(20)}]}],
    ["unfinished job", {processing_jobs: [{...job, status: "leased"}]}],
    ["changed session run during reads", {freshSession: {...session, current_run_id: id(20)}}],
    ["changed session timestamp during reads", {freshSession: {...session, updated_at: "2026-09-08T12:06:00Z"}}],
  ])("rejects %s", async (_name, change) => {expect(await load(db(change).client)).toBeNull();});
  it("rejects tampered persisted prose before secondary reads", async () => {
    const mock = db({document_intake_sessions: {...session, result_summary: {...session.result_summary, case_state: {...state, documentWorkProduct: {binding, product: {...product, gaps: []}}}}}});
    expect(await load(mock.client)).toBeNull();
    expect(mock.queries).toHaveLength(1);
  });
  it.each(["document_intake_sessions", "case_artifact_manifests", "processing_jobs", "source_documents", "rpc"])("fails closed on %s error", async table => {expect(await load(db({}, table).client)).toBeNull();});
});
