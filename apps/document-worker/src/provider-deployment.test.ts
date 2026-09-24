import {readFileSync, mkdtempSync, writeFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {describe, expect, it} from "vitest";
import {processingAssuranceSchema} from "@offroad/model-gateway";

const root = new URL("../../../", import.meta.url);
const task = JSON.parse(readFileSync(new URL("apps/document-worker/task-definition.json", root), "utf8"));
const workflow = readFileSync(new URL(".github/workflows/deploy-worker.yml", root), "utf8");
const script = workflow.split("          python3 - <<'PY'\n")[1]!.split("          PY\n")[0]!.split("\n").map(line => line.slice(10)).join("\n");

function render(spec: typeof task) {
  const dir = mkdtempSync(join(tmpdir(), "offroad-provider-pin-"));
  try {
    writeFileSync(join(dir, "task.json"), JSON.stringify(spec));
    writeFileSync(join(dir, "arns.txt"), spec.containerDefinitions[0].secrets.map((s: {valueFrom: string}) => `${s.valueFrom} arn:aws:secretsmanager:sa-east-1:000000000000:secret:${s.valueFrom}-synthetic`).join("\n"));
    const actual = script.replaceAll("apps/document-worker/task-definition.json", join(dir, "task.json"))
      .replaceAll("/tmp/secret-arns.txt", join(dir, "arns.txt")).replaceAll("/tmp/taskdef.json", join(dir, "rendered.json"));
    const run = spawnSync("python3", ["-c", actual], {encoding: "utf8", env: {...process.env, IMAGE_URI: "synthetic-image", DOCUMENTARY_WORK_PLANNING_ENABLED: "true"}});
    return {status: run.status, stderr: run.stderr, result: run.status === 0 ? JSON.parse(readFileSync(join(dir, "rendered.json"), "utf8")) : null};
  } finally {rmSync(dir, {recursive: true, force: true});}
}

describe("provider deployment binding", () => {
  it("runs the actual deployment renderer and pins both reviewed secret versions", () => {
    const run = render(structuredClone(task));
    expect(run.status, run.stderr).toBe(0);
    const container = run.result.containerDefinitions[0];
    const bindings = JSON.parse(container.environment.find((e: {name: string}) => e.name === "PROVIDER_CONNECTIONS_JSON").value);
    for (const [name, provider] of [["OPENAI_API_KEY", "openai"], ["ANTHROPIC_API_KEY", "anthropic"]]) {
      const secret = container.secrets.find((s: {name: string}) => s.name === name);
      expect(secret.valueFrom).toMatch(new RegExp(`:::${bindings[provider!].credentialBinding}$`));
      expect(secret).not.toHaveProperty("versionId");
    }
    expect(container.environment.find((e: {name: string}) => e.name === "DOCUMENTARY_WORK_PLANNING_ENABLED").value).toBe("true");
  });

  it("stops deployment when a credential version no longer matches its reviewed account binding", () => {
    const changed = structuredClone(task);
    changed.containerDefinitions[0].secrets.find((s: {name: string}) => s.name === "OPENAI_API_KEY").versionId = "00000000-0000-4000-8000-000000000001";
    const run = render(changed);
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("Provider credential version differs from reviewed binding");
  });

  it("accepts the reviewed assurance bundles under the same strict runtime contract", () => {
    for (const review of ["2026-09-21", "2026-09-24"]) {
      const rows = JSON.parse(readFileSync(new URL(`docs/security/provider-processing/${review}/assurances.json`, root), "utf8"));
      expect(rows).toHaveLength(8);
      for (const row of rows) expect(processingAssuranceSchema.safeParse(row).success).toBe(true);
    }
  });

  it("re-registers the reviewed assurances without a date, through the operator commands only", () => {
    const read = (path: string) => readFileSync(new URL(`docs/security/provider-processing/${path}`, root), "utf8");
    type Row = Record<string, unknown> & {id: string};
    const previous = JSON.parse(read("2026-09-21/assurances.json")) as Row[];
    const current = JSON.parse(read("2026-09-24/assurances.json")) as Row[];
    // The founder decision of 24/09/2026: the same verification and evidence, a new identity, no date.
    const verification = ({id: _id, validThrough: _validThrough, ...rest}: Row) => rest;
    expect(current.map(verification)).toEqual(previous.map(verification));
    expect(current.map(row => row.validThrough)).toEqual(previous.map(() => null));
    expect(new Set([...previous, ...current].map(row => row.id)).size).toBe(previous.length + current.length);
    // The act pairs, revokes and records exactly these identities and documents, in the same order.
    const act = read("2026-09-24/reregister-without-expiry.sql");
    const pairs = [...act.matchAll(/\('([0-9a-f-]{36})','[0-9a-f]{64}','([0-9a-f-]{36})','[0-9a-f]{64}'\)/g)].map(m => [m[1], m[2]]);
    const revoked = [...act.matchAll(/revoke_provider_processing_assurance_v1\('([0-9a-f-]{36})'/g)].map(m => m[1]);
    const recorded = [...act.matchAll(/record_provider_processing_assurance_v1\(\$assurance\$(.*?)\$assurance\$::jsonb/g)].map(m => JSON.parse(m[1]!));
    expect(pairs).toEqual(previous.map((row, index) => [row.id, current[index]!.id]));
    expect(revoked).toEqual(previous.map(row => row.id));
    expect(recorded).toEqual(current);
    expect(act).not.toMatch(/\b(insert\s+into|update|delete\s+from|truncate)\s+private\.provider_processing/i);
  });
});
