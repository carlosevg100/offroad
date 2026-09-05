/**
 * `pnpm --filter @offroad/evals review:codex -- --case gc01 --subject answer_key [--model gpt-5.6-sol]`
 *
 * Runs an independent review by a model, through the Codex CLI in a read-only sandbox, and
 * records it as `ai-independent-review.v1`: reviewer, run, fingerprint of the exact bytes
 * reviewed, evidence item by item, result and conditions. It is never a human approval, and the
 * record says so. The reviewer reads the answer key and the text corpus derived from the frozen
 * documents; nothing else.
 */
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";

import {aiIndependentReviewSchema, type AiIndependentReview} from "@offroad/credit-playbook";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..", "..", "..");
const args = process.argv.slice(2);
const option = (name: string, fallback: string): string => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? String(args[index + 1]) : fallback;
};
const caseKey = option("case", "gc01");
const model = option("model", "gpt-5.6-sol");
const effort = option("effort", "high");
const sha256 = (value: string | Uint8Array): string => createHash("sha256").update(value).digest("hex");

const cases: Record<string, {caseId: string; answerKey: string; corpusDir: string; reviewsDir: string}> = {
  gc01: {
    caseId: "gc01-analista-ib-camil",
    answerKey: "docs/product/gold-cases/gc01-gabarito-rascunho.md",
    corpusDir: "docs/product/gold-cases/runs/gc01/ai-review-corpus",
    reviewsDir: "docs/product/gold-cases/reviews/gc01",
  },
};

function main(): void {
  const spec = cases[caseKey];
  if (!spec) {
    console.error(`unknown case "${caseKey}". Available: ${Object.keys(cases).join(", ")}`);
    process.exit(2);
  }
  const answerKeyText = readFileSync(join(repo, spec.answerKey), "utf8");
  const versionMatch = /rascunho v(\d+\.\d+)|versão (\d+\.\d+)/.exec(answerKeyText);
  const answerKeyVersion = versionMatch?.[1] ?? versionMatch?.[2] ?? "unknown";
  const corpusManifest = readFileSync(join(repo, spec.corpusDir, "manifest.json"), "utf8");
  const fingerprint = sha256(`${sha256(answerKeyText)}:${sha256(corpusManifest)}`);
  const startedAt = new Date();
  const runId = `${caseKey}-answer-key-${startedAt.toISOString().slice(0, 19).replace(/[:T]/g, "-")}`;
  const runDir = join(repo, spec.reviewsDir, runId);
  mkdirSync(runDir, {recursive: true});

  const prompt = readFileSync(join(here, "..", "review", "answer-key-review.prompt.md"), "utf8")
    .replaceAll("{{ANSWER_KEY_PATH}}", spec.answerKey)
    .replaceAll("{{CASE_ID}}", spec.caseId)
    .replaceAll("{{ANSWER_KEY_VERSION}}", answerKeyVersion)
    .replaceAll("{{CORPUS_DIR}}", spec.corpusDir);
  writeFileSync(join(runDir, "prompt.md"), prompt, "utf8");
  const schemaPath = join(here, "..", "review", "answer-key-review.schema.json");
  const lastMessagePath = join(runDir, "reviewer-response.json");
  const eventsPath = join(runDir, "codex-events.jsonl");

  console.log(`review ${runId}: model ${model}, fingerprint ${fingerprint.slice(0, 16)}`);
  let commit: string | undefined;
  try {
    commit = execFileSync("git", ["rev-parse", "HEAD"], {cwd: repo, encoding: "utf8"}).trim();
  } catch {
    commit = undefined;
  }
  const events = execFileSync("codex", [
    "exec", "--skip-git-repo-check", "--ephemeral", "--json",
    "-C", repo, "-s", "read-only", "-m", model,
    "-c", `model_reasoning_effort="${effort}"`,
    "--output-schema", schemaPath, "-o", lastMessagePath,
    prompt,
  ], {cwd: repo, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "inherit"]});
  writeFileSync(eventsPath, events, "utf8");
  const finishedAt = new Date();

  const response = JSON.parse(readFileSync(lastMessagePath, "utf8")) as {
    reviewerSelfDescription: string;
    checks: Record<string, boolean>;
    evidence: Array<{claim: string; source: string; anchor?: string; result: string; note?: string}>;
    result: "pass" | "conditional" | "fail";
    conditions: string[];
    notes: string;
  };
  const record: AiIndependentReview = aiIndependentReviewSchema.parse({
    schemaVersion: "ai-independent-review.v1",
    reviewId: runId.replace(/[^a-z0-9_.-]/g, "-"),
    kind: "ai_independent_review",
    humanApproval: false,
    reviewer: {provider: "openai", model, effort, tool: `codex-cli ${codexVersion()}`},
    subject: {kind: "answer_key", id: spec.caseId, version: answerKeyVersion, fingerprint},
    run: {id: runId, startedAt: startedAt.toISOString(), finishedAt: finishedAt.toISOString(), ...(commit ? {commit} : {})},
    checks: {
      sourcesRevisited: Boolean(response.checks.sourcesRevisited),
      numbersRecalculated: Boolean(response.checks.numbersRecalculated),
      definitionsTested: Boolean(response.checks.definitionsTested),
      exceptionsTested: Boolean(response.checks.exceptionsTested),
      adversarialTested: Boolean(response.checks.adversarialTested),
      consistencyTested: Boolean(response.checks.consistencyTested),
      baselineAdvantage: null,
    },
    evidence: response.evidence.map((item) => ({
      claim: item.claim.slice(0, 600), source: item.source.slice(0, 300),
      ...(item.anchor ? {anchor: item.anchor.slice(0, 200)} : {}),
      result: item.result, ...(item.note ? {note: item.note.slice(0, 800)} : {}),
    })),
    result: response.result,
    conditions: response.conditions,
    notes: `${response.reviewerSelfDescription}\n\n${response.notes}`.slice(0, 4000),
  });
  writeFileSync(join(runDir, "review.json"), `${JSON.stringify(record, null, 2)}\n`, "utf8");
  const counts = record.evidence.reduce<Record<string, number>>((acc, item) => ((acc[item.result] = (acc[item.result] ?? 0) + 1), acc), {});
  const markdown = [
    `# Revisão independente por IA: gabarito ${spec.caseId} v${answerKeyVersion}`,
    "",
    `Registro \`ai_independent_review\`, nunca aprovação humana. Revisor: ${record.reviewer.provider}/${record.reviewer.model} (${record.reviewer.effort}) via ${record.reviewer.tool}. Run ${record.run.id}${commit ? `, commit ${commit.slice(0, 7)}` : ""}. Fingerprint ${fingerprint}.`,
    "",
    `Resultado: **${record.result}**. Evidências: ${Object.entries(counts).map(([key, value]) => `${value} ${key}`).join(", ")}.`,
    "",
    "| Checagem | Feita |",
    "| --- | --- |",
    ...Object.entries(record.checks).map(([key, value]) => `| ${key} | ${value === null ? "n/a" : value ? "sim" : "não"} |`),
    "",
    "## Evidências",
    "",
    "| Resultado | Afirmação | Fonte | Âncora | Nota |",
    "| --- | --- | --- | --- | --- |",
    ...record.evidence.map((item) => `| ${item.result} | ${item.claim.replace(/\|/g, "/")} | ${item.source} | ${item.anchor ?? ""} | ${(item.note ?? "").replace(/\|/g, "/")} |`),
    "",
    ...(record.conditions.length > 0 ? ["## Condições", "", ...record.conditions.map((condition) => `- ${condition}`), ""] : []),
    "## Notas do revisor",
    "",
    record.notes,
    "",
  ].join("\n");
  writeFileSync(join(runDir, "review.md"), markdown, "utf8");
  console.log(`result ${record.result}; ${record.evidence.length} evidence items; written to ${runDir}`);
}

function codexVersion(): string {
  try {
    return execFileSync("codex", ["--version"], {encoding: "utf8"}).trim().replace(/^codex-cli\s*/, "");
  } catch {
    return "unknown";
  }
}

main();
