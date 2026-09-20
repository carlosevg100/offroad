import {createRequire} from 'node:module';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const require = createRequire(join(root, 'apps/document-worker/package.json'));
const {build} = require('esbuild');
const temporary = await mkdtemp(join(tmpdir(), 'offroad-capital-policy-'));
try {
  const outfile = join(temporary, 'compiler.mjs');
  await build({entryPoints: [join(root, 'packages/credit-playbook/src/build-capital-planning-policy.ts')], outfile, bundle: true,
    platform: 'node', format: 'esm', target: 'node24', logLevel: 'silent'});
  const {renderCapitalPlanningPolicy} = await import(pathToFileURL(outfile));
  await writeFile(join(root, 'packages/credit-playbook/src/capital-planning-policy.generated.ts'), renderCapitalPlanningPolicy(root));
} finally {await rm(temporary, {recursive: true, force: true});}
