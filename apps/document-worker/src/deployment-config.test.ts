import {execFileSync} from "node:child_process";
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {describe, expect, it} from "vitest";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const workflow = readFileSync(join(root, ".github/workflows/deploy-worker.yml"), "utf8");
const spec = JSON.parse(readFileSync(join(root, "apps/document-worker/task-definition.json"), "utf8"));
const script = workflow.split("          python3 - <<'PY'\n")[1]!.split("          PY")[0]!.split("\n").map(line => line.slice(10)).join("\n");

function render(flag?: string, duplicate = false) {
  const directory = mkdtempSync(join(tmpdir(), "offroad-deploy-config-"));
  try {
    const source = structuredClone(spec);
    if (duplicate) source.containerDefinitions[0].environment.push({name: "DOCUMENTARY_WORK_PLANNING_ENABLED", value: "false"});
    writeFileSync(join(directory, "source.json"), JSON.stringify(source));
    writeFileSync(join(directory, "secret-arns.txt"), source.containerDefinitions[0].secrets.map((entry: {valueFrom: string}) => `${entry.valueFrom} arn:aws:secretsmanager:synthetic`).join("\n"));
    const compiled = script.replace('"apps/document-worker/task-definition.json"', JSON.stringify(join(directory, "source.json"))).replaceAll('"/tmp/secret-arns.txt"', JSON.stringify(join(directory, "secret-arns.txt"))).replace('"/tmp/taskdef.json"', JSON.stringify(join(directory, "taskdef.json")));
    const env: NodeJS.ProcessEnv = {...process.env, IMAGE_URI: "synthetic-image:approved-sha"};
    delete env.DOCUMENTARY_WORK_PLANNING_ENABLED;
    if (flag !== undefined) env.DOCUMENTARY_WORK_PLANNING_ENABLED = flag;
    execFileSync("python3", ["-c", compiled], {env, stdio: "pipe"});
    return JSON.parse(readFileSync(join(directory, "taskdef.json"), "utf8"));
  } finally { rmSync(directory, {recursive: true, force: true}); }
}

describe("managed worker documentary deployment gate", () => {
  it("checks boot evidence with mocked AWS responses without credentials", () => {
    execFileSync("python3", ["-B", "-m", "unittest", "discover", "-s", "scripts/ci", "-p", "test_verify_worker_boot_flag.py"], {cwd: root, stdio: "pipe"});
  });
  it("keeps the checked-in gate and missing repository variable disabled", () => {
    expect(spec.containerDefinitions[0].environment.filter((entry: {name: string}) => entry.name === "DOCUMENTARY_WORK_PLANNING_ENABLED")).toEqual([{name: "DOCUMENTARY_WORK_PLANNING_ENABLED", value: "false"}]);
    expect(workflow).toContain("${{ vars.DOCUMENTARY_WORK_PLANNING_ENABLED || 'false' }}");
    expect(render().containerDefinitions[0].environment).toContainEqual({name: "DOCUMENTARY_WORK_PLANNING_ENABLED", value: "false"});
  });
  it.each(["true", "false"])("renders explicit %s and preserves all other runtime controls", flag => {
    const actual = render(flag).containerDefinitions[0];
    expect(actual.image).toBe("synthetic-image:approved-sha");
    expect(actual.environment.filter((entry: {name: string}) => entry.name !== "DOCUMENTARY_WORK_PLANNING_ENABLED")).toEqual(spec.containerDefinitions[0].environment.filter((entry: {name: string}) => entry.name !== "DOCUMENTARY_WORK_PLANNING_ENABLED"));
    expect(actual.environment).toContainEqual({name: "DOCUMENTARY_WORK_PLANNING_ENABLED", value: flag});
  });
  it.each(["TRUE", "1", "yes", "", " true "])("rejects invalid deployment setting %j before registration", flag => {
    expect(() => render(flag)).toThrow(/must be true or false/);
  });
  it("refuses an ambiguous duplicate environment entry", () => {
    expect(() => render("true", true)).toThrow(/exactly one/);
  });
});
