import {readFileSync,mkdtempSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {spawnSync} from "node:child_process";
import {describe,it,expect} from "vitest";
const workflow=readFileSync(resolve(import.meta.dirname,"../../../.github/workflows/document-work-product-continuation.yml"),"utf8");
const body=workflow.match(/python3 - <<'PY'\n([\s\S]*?)\n          PY/);
if(!body)throw new Error("Real continuation guard missing");
const python=body[1]!.split("\n").map(line=>line.startsWith("          ")?line.slice(10):line).join("\n");
function run(inventory:unknown,write=true){const dir=mkdtempSync(resolve(tmpdir(),"offroad-continuation-guard-"));try{if(write)writeFileSync(resolve(dir,"continuation-runs.json"),JSON.stringify(inventory));return spawnSync("python3",["-c",python],{env:{...process.env,RUNNER_TEMP:dir,GITHUB_RUN_ID:"100"},encoding:"utf8"}).status;}finally{rmSync(dir,{recursive:true,force:true});}}
describe("actual protected continuation workflow guard",()=>{
 it("permits only the first inventoried run",()=>{expect(run({total_count:1,workflow_runs:[{id:100}]})).toBe(0);});
 it("rejects any prior run, including cancelled predecessors",()=>{expect(run({total_count:2,workflow_runs:[{id:100},{id:99}]})).not.toBe(0);});
 it("rejects missing current inventory",()=>{expect(run({total_count:1,workflow_runs:[{id:101}]})).not.toBe(0);expect(run({total_count:0,workflow_runs:[]})).not.toBe(0);expect(run(null,false)).not.toBe(0);});
 it("rejects incomplete pagination",()=>{expect(run({total_count:2,workflow_runs:[{id:100}]})).not.toBe(0);});
 it("rejects malformed inventory",()=>{expect(run(null)).not.toBe(0);});
 it("keeps protected main and shared concurrency",()=>{expect(workflow).toContain("github.run_attempt == 1");expect(workflow).toContain("environment: intent-router-gold-main");expect(workflow).toContain("group: document-work-product-live");expect(workflow).toContain("cancel-in-progress: false");});
});
