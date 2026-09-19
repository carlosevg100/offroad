/** Operator tooling only. Not exported to web or worker. This prepares, never publishes. */
import {createHash} from "node:crypto";
import {z} from "zod";
import {methodComponentSchema, contentHashSchema} from "./method-component";
import {methodContentHash, stableMethodJson, type CompiledProcedureManifest} from "./procedure-compiler";

const pathSchema = z.string().regex(/^packages\/credit-playbook\/knowledge\/reviews\/[a-zA-Z0-9_./-]+\.json$/).refine((p) => !p.split("/").includes(".."));
const reviewSchema = z.object({
  kind: z.enum(["technical_review", "content_approval"]), actor: z.string().trim().min(3).max(200),
  result: z.literal("approved"), humanApproval: z.boolean(),
  occurredAt: z.iso.datetime({offset: true}), manifestHash: contentHashSchema,
  rationale: z.string().trim().min(20),
}).strict();
export type PlatformMethodReview = z.infer<typeof reviewSchema>;
const sha = (bytes: string) => createHash("sha256").update(bytes).digest("hex");

export function preparePlatformMethodPublication(input: {
  manifest: CompiledProcedureManifest; sourceCommit: string; author: string;
  technicalReviewPath: string; contentApprovalPath: string;
  /** Bytes resolved from one trusted Git commit by the operator CLI, never a customer upload. */
  readSource: (path: string) => string;
  now: Date;
}) {
  const manifest = input.manifest;
  const {manifestHash, ...payload} = manifest;
  if (methodContentHash(payload) !== manifestHash || manifest.schemaVersion !== "compiled-procedure-manifest.v1"
    || manifest.authoringStatus !== "ready_for_review" || manifest.pendingContent.length
    || !["tested", "ready_for_founder", "production"].includes(manifest.procedure.maturity)
    || manifest.grantsExecution !== false) throw new Error("platform_method_not_reviewable");
  if (!/^[a-f0-9]{40}$/.test(input.sourceCommit) || !Number.isFinite(input.now.getTime())
    || input.author.trim().length < 3 || input.author.trim().length > 200) throw new Error("platform_method_provenance_required");
  const checkPin = (pin: {path: string; hash: string}) => {
    if (pin.path.startsWith("/") || pin.path.includes("\\") || pin.path.split("/").includes("..")
      || sha(input.readSource(pin.path)) !== pin.hash) throw new Error("platform_method_source_changed");
  };
  const sourcePath = manifest.source.path;
  if (sourcePath.startsWith("/") || sourcePath.includes("\\") || sourcePath.split("/").includes("..")) throw new Error("platform_method_source_changed");
  checkPin({...manifest.source, path: sourcePath.startsWith("packages/") ? sourcePath : `packages/credit-playbook/knowledge/procedures/${sourcePath}`});
  if (!manifest.compiler.sources.length || methodContentHash(manifest.compiler.sources) !== manifest.compiler.hash) throw new Error("platform_method_compiler_changed");
  manifest.compiler.sources.forEach(checkPin);
  const evidence = new Map<string, {path: string; hash: string}>();
  const components = manifest.components.map((entry) => {
    const component = methodComponentSchema.parse(entry.component);
    if (methodContentHash(component) !== entry.componentHash) throw new Error("platform_method_component_changed");
    if ("executor" in component && !entry.executor) throw new Error("platform_method_executor_missing");
    if (entry.executor) {
      const {sources, hash, ...ref} = entry.executor;
      if (!sources.length || methodContentHash({ref, sources, inputContractHash: methodContentHash(component.inputs), outputContractHash: methodContentHash(component.outputs)}) !== hash) throw new Error("platform_method_executor_changed");
      sources.forEach(checkPin);
    }
    entry.evidence.forEach((pin) => {checkPin(pin); pathSchema.parse(pin.path); evidence.set(pin.path, pin);});
    return component;
  });
  const reviews = [input.technicalReviewPath, input.contentApprovalPath].map((path, i) => {
    pathSchema.parse(path);
    const bytes = input.readSource(path);
    const review = reviewSchema.parse(JSON.parse(bytes));
    if (review.kind !== (i === 0 ? "technical_review" : "content_approval") || review.manifestHash !== manifestHash
      || Date.parse(review.occurredAt) > input.now.getTime()
      || (review.kind === "technical_review" && review.actor === input.author.trim())
      || (review.kind === "content_approval" && !review.humanApproval)) throw new Error("platform_method_approval_invalid");
    const pin = {path, hash: sha(bytes)}; evidence.set(path, pin);
    return {kind: review.kind, actor: review.actor, evidence: {sourcePath: path, sourceHash: pin.hash, occurredAt: review.occurredAt, result: review.result, manifestHash, sourceCommit: input.sourceCommit, humanApproval: review.humanApproval}};
  });
  if (input.technicalReviewPath === input.contentApprovalPath) throw new Error("platform_method_distinct_reviews_required");
  if (!manifest.components.some((entry) => entry.evidence.length)) throw new Error("platform_method_test_evidence_required");
  return {
    releaseId: `${manifest.procedure.id}-${manifest.procedure.version}`, author: input.author.trim(),
    bundle: {manifest, manifestText: stableMethodJson(payload), components, evidence: [...evidence.values()].sort((a, b) => a.path < b.path ? -1 : 1), sourceCommit: input.sourceCommit},
    reviews, grantsExecution: false as const,
  };
}
