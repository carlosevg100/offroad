import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {mkdtemp, mkdir, writeFile, rm, access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const require = createRequire(join(root, 'apps/document-worker/package.json'));
const {build} = require('esbuild');
const temporary = await mkdtemp(join(tmpdir(), 'offroad-capital-procedure-eval-'));
try {
  const outfile = join(temporary, 'runs.mjs');
  await build({stdin: {contents: `
    export {buildCapitalProcedureV2Runs} from './packages/financial-model/src/capital-procedure-v2-runs.test-support';
    export {deterministicMethodRunSchema} from './packages/credit-playbook/src/method-run-record';`,
    resolveDir: root, sourcefile: 'capital-procedure-eval.ts', loader: 'ts'},
    outfile, bundle: true, platform: 'node', format: 'esm', target: 'node24', logLevel: 'silent'});
  const {buildCapitalProcedureV2Runs, deterministicMethodRunSchema} = await import(pathToFileURL(outfile));
  const startedAt = new Date().toISOString();
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim();
  // A local run can include uncommitted harness bytes; the source commit is deliberately omitted
  // until those bytes are committed. The publication manifest later pins every harness source.
  const dirty = execFileSync('git', ['status', '--porcelain', '--', 'packages/financial-model', 'packages/testing-fixtures'], {cwd: root, encoding: 'utf8'}).trim();
  const version = process.argv[2] ?? "2026.09.21-v3";
  if (!["2026.09.21-v3", "2026.09.21-v4"].includes(version)) throw new Error("Unsupported method evaluation version");
  const records = buildCapitalProcedureV2Runs(version).map(evidence => deterministicMethodRunSchema.parse({
    schemaVersion: 'deterministic-method-run.v1', humanApproval: false, ...evidence,
    run: {startedAt, finishedAt: new Date().toISOString(), ...(dirty ? {} : {commit})},
  }));
  for (const record of records) {
    if (record.result !== 'pass') throw new Error(JSON.stringify(record.cases.filter(c => !c.passed)));
  }
  for (const record of records) {
    const directory = join(root, 'packages/credit-playbook/knowledge/reviews/runs', record.runId);
    try {await access(join(directory, "run.json")); throw new Error("Refuse to overwrite an existing run receipt");} catch(error) {if(error.code !== "ENOENT") throw error;}
    await mkdir(directory, {recursive: true});
    await writeFile(join(directory, 'run.json'), JSON.stringify(record, null, 2) + '\n');
    process.stdout.write(`${record.runId}: ${record.result} (${record.cases.length} cases)\n`);
  }
} finally {await rm(temporary, {recursive: true, force: true});}
