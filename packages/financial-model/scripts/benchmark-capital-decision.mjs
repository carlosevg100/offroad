import {createRequire} from 'node:module';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const require = createRequire(join(root, 'apps/document-worker/package.json'));
const {build} = require('esbuild');
const temporary = await mkdtemp(join(tmpdir(), 'offroad-capital-domain-eval-'));
try {
  const outfile = join(temporary, 'benchmark.mjs');
  await build({stdin: {contents: `
    import {performance} from 'node:perf_hooks';
    import {capitalDecisionReviewFixture} from './packages/testing-fixtures/src/capital-decision-review';
    import {prepareCapitalDecisionDelivery} from './packages/financial-model/src/capital-decision-delivery';
    export function benchmark() {
      const samplesMs = [];
      for (let i = 0; i < 3; i++) {
        const input = {review: capitalDecisionReviewFixture().input, material: {requested: true, audience: 'authorized_work_participants'}};
        const start = performance.now();
        const packet = prepareCapitalDecisionDelivery(input);
        const elapsed = performance.now() - start;
        if (!Number.isFinite(elapsed) || elapsed < 0 || !packet.alternatives[0]?.projection.rows) throw new Error('capital_domain_benchmark_invalid');
        samplesMs.push(elapsed);
      }
      return {event: 'capital.domain_useful_packet', schemaVersion: 1, synthetic: true, samplesMs,
        boundary: 'domain_call_to_validated_packet', includesQueue: false, includesProvider: false,
        includesPersistence: false, includesBrowserDelivery: false, providerCalls: 0};
    }`, resolveDir: root, sourcefile: 'capital-domain-benchmark.ts', loader: 'ts'},
    outfile, bundle: true, platform: 'node', format: 'esm', target: 'node24', logLevel: 'silent'});
  const {benchmark} = await import(pathToFileURL(outfile));
  process.stdout.write(JSON.stringify(benchmark()) + '\n');
} finally {await rm(temporary, {recursive: true, force: true});}
