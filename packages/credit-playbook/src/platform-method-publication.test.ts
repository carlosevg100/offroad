import {createHash} from "node:crypto";
import {describe, expect, it} from "vitest";
import {preparePlatformMethodPublication} from "./platform-method-publication";
import {methodContentHash, type CompiledProcedureManifest} from "./procedure-compiler";
import {protectedMethodInvariants, type MethodComponent} from "./method-component";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
function fixture() {
  const files: Record<string, string> = {
    "packages/credit-playbook/knowledge/procedures/synthetic.md": "Synthetic method only",
    "packages/credit-playbook/src/synthetic-compiler.ts": "Synthetic compiler only",
    "packages/credit-playbook/knowledge/reviews/synthetic-test.json": '{"synthetic":true,"passed":true}',
  };
  const pins = Object.entries(files).map(([path, text]) => ({path, hash: sha(text)}));
  const component: MethodComponent = {
    id: "synthetic.framing", version: "2026.09.19-v1", kind: "narrative", title: "Synthetic publication test",
    text: "Synthetic framing, no financial conclusion or production use.",
    inputs: {id: "synthetic.input", version: "2026.09.19-v1", value: {type: "string"}},
    outputs: {id: "synthetic.output", version: "2026.09.19-v1", value: {type: "string"}},
    dependencies: [], tools: [], effect: "none", budget: {maxModelCalls: 0, maxDurationMs: 1000, maxCostMinorUnits: 0, currency: "BRL"},
    rights: {inheritSourceRestrictions: true, purposes: ["internal_validation"], sourceClasses: ["synthetic_fixture"]},
    competencies: ["financial_analysis"], invariants: [...protectedMethodInvariants], overridePoints: [], evidence: [pins[2]!.path],
  };
  const payload: Omit<CompiledProcedureManifest, "manifestHash"> = {
    schemaVersion: "compiled-procedure-manifest.v1", procedure: {id: "synthetic-platform-method", version: "2026.09.19-v1", maturity: "tested"},
    source: pins[0]!, compiler: {version: "2026.09.18-v1", sources: [pins[1]!], hash: methodContentHash([pins[1]!])},
    authoringStatus: "ready_for_review", pendingContent: [], grantsExecution: false,
    budget: component.budget, allowedTools: [], maximumEffect: "none",
    components: [{component, componentHash: methodContentHash(component), executor: null, evidence: [pins[2]!]}],
  };
  const manifest = {...payload, manifestHash: methodContentHash(payload)};
  const technicalReviewPath = "packages/credit-playbook/knowledge/reviews/synthetic-technical.json";
  const contentApprovalPath = "packages/credit-playbook/knowledge/reviews/synthetic-human.json";
  const review = {actor: "Synthetic reviewer", result: "approved", humanApproval: false, occurredAt: "2026-09-19T00:00:00Z", manifestHash: manifest.manifestHash, rationale: "Synthetic reviewer checked the exact synthetic bytes."};
  files[technicalReviewPath] = JSON.stringify({...review, kind: "technical_review"});
  files[contentApprovalPath] = JSON.stringify({...review, kind: "content_approval", actor: "Synthetic founder", humanApproval: true});
  const input = {manifest, sourceCommit: "a".repeat(40), author: "Synthetic author", technicalReviewPath, contentApprovalPath, readSource: (path: string) => {if (!(path in files)) throw new Error("missing source"); return files[path]!;}, now: new Date("2026-09-19T12:00:00Z")};
  return {files, input};
}

describe("platform method publication preparation", () => {
  it("pins exact reviewed source bytes without granting execution", () => {
    const {input} = fixture(); const result = preparePlatformMethodPublication(input);
    expect(result).toEqual(preparePlatformMethodPublication(input));
    expect(result.grantsExecution).toBe(false);
    expect(result.bundle.evidence).toHaveLength(3);
    expect(sha(result.bundle.manifestText)).toBe(input.manifest.manifestHash);
  });
  it("resolves the compiler's corpus-relative source without changing its manifest", () => {
    const {input, files} = fixture(); input.manifest.source.path = "synthetic.md";
    const {manifestHash: _oldHash, ...payload} = input.manifest;
    input.manifest.manifestHash = methodContentHash(payload);
    for (const path of [input.technicalReviewPath, input.contentApprovalPath]) files[path] = JSON.stringify({...JSON.parse(files[path]!), manifestHash: input.manifest.manifestHash});
    expect(preparePlatformMethodPublication(input).bundle.manifest.source.path).toBe("synthetic.md");
  });
  it("rejects stale method, compiler and test evidence bytes", () => {
    for (const key of ["source", "compiler", "test"] as const) {
      const {input, files} = fixture();
      const path = key === "source" ? input.manifest.source.path : key === "compiler" ? input.manifest.compiler.sources[0]!.path : input.manifest.components[0]!.evidence[0]!.path;
      files[path] += "changed";
      expect(() => preparePlatformMethodPublication(input)).toThrow("platform_method_source_changed");
    }
  });
  it("rejects an incomplete candidate and an altered manifest", () => {
    const {input} = fixture(); input.manifest.authoringStatus = "incomplete";
    expect(() => preparePlatformMethodPublication(input)).toThrow("platform_method_not_reviewable");
  });
  it("does not convert machine review or a wave approval into content approval", () => {
    const {input, files} = fixture(); const review = JSON.parse(files[input.contentApprovalPath]!);
    files[input.contentApprovalPath] = JSON.stringify({...review, humanApproval: false});
    expect(() => preparePlatformMethodPublication(input)).toThrow("platform_method_approval_invalid");
    files[input.contentApprovalPath] = JSON.stringify({...review, kind: "wave_approval"});
    expect(() => preparePlatformMethodPublication(input)).toThrow();
  });
  it("rejects a technical review by the author", () => {
    const {input, files} = fixture();const review = JSON.parse(files[input.technicalReviewPath]!);
    files[input.technicalReviewPath] = JSON.stringify({...review, actor: input.author});
    expect(() => preparePlatformMethodPublication(input)).toThrow("platform_method_approval_invalid");
  });
  it("rejects approval of another manifest and future approval", () => {
    for (const change of [{manifestHash: "b".repeat(64)}, {occurredAt: "2099-01-01T00:00:00Z"}]) {
      const {input, files} = fixture();files[input.contentApprovalPath] = JSON.stringify({...JSON.parse(files[input.contentApprovalPath]!), ...change});
      expect(() => preparePlatformMethodPublication(input)).toThrow("platform_method_approval_invalid");
    }
  });
  it("requires actual approval artifacts and rejects path traversal", () => {
    const {input, files} = fixture();delete files[input.contentApprovalPath];
    expect(() => preparePlatformMethodPublication(input)).toThrow("missing source");
    input.contentApprovalPath = "packages/credit-playbook/knowledge/reviews/../../secret.json";
    expect(() => preparePlatformMethodPublication(input)).toThrow();
  });
});
