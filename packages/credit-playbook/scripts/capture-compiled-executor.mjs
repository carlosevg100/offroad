/** Operator build tooling: capture one published composition from a committed source graph.
 * This creates executor packaging only; it never publishes a method or grants execution. */
import {createRequire} from 'node:module';
import {readFileSync, writeFileSync, mkdtempSync, rmSync} from 'node:fs';
import {resolve, relative, join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {rebuildReleasedExecutor} from './build-released-executors.mjs';
const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const [commit, manifestPath] = process.argv.slice(2);
if (!/^[a-f0-9]{40}$/.test(commit ?? '') || !/^packages\/credit-playbook\/knowledge\/reviews\/[\w/.-]+\.json$/.test(manifestPath ?? '') || manifestPath.split('/').includes('..')) throw Error('usage: capture-compiled-executor.mjs COMMIT MANIFEST_PATH');
const git = (...a) => execFileSync('git', a, {cwd: root, encoding: 'utf8', maxBuffer: 20e6});
if (git('remote', 'get-url', 'origin').trim() !== 'https://github.com/carlosevg100/offroad.git') throw Error('untrusted_repository');
git('merge-base', '--is-ancestor', commit, 'origin/main');
const sha = x => createHash('sha256').update(x).digest('hex');
const readCommitted = path => {
  if (!path.startsWith('packages/') && !['pnpm-lock.yaml', 'tsconfig.base.json'].includes(path)) throw Error('source_path_denied');
  if (path.includes('\\') || path.split('/').includes('..') || !/^100(644|755) blob /.test(git('ls-tree', commit, '--', path))) throw Error('source_not_regular');
  return git('show', `${commit}:${path}`);
};
const require = createRequire(join(root, 'apps/document-worker/package.json'));
const {build, version} = require('esbuild');
const helper = await build({entryPoints:[join(root, 'packages/agent-contracts/src/execution-profile.ts')], bundle:true, write:false, format:'esm', platform:'node', target:'node24', logLevel:'silent'});
const {deriveExecutionProfile} = await import('data:text/javascript;base64,' + Buffer.from(helper.outputFiles[0].contents).toString('base64'));
const manifestBytes = readCommitted(manifestPath), manifest = JSON.parse(manifestBytes);
const platformReleaseId = `${manifest.procedure.id}-${manifest.procedure.version}`;
const profile = deriveExecutionProfile(manifest, {id:platformReleaseId, manifestHash:manifest.manifestHash});
// The adapter and its schemas are explicit. Additional formats require their own reviewed adapter.
if (profile.method.executor.key !== '@offroad/financial-model#prepareCapitalProcedurePacketV2' || profile.method.executor.version !== '2026.09.21-v2') throw Error('compiled_executor_adapter_unavailable');
const selected = manifest.components.find(c => c.component.id === profile.selectedComponentId);
const evidence = [...new Map(manifest.components.flatMap(c => c.evidence).map(p => [p.path, p])).values()];
const pins = [...selected.executor.sources, ...manifest.compiler.sources, ...evidence,
  {path:`packages/credit-playbook/knowledge/procedures/${manifest.source.path}`, hash:manifest.source.hash},
  {path:manifestPath, hash:sha(manifestBytes)}];
const pinned = {};
for (const pin of pins) {
  const bytes = readCommitted(pin.path);
  if (sha(bytes) !== pin.hash) throw Error('source_pin_changed:' + pin.path);
  pinned[pin.path] = bytes;
}
if (readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8') !== pinned['pnpm-lock.yaml']) throw Error('installed_lock_differs');
const files = {}, edges = {}, parseOnlySources = [];
const unusedRegistry = 'packages/credit-playbook/src/method-runtime-manifest.ts';
const canonical = path => relative(root, path).split('\\').join('/');
const entry = 'export {prepareCapitalProcedurePacketV2, capitalProcedurePacketV2InputSchema, capitalProcedurePacketV2OutputSchema} from "../../packages/financial-model/src/capital-procedure-packet-v2.ts";';
const captured = await build({metafile:true, stdin:{contents:entry, resolveDir:join(root,'apps/document-worker'), sourcefile:'release-entry.ts', loader:'ts'}, bundle:true, write:false, format:'cjs', platform:'node', target:'node24', plugins:[{name:'capture-published-composition', setup(b) {
  b.onResolve({filter:/.*/}, async a => {
    if (a.pluginData?.skip) return;
    const result = await b.resolve(a.path, {resolveDir:a.resolveDir, kind:a.kind, importer:a.importer, pluginData:{skip:true}});
    if (result.errors.length) return {errors:result.errors};
    if (result.external && !['node:crypto','node:fs','node:path'].includes(a.path)) throw Error('external_import_denied');
    // Only unused hash initializers in this pinned barrel are elidable.
    if (!result.external && canonical(result.path) === unusedRegistry) result.sideEffects = false;
    const from = !a.importer || a.importer.endsWith('release-entry.ts') ? 'entry' : canonical(a.importer);
    (edges[from] ??= {})[a.path] = result.external ? {external:a.path} : {path:canonical(result.path), ...(canonical(result.path) === unusedRegistry ? {sideEffects:false} : {})};
    return result;
  });
  b.onLoad({filter:/.*/}, a => {
    const key = canonical(a.path);
    if (key.startsWith('../') || key.startsWith('/')) throw Error('source_outside_repository');
    const content = readFileSync(a.path, 'utf8'), loader = a.path.endsWith('.ts') ? 'ts' : a.path.endsWith('.json') ? 'json' : 'js';
    if (!key.startsWith('node_modules/') && pinned[key] !== content) {
      const allowedParseOnly = ['packages/credit-playbook/src/capital-planning-policy.generated.ts','packages/credit-playbook/src/method-runtime-manifest.generated.ts'];
      if (!allowedParseOnly.includes(key) || readCommitted(key) !== content) throw Error('unpublished_source:' + key);
      pinned[key] = content; parseOnlySources.push({path:key, hash:sha(content)});
    }
    files[key] = {content, loader};
    return {contents:content, loader, resolveDir:dirname(a.path)};
  });
}}]});
for (const output of Object.values(captured.metafile.outputs)) {
  if (output.imports.some(i => i.external && i.path !== 'node:crypto')) throw Error('runtime_external_import_denied');
  for (const [path, info] of Object.entries(output.inputs)) if (path !== 'apps/document-worker/release-entry.ts' && !path.startsWith('node_modules/') && info.bytesInOutput > 0 && !selected.executor.sources.some(p => p.path === path)) throw Error('runtime_source_not_pinned:' + path);
}
files.entry = {content:entry, loader:'ts'};
const snapshot = {schemaVersion:'method-executor-snapshot.v1', sourceCommit:commit, esbuildVersion:version, pinned, files, edges};
const directory = join(root, 'packages/credit-playbook/knowledge/releases');
const bytes = JSON.stringify(snapshot) + '\n', snapshotHash = sha(bytes);
const lockPath = join(directory, 'compiled-executor-lock.json');
const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
if (lock.schemaVersion !== 'compiled-executor-lock.v1' || lock.releases.some(r => r.platformReleaseId === platformReleaseId)) throw Error('compiled_release_already_recorded');
const temporary = mkdtempSync(join(tmpdir(), 'offroad-compiled-executor-'));
writeFileSync(join(temporary, snapshotHash + '.sources.json'), bytes, {flag:'wx'});
const release = {platformReleaseId, sourceCommit:commit, snapshotHash, artifactHash:null,
  parseOnlySources, manifestPath, manifestFileHash:sha(manifestBytes), profileFingerprint:profile.fingerprint,
  provenance:{procedure:manifest.procedure, manifestHash:manifest.manifestHash, compiler:manifest.compiler, evidence}, executorSources:selected.executor.sources};
let artifactHash;
try { ({artifactHash} = await rebuildReleasedExecutor(release, temporary)); } finally { rmSync(temporary, {recursive:true, force:true}); }
writeFileSync(join(directory, snapshotHash + '.sources.json'), bytes, {flag:'wx'});
release.artifactHash = artifactHash;
lock.releases.push(release);
writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
console.log(JSON.stringify({platformReleaseId, sourceCommit:commit, snapshotHash, artifactHash, files:Object.keys(files).length, grantsExecution:false}));
