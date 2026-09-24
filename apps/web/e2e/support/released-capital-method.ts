import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {existsSync, readFileSync} from "node:fs";
import {join} from "node:path";
import {deriveExecutionProfile, executionCanonicalText} from "@offroad/agent-contracts";

/** The capital method production released for execution in stage 17, increment 4A. */
export const releasedCapitalMethod = {methodId: "prepare-capital-structure-decision", methodVersion: "2026.09.21-v4"} as const;

const root = join(__dirname, "../../../..");
const reviewPath = "packages/credit-playbook/knowledge/reviews/execution-profile-prepare-capital-structure-decision-2026-09-21-v4-adapter-review.json";
const sha256 = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
/** Exact bytes as a SQL text value: no quoting of JSON or prose can change them on the way. */
const literal = (value: string) => `convert_from(decode('${Buffer.from(value, "utf8").toString("hex")}','hex'),'UTF8')`;

type CompiledRelease = {
  platformReleaseId: string; artifactHash: string; manifestFileHash: string; profileFingerprint: string;
  provenance: {procedure: {id: string; version: string}; manifestHash: string};
};

/**
 * The execution profile of the released v4 method, derived from the manifest the E2E job installed
 * beside the executor when it built the worker, and checked against the bytes production registered:
 * the profile fingerprint the compiled executor lock records and the canonical text hash the
 * independent adapter review approved.
 */
function releasedCapitalProfile() {
  const lock = JSON.parse(readFileSync(join(root, "packages/credit-playbook/knowledge/releases/compiled-executor-lock.json"), "utf8")) as {releases: CompiledRelease[]};
  const release = lock.releases.find(r => r.provenance.procedure.id === releasedCapitalMethod.methodId && r.provenance.procedure.version === releasedCapitalMethod.methodVersion);
  if (!release) throw new Error("The compiled executor lock has no release of the capital method v4.");
  const installed = join(root, "apps/document-worker/released-methods", `${release.artifactHash}.manifest.json`);
  if (!existsSync(installed)) throw new Error(`The released v4 manifest is not installed at ${installed}: the E2E job builds the worker, and with it the released executors, before Playwright.`);
  const manifest = readFileSync(installed);
  if (sha256(manifest) !== release.manifestFileHash) throw new Error("The installed v4 manifest is not the released one.");
  const profile = deriveExecutionProfile(JSON.parse(manifest.toString("utf8")), {id: release.platformReleaseId, manifestHash: release.provenance.manifestHash});
  const text = executionCanonicalText(profile);
  const reviewBytes = readFileSync(join(root, reviewPath));
  const review = JSON.parse(reviewBytes.toString("utf8")) as {result: string; reviewer: string; subjectCommit: string; evidence: {canonicalProfileTextSha256: string}};
  if (profile.fingerprint !== release.profileFingerprint || sha256(text) !== review.evidence.canonicalProfileTextSha256) throw new Error("The derived v4 profile differs from the one production registered.");
  return {release, text, textSha256: sha256(text),
    evidence: {result: review.result, reviewer: review.reviewer, subjectCommit: review.subjectCommit, sourcePath: reviewPath, sourceHash: sha256(reviewBytes)}};
}

export type ReleasedCapitalSetup = {
  /** SHA-256 of the canonical profile text: the payload fingerprint of the only released profile. */
  profileSha256: string;
  /** Puts the capability back as it was, so later journeys see the catalogue they saw before. */
  restore: () => void;
};

/**
 * What production holds for the founder's workspace before the first real request, set up on the
 * disposable local stack through the operator commands production used, as postgres (they refuse
 * any other role):
 *
 * 1. The acting principal. Production's founder principal was seeded by the migration that created
 *    the registry (20260923200029_platform_operator_identity.sql), and no command registers one;
 *    here the journey's own synthetic user stands in for the founder, a member of the workspace that
 *    requests, as the founder is of Cedro.
 * 2. `grant_execution_producer_v1` for that workspace: an operator act, as production's grant was.
 * 3. The v4 profile. `register_execution_method_profile_v1` runs only when the release has no
 *    profile with production's bytes: the pinned consumer proof of this job already installs them.
 *    A local stack without the v4 release row cannot publish one here, and the journey stops.
 * 4. `release_platform_capability_v1` with universal exposure on the capability of the v4 release,
 *    unless it is already released universally.
 *
 * Then the server must resolve exactly one released profile for the method, with production's bytes.
 */
export function enableReleasedCapitalMethod({databaseUrl, email, projectId}: {databaseUrl: string; email: string; projectId: string}): ReleasedCapitalSetup {
  const sql = (query: string) => execFileSync("psql", [databaseUrl, "-qAt", "-v", "ON_ERROR_STOP=1"],
    {input: query, encoding: "utf8", env: {...process.env, PGAPPNAME: "offroad e2e capital execution journey"}}).trim();
  const {release, text, textSha256, evidence} = releasedCapitalProfile();
  const [actor, organization] = sql(`select u.id||'|'||p.organization_id from public.capital_projects p join auth.users u on u.id=p.created_by where p.id='${projectId}' and u.email=${literal(email)};`).split("|");
  if (!actor || !organization) throw new Error("The journey's project and its creator were not found.");
  sql(`insert into private.platform_principals(user_id,role,label) values('${actor}','founder','Synthetic founder of the local E2E stack') on conflict (user_id) do nothing;`);
  sql(`select private.grant_execution_producer_v1(gen_random_uuid(),'${organization}',true,${literal("Local E2E stack: producer for the synthetic founder workspace, as production enabled the founder workspace in stage 17, 4A.")},'${actor}');`);
  const row = sql(`select r.capability_key||'|'||c.released::text||'|'||c.exposure||'|'||exists(select 1 from private.execution_method_profiles x where x.platform_release_id=r.id and x.payload_fingerprint='${textSha256}')::text
    from private.platform_method_releases r join private.platform_capability_releases c on c.capability_key=r.capability_key and c.method_id=r.method_id and c.method_version=r.version
    where r.id=${literal(release.platformReleaseId)} and r.method_id='${releasedCapitalMethod.methodId}' and r.version='${releasedCapitalMethod.methodVersion}' and r.manifest_hash='${release.provenance.manifestHash}';`);
  if (!row) throw new Error(`The local database has no platform release ${release.platformReleaseId} to execute: the capability of the released v4 method is not installed on this stack.`);
  const [capability, released, exposure, registered] = row.split("|");
  if (registered !== "true") {
    sql(`select private.register_execution_method_profile_v1(gen_random_uuid(),gen_random_uuid(),${literal(release.platformReleaseId)},${literal(text)},'${evidence.subjectCommit}',
      ${literal(JSON.stringify(evidence))}::jsonb,'${actor}',${literal("Local E2E stack: the v4 execution profile with the bytes production registered in stage 17, 4A.")});`);
  }
  const changed = !(released === "true" && exposure === "universal");
  if (changed) {
    sql(`select private.release_platform_capability_v1(gen_random_uuid(),${literal(capability)},true,'universal','${actor}',${literal("Local E2E stack: the universal v4 release production made in stage 17, 4A, for one journey.")});`);
  }
  const served = sql(`select (private.execution_released_profile_v1('${releasedCapitalMethod.methodId}')).payload_fingerprint;`);
  if (served !== textSha256) throw new Error(`The server resolves profile ${served} for the capital method, not the v4 bytes production registered.`);
  return {
    profileSha256: textSha256,
    restore: () => {
      if (!changed) return;
      sql(`select private.release_platform_capability_v1(gen_random_uuid(),${literal(capability)},${released === "true"},${literal(exposure)},'${actor}',${literal("Local E2E stack: the journey ended; the capability returns to its prior state.")});`);
    },
  };
}
