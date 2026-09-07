import {createHash} from "node:crypto";

import {z} from "zod";

import {buildDecisionArtifactContract, type DecisionArtifactContract} from "./decision-artifact";
import {fingerprintJson} from "./manifest";

/**
 * The immutable receipt for one binary work product.
 *
 * A generated file is not a governed material merely because its extension is .xlsx or .pptx.
 * The receipt binds the exact bytes to the decision contract, renderer, template, tenant path
 * and release gates. The UI may expose a file only after this object says it is stored.
 */
export const renderedMaterialManifestSchemaVersion = "2026.09.07-v1";

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const idSchema = z.string().min(1).max(160);

export const renderedMaterialSurfaceSchema = z.enum(["workbook", "presentation", "supporting_document"]);
export const renderedMaterialFormatSchema = z.enum(["xlsx", "pptx", "docx"]);

const formatContract = {
  xlsx: {
    surface: "workbook",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  pptx: {
    surface: "presentation",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  },
  docx: {
    surface: "supporting_document",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
} as const;

const renderedMaterialBodySchema = z.object({
  schemaVersion: z.literal(renderedMaterialManifestSchemaVersion),
  id: idSchema,
  organizationId: z.uuid(),
  projectId: z.uuid(),
  caseId: idSchema,
  decisionContractFingerprint: hashSchema,
  surface: renderedMaterialSurfaceSchema,
  format: renderedMaterialFormatSchema,
  fileName: z.string().min(5).max(240),
  mimeType: z.string().min(1),
  byteLength: z.number().int().positive(),
  contentSha256: hashSchema,
  renderer: z.object({
    id: idSchema,
    version: idSchema,
  }),
  template: z.object({
    id: idSchema,
    version: idSchema,
    fingerprint: hashSchema,
    origin: z.enum(["offroad_house", "client_supplied"]),
  }),
  storage: z.object({
    bucket: z.literal("case-artifacts"),
    objectPath: z.string().min(1).max(1000),
    state: z.enum(["pending_upload", "stored"]),
    etag: z.string().min(1).nullable(),
  }),
  generatedAt: z.iso.datetime(),
  quality: z.object({
    schemaValidated: z.boolean(),
    numericIdentityPassed: z.boolean(),
    formulaAuditPassed: z.boolean(),
    visualInspection: z.enum(["not_run", "passed", "failed"]),
    openIssues: z.array(z.object({
      code: idSchema,
      severity: z.enum(["blocker", "high", "medium", "low"]),
      detail: z.string().min(1).max(2000),
    })).max(100),
    releaseEligible: z.boolean(),
  }),
  release: z.object({
    state: z.enum(["internal_only", "reviewable", "approved_for_named_recipients"]),
    recipientIds: z.array(idSchema).max(100),
  }),
  claimIds: z.array(idSchema).min(1).max(1000),
  sourceIds: z.array(idSchema).max(1000),
  assumptionIds: z.array(idSchema).max(1000),
  gapIds: z.array(idSchema).max(1000),
});

export const renderedMaterialManifestSchema = renderedMaterialBodySchema.extend({
  manifestFingerprint: hashSchema,
}).superRefine(validateRenderedMaterialManifest);

export type RenderedMaterialManifest = z.infer<typeof renderedMaterialManifestSchema>;
export type RenderedMaterialManifestInput = Omit<RenderedMaterialManifest, "manifestFingerprint">;

export function buildRenderedMaterialManifest(raw: RenderedMaterialManifestInput): RenderedMaterialManifest {
  const body = renderedMaterialBodySchema.parse(raw);
  return renderedMaterialManifestSchema.parse({...body, manifestFingerprint: fingerprintJson(body)});
}

/** Refuse a receipt if it does not describe these exact binary bytes. */
export function verifyRenderedMaterialBytes(manifest: RenderedMaterialManifest, bytes: Uint8Array): void {
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (bytes.byteLength !== manifest.byteLength) throw new Error("rendered material byte length does not match its manifest");
  if (digest !== manifest.contentSha256) throw new Error("rendered material bytes do not match their signed sha256");
}

/**
 * Project a stored workbook or presentation back into the universal decision contract.
 * Supporting Word documents have their own manifest and never impersonate a primary surface.
 */
export function bindRenderedMaterialToDecisionArtifact(
  contract: DecisionArtifactContract,
  manifest: RenderedMaterialManifest,
): DecisionArtifactContract {
  if (manifest.decisionContractFingerprint !== contract.contractFingerprint) {
    throw new Error("rendered material was produced from a different decision contract");
  }
  if (manifest.storage.state !== "stored") throw new Error("rendered material must be stored before it can be bound to a decision surface");
  if (manifest.surface === "supporting_document") throw new Error("supporting documents are not primary decision surfaces");

  const knownClaims = new Set(contract.claims.map((claim) => claim.id));
  for (const claimId of manifest.claimIds) {
    if (!knownClaims.has(claimId)) throw new Error(`rendered material references unknown claim ${claimId}`);
  }
  const surface = manifest.surface;
  const views = contract.views.map((view) => view.surface === surface
    ? {...view, artifactId: manifest.id, artifactFingerprint: manifest.contentSha256}
    : view);
  if (!views.some((view) => view.surface === surface)) throw new Error(`decision contract has no ${surface} surface`);
  return buildDecisionArtifactContract({...stripContractFingerprint(contract), views});
}

function validateRenderedMaterialManifest(manifest: RenderedMaterialManifest, context: z.RefinementCtx): void {
  const expected = formatContract[manifest.format];
  if (manifest.surface !== expected.surface) {
    context.addIssue({code: "custom", path: ["surface"], message: `${manifest.format} must use the ${expected.surface} surface`});
  }
  if (manifest.mimeType !== expected.mimeType) {
    context.addIssue({code: "custom", path: ["mimeType"], message: `${manifest.format} has an invalid MIME type`});
  }
  if (!manifest.fileName.toLowerCase().endsWith(`.${manifest.format}`)) {
    context.addIssue({code: "custom", path: ["fileName"], message: `file name must end in .${manifest.format}`});
  }
  const expectedPrefix = `${manifest.organizationId}/${manifest.projectId}/materials/`;
  if (!manifest.storage.objectPath.startsWith(expectedPrefix)
    || manifest.storage.objectPath.includes("..")
    || manifest.storage.objectPath.startsWith("/")) {
    context.addIssue({code: "custom", path: ["storage", "objectPath"], message: "storage path must remain inside the organization and project material scope"});
  }
  if (manifest.storage.state === "stored" && !manifest.storage.etag) {
    context.addIssue({code: "custom", path: ["storage", "etag"], message: "stored materials require the storage etag"});
  }
  if (manifest.storage.state === "pending_upload" && manifest.storage.etag) {
    context.addIssue({code: "custom", path: ["storage", "etag"], message: "pending uploads cannot carry a storage etag"});
  }
  unique(manifest.claimIds, ["claimIds"], context);
  unique(manifest.sourceIds, ["sourceIds"], context);
  unique(manifest.assumptionIds, ["assumptionIds"], context);
  unique(manifest.gapIds, ["gapIds"], context);

  const qualityPasses = manifest.quality.schemaValidated
    && manifest.quality.numericIdentityPassed
    && manifest.quality.formulaAuditPassed
    && manifest.quality.visualInspection === "passed"
    && manifest.quality.openIssues.every((issue) => issue.severity !== "blocker" && issue.severity !== "high")
    && manifest.storage.state === "stored";
  if (manifest.quality.releaseEligible !== qualityPasses) {
    context.addIssue({code: "custom", path: ["quality", "releaseEligible"], message: "release eligibility must equal the deterministic quality-gate result"});
  }
  if (manifest.release.state === "approved_for_named_recipients") {
    if (!manifest.quality.releaseEligible) {
      context.addIssue({code: "custom", path: ["release", "state"], message: "external release requires every material quality gate"});
    }
    if (manifest.release.recipientIds.length === 0) {
      context.addIssue({code: "custom", path: ["release", "recipientIds"], message: "named recipients are required for external release"});
    }
  } else if (manifest.release.recipientIds.length > 0) {
    context.addIssue({code: "custom", path: ["release", "recipientIds"], message: "recipient ids are only valid after named-recipient approval"});
  }
  const expectedFingerprint = fingerprintJson(stripManifestFingerprint(manifest));
  if (manifest.manifestFingerprint !== expectedFingerprint) {
    context.addIssue({code: "custom", path: ["manifestFingerprint"], message: "material manifest fingerprint does not match its governed body"});
  }
}

function stripManifestFingerprint(manifest: RenderedMaterialManifest): RenderedMaterialManifestInput {
  const {manifestFingerprint: _fingerprint, ...body} = manifest;
  return body;
}

function stripContractFingerprint(contract: DecisionArtifactContract) {
  const {contractFingerprint: _fingerprint, ...body} = contract;
  return body;
}

function unique(values: readonly string[], path: PropertyKey[], context: z.RefinementCtx): void {
  if (new Set(values).size === values.length) return;
  context.addIssue({code: "custom", path, message: "identifiers must be unique"});
}
