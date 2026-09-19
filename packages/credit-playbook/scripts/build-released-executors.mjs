/** Rebuild from the recorded source graph only. No live package resolution or network. */
import {createRequire} from 'node:module';
import {readFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve, join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const require = createRequire(join(root, 'apps/document-worker/package.json'));
const {build, version} = require('esbuild');
const hash = value => createHash('sha256').update(value).digest('hex');
export async function rebuildReleasedExecutor(release, directory = join(root, 'packages/credit-playbook/knowledge/releases')) {
  if (!/^[a-f0-9]{64}$/.test(release.snapshotHash)) throw new Error('release_snapshot_identity_invalid');
  const bytes = readFileSync(join(directory, release.snapshotHash + '.sources.json'));
  if (hash(bytes) !== release.snapshotHash) throw new Error('release_snapshot_hash_mismatch');
  const snapshot = JSON.parse(bytes);
  if (snapshot.schemaVersion !== 'method-executor-snapshot.v1' || snapshot.sourceCommit !== release.sourceCommit || snapshot.esbuildVersion !== version) throw new Error('release_build_toolchain_mismatch');
  for (const pin of [...release.executorSources, ...release.provenance.compiler.sources, ...release.provenance.evidence]) {
    if (typeof snapshot.pinned[pin.path] !== 'string' || hash(snapshot.pinned[pin.path]) !== pin.hash) throw new Error('release_source_pin_mismatch');
  }
  for (const [path, file] of Object.entries(snapshot.files)) {
    if (path !== 'entry' && !path.startsWith('node_modules/') && snapshot.pinned[path] !== file.content) throw new Error('release_unpinned_first_party_source');
  }
  const result = await build({entryPoints: ['entry'], bundle: true, write: false, format: 'cjs', platform: 'node', target: 'node24', minify: true, legalComments: 'inline', plugins: [{name: 'released-sources', setup(b) {
    b.onResolve({filter: /.*/}, args => {
      if (args.kind === 'entry-point') return {path: 'entry', namespace: 'released'};
      const edge = snapshot.edges[args.importer]?.[args.path];
      if (!edge) throw new Error('release_import_not_recorded');
      if (edge.external) {
        if (edge.external !== 'node:crypto') throw new Error('release_external_import_denied');
        return {path: edge.external, external: true};
      }
      if (!snapshot.files[edge.path]) throw new Error('release_source_missing');
      return {path: edge.path, namespace: 'released'};
    });
    b.onLoad({filter: /.*/, namespace: 'released'}, args => {
      const file = snapshot.files[args.path];
      if (!file) throw new Error('release_source_missing');
      return {contents: file.content, loader: file.loader};
    });
  }}]});
  const artifact = result.outputFiles[0].contents;
  if (release.artifactHash && hash(artifact) !== release.artifactHash) throw new Error('release_artifact_hash_mismatch');
  return {artifact, artifactHash: hash(artifact)};
}
export async function buildReleasedExecutors() {
  const lock = JSON.parse(readFileSync(join(root, 'packages/credit-playbook/knowledge/releases/method-release-lock.json'), 'utf8'));
  if (lock.schemaVersion !== 'method-release-lock.v1') throw new Error('release_lock_invalid');
  const entries = lock.releases.map(r => ({platformReleaseId: r.platformReleaseId, methodId: r.provenance.procedure.id, methodVersion: r.provenance.procedure.version, manifestHash: r.provenance.manifestHash, artifactHash: r.artifactHash}));
  const index = '// Generated from method-release-lock.json; verified by the release build.\nexport const releasedMethodArtifacts = ' + JSON.stringify(entries, null, 2) + ' as const;\n';
  if (readFileSync(join(root, 'apps/document-worker/src/released-methods.generated.ts'), 'utf8') !== index) throw new Error('release_runtime_index_mismatch');
  const directory = join(root, 'apps/document-worker/released-methods');
  mkdirSync(directory, {recursive: true});
  writeFileSync(join(directory, "THIRD_PARTY_NOTICES.md"), readFileSync(join(root, "packages/credit-playbook/knowledge/releases/THIRD_PARTY_NOTICES.md")));
  for (const release of lock.releases) {
    if (!/^[a-f0-9]{64}$/.test(release.artifactHash)) throw new Error('release_artifact_identity_missing');
    const {artifact} = await rebuildReleasedExecutor(release);
    writeFileSync(join(directory, release.artifactHash + '.cjs'), artifact);
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildReleasedExecutors();
