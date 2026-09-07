import {createHash, randomUUID} from "node:crypto";

import {describe, expect, it} from "vitest";

import {compileTaskGraph} from "./capital-jobs";
import * as packageApi from "./index";
import {
  assertTrustedObjectivePlan,
  compileObjectivePlan,
  expandObjectivePlanWithTaskTargets,
  type ObjectiveToPlanDecision,
} from "./objective-plan";
import {
  assertTrustedOutputTerminalResolution,
  createTestOnlyOutputTerminalAuthority,
  outputTerminalRequestSchema,
  outputTerminalResolutionStructuralSchema,
  revalidateSameProcessOutputTerminalResolution,
  resolveOutputTerminal,
  type OutputTerminalAuthorization,
  type OutputTerminalRequest,
  type ResolvedTerminalArtifactBinding,
  type TerminalAudience,
  type TerminalDeliveryFormat,
  type TerminalWorkProduct,
} from "./output-terminal";

const companyPlan = compileObjectivePlan({objectiveKind: "company_analysis", hasAttachments: true, existingProject: null});
const operationReviewPlan = compileObjectivePlan({objectiveKind: "operation_review", hasAttachments: true, existingProject: null});
const ids = {
  artifact: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  artifactVersion: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  organization: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  project: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
};

function request(
  workProducts: TerminalWorkProduct[],
  patch: Partial<Omit<OutputTerminalRequest, "schemaVersion" | "basePlan" | "workProducts">> & {basePlan?: ObjectiveToPlanDecision} = {},
): OutputTerminalRequest {
  const {basePlan = companyPlan, ...rest} = patch;
  return {
    schemaVersion: "output-terminal-request.v2",
    basePlan,
    workProducts: {value: workProducts, state: workProducts.length > 0 ? "explicit" : "unknown"},
    formats: {value: [], state: "unknown"},
    audience: {value: "requester", state: "explicit"},
    continuity: {value: "new", state: "explicit"},
    ...rest,
  };
}

type AuthorizationFixture = {
  confirmSelection?: boolean;
  confirmAudience?: boolean;
  artifactBindings?: readonly ResolvedTerminalArtifactBinding[];
};

function authorize(input: OutputTerminalRequest, options: AuthorizationFixture = {}) {
  return createTestOnlyOutputTerminalAuthority({
    selectionConfirmed: options.confirmSelection ?? true,
    audienceConfirmed: options.confirmAudience ?? true,
    trustedArtifactRegistryBindings: options.artifactBindings ?? [],
  }).attest(input);
}

function resolveConfirmed(
  products: TerminalWorkProduct[],
  patch: Parameters<typeof request>[1] = {},
  options: AuthorizationFixture = {},
) {
  const input = request(products, patch);
  return resolveOutputTerminal(input, authorize(input, options));
}

function binding(
  workProduct: TerminalWorkProduct,
  format: TerminalDeliveryFormat,
  patch: Partial<ResolvedTerminalArtifactBinding> = {},
): ResolvedTerminalArtifactBinding {
  return {
    workProduct,
    format,
    artifactId: ids.artifact,
    artifactVersionId: ids.artifactVersion,
    organizationId: ids.organization,
    projectId: ids.project,
    authorizationRef: "artifact-access/verified/1",
    ...patch,
  };
}

function expectNoExecutableGraph(resolution: ReturnType<typeof resolveOutputTerminal>) {
  expect(resolution).not.toHaveProperty("targetTaskIds");
  expect(resolution).not.toHaveProperty("taskGraph");
  expect(() => assertTrustedOutputTerminalResolution(resolution)).toThrow(/lacks an opaque trusted execution attestation/);
}

function withFingerprint<T extends Record<string, unknown>>(value: T): T & {fingerprint: string} {
  const {fingerprint: _ignored, ...core} = value;
  return {...core, fingerprint: createHash("sha256").update(stableJson(core)).digest("hex")} as T & {fingerprint: string};
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, nested: unknown) => nested && typeof nested === "object" && !Array.isArray(nested)
    ? Object.fromEntries(Object.entries(nested as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)))
    : nested);
}

function withObjectiveIdentity(plan: ObjectiveToPlanDecision): ObjectiveToPlanDecision {
  const identityPayload = {
    schemaVersion: "objective-plan.v1",
    objectiveKind: plan.objectiveKind,
    mode: plan.mode,
    entryJob: plan.entryJob,
    outputTerminal: plan.outputTerminal,
    targetTaskIds: plan.targetTaskIds,
    sourcePlan: plan.sourcePlan,
    analysisPlan: plan.analysisPlan,
    proposedDeliverable: plan.proposedDeliverable,
    requiredContext: plan.requiredContext,
  };
  return {...plan, structuralIdentity: createHash("sha256").update(JSON.stringify(identityPayload)).digest("hex")};
}

describe("output terminal resolver", () => {
  it.each([
    ["analysis", "capital_alternative_map", companyPlan, ["S11"]],
    ["meeting", "meeting_brief", compileObjectivePlan({objectiveKind: "meeting_preparation", hasAttachments: false, existingProject: null}), ["K04", "M07", "S11"]],
    ["model", "financial_model", companyPlan, ["A05"]],
    ["review", "operation_review", operationReviewPlan, ["S10"]],
    ["material", "teaser", companyPlan, ["A03"]],
  ] as const)("gives %s an exact and distinct executable terminal graph", (_name, product, basePlan, targets) => {
    const audience: TerminalAudience = product === "meeting_brief" ? "senior_sponsor" : product === "teaser" ? "lender" : "requester";
    const resolution = resolveConfirmed([product], {basePlan, audience: {value: audience, state: "explicit"}});
    expect(resolution).toMatchObject({status: "resolved", workProducts: [product], targetTaskIds: [...targets]});
    if (resolution.status !== "resolved") throw new Error("expected resolved terminal");
    expect(resolution.taskGraph.targetTaskIds).toEqual([...targets]);
    expect(assertTrustedOutputTerminalResolution(resolution)).toBe(resolution);
  });

  it("compiles an exact multi-output XLSX and DOCX bundle", () => {
    const resolution = resolveConfirmed(["financial_model", "indicative_term_sheet"], {
      formats: {value: [
        {workProduct: "financial_model", format: "xlsx"},
        {workProduct: "indicative_term_sheet", format: "docx"},
      ], state: "explicit"},
    });
    expect(resolution).toMatchObject({status: "resolved", targetTaskIds: ["A05", "A06"]});
  });

  it("does not run A11's mega-closure when no exact presentation terminal exists", () => {
    const result = resolveConfirmed(["presentation_deck"], {audience: {value: "board", state: "explicit"}});
    expect(result).toMatchObject({status: "blocked", reason: "terminal_task_unavailable"});
    expectNoExecutableGraph(result);
  });

  it("keeps operation review out of term-sheet compilation", () => {
    const result = resolveConfirmed(["operation_review"], {basePlan: operationReviewPlan});
    expect(result).toMatchObject({status: "resolved", targetTaskIds: ["S10"]});
    if (result.status !== "resolved") throw new Error("expected resolved terminal");
    expect(result.taskGraph.tasks.map((task) => task.id)).not.toContain("S12");
  });

  it("preserves only a target covered by the governed specialist manifest", () => {
    const specialized = expandObjectivePlanWithTaskTargets(
      compileObjectivePlan({objectiveKind: "documents_to_case", hasAttachments: true, existingProject: null}),
      ["R01"],
    );
    const result = resolveConfirmed(["preliminary_case"], {basePlan: specialized});
    expect(result).toMatchObject({status: "resolved", targetTaskIds: ["R01", "S11"], preservedSpecialistTaskIds: ["R01"]});
  });

  it("keeps the compiler receipt and its internal snapshot deeply frozen against A11 mutation", () => {
    const specialized = expandObjectivePlanWithTaskTargets(
      compileObjectivePlan({objectiveKind: "documents_to_case", hasAttachments: true, existingProject: null}), ["R01"],
    );
    const receipt = assertTrustedObjectivePlan(specialized);
    const secondReceipt = assertTrustedObjectivePlan(specialized);
    expect(secondReceipt).not.toBe(receipt);
    expect(secondReceipt.planSnapshot).not.toBe(receipt.planSnapshot);
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(Object.isFrozen(receipt.planSnapshot)).toBe(true);
    expect(Object.isFrozen(receipt.specialistTaskIds)).toBe(true);
    expect(Reflect.set(receipt, "specialistTaskIds", ["A11"])).toBe(false);
    expect(() => (receipt.specialistTaskIds as string[]).push("A11")).toThrow();

    const result = resolveConfirmed(["preliminary_case"], {basePlan: specialized});
    expect(result).toMatchObject({status: "resolved", targetTaskIds: ["R01", "S11"], preservedSpecialistTaskIds: ["R01"]});
    if (result.status !== "resolved") throw new Error("expected specialist resolution");
    expect(result.targetTaskIds).not.toContain("A11");
  });

  it("does not expose the test-only witness issuer from the package root", () => {
    expect(packageApi).not.toHaveProperty("createTestOnlyOutputTerminalAuthority");
    expect(packageApi).not.toHaveProperty("createInMemoryOutputTerminalAuthority");
  });

  it("rejects arbitrary A11 as a specialist even though A11 is a real TaskSpec", () => {
    const base = compileObjectivePlan({objectiveKind: "documents_to_case", hasAttachments: true, existingProject: null});
    expect(() => expandObjectivePlanWithTaskTargets(base, ["A11"])).toThrow(/lacks a governed specialist manifest binding/);

    const forgedPlan = withObjectiveIdentity({...base, targetTaskIds: ["A11", "S11"], taskGraph: compileTaskGraph(["A11", "S11"])});
    const forgedRequest = request(["preliminary_case"], {basePlan: forgedPlan});
    const result = resolveOutputTerminal(
      forgedRequest,
      {authorizationId: randomUUID()} as unknown as OutputTerminalAuthorization,
    );
    expect(result).toMatchObject({status: "blocked", reason: "base_plan_untrusted", preservedSpecialistTaskIds: []});
    expectNoExecutableGraph(result);
  });

  it("does not let a package-root caller mutate the governed manifest to authorize A11", () => {
    const publicManifest = packageApi.governedSpecialistTargetManifest;
    expect(Object.isFrozen(publicManifest)).toBe(true);
    expect(Object.isFrozen(publicManifest.targets)).toBe(true);
    expect(Reflect.set(publicManifest.targets, "A11", {
      specialization: "caller_injected",
      purpose: "Escalate to the presentation mega-closure",
    })).toBe(false);
    expect(publicManifest.targets).not.toHaveProperty("A11");

    const base = compileObjectivePlan({objectiveKind: "documents_to_case", hasAttachments: true, existingProject: null});
    expect(() => expandObjectivePlanWithTaskTargets(base, ["A11"]))
      .toThrow(/lacks a governed specialist manifest binding/);
  });

  it("treats self-consistent serialized plans as data, not compiler authority", () => {
    const serialized = structuredClone(companyPlan);
    const input = request(["financial_model"], {basePlan: serialized});
    const result = resolveOutputTerminal(
      input,
      {authorizationId: randomUUID()} as unknown as OutputTerminalAuthorization,
    );
    expect(result).toMatchObject({status: "blocked", reason: "base_plan_untrusted"});
    expectNoExecutableGraph(result);
  });

  it("does not accept a copied authorization id or recomputable receipt claims", () => {
    const input = request(["financial_model"]);
    const trusted = authorize(input);
    const copied = {
      authorizationId: (trusted as unknown as {authorizationId: string}).authorizationId,
    } as unknown as OutputTerminalAuthorization;
    const result = resolveOutputTerminal(input, copied);
    expect(result).toMatchObject({status: "blocked", reason: "execution_authorization_mismatch"});
    expectNoExecutableGraph(result);
  });

  it("binds one opaque authorization to the exact work products and governed specialist targets", () => {
    const modelRequest = request(["financial_model"]);
    const modelAuthorization = authorize(modelRequest);
    const changedProduct = request(["indicative_term_sheet"]);
    const productMismatch = resolveOutputTerminal(changedProduct, modelAuthorization);
    expect(productMismatch).toMatchObject({status: "blocked", reason: "execution_authorization_mismatch"});
    expectNoExecutableGraph(productMismatch);

    const specialized = expandObjectivePlanWithTaskTargets(
      compileObjectivePlan({objectiveKind: "documents_to_case", hasAttachments: true, existingProject: null}), ["R01"],
    );
    const ordinaryRequest = request(["preliminary_case"]);
    const specialistRequest = request(["preliminary_case"], {basePlan: specialized});
    const specialistMismatch = resolveOutputTerminal(specialistRequest, authorize(ordinaryRequest));
    expect(specialistMismatch).toMatchObject({status: "blocked", reason: "execution_authorization_mismatch"});
    expectNoExecutableGraph(specialistMismatch);
  });

  it("preserves context and unavailable-capability gates", () => {
    const materialPlan = compileObjectivePlan({objectiveKind: "material_preparation", hasAttachments: true, existingProject: null});
    const materialInput = request(["presentation_deck"], {basePlan: materialPlan, audience: {value: "board", state: "explicit"}});
    const material = resolveOutputTerminal(materialInput, authorize(materialInput));
    expect(material).toMatchObject({status: "needs_confirmation", reason: "base_plan_context_required"});
    expectNoExecutableGraph(material);

    for (const objectiveKind of ["monitoring", "workspace_management"] as const) {
      const plan = compileObjectivePlan({objectiveKind, hasAttachments: true, existingProject: null});
      const input = request([], {basePlan: plan});
      const result = resolveOutputTerminal(input, authorize(input));
      expect(result).toMatchObject({status: "blocked", reason: "base_plan_capability_unavailable"});
      expectNoExecutableGraph(result);
    }
  });

  it("requires an opaque exact attestation for terminal selection", () => {
    const input = request(["financial_model"]);
    const missing = resolveOutputTerminal(input);
    expect(missing).toMatchObject({status: "needs_confirmation", reason: "terminal_inferred_confirmation_required"});
    expectNoExecutableGraph(missing);
    const declined = resolveOutputTerminal(input, authorize(input, {confirmSelection: false}));
    expect(declined).toMatchObject({status: "needs_confirmation", reason: "terminal_inferred_confirmation_required"});
    expectNoExecutableGraph(declined);
  });

  it("keeps incompatible formats and inferred high-effort terminals non-executable", () => {
    const incompatibleInput = request(["financial_model"], {
      formats: {value: [{workProduct: "financial_model", format: "pptx"}], state: "explicit"},
    });
    const incompatible = resolveOutputTerminal(incompatibleInput, authorize(incompatibleInput));
    expect(incompatible).toMatchObject({status: "blocked", reason: "incompatible_format"});
    expectNoExecutableGraph(incompatible);

    const inferredInput = {...request(["financial_model"]), workProducts: {value: ["financial_model"] as TerminalWorkProduct[], state: "inferred" as const}};
    const inferred = resolveOutputTerminal(inferredInput);
    expect(inferred).toMatchObject({status: "needs_confirmation", reason: "terminal_inferred_confirmation_required"});
    expectNoExecutableGraph(inferred);
  });

  it.each([
    ["capital_alternative_map", "investor"], ["financial_model", "lender"],
  ] as const)("requires exact confirmation for %s sent to %s", (product, audience) => {
    const input = request([product], {audience: {value: audience, state: "explicit"}});
    const missing = resolveOutputTerminal(input, authorize(input, {confirmAudience: false}));
    expect(missing).toMatchObject({status: "needs_confirmation", reason: "audience_required"});
    expectNoExecutableGraph(missing);

    const other = request([product], {audience: {value: "company", state: "explicit"}});
    const mismatched = resolveOutputTerminal(input, authorize(other));
    expect(mismatched).toMatchObject({status: "blocked", reason: "execution_authorization_mismatch"});
    expectNoExecutableGraph(mismatched);
  });

  it.each(["senior_sponsor", "executive_management", "credit_committee", "board"] as const)(
    "treats %s as a consequential decision recipient",
    (audience) => {
      const input = request(["financial_model"], {audience: {value: audience, state: "explicit"}});
      const result = resolveOutputTerminal(input, authorize(input, {confirmAudience: false}));
      expect(result).toMatchObject({status: "needs_confirmation", reason: "audience_required"});
      expectNoExecutableGraph(result);
    },
  );

  it("binds a revision to exact artifact version and tenant scope", () => {
    const input = request(["financial_model"], {continuity: {value: "revise", state: "explicit"}});
    const missing = resolveOutputTerminal(input, authorize(input));
    expect(missing).toMatchObject({status: "needs_confirmation", reason: "revision_target_required"});
    expectNoExecutableGraph(missing);

    const exact = binding("financial_model", "xlsx");
    const auth = authorize(input, {artifactBindings: [exact]});
    const resolved = resolveOutputTerminal(input, auth);
    expect(resolved).toMatchObject({status: "resolved", artifactBindings: [exact]});
    if (resolved.status !== "resolved") throw new Error("expected resolved revision");

    const swapped = binding("financial_model", "xlsx", {artifactVersionId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"});
    const forged = withFingerprint({...resolved, artifactBindings: [swapped]});
    expect(outputTerminalResolutionStructuralSchema.safeParse(forged).success).toBe(true);
    expect(() => assertTrustedOutputTerminalResolution(forged)).toThrow(/lacks an opaque trusted execution attestation/);
    expect(() => revalidateSameProcessOutputTerminalResolution({serializedResolution: forged, request: input, authorization: auth}))
      .toThrow(/does not match its same-process trusted witness/);
  });

  it("does not accept one artifact binding for a two-output revision", () => {
    const input = request(["financial_model", "indicative_term_sheet"], {
      formats: {value: [
        {workProduct: "financial_model", format: "xlsx"},
        {workProduct: "indicative_term_sheet", format: "docx"},
      ], state: "explicit"},
      continuity: {value: "revise", state: "explicit"},
    });
    const result = resolveOutputTerminal(input, authorize(input, {artifactBindings: [binding("financial_model", "xlsx")]}));
    expect(result.status).not.toBe("resolved");
    expectNoExecutableGraph(result);
  });

  it("revalidates replay against the trusted specialist witness and rejects drop/add R01 after rehash", () => {
    const specialized = expandObjectivePlanWithTaskTargets(
      compileObjectivePlan({objectiveKind: "documents_to_case", hasAttachments: true, existingProject: null}), ["R01"],
    );
    const specialistRequest = request(["preliminary_case"], {basePlan: specialized});
    const specialistAuth = authorize(specialistRequest);
    const specialistResolution = resolveOutputTerminal(specialistRequest, specialistAuth);
    if (specialistResolution.status !== "resolved") throw new Error("expected specialist resolution");
    const dropped = withFingerprint({
      ...specialistResolution,
      preservedSpecialistTaskIds: [],
      targetTaskIds: ["S11"],
      taskGraph: compileTaskGraph(["S11"]),
    });
    expect(outputTerminalResolutionStructuralSchema.safeParse(dropped).success).toBe(true);
    expect(() => revalidateSameProcessOutputTerminalResolution({serializedResolution: dropped, request: specialistRequest, authorization: specialistAuth}))
      .toThrow(/does not match its same-process trusted witness/);

    const ordinaryRequest = request(["preliminary_case"]);
    const ordinaryAuth = authorize(ordinaryRequest);
    const ordinaryResolution = resolveOutputTerminal(ordinaryRequest, ordinaryAuth);
    if (ordinaryResolution.status !== "resolved") throw new Error("expected ordinary resolution");
    const added = withFingerprint({
      ...ordinaryResolution,
      preservedSpecialistTaskIds: ["R01"],
      targetTaskIds: ["R01", "S11"],
      taskGraph: compileTaskGraph(["R01", "S11"]),
    });
    expect(outputTerminalResolutionStructuralSchema.safeParse(added).success).toBe(true);
    expect(() => revalidateSameProcessOutputTerminalResolution({serializedResolution: added, request: ordinaryRequest, authorization: ordinaryAuth}))
      .toThrow(/does not match its same-process trusted witness/);
  });

  it("accepts an unchanged persisted resolution only after trusted revalidation", () => {
    const input = request(["financial_model"]);
    const auth = authorize(input);
    const resolved = resolveOutputTerminal(input, auth);
    const persisted = structuredClone(resolved);
    expect(() => assertTrustedOutputTerminalResolution(persisted)).toThrow();
    expect(revalidateSameProcessOutputTerminalResolution({serializedResolution: persisted, request: input, authorization: auth}))
      .toMatchObject({status: "resolved", targetTaskIds: ["A05"]});
  });

  it("does not invent a cited answer when generic material lacks an exact terminal", () => {
    const plan = compileObjectivePlan({objectiveKind: "material_preparation", hasAttachments: true, existingProject: {
      entryJob: "capital_planning", hasSignedAnalyticalSnapshot: true, hasCurrentMandates: false,
    }});
    const input = request([], {basePlan: plan});
    const result = resolveOutputTerminal(input, authorize(input));
    expect(result).toMatchObject({status: "needs_confirmation", reason: "material_kind_required", workProducts: []});
    expectNoExecutableGraph(result);
  });

  it("rejects forged structural output and status/graph confusion", () => {
    const input = request(["financial_model"]);
    const pending = resolveOutputTerminal(input);
    expect(outputTerminalResolutionStructuralSchema.safeParse({...pending, taskGraph: compileTaskGraph(["A05"]), targetTaskIds: ["A05"]}).success).toBe(false);

    const model = resolveOutputTerminal(input, authorize(input));
    if (model.status !== "resolved") throw new Error("expected model resolution");
    const graphForgery = withFingerprint({...model, targetTaskIds: ["A06"], taskGraph: compileTaskGraph(["A06"])});
    expect(outputTerminalResolutionStructuralSchema.safeParse(graphForgery).success).toBe(false);
  });

  it("rejects persona and authority fields instead of letting them influence work", () => {
    const input = request(["risk_matrix"]);
    expect(outputTerminalRequestSchema.safeParse({...input, persona: "MD"}).success).toBe(false);
    expect(outputTerminalRequestSchema.safeParse({...input, authority: "external_action"}).success).toBe(false);
  });

  it("is deterministic for the same plan and exact opaque authorization", () => {
    const input = request(["board_decision_pack"], {audience: {value: "board", state: "explicit"}});
    const auth = authorize(input);
    expect(resolveOutputTerminal(input, auth)).toEqual(resolveOutputTerminal(input, auth));
  });
});
