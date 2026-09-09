import {describe, expect, it, vi} from "vitest";
import {capitalProjectPlanSnapshot} from "@offroad/work-plan";
import {processExecutionBriefProposalJob} from "./execution-brief-proposal";
import {claimedJobSchema, type ExecutionBriefProposalJob} from "./queue";

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const job: ExecutionBriefProposalJob = {claimed: true, kind: "execution_brief_proposal", job_id: id(1), capability_token: "a".repeat(40), lease_expires_at: "2026-09-08T00:00:00Z", attempt: 1, organization_id: id(2), intake_session_id: id(3), processing_run_id: id(4), payload: {approval_target_job_id: id(5), locale: "pt-BR"}};
function context(access_basis = "authorized_private") {
  return {target_kind: "case_analysis", input_fingerprint: "f".repeat(64), target_job_id: id(5), locale: "pt-BR", project: {entry_job: "structure_from_documents", id: id(6), name: "Company", access_basis}, objective: "Revisar posição de liquidez e próximos caminhos", documents: [{id: id(7), name: "Budget.xlsx"}], plan: capitalProjectPlanSnapshot("structure_from_documents")};
}
function queue(value: unknown) {return {loadExecutionBriefProposal: vi.fn().mockResolvedValue(value), recordExecutionBriefProposal: vi.fn().mockResolvedValue({status: "proposed"}), fail: vi.fn()};}
describe("execution brief proposal", () => {
  it("does not activate new documentary planning by default", async()=>{
    const q=queue({...context(),plan:null,objective:"Compare propostas em leitura documental preliminar"});
    expect(await processExecutionBriefProposalJob(job,q)).toEqual({status:"proposed"});
    expect(q.recordExecutionBriefProposal.mock.calls[0]![1].planVersion).not.toMatch(/^document-work-plan.v1:/);
  });
  it("compiles a separate approved documentary plan only for explicit bounded new work", async () => {
    const q=queue({...context(),plan:null,objective:"Compare as propostas em uma leitura documental preliminar, sem cálculos."});
    expect(await processExecutionBriefProposalJob(job,q,{documentaryWorkEnabled:true})).toEqual({status:"proposed"});
    const [,internal,, ,plan]=q.recordExecutionBriefProposal.mock.calls[0]!;
    expect(internal.planVersion).toMatch(/^document-work-plan.v1:/);
    expect(plan.taskSpecs.map((task:{id:string})=>task.id)).toEqual(["Q01","Q02","Q03"]);
    expect(internal.executionMode).toBe("confirm_before_expensive_work");
    expect(internal.workstreams.flatMap((w:{sourceTaskIds:string[]})=>w.sourceTaskIds)).toEqual(["Q01","Q02","Q03"]);
  });
  it("does not replace an existing financial plan or classify a calculation as documentary", async () => {
    for(const value of [{...context(),objective:"Compare propostas em leitura documental preliminar"},{...context(),plan:null,objective:"Compare propostas em leitura documental e calcule o CET"}]) {
      const q=queue(value);expect(await processExecutionBriefProposalJob(job,q,{documentaryWorkEnabled:true})).toEqual({status:"proposed"});
      expect(q.recordExecutionBriefProposal.mock.calls[0]![1].planVersion).not.toMatch(/^document-work-plan.v1:/);
    }
  });
  it("claims the distinct planning kind and rejects a missing immutable target", () => {
    expect(claimedJobSchema.parse(job).kind).toBe("execution_brief_proposal");
    expect(claimedJobSchema.safeParse({...job, payload: {locale: "pt-BR"}}).success).toBe(false);
  });
  it("records only a consent-requiring proposal, preserving private sources and leaving dispatch to SQL", async () => {
    const q = queue(context());
    expect(await processExecutionBriefProposalJob(job, q)).toEqual({status: "proposed"});
    expect(q.recordExecutionBriefProposal).toHaveBeenCalledOnce();
    expect(q.recordExecutionBriefProposal.mock.calls[0]![3]).toBe("f".repeat(64));
    const [, internal, visible] = q.recordExecutionBriefProposal.mock.calls[0]!;
    expect(internal.authority.evidenceRegime).toBe("private");
    expect(visible.executionMode).not.toBe("start_after_display");
    expect(internal.sources ?? internal.currentContext).toBeDefined();
    expect(JSON.stringify(visible)).not.toContain('"informationClass":"public"');
    expect(q.fail).not.toHaveBeenCalled();
  });
  it("uses the canonical company independently of the project label and preserves the declared objective", async () => {
    const source = context("public_information");
    const objective = "Analisar a dívida e a capacidade financeira de Companhia Pública Exemplo";
    const q = queue({...source, objective, project: {...source.project, entry_job: "company_debt_view", name: "Projeto Dívida 123", company_name: "Companhia Pública Exemplo"}, documents: [], plan: capitalProjectPlanSnapshot("company_debt_view")});
    expect(await processExecutionBriefProposalJob(job, q)).toEqual({status: "proposed"});
    const visible = q.recordExecutionBriefProposal.mock.calls[0]![2];
    expect(visible.objective).toBe(objective);
    expect(JSON.stringify(visible.workstreams)).toContain("Companhia Pública Exemplo");
    expect(JSON.stringify(visible.workstreams)).not.toContain("Projeto Dívida 123");
  });
  it("keeps missing private documents as a request instead of claiming availability", async () => {
    const q = queue({...context(), documents: []});
    expect(await processExecutionBriefProposalJob(job, q)).toEqual({status: "proposed"});
    const internal = q.recordExecutionBriefProposal.mock.calls[0]![1];
    const documents = internal.workstreams.flatMap((stream: {sources: Array<{role: string; status: string}>}) => stream.sources).filter((source: {role: string}) => source.role === "provided_documents");
    expect(documents.length).toBeGreaterThan(0);
    expect(documents.every((source: {status: string}) => source.status === "to_request")).toBe(true);
  });
  it("preserves public scope without claiming public research has already happened", async () => {
    const q = queue({...context("public_information"), documents: [], plan: capitalProjectPlanSnapshot("company_debt_view")});
    expect(await processExecutionBriefProposalJob(job, q)).toEqual({status: "proposed"});
    const [, internal, visible] = q.recordExecutionBriefProposal.mock.calls[0]!;
    expect(internal.authority.evidenceRegime).toBe("public");
    expect(visible.executionMode).toBe("confirm_before_expensive_work");
    const publicSources = internal.workstreams.flatMap((stream: {sources: Array<{informationClass: string; status: string}>}) => stream.sources).filter((source: {informationClass: string}) => source.informationClass === "public");
    expect(publicSources.length).toBeGreaterThan(0);
    expect(publicSources.every((source: {status: string}) => source.status === "to_research")).toBe(true);
  });
  it("rejects context for a different held job before recording anything", async () => {
    const q = queue({...context(), target_job_id: id(99)});
    expect(await processExecutionBriefProposalJob(job, q)).toEqual({status: "failed"});
    expect(q.recordExecutionBriefProposal).not.toHaveBeenCalled();
    expect(q.fail).toHaveBeenCalledOnce();
  });
  it("bootstraps only a missing case plan with the existing canonical compiler", async () => {
    const q = queue({...context(), plan: null});
    expect(await processExecutionBriefProposalJob(job, q)).toEqual({status: "proposed"});
    expect(q.recordExecutionBriefProposal.mock.calls[0]![4]).toEqual(capitalProjectPlanSnapshot("structure_from_documents"));
    const existing = queue(context()); await processExecutionBriefProposalJob(job, existing);
    expect(existing.recordExecutionBriefProposal.mock.calls[0]![4]).toBeNull();
    const capital = queue({...context(), target_kind: "capital_project_analysis", plan: null});
    expect(await processExecutionBriefProposalJob(job, capital)).toEqual({status: "failed"});
    expect(capital.recordExecutionBriefProposal).not.toHaveBeenCalled();
  });
  it("supports the existing preview work product without changing its task graph", async () => {
    const canonical = capitalProjectPlanSnapshot("origination_thesis");
    const plan = {...canonical, taskSpecs: [{id: "C05", dependencies: [], effect: "propose_state"}, {id: "A03", dependencies: ["C05"], effect: "propose_state"}]};
    const q = queue({...context("public_information"), plan: {...plan, job: {...plan.job, firstWorkProduct: "preview_meeting_brief"}}});
    const outcome = await processExecutionBriefProposalJob(job, q);
    expect(q.fail.mock.calls).toEqual([]);
    expect(outcome).toEqual({status: "proposed"});
    expect(q.recordExecutionBriefProposal.mock.calls[0]![2].proposedDeliverable).toContain("em validação");
    expect(q.recordExecutionBriefProposal.mock.calls[0]![2].workstreams).toHaveLength(2);
  });
  it("retries transient transport failures with the same bounded planning job", async () => {
    const q = queue(context()); q.loadExecutionBriefProposal.mockRejectedValue(new Error("fetch failed: ECONNRESET"));
    await processExecutionBriefProposalJob(job, q);
    expect(q.fail.mock.calls[0]![0]).toBe(job);
    expect(q.fail.mock.calls[0]![2]).toEqual({retryable: true});
    expect(q.recordExecutionBriefProposal).not.toHaveBeenCalled();
    const exhausted = queue(context()); exhausted.loadExecutionBriefProposal.mockRejectedValue(new Error("fetch failed: ECONNRESET"));
    await processExecutionBriefProposalJob({...job, attempt: 3}, exhausted);
    expect(exhausted.fail.mock.calls[0]![2]).toEqual({retryable: false});
  });
  it("gives two dispatches distinct fingerprints without changing visible economic content", async () => {
    const q1 = queue(context()); const q2 = queue({...context(), target_job_id: id(8)});
    await processExecutionBriefProposalJob(job, q1);
    await processExecutionBriefProposalJob({...job, payload: {...job.payload, approval_target_job_id: id(8)}}, q2);
    const first = q1.recordExecutionBriefProposal.mock.calls[0]![2]; const second = q2.recordExecutionBriefProposal.mock.calls[0]![2];
    expect(first.fingerprint).not.toBe(second.fingerprint);
    expect({...first, fingerprint: null}).toEqual({...second, fingerprint: null});
  });
});

// Synthetic explicitly reviewed company input; no real document or user data.
function reviewedSectorInputs() {
  return {schema_version: "governed-sector-context-inputs.v1", as_of: "2026-09-08", sources: [], candidates: [{
    id: "10000000-0000-4000-8000-000000000080", field_path: "company.revenue_model", normalized_value: "merchant",
    review_state: "edited", is_primary: true, reviewed_by: "10000000-0000-4000-8000-000000000081", reviewed_at: "2026-09-08T00:00:00Z",
    entity_name: null, entity_scope: "company", period_start: null, period_end: null,
    source_anchor: {}, anchor_verified: null, extraction_method: "user_entry", processing_run_id: null,
    source_document_id: null, extraction_document_version: null, extraction_source_sha256: null,
  }]};
}

it("persists reviewed sector planning in both proposal snapshots without changing executable work", async () => {
  const original = queue(context());
  const enriched = queue({...context(), governed_sector_context_inputs: reviewedSectorInputs()});
  expect(await processExecutionBriefProposalJob(job, original)).toEqual({status: "proposed"});
  expect(await processExecutionBriefProposalJob(job, enriched)).toEqual({status: "proposed"});
  const [, priorInternal, priorVisible] = original.recordExecutionBriefProposal.mock.calls[0]!;
  const [, internal, visible, expectedInput] = enriched.recordExecutionBriefProposal.mock.calls[0]!;
  expect(priorInternal).not.toHaveProperty("planningContext");
  expect(priorVisible).not.toHaveProperty("planningContext");
  expect(internal.planningContext).toEqual(visible.planningContext);
  expect(visible.planningContext).toMatchObject({mode: "planning_only", objects: [{attributes: [{value: "Exposição ao mercado", status: "confirmed", sources: [{basis: "user_review"}]}]}]});
  expect(visible.planningContext.objects[0].requirements.length).toBeGreaterThan(0);
  expect(internal.workstreams).toEqual(priorInternal.workstreams);
  expect(visible.workstreams).toEqual(priorVisible.workstreams);
  expect(visible.fingerprint).not.toBe(priorVisible.fingerprint);
  expect(expectedInput).toBe("f".repeat(64));
});

it("records open reviewed business descriptions in revised proposals without granting new executable work", async () => {
  const inputs = reviewedSectorInputs();
  inputs.candidates[0]!.field_path = "company.business_model";
  inputs.candidates[0]!.normalized_value = "Vehicle leasing and fleet services";
  const source = {...context(), objective: "Analisar a companhia e seus riscos de crédito"};
  const baseline = queue(source);
  const first = queue({...source, governed_sector_context_inputs: inputs});
  expect(await processExecutionBriefProposalJob(job, baseline)).toEqual({status: "proposed"});
  expect(await processExecutionBriefProposalJob(job, first)).toEqual({status: "proposed"});
  const [, original] = baseline.recordExecutionBriefProposal.mock.calls[0]!;
  const [, internal, visible] = first.recordExecutionBriefProposal.mock.calls[0]!;
  expect(internal.planningContext).toEqual(visible.planningContext);
  expect(visible.planningContext).toMatchObject({mode: "planning_only", objects: [{attributes: [{value: "Vehicle leasing and fleet services", status: "confirmed", sources: [{basis: "user_review"}]}]}]});
  expect(internal.workstreams).toEqual(original.workstreams);
  expect(internal.authority).toEqual(original.authority);
  expect(visible.executionMode).toBe("confirm_before_expensive_work");
  const revisedInputs = structuredClone(inputs);
  revisedInputs.candidates[0]!.normalized_value = "Vehicle leasing and used fleet sales";
  const revised = queue({...source, governed_sector_context_inputs: revisedInputs});
  expect(await processExecutionBriefProposalJob(job, revised)).toEqual({status: "proposed"});
  const [, nextInternal, nextVisible] = revised.recordExecutionBriefProposal.mock.calls[0]!;
  expect(nextInternal.planningContext).toEqual(nextVisible.planningContext);
  expect(nextVisible.planningContext.contextFingerprint).not.toBe(visible.planningContext.contextFingerprint);
  expect(nextVisible.planningContext.planFingerprint).not.toBe(visible.planningContext.planFingerprint);
  expect(nextVisible.fingerprint).not.toBe(visible.fingerprint);
  expect(nextInternal.workstreams).toEqual(internal.workstreams);
  expect(first.fail).not.toHaveBeenCalled();
  expect(revised.fail).not.toHaveBeenCalled();
});

it("persists approved scope identity with bounded display for long names and many sources", async () => {
  const sources = Array.from({length: 40}, (_, index) => ({
    sourceDocumentId: id(100 + index), documentVersion: 1, contentKind: "document_layer" as const,
    sourceSha256: "a".repeat(64), contentSha256: "b".repeat(64), schemaVersion: "2026.08.28-v1" as const,
    fileName: "Synthetic long filename ".repeat(50),
  }));
  const primaryTape = {documentId: sources[0]!.sourceDocumentId, sheet: "Synthetic long sheet ".repeat(100), headerRow: 1};
  const confirmed = {
    state: "current", sourceManifest: {schemaVersion: "receivables-evidence-manifest.v1", fingerprint: "c".repeat(64), sources},
    candidates: [{...primaryTape, fileName: sources[0]!.fileName}],
    scope: {
      schemaVersion: "receivables-evidence-scope.v1", id: id(80), fingerprint: "d".repeat(64), sourceManifestFingerprint: "c".repeat(64),
      primaryTape, complementDocumentIds: sources.slice(1).map(source => source.sourceDocumentId),
      reportingDate: "2026-08-31", sourceRevisions: sources, confirmedBy: id(81), confirmedAt: "2026-09-08T00:00:00Z",
    },
  };
  const original = queue(context());
  await processExecutionBriefProposalJob(job, original);
  const scoped = queue({...context(), confirmed_receivables_scope: confirmed});
  expect(await processExecutionBriefProposalJob(job, scoped)).toEqual({status: "proposed"});
  expect(scoped.fail).not.toHaveBeenCalled();
  const [, internal, visible] = scoped.recordExecutionBriefProposal.mock.calls[0]!;
  const [, before] = original.recordExecutionBriefProposal.mock.calls[0]!;
  expect(internal.fingerprint).not.toBe(before.fingerprint);
  expect(internal.workstreams).toEqual(before.workstreams);
  expect(visible.assumptions).toEqual(internal.assumptions);
  expect(visible.assumptions).toHaveLength(1);
  expect(visible.assumptions[0].value.length).toBeLessThan(1000);
  expect(visible.assumptions[0].basis.length).toBeLessThan(1000);
  expect(JSON.parse(visible.assumptions[0].basis)).toMatchObject({scopeFingerprint: "d".repeat(64), reportingDate: "2026-08-31", selectedSourceCount: 40, primaryDocumentId: primaryTape.documentId});
});
