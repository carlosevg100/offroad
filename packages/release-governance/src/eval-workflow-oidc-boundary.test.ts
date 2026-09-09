import {readdirSync, readFileSync} from "node:fs";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {describe, expect, it} from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
const workflowDirectory = join(repositoryRoot, ".github", "workflows");
const evaluationRole =
  "arn:aws:iam::389642461544:role/offroadGitHubEvalsRole";

const expectedConsumers = [
  "codex-review.yml",
  "document-work-product-live.yml",
  "gold-baseline.yml",
  "intent-router-gold.yml",
  "live-preview-gate.yml",
  "measure-classification.yml",
  "measure-extraction.yml",
  "probe-structured-output.yml",
];

function readWorkflowFiles(): Array<{name: string; source: string}> {
  return readdirSync(workflowDirectory)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .map((name) => ({name, source: readFileSync(join(workflowDirectory, name), "utf8")}));
}

function roleConsumers(): Array<{name: string; source: string}> {
  return readWorkflowFiles().filter(({source}) => {
    const executableYaml = source
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("#"))
      .join("\n");
    return executableYaml.includes(evaluationRole);
  });
}

describe("paid evaluation workflow OIDC boundary", () => {
  it("enumerates every workflow that assumes the shared evaluation role", () => {
    expect(roleConsumers().map(({name}) => name).sort()).toEqual(expectedConsumers);
  });

  it("applies the same repository, ref, Environment, checkout and token boundary", () => {
    for (const {name, source} of roleConsumers()) {
      expect(
        source,
        `${name} must fail closed outside the canonical repository main branch`,
      ).toMatch(
        /^ {4}if: github\.repository == 'carlosevg100\/offroad' && github\.ref == 'refs\/heads\/main'$/m,
      );
      expect(source, `${name} must use the common paid-eval Environment`).toMatch(
        /^ {4}environment: intent-router-gold-main$/m,
      );

      const permissionBlock = source.match(
        /^permissions:\n((?: {2}[a-z-]+: [^\n]+\n?)+)/m,
      );
      expect(
        source.match(/^ *permissions:/gm) ?? [],
        `${name} must not override the minimal workflow permissions at job level`,
      ).toHaveLength(1);
      expect(permissionBlock, `${name} must declare workflow permissions`).not.toBeNull();
      if (!permissionBlock) throw new Error(`${name} must declare workflow permissions`);
      expect(permissionBlock[1]!.trim().split("\n").map((line) => line.trim()).sort()).toEqual([
        "contents: read",
        "id-token: write",
      ]);

      const checkoutCount = (source.match(/uses: actions\/checkout@/g) ?? []).length;
      const exactCheckoutCount = (
        source.match(
          /uses: actions\/checkout@[^\n]+\n {8}with:\n {10}ref: \$\{\{ github\.sha \}\}/g,
        ) ?? []
      ).length;
      expect(checkoutCount, `${name} must contain a checkout step`).toBeGreaterThan(0);
      expect(
        exactCheckoutCount,
        `${name} must pin every checkout to the triggering github.sha`,
      ).toBe(checkoutCount);
    }
  });
});
