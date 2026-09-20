import {createRequire} from 'node:module';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const require = createRequire(join(root, 'apps/document-worker/package.json'));
const {build} = require('esbuild');
const temporary = await mkdtemp(join(tmpdir(), 'offroad-capital-contracts-'));
try {
  const outfile = join(temporary, 'contracts.mjs');
  await build({entryPoints: [join(root, 'packages/financial-model/src/capital-executor-contracts.ts')], outfile, bundle: true, platform: 'node', format: 'esm', target: 'node24', logLevel: 'silent'});
  const {capitalDecisionExecutorContracts, capitalContractPreparationExecutorContracts} = await import(pathToFileURL(outfile));
  await writeFile(join(root, 'packages/financial-model/contracts/capital-decision-delivery.json'), JSON.stringify(capitalDecisionExecutorContracts()) + '\n');
  await writeFile(join(root, 'packages/financial-model/contracts/capital-contract-preparation.json'), JSON.stringify(capitalContractPreparationExecutorContracts()) + '\n');
} finally {await rm(temporary, {recursive: true, force: true});}
