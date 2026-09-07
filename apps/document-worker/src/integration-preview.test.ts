import {createHash} from "node:crypto";

import {offroadHousePresentationTemplate} from "@offroad/case-export";
import {decisionArtifactContractSchema, decisionArtifactIdentityReport, renderedMaterialManifestSchema} from "@offroad/case-understanding";
import {case01, executors, preview} from "@offroad/credit-playbook";
import {describe, expect, it} from "vitest";

import {buildPreviewInformationRequestProjection, parsePremises, processIntegrationPreviewRunJob, routeIntegrationPreviewTurn, type PreviewStepOutput} from "./integration-preview";
import type {MaterialRenderInspector} from "./material-render-inspection";
import type {CapitalProjectAnalysisJob, QueueClient} from "./queue";

const ids = {
  job: "11111111-1111-4111-8111-111111111111",
  organization: "22222222-2222-4222-8222-222222222222",
  session: "33333333-3333-4333-8333-333333333333",
  run: "44444444-4444-4444-8444-444444444444",
  project: "55555555-5555-4555-8555-555555555555",
  plan: "66666666-6666-4666-8666-666666666666",
  brief: "77777777-7777-4777-8777-777777777777",
};
const steps = ["C05", "D07", "C09", "C10", "C07", "S07", "C08", "S10", "A01", "A02"];
type TestComposition = "prepare_meeting" | "prepare_material" | "change_premise" | "deepen" | "prepare_decision";
const stepsFor = (composition: TestComposition) => preview.previewStepsForComposition(composition).map((step) => step.taskId);

const previewJob = (composition: TestComposition, premises: Record<string, unknown> = {}): CapitalProjectAnalysisJob => ({
  claimed: true,
  job_id: ids.job,
  capability_token: "c".repeat(64),
  lease_expires_at: "2026-09-05T18:00:00.000Z",
  attempt: 1,
  organization_id: ids.organization,
  intake_session_id: ids.session,
  processing_run_id: ids.run,
  integration_preview: true,
  kind: "capital_project_analysis",
  payload: {
    analysis_scope: "integration_preview",
    locale: "pt-BR",
    capital_project_id: ids.project,
    capital_project_plan_id: ids.plan,
    capital_project_brief_id: ids.brief,
    capital_task_ids: stepsFor(composition),
    capital_artifact_required: true,
    trigger_event: {type: "advisor_semantic_route", mode: "integration_preview"},
    model_budget: {max_cost_usd: 0.01, max_calls: 1},
    preview: {mode: "integration_preview", composition, caseId: "gc01-analista-ib-camil", workflow: preview.previewWorkflowIdentity(composition), premises},
  },
});

type Recorded = {taskId: string; artifactType: string; inputFingerprint: string; content: Record<string, unknown>; id: string; artifactFingerprint: string};

function fakeQueue(input: {composition: TestComposition; premises?: Record<string, unknown>; request?: Record<string, unknown>; prior?: Recorded[]}) {
  const selectedSteps = stepsFor(input.composition);
  const recorded: Recorded[] = [];
  const started: string[] = [];
  const stages: Array<{stage: string; status: string}> = [];
  let completion: {content: string; artifactId: string; result: unknown} | null = null;
  let failure: unknown = null;
  let questionProjection: Record<string, unknown> | null = null;
  const storedMaterials: Array<{bytes: Uint8Array; contentSha256: string; format: string; mimeType: string}> = [];
  const runsByTask = new Map<string, string>();
  const queue = {
    writeStage: async (_job: unknown, stage: string, status: string) => { stages.push({stage, status}); },
    loadCapitalProjectContext: async () => ({
      mode: "integration_preview",
      preview: {mode: "integration_preview", composition: input.composition, caseId: "gc01-analista-ib-camil", workflow: preview.previewWorkflowIdentity(input.composition), premises: input.premises ?? {}},
      project: {id: ids.project, organization_id: ids.organization, project_name: "Reunião Camil", entry_job: "origination_thesis", access_basis: "public_information", current_phase: "understand"},
      session: {id: ids.session, locale: "pt-BR", company_profile: {name: "Camil Alimentos S.A."}},
      brief: {id: ids.brief, kind: "integration_preview", version: 1, content: {request: input.request ?? {turn: 1, audience: {primary: "vp", others: []}, form: "first_deliverable", pages: null, sponsorInstruction: "refinanciamento", undefinedAspects: ["thesis", "format"]}}, content_fingerprint: "b".repeat(64)},
      plan: {id: ids.plan, version: 2, fingerprint: "d".repeat(64)},
      tasks: selectedSteps.map((id, ordinal) => ({id, ordinal, batch: ordinal, label: id, dependencies: [], execution_class: "deterministic", effect: "propose_state", maturity_at_compile: "implemented"})),
      prior_artifacts: (input.prior ?? []).map((artifact) => ({task_id: artifact.taskId, id: artifact.id, artifact_type: artifact.artifactType, artifact_version: 1, artifact_fingerprint: artifact.artifactFingerprint, input_fingerprint: artifact.inputFingerprint, status: "draft", content: artifact.content})),
      recent_messages: [],
    }),
    startCapitalTask: async (_job: unknown, task: {taskId: string}) => { started.push(task.taskId); const id = `run-${task.taskId}`; runsByTask.set(task.taskId, id); return id; },
    recordCapitalProjectArtifact: async (_job: unknown, artifact: {taskRunId: string; artifactType: string; inputFingerprint: string; content: unknown; evidenceRefs?: Array<Record<string, unknown>>}) => {
      // The database refuses an evidence reference without sourceType and sourceId.
      for (const reference of artifact.evidenceRefs ?? []) {
        if (typeof reference.sourceType !== "string" || typeof reference.sourceId !== "string") throw new Error("capital_project_artifact_evidence_invalid");
      }
      const taskId = artifact.taskRunId.replace("run-", "");
      const artifactFingerprint = createHash("sha256").update(JSON.stringify(artifact.content)).digest("hex");
      const id = `00000000-0000-4000-8000-${String(recorded.length + 10).padStart(12, "0")}`;
      recorded.push({taskId, artifactType: artifact.artifactType, inputFingerprint: artifact.inputFingerprint, content: artifact.content as Record<string, unknown>, id, artifactFingerprint});
      return {id, artifactFingerprint, artifactVersion: 1, replayed: false};
    },
    storeCapitalProjectMaterial: async (_job: unknown, material: {bytes: Uint8Array; contentSha256: string; format: string; mimeType: string}) => {
      storedMaterials.push(material);
      return {
        objectPath: `${ids.organization}/${ids.project}/materials/${material.contentSha256}.${material.format}`,
        storageEtag: `etag-${material.contentSha256}`,
        replayed: false,
      };
    },
    finishCapitalTask: async () => "finished",
    syncProjectInformationRequests: async (_job: unknown, projection: unknown) => {
      questionProjection = projection as Record<string, unknown>;
      return {openCount: ((questionProjection.requests as unknown[]) ?? []).length, preservedClosedCount: 0, supersededCount: 0};
    },
    completeIntegrationPreviewRun: async (_job: unknown, value: {content: string; artifactId: string; result: unknown}) => { completion = value; return {replayed: false}; },
    fail: async (_job: unknown, error: unknown) => { failure = error; },
  } as unknown as QueueClient;
  return {queue, recorded, started, stages, storedMaterials, completion: () => completion, failure: () => failure, questionProjection: () => questionProjection};
}

describe("integration_preview governed questions", () => {
  it("preserves the planner's stable key and adds useful choices only when the workflow defines them", () => {
    const projection = buildPreviewInformationRequestProjection({
      projectId: ids.project,
      locale: "pt-BR",
      projectionRef: "preview_meeting_brief:abc",
      questions: [
        {id: "q-angle", text: "Refinanciamento ou alternativas mais amplas?", changes_the_work: "define o universo de alternativas"},
        {id: "q-custom", text: "Qual caixa mínimo deve ser preservado?", changes_the_work: "altera a capacidade de dívida"},
      ],
    });
    expect(projection.requests[0]).toMatchObject({
      requirementKey: "q-angle",
      answerKind: "choice",
      choices: ["Refinanciamento como foco principal", "Alternativas de estrutura de capital mais amplas"],
    });
    expect(projection.requests[1]).toMatchObject({requirementKey: "q-custom", answerKind: "text", choices: []});
  });
});

describe("integration_preview turn router", () => {
  const base = {locale: "pt-BR" as const, recentMessages: [], runActive: false, priorOutputs: new Map<string, PreviewStepOutput>(), entryJob: "origination_thesis"};
  it("starts the analysis on the first turn and names the three points to align with the VP, with zero model calls", () => {
    const decision = routeIntegrationPreviewTurn({...base, message: "Sou analista no time de Investment Banking. Meu VP me pediu para preparar material para uma reunião com a Camil na segunda. Ele falou em refinanciamento, mas não disse que tese quer levar nem que formato espera.", artifactTypes: []});
    expect(decision.kind).toBe("activate");
    expect(decision.activation?.composition).toBe("prepare_meeting");
    expect(decision.activation?.plan.taskSpecs).toHaveLength(9);
    expect(decision.activation?.plan.taskSpecs.every((task) => task.maturity === "implemented")).toBe(true);
    // Every turn compiles its own plan: a plan that already holds runs is never reactivated.
    const later = routeIntegrationPreviewTurn({...base, message: "Vamos preparar a reunião com a Camil: refinanciamento.", artifactTypes: [], messageId: "10000000-0000-4000-8000-000000000077"});
    expect(later.activation?.plan.turn).toEqual({messageId: "10000000-0000-4000-8000-000000000077"});
    expect(decision.activation?.plan.turn).toBeUndefined();
    expect(decision.reply).toContain("[Validação interna, integration_preview]");
    expect(decision.reply).toMatch(/\(1\) leitura de refinanciamento/);
  });
  it("prepares the material when asked, with the pages and the audience the sentence states", () => {
    const decision = routeIntegrationPreviewTurn({...base, message: "Vamos preparar o material: meu VP quer três páginas de pitch, situação atual, alternativas e impacto nos indicadores.", artifactTypes: ["preview_debt_ledger", "preview_alternatives"]});
    expect(decision.kind).toBe("activate");
    expect(decision.activation?.composition).toBe("prepare_material");
    expect(decision.activation?.brief.request.pages).toBe(3);
    expect(decision.activation?.brief.request.audience?.primary).toBe("vp");
    expect(decision.activation?.brief.request.form).toBe("pitch_pages");
  });
  it("changes only the premises the sentence states", () => {
    expect(parsePremises("Considere taxa de 15,50% a.a. e prazo de 7 anos com carência de 24 meses")).toEqual({newDebtAnnualRate: "0.155", newDebtTermMonths: 84, newDebtGraceMonths: 24});
    expect(parsePremises("Assuma CDI + 1,50% para a nova dívida")).toEqual({newDebtAnnualRate: "0.1475"});
    expect(parsePremises("Altere o prazo para 60 meses")).toEqual({newDebtTermMonths: 60});
    const decision = routeIntegrationPreviewTurn({...base, message: "Altere a taxa da nova dívida para 15,50% a.a.", artifactTypes: ["preview_alternatives"]});
    expect(decision.kind).toBe("activate");
    expect(decision.activation?.composition).toBe("change_premise");
    expect(decision.activation?.brief.premises).toEqual({newDebtAnnualRate: "0.155"});
    const unrecognised = routeIntegrationPreviewTurn({...base, message: "Mude a premissa de crescimento", artifactTypes: ["preview_alternatives"]});
    expect(unrecognised.kind).toBe("converse");
  });
  it("answers where a number came from out of the fingerprint-governed covenant object", () => {
    const covenants = executors.reconcileCovenantDefinitions(case01.case01Evidence()["reconcile-covenant-definitions"]) as unknown as PreviewStepOutput;
    const decision = routeIntegrationPreviewTurn({...base, message: "De onde saiu essa alavancagem de 4,7x?", artifactTypes: ["preview_alternatives"], priorOutputs: new Map([["C09", covenants]])});
    expect(decision.kind).toBe("answer");
    expect(decision.reply).toContain("reconcile-covenant-definitions");
    expect(decision.reply).toMatch(/deb-11|deb-13|deb-14|deb-15/);
  });
  it("waits while a run is active and converses when nothing else applies", () => {
    expect(routeIntegrationPreviewTurn({...base, message: "E agora?", artifactTypes: ["preview_alternatives"], runActive: true}).kind).toBe("wait");
    expect(routeIntegrationPreviewTurn({...base, message: "Obrigado.", artifactTypes: ["preview_alternatives"]}).kind).toBe("converse");
  });
  it("recompiles an explicit plan-control edit even when the prose is not a router keyword", () => {
    const decision = routeIntegrationPreviewTurn({...base,
      message: "Quero que a comparação deixe flexibilidade antes de custo e retire o bloco de rating.",
      artifactTypes: ["preview_alternatives"],
      planEditRequested: true,
    });
    expect(decision.kind).toBe("activate");
    expect(decision.activation?.composition).toBe("deepen");
    expect(decision.activation?.brief.request.sponsorInstruction).toContain("retire o bloco de rating");
    expect(decision.reply).toContain("Ajuste recebido sobre a versão exibida");
  });
  it("binds a governed answer to the exact open question without parsing the prose", () => {
    const decision = routeIntegrationPreviewTurn({...base,
      message: "Leve uma leitura de alternativas mais ampla, mas destaque refinanciamento.",
      artifactTypes: ["preview_alternatives"],
      answeredQuestion: {id: "q-thesis", text: "Qual tese o VP quer levar?"},
    });
    expect(decision.kind).toBe("activate");
    expect(decision.activation?.composition).toBe("deepen");
    expect(decision.activation?.brief.answers).toEqual([{questionId: "q-thesis", answer: "Leve uma leitura de alternativas mais ampla, mas destaque refinanciamento."}]);
    expect(decision.reply).toContain("Resposta vinculada à pergunta em aberto");
  });
});

describe("integration_preview run processor", () => {
  it("runs the nine-step meeting slice, records its methods and one cross-surface decision contract", async () => {
    const fake = fakeQueue({composition: "prepare_meeting"});
    const outcome = await processIntegrationPreviewRunJob(previewJob("prepare_meeting"), {queue: fake.queue});
    expect(fake.failure(), JSON.stringify(fake.failure())).toBeNull();
    expect(outcome.status).toBe("succeeded");
    expect(fake.started).toEqual(steps.slice(0, 9));
    expect(fake.recorded.map((artifact) => artifact.artifactType)).toEqual(["preview_debt_ledger", "preview_financial_statements", "preview_covenants", "preview_maturity_wall", "preview_interest_schedule", "preview_exit_costs", "preview_scenarios", "preview_alternatives", "preview_meeting_brief", "preview_decision_contract"]);
    for (const artifact of fake.recorded.filter((candidate) => candidate.artifactType !== "preview_decision_contract")) {
      expect((artifact.content.preview as {mode: string}).mode).toBe("integration_preview");
      expect((artifact.content.preview as {methodMaturity: string}).methodMaturity).toBe("implemented");
      expect(typeof (artifact.content.output as {state: string}).state).toBe("string");
    }
    const decisionArtifact = fake.recorded.find((artifact) => artifact.artifactType === "preview_decision_contract")!;
    const contract = decisionArtifactContractSchema.parse(decisionArtifact.content.contract);
    expect(decisionArtifactIdentityReport(contract).valid).toBe(true);
    expect(contract.release).toEqual({state: "internal_only", recipientIds: []});
    expect(contract.claims).toEqual(expect.arrayContaining([
      expect.objectContaining({id: "claim-gross-debt", value: "5670186"}),
      expect.objectContaining({id: "claim-peak-maturity-amount", value: "1229828"}),
      expect.objectContaining({id: "claim-reported-leverage", value: "4.72", evidenceState: "mixed"}),
    ]));
    expect(contract.gaps).toEqual(expect.arrayContaining([
      expect.objectContaining({id: "gap-covenant-definition-and-headroom", materiality: "blocker"}),
      expect.objectContaining({id: "gap-forward-cash-generation", materiality: "blocker"}),
    ]));
    const completion = fake.completion()!;
    expect(completion.artifactId).toBe(fake.recorded.find((artifact) => artifact.artifactType === "preview_meeting_brief")!.id);
    expect(completion.content).toMatch(/^\[Validação interna, integration_preview\]/);
    expect(completion.content).toContain("Concluí a primeira leitura financeira");
    expect(completion.content).toContain("Dívida bruta contábil: R$");
    expect(completion.content).toContain("O que ainda muda a decisão");
    expect(completion.content).toContain("Para alinhar com o VP");
    expect(fake.questionProjection()).toMatchObject({
      schemaVersion: "project-information-request-projection.v1",
      sourceNamespace: "integration_preview",
      requests: expect.arrayContaining([expect.objectContaining({requirementKey: "q-angle"})]),
    });
    expect(fake.stages.filter((stage) => stage.stage.startsWith("integration_preview:") && stage.status === "succeeded")).toHaveLength(9);
  });
  it("runs the complete material slice when the requested outcome is a board decision", async () => {
    const fake = fakeQueue({
      composition: "prepare_decision",
      request: {turn: 1, audience: {primary: "conselho", others: []}, form: "board_deck", pages: null, sponsorInstruction: "avaliar a estrutura de capital", undefinedAspects: []},
    });
    const outcome = await processIntegrationPreviewRunJob(previewJob("prepare_decision"), {queue: fake.queue});
    expect(fake.failure(), JSON.stringify(fake.failure())).toBeNull();
    expect(outcome.status).toBe("succeeded");
    expect(fake.started).toEqual(steps);
    expect(fake.recorded.some((artifact) => artifact.artifactType === "preview_material")).toBe(true);
    expect(fake.recorded.at(-1)?.artifactType).toBe("preview_decision_contract");
    expect(fake.completion()?.content).toContain("Plano do material a partir dos objetos governados por fingerprint");
  });
  it("replays every unchanged step by fingerprint on a repeated run, and recomputes only the alternatives and the plan when a premise changes", async () => {
    const first = fakeQueue({composition: "prepare_meeting"});
    await processIntegrationPreviewRunJob(previewJob("prepare_meeting"), {queue: first.queue});
    const repeat = fakeQueue({composition: "deepen", prior: first.recorded});
    const outcome = await processIntegrationPreviewRunJob(previewJob("deepen"), {queue: repeat.queue});
    expect(repeat.failure(), JSON.stringify(repeat.failure())).toBeNull();
    expect(outcome.status).toBe("succeeded");
    // A replayed step is still a run of this turn's plan (the plan's dependency gate reads its own runs); no artifact is written.
    expect(repeat.started).toEqual(steps.slice(0, 9));
    expect(repeat.recorded).toEqual([]);
    expect(repeat.completion()?.content).toContain("[Validação interna, integration_preview]");
    const changed = fakeQueue({composition: "change_premise", premises: {newDebtAnnualRate: "0.155"}, prior: first.recorded});
    const changedOutcome = await processIntegrationPreviewRunJob(previewJob("change_premise", {newDebtAnnualRate: "0.155"}), {queue: changed.queue});
    expect(changedOutcome.status).toBe("succeeded");
    expect(changed.started).toEqual(steps.slice(0, 9));
    expect(changed.recorded.filter((artifact) => artifact.artifactType !== "preview_decision_contract").map((artifact) => artifact.taskId)).toEqual(["S10", "A01"]);
    expect(changed.completion()?.content).toContain("7 de 9 etapas replicaram");
    const alternatives = changed.recorded.find((artifact) => artifact.taskId === "S10")!;
    expect((alternatives.content.preview as {premisesApplied: unknown}).premisesApplied).toEqual({newDebtAnnualRate: "0.155"});
  });
  it("backfills the decision contract for an existing preview without recomputing unchanged method objects", async () => {
    const first = fakeQueue({composition: "prepare_meeting"});
    await processIntegrationPreviewRunJob(previewJob("prepare_meeting"), {queue: first.queue});
    const legacyArtifacts = first.recorded.filter((artifact) => artifact.artifactType !== "preview_decision_contract");
    const backfill = fakeQueue({composition: "deepen", prior: legacyArtifacts});
    const outcome = await processIntegrationPreviewRunJob(previewJob("deepen"), {queue: backfill.queue});
    expect(backfill.failure(), JSON.stringify(backfill.failure())).toBeNull();
    expect(outcome.status).toBe("succeeded");
    expect(backfill.recorded.map((artifact) => artifact.artifactType)).toEqual(["preview_decision_contract"]);
    expect(decisionArtifactContractSchema.parse(backfill.recorded[0]!.content.contract).claims).not.toHaveLength(0);
  });
  it("prepares the material on a later turn from fingerprint-governed objects, with a change note against the first readout", async () => {
    const first = fakeQueue({composition: "prepare_meeting"});
    await processIntegrationPreviewRunJob(previewJob("prepare_meeting"), {queue: first.queue});
    const material = fakeQueue({composition: "prepare_material", prior: first.recorded, request: {turn: 2, audience: {primary: "vp", others: ["companhia"]}, form: "pitch_pages", pages: 3, sponsorInstruction: "três páginas de pitch", undefinedAspects: []}});
    const outcome = await processIntegrationPreviewRunJob(previewJob("prepare_material"), {queue: material.queue});
    expect(material.failure(), JSON.stringify(material.failure())).toBeNull();
    expect(outcome.status).toBe("succeeded");
    expect(material.started).toEqual(steps);
    expect(material.recorded.filter((artifact) => !["preview_decision_contract", "preview_material_execution_status"].includes(artifact.artifactType)).map((artifact) => artifact.taskId)).toEqual(["A01", "A02"]);
    expect(material.completion()?.content).toContain("Plano do material");
    const brief = material.recorded.find((artifact) => artifact.artifactType === "preview_meeting_brief")!.content.output as {page_plan: {state: string; pages: unknown[]}};
    expect(brief.page_plan.state).toBe("proposed");
    expect(brief.page_plan.pages).toHaveLength(3);
    // A runner without the complete Office inspection suite may still finish the governed plan,
    // but must not claim that it created or stored a binary material.
    expect(material.storedMaterials).toEqual([]);
    expect(material.recorded.some((artifact) => artifact.artifactType === "preview_presentation_material" || artifact.artifactType === "preview_workbook_material")).toBe(false);
    expect(material.recorded.find((artifact) => artifact.artifactType === "preview_material_execution_status")?.content).toMatchObject({
      state: "unavailable",
      code: "governed_material_pipeline_unavailable",
      reason: "inspection_toolchain_unavailable",
      requestedFormats: ["pptx", "xlsx"],
      release: {state: "internal_only", recipientIds: []},
    });
    expect(material.completion()?.content).toContain("Os arquivos Office não foram criados");
    expect(material.stages).toContainEqual({stage: "integration_preview:materials", status: "succeeded"});
    const contract = decisionArtifactContractSchema.parse(material.recorded.at(-1)!.content.contract);
    expect(contract.views.find((view) => view.surface === "presentation")?.artifactFingerprint).toBeNull();
    expect(contract.views.find((view) => view.surface === "workbook")?.artifactFingerprint).toBeNull();
  });
  it("renders, inspects, stores and binds exact presentation and decision-workbook bytes when the suite is present", async () => {
    const first = fakeQueue({composition: "prepare_meeting"});
    await processIntegrationPreviewRunJob(previewJob("prepare_meeting"), {queue: first.queue});
    const material = fakeQueue({
      composition: "prepare_material",
      prior: first.recorded,
      request: {turn: 2, audience: {primary: "vp", others: ["companhia"]}, form: "pitch_pages", pages: 3, sponsorInstruction: "três páginas de pitch", undefinedAspects: []},
    });
    const inspected: Array<{format: string; sha256: string; byteLength: number}> = [];
    const inspector: MaterialRenderInspector = {
      inspect: async (input) => {
        expect(createHash("sha256").update(input.bytes).digest("hex")).toBe(input.contentSha256);
        inspected.push({format: input.format, sha256: input.contentSha256, byteLength: input.bytes.byteLength});
        return ({
        version: "2026.09.07-v1",
        source: {format: input.format, byteLength: input.bytes.byteLength, sha256: input.contentSha256},
        renderer: {id: "libreoffice", version: "test"},
        pdf: {byteLength: 999, sha256: "1".repeat(64), pageCount: 9},
        pages: [{pageNumber: 1, byteLength: 111, sha256: "2".repeat(64), widthPx: 1600, heightPx: 900}],
        renderabilityPassed: true,
        visualInspection: "awaiting_review",
        releaseEligible: false,
        inspectedAt: input.inspectedAt,
        receiptFingerprint: "3".repeat(64),
        });
      },
    };
    const outcome = await processIntegrationPreviewRunJob(previewJob("prepare_material"), {
      queue: material.queue,
      materialInspector: inspector,
      presentationTemplate: offroadHousePresentationTemplate,
      now: () => new Date("2026-09-07T12:00:00.000Z"),
    });
    expect(material.failure(), JSON.stringify(material.failure())).toBeNull();
    expect(outcome.status).toBe("succeeded");
    expect(inspected.map((item) => item.format)).toEqual(["pptx", "xlsx"]);
    expect(material.storedMaterials.map((item) => item.format)).toEqual(["pptx", "xlsx"]);
    expect(material.storedMaterials.every((item) => new TextDecoder().decode(item.bytes.slice(0, 2)) === "PK")).toBe(true);
    for (const stored of material.storedMaterials) {
      expect(createHash("sha256").update(stored.bytes).digest("hex")).toBe(stored.contentSha256);
      expect(inspected).toContainEqual({format: stored.format, sha256: stored.contentSha256, byteLength: stored.bytes.byteLength});
    }
    const presentationArtifact = material.recorded.find((artifact) => artifact.artifactType === "preview_presentation_material")!;
    const workbookArtifact = material.recorded.find((artifact) => artifact.artifactType === "preview_workbook_material")!;
    const presentationManifest = renderedMaterialManifestSchema.parse(presentationArtifact.content.manifest);
    const workbookManifest = renderedMaterialManifestSchema.parse(workbookArtifact.content.manifest);
    for (const manifest of [presentationManifest, workbookManifest]) {
      expect(manifest.storage.state).toBe("stored");
      expect(manifest.quality).toMatchObject({schemaValidated: true, numericIdentityPassed: true, visualInspection: "not_run", releaseEligible: false});
      expect(manifest.release.state).toBe("internal_only");
    }
    expect((workbookArtifact.content.rendererAudit as {decisionContractFingerprint: string}).decisionContractFingerprint).toBe(workbookManifest.decisionContractFingerprint);
    const contract = decisionArtifactContractSchema.parse(material.recorded.at(-1)!.content.contract);
    expect(contract.views.find((view) => view.surface === "presentation")).toMatchObject({
      artifactId: presentationManifest.id,
      artifactFingerprint: presentationManifest.contentSha256,
    });
    expect(contract.views.find((view) => view.surface === "workbook")).toMatchObject({
      artifactId: workbookManifest.id,
      artifactFingerprint: workbookManifest.contentSha256,
    });
  });
});
