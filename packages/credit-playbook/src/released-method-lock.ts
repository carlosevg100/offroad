/** Build-only registry. Published identities keep the source graph they were reviewed against. */
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {z} from "zod";
import {methodContentHash} from "./procedure-compiler";
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const pin = z.object({path: z.string(), hash});
const identity = z.object({id: z.string(), version: z.string()});
const releaseSchema = z.object({
  platformReleaseId: z.string(), sourceCommit: z.string().regex(/^[a-f0-9]{40}$/), snapshotHash: hash, artifactHash: hash,
  provenance: z.object({
    manifestHash: hash, procedure: identity.passthrough(), source: z.object({path: z.string(), hash}).passthrough(),
    compiler: z.object({hash, sources: z.array(pin)}).passthrough(),
    executor: z.object({sourceClosureHash: hash}).passthrough(), evidence: z.array(pin),
  }).passthrough(),
  routing: z.array(z.unknown()), capabilities: z.array(z.unknown()), approval: z.unknown(), executorSources: z.array(pin),
}).strict();
export function readReleasedMethodLock(root: string) {
  const directory = join(root, "packages/credit-playbook/knowledge/releases");
  const lock = z.object({schemaVersion: z.literal("method-release-lock.v1"), releases: z.array(releaseSchema)}).strict().parse(JSON.parse(readFileSync(join(directory, "method-release-lock.json"), "utf8")));
  const identities = new Set<string>();
  const releases = new Set<string>();
  for (const release of lock.releases) {
    const {manifestHash, ...payload} = release.provenance;
    const identity = `${payload.procedure.id}@${payload.procedure.version}`;
    if (identities.has(identity) || releases.has(release.platformReleaseId)) throw new Error("duplicate_published_method_identity");
    identities.add(identity); releases.add(release.platformReleaseId);
    if (methodContentHash(payload) !== manifestHash || methodContentHash(payload.compiler.sources) !== payload.compiler.hash || methodContentHash(release.executorSources) !== payload.executor.sourceClosureHash) throw new Error("published_method_lock_mismatch");
    const bytes = readFileSync(join(directory, `${release.snapshotHash}.sources.json`));
    if (createHash("sha256").update(bytes).digest("hex") !== release.snapshotHash) throw new Error("published_method_snapshot_mismatch");
    const snapshot = z.object({sourceCommit: z.literal(release.sourceCommit), pinned: z.record(z.string(), z.string())}).parse(JSON.parse(bytes.toString()));
    for (const p of [...release.executorSources, ...payload.compiler.sources, ...payload.evidence, {path: `packages/credit-playbook/knowledge/procedures/${payload.source.path}`, hash: payload.source.hash}]) {
      const content = snapshot.pinned[p.path];
      if (typeof content !== "string" || createHash("sha256").update(content).digest("hex") !== p.hash) throw new Error("published_method_source_mismatch");
    }
  }
  return lock;
}
