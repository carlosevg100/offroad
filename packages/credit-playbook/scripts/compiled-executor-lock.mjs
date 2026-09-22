/** Validate compiled compositions separately from the historical specialist manifest format. */
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve, join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const sha = x => createHash('sha256').update(x).digest('hex');
let helper;
async function derivation() {
  helper ??= (async () => {
    const require = createRequire(join(root, 'apps/document-worker/package.json'));
    const {build} = require('esbuild');
    const result = await build({entryPoints:[join(root,'packages/agent-contracts/src/execution-profile.ts')], bundle:true, write:false, format:'esm', platform:'node', target:'node24', logLevel:'silent'});
    return import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].contents).toString('base64'));
  })();
  return helper;
}
export async function validateCompiledExecutorRelease(release, directory) {
  for (const key of ['snapshotHash','artifactHash','manifestFileHash','profileFingerprint']) if (!/^[a-f0-9]{64}$/.test(release[key] ?? '')) throw Error('compiled_release_hash_invalid');
  if (!/^[a-f0-9]{40}$/.test(release.sourceCommit ?? '')) throw Error('compiled_release_commit_invalid');
  const bytes = readFileSync(join(directory, release.snapshotHash + '.sources.json'));
  if (sha(bytes) !== release.snapshotHash) throw Error('compiled_release_snapshot_mismatch');
  const snapshot = JSON.parse(bytes);
  const manifestBytes = snapshot.pinned?.[release.manifestPath];
  if (typeof manifestBytes !== 'string' || sha(manifestBytes) !== release.manifestFileHash || snapshot.sourceCommit !== release.sourceCommit) throw Error('compiled_release_manifest_mismatch');
  const allowedParseOnly = ['packages/credit-playbook/src/capital-planning-policy.generated.ts','packages/credit-playbook/src/method-runtime-manifest.generated.ts'];
  if (!Array.isArray(release.parseOnlySources) || release.parseOnlySources.length !== allowedParseOnly.length || new Set(release.parseOnlySources.map(p => p.path)).size !== allowedParseOnly.length) throw Error('compiled_release_parse_dependency_mismatch');
  for (const p of release.parseOnlySources) if (!allowedParseOnly.includes(p.path) || typeof snapshot.pinned[p.path] !== 'string' || sha(snapshot.pinned[p.path]) !== p.hash) throw Error('compiled_release_parse_dependency_mismatch');
  const manifest = JSON.parse(manifestBytes), {deriveExecutionProfile} = await derivation();
  const profile = deriveExecutionProfile(manifest, {id:release.platformReleaseId, manifestHash:release.provenance.manifestHash});
  const selected = manifest.components.find(c => c.component.id === profile.selectedComponentId);
  const evidence = [...new Map(manifest.components.flatMap(c => c.evidence).map(p => [p.path,p])).values()];
  if (profile.fingerprint !== release.profileFingerprint || JSON.stringify(selected.executor.sources) !== JSON.stringify(release.executorSources)
    || JSON.stringify(release.provenance) !== JSON.stringify({procedure:manifest.procedure, manifestHash:manifest.manifestHash, compiler:manifest.compiler, evidence})) throw Error('compiled_release_profile_mismatch');
  if (profile.method.executor.key !== '@offroad/financial-model#prepareCapitalProcedurePacketV2' || profile.method.executor.version !== '2026.09.21-v2') throw Error('compiled_executor_adapter_unavailable');
  return {manifestBytes, profile};
}
export async function readCompiledExecutorLock(directory) {
  const lock = JSON.parse(readFileSync(join(directory,'compiled-executor-lock.json'), 'utf8'));
  if (lock.schemaVersion !== 'compiled-executor-lock.v1' || !Array.isArray(lock.releases)) throw Error('compiled_release_lock_invalid');
  const identities = new Set();
  for (const r of lock.releases) {
    if (identities.has(r.platformReleaseId)) throw Error('compiled_release_duplicate');
    identities.add(r.platformReleaseId);
    await validateCompiledExecutorRelease(r, directory);
  }
  return lock;
}
