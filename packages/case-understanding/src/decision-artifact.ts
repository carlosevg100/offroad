import {z} from "zod";

import {fingerprintJson} from "./manifest";

/**
 * One governed decision product, projected into several delivery surfaces.
 *
 * The surfaces never own economic values. They reference claims, and claims reference signed
 * objects, sources, assumptions and gaps. This is the boundary that prevents the conversation,
 * workbook and presentation from becoming three unrelated versions of the same case.
 */
export const decisionArtifactSchemaVersion = "2026.09.07-v1";

const fingerprintSchema = z.string().regex(/^[a-f0-9]{64}$/);
const idSchema = z.string().min(1).max(160);
const valueSchema = z.union([z.string(), z.number(), z.boolean()]).nullable();

export const decisionArtifactSurfaceSchema = z.enum(["conversation", "workbook", "presentation"]);
export type DecisionArtifactSurface = z.infer<typeof decisionArtifactSurfaceSchema>;

export const decisionEvidenceStateSchema = z.enum([
  "observed_public",
  "observed_private",
  "calculated",
  "assumption",
  "mixed",
  "not_computable",
]);

export const decisionSourceSchema = z.object({
  id: idSchema,
  title: z.string().min(1),
  classification: z.enum(["public", "private", "synthetic", "market"]),
  asOf: z.iso.date(),
  locator: z.string().min(1),
});

export const decisionAssumptionSchema = z.object({
  id: idSchema,
  label: z.string().min(1),
  value: valueSchema,
  unit: z.string().min(1).nullable(),
  basis: z.string().min(1),
  sourceIds: z.array(idSchema),
  editable: z.boolean(),
  material: z.boolean(),
});

export const decisionGapSchema = z.object({
  id: idSchema,
  label: z.string().min(1),
  materiality: z.enum(["blocker", "high", "medium", "low"]),
  impact: z.string().min(1),
  requestedInput: z.string().min(1),
});

export const decisionClaimSchema = z.object({
  id: idSchema,
  label: z.string().min(1),
  value: valueSchema,
  unit: z.string().min(1).nullable(),
  evidenceState: decisionEvidenceStateSchema,
  object: z.object({
    id: idSchema,
    type: idSchema,
    fingerprint: fingerprintSchema,
    path: z.string().min(1),
  }),
  sourceIds: z.array(idSchema),
  assumptionIds: z.array(idSchema),
  gapIds: z.array(idSchema),
});

export const decisionArtifactBlockSchema = z.object({
  id: idSchema,
  kind: z.enum(["headline", "metric", "table", "chart", "narrative", "decision", "gap", "source_register"]),
  title: z.string().min(1),
  claimIds: z.array(idSchema),
  sourceIds: z.array(idSchema),
  assumptionIds: z.array(idSchema),
  gapIds: z.array(idSchema),
});

export const decisionArtifactViewSchema = z.object({
  surface: decisionArtifactSurfaceSchema,
  artifactId: idSchema,
  artifactKind: z.enum(["chat_readout", "xlsx", "pptx"]),
  artifactFingerprint: fingerprintSchema.nullable(),
  blocks: z.array(decisionArtifactBlockSchema).min(1),
});

const decisionArtifactBodySchema = z.object({
  schemaVersion: z.literal(decisionArtifactSchemaVersion),
  caseId: idSchema,
  snapshotFingerprint: fingerprintSchema,
  asOf: z.iso.date(),
  status: z.enum(["reference", "draft", "reviewable", "approved"]),
  release: z.object({
    state: z.enum(["internal_only", "reviewable", "approved_for_named_recipients"]),
    recipientIds: z.array(idSchema),
  }),
  sources: z.array(decisionSourceSchema),
  assumptions: z.array(decisionAssumptionSchema),
  gaps: z.array(decisionGapSchema),
  claims: z.array(decisionClaimSchema).min(1),
  views: z.array(decisionArtifactViewSchema).min(1),
  identityRequirements: z.array(z.object({
    claimId: idSchema,
    surfaces: z.array(decisionArtifactSurfaceSchema).min(2),
  })),
});

export const decisionArtifactContractSchema = decisionArtifactBodySchema.extend({
  contractFingerprint: fingerprintSchema,
}).superRefine(validateDecisionArtifact);

export type DecisionArtifactContract = z.infer<typeof decisionArtifactContractSchema>;
export type DecisionArtifactContractInput = Omit<DecisionArtifactContract, "contractFingerprint">;

export function buildDecisionArtifactContract(raw: DecisionArtifactContractInput): DecisionArtifactContract {
  const body = decisionArtifactBodySchema.parse(raw);
  const contractFingerprint = fingerprintJson(body);
  return decisionArtifactContractSchema.parse({...body, contractFingerprint});
}

export type DecisionArtifactIdentityReport = {
  valid: boolean;
  requirements: Array<{claimId: string; required: DecisionArtifactSurface[]; present: DecisionArtifactSurface[]; missing: DecisionArtifactSurface[]}>;
};

/** A compact report for gates and UI: which critical claims actually appear on each surface. */
export function decisionArtifactIdentityReport(contract: DecisionArtifactContract): DecisionArtifactIdentityReport {
  const claimsBySurface = new Map<DecisionArtifactSurface, Set<string>>();
  for (const view of contract.views) {
    claimsBySurface.set(view.surface, new Set(view.blocks.flatMap((block) => block.claimIds)));
  }
  const requirements = contract.identityRequirements.map((requirement) => {
    const present = requirement.surfaces.filter((surface) => claimsBySurface.get(surface)?.has(requirement.claimId));
    const missing = requirement.surfaces.filter((surface) => !claimsBySurface.get(surface)?.has(requirement.claimId));
    return {claimId: requirement.claimId, required: requirement.surfaces, present, missing};
  });
  return {valid: requirements.every((requirement) => requirement.missing.length === 0), requirements};
}

/** Resolve a displayed block to the immutable claim records that supply its values. */
export function traceDecisionArtifactBlock(contract: DecisionArtifactContract, surface: DecisionArtifactSurface, blockId: string) {
  const view = contract.views.find((candidate) => candidate.surface === surface);
  const block = view?.blocks.find((candidate) => candidate.id === blockId);
  if (!view || !block) return null;
  const claims = new Map(contract.claims.map((claim) => [claim.id, claim]));
  return {view, block, claims: block.claimIds.map((claimId) => claims.get(claimId)!).filter(Boolean)};
}

function validateDecisionArtifact(contract: DecisionArtifactContract, context: z.RefinementCtx): void {
  unique(contract.sources.map((source) => source.id), ["sources"], context);
  unique(contract.assumptions.map((assumption) => assumption.id), ["assumptions"], context);
  unique(contract.gaps.map((gap) => gap.id), ["gaps"], context);
  unique(contract.claims.map((claim) => claim.id), ["claims"], context);
  unique(contract.views.map((view) => view.surface), ["views"], context);
  unique(contract.identityRequirements.map((requirement) => requirement.claimId), ["identityRequirements"], context);

  const sourceIds = new Set(contract.sources.map((source) => source.id));
  const assumptionIds = new Set(contract.assumptions.map((assumption) => assumption.id));
  const gapIds = new Set(contract.gaps.map((gap) => gap.id));
  const claimIds = new Set(contract.claims.map((claim) => claim.id));

  for (const [index, assumption] of contract.assumptions.entries()) {
    referencesExist(assumption.sourceIds, sourceIds, ["assumptions", index, "sourceIds"], context);
  }
  for (const [index, claim] of contract.claims.entries()) {
    unique(claim.sourceIds, ["claims", index, "sourceIds"], context);
    unique(claim.assumptionIds, ["claims", index, "assumptionIds"], context);
    unique(claim.gapIds, ["claims", index, "gapIds"], context);
    referencesExist(claim.sourceIds, sourceIds, ["claims", index, "sourceIds"], context);
    referencesExist(claim.assumptionIds, assumptionIds, ["claims", index, "assumptionIds"], context);
    referencesExist(claim.gapIds, gapIds, ["claims", index, "gapIds"], context);
    if (claim.evidenceState === "not_computable" && claim.value !== null) {
      context.addIssue({code: "custom", path: ["claims", index, "value"], message: "not_computable claims cannot carry a value"});
    }
  }
  for (const [viewIndex, view] of contract.views.entries()) {
    const expectedKind = {conversation: "chat_readout", workbook: "xlsx", presentation: "pptx"}[view.surface];
    if (view.artifactKind !== expectedKind) {
      context.addIssue({code: "custom", path: ["views", viewIndex, "artifactKind"], message: `${view.surface} must use ${expectedKind}`});
    }
    unique(view.blocks.map((block) => block.id), ["views", viewIndex, "blocks"], context);
    for (const [blockIndex, block] of view.blocks.entries()) {
      const path = ["views", viewIndex, "blocks", blockIndex];
      unique(block.claimIds, [...path, "claimIds"], context);
      unique(block.sourceIds, [...path, "sourceIds"], context);
      unique(block.assumptionIds, [...path, "assumptionIds"], context);
      unique(block.gapIds, [...path, "gapIds"], context);
      referencesExist(block.claimIds, claimIds, [...path, "claimIds"], context);
      referencesExist(block.sourceIds, sourceIds, [...path, "sourceIds"], context);
      referencesExist(block.assumptionIds, assumptionIds, [...path, "assumptionIds"], context);
      referencesExist(block.gapIds, gapIds, [...path, "gapIds"], context);
      if (block.claimIds.length + block.sourceIds.length + block.assumptionIds.length + block.gapIds.length === 0) {
        context.addIssue({code: "custom", path, message: "a displayed block must carry governed lineage"});
      }
    }
  }

  const objectValues = new Map<string, string>();
  for (const [index, claim] of contract.claims.entries()) {
    const objectKey = `${claim.object.fingerprint}:${claim.object.path}`;
    const valueKey = fingerprintJson({value: claim.value, unit: claim.unit, evidenceState: claim.evidenceState});
    const previous = objectValues.get(objectKey);
    if (previous && previous !== valueKey) {
      context.addIssue({code: "custom", path: ["claims", index], message: `signed object path ${claim.object.path} carries divergent values`});
    }
    objectValues.set(objectKey, valueKey);
  }
  for (const [index, requirement] of contract.identityRequirements.entries()) {
    if (!claimIds.has(requirement.claimId)) {
      context.addIssue({code: "custom", path: ["identityRequirements", index, "claimId"], message: `unknown claim ${requirement.claimId}`});
    }
    unique(requirement.surfaces, ["identityRequirements", index, "surfaces"], context);
    for (const surface of requirement.surfaces) {
      const view = contract.views.find((candidate) => candidate.surface === surface);
      if (!view?.blocks.some((block) => block.claimIds.includes(requirement.claimId))) {
        context.addIssue({code: "custom", path: ["identityRequirements", index, "surfaces"], message: `${requirement.claimId} is absent from ${surface}`});
      }
    }
  }

  if (contract.release.state === "approved_for_named_recipients") {
    if (contract.release.recipientIds.length === 0) {
      context.addIssue({code: "custom", path: ["release", "recipientIds"], message: "named recipients are required for external release"});
    }
    if (contract.views.some((view) => view.artifactFingerprint === null)) {
      context.addIssue({code: "custom", path: ["views"], message: "every released artifact must have an immutable fingerprint"});
    }
    if (contract.gaps.some((gap) => gap.materiality === "blocker")) {
      context.addIssue({code: "custom", path: ["release", "state"], message: "a product with blocker gaps cannot be released"});
    }
  } else if (contract.release.recipientIds.length > 0) {
    context.addIssue({code: "custom", path: ["release", "recipientIds"], message: "recipient ids are only valid after named-recipient approval"});
  }

  const expectedFingerprint = fingerprintJson(stripFingerprint(contract));
  if (contract.contractFingerprint !== expectedFingerprint) {
    context.addIssue({code: "custom", path: ["contractFingerprint"], message: "contract fingerprint does not match its governed body"});
  }
}

function stripFingerprint(contract: DecisionArtifactContract): DecisionArtifactContractInput {
  const {contractFingerprint: _fingerprint, ...body} = contract;
  return body;
}

function unique(values: readonly string[], path: PropertyKey[], context: z.RefinementCtx): void {
  if (new Set(values).size === values.length) return;
  context.addIssue({code: "custom", path, message: "identifiers must be unique"});
}

function referencesExist(values: readonly string[], registry: ReadonlySet<string>, path: PropertyKey[], context: z.RefinementCtx): void {
  for (const value of values) {
    if (!registry.has(value)) context.addIssue({code: "custom", path, message: `unknown reference ${value}`});
  }
}
