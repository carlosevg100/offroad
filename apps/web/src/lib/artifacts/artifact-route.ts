import "server-only";

import {houseDocumentTemplate} from "@offroad/case-export";
import {presentationStructureFromStored} from "@offroad/case-export/presentation-structure";
import {presentationTemplateFromStored, type InstitutionalPresentationTemplate} from "@offroad/case-export/presentation-template";
import type {ArtifactKind, ArtifactRevision} from "@offroad/domain-contracts";
import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";

import enMessages from "../../../messages/en-US.json";
import ptMessages from "../../../messages/pt-BR.json";
import {presentationTemplateForProject, resolvePresentationTemplate} from "@/lib/advisor/presentation-template";
import type {Database} from "@/types/database";

import {artifactRenderers, type ArtifactRendererEntry} from "./artifact-renderers";
import {
  artifactServing,
  readArtifactHead,
  readArtifactRevision,
  resolveRenderer,
  revisionBelongsTo,
  type ArtifactRead,
  type ArtifactRefusal,
} from "./authorized-artifact-reader";

/**
 * What the five download routes share once they resolve an exact revision: the optional `revision`
 * query parameter, the resolution through the authorized reader, the identity the revision renders
 * with, and the plain answers a person reads when nothing is served.
 */

export type ArtifactDownloadCopy = typeof ptMessages.ArtifactDownload;

export function artifactDownloadCopy(lang: "pt" | "en"): ArtifactDownloadCopy {
  return (lang === "pt" ? ptMessages : enMessages).ArtifactDownload;
}

const noStore = {"cache-control": "private, no-store"} as const;

export function artifactNotFound(): Response {
  return new Response(null, {status: 404, headers: noStore});
}

/** A refusal the person can read. Nothing is served and nothing is cached. */
export function artifactUnavailable(text: string, status = 409): Response {
  return new Response(text, {status, headers: {...noStore, "content-type": "text/plain; charset=utf-8"}});
}

export type RevisionParameter = {ok: true; revisionId: string | null} | {ok: false};

/** `?revision=<uuid>` selects the exact revision; without it the route serves the head. Anything else is not a revision. */
export function requestedRevision(request: Request): RevisionParameter {
  const values = new URL(request.url).searchParams.getAll("revision");
  if (values.length === 0) return {ok: true, revisionId: null};
  return values.length === 1 && z.uuid().safeParse(values[0]).success ? {ok: true, revisionId: values[0]!} : {ok: false};
}

export type RouteRevisionTarget = {workId: string; kind: ArtifactKind; subject: string};
export type ServedRead = Extract<ArtifactRead, {withheld: false}>;
export type RouteRevision =
  /** `target` is the work, kind and subject the served revision belongs to. */
  | {ok: true; read: ServedRead; revision: ArtifactRevision; exact: boolean; target: RouteRevisionTarget}
  /** An exact revision that does not exist, is not readable, or belongs to another work, kind or subject. */
  | {ok: false; outcome: "not_found"}
  /** The work has no current revision for this kind and subject; each route keeps its own answer for it. */
  | {ok: false; outcome: "head_missing"}
  | {ok: false; outcome: "refused"; refusal: ArtifactRefusal};

export async function resolveRouteRevision(
  supabase: SupabaseClient<Database>,
  target: RouteRevisionTarget,
  revisionId: string | null,
): Promise<RouteRevision> {
  return resolvePreferredRouteRevision(supabase, [target], revisionId);
}

/**
 * The same resolution over targets in order of preference. An exact revision is this route's when it
 * belongs to one of them; without `?revision=`, the head of the first target that has one is served.
 * Only a target with no revision at all passes to the next one: a head that cannot be read stops the
 * search, so a later target is never served in place of a preferred one that exists.
 */
export async function resolvePreferredRouteRevision(
  supabase: SupabaseClient<Database>,
  targets: readonly RouteRevisionTarget[],
  revisionId: string | null,
): Promise<RouteRevision> {
  let found: {read: ArtifactRead; target: RouteRevisionTarget} | null = null;
  if (revisionId !== null) {
    const result = await readArtifactRevision(supabase, {revisionId});
    if (!result.ok) return {ok: false, outcome: "not_found"};
    const target = targets.find((candidate) => revisionBelongsTo(result.read, candidate));
    if (!target) return {ok: false, outcome: "not_found"};
    found = {read: result.read, target};
  } else {
    for (const target of targets) {
      const result = await readArtifactHead(supabase, target);
      if (result.ok) {
        found = {read: result.read, target};
        break;
      }
      if (result.error !== "artifact_revision_not_found") return {ok: false, outcome: "head_missing"};
    }
    if (found === null || !revisionBelongsTo(found.read, found.target)) return {ok: false, outcome: "head_missing"};
  }
  const serving = artifactServing(found.read);
  if (!serving.serve) return {ok: false, outcome: "refused", refusal: serving.refusal};
  // A withheld read is never served; the serving rule already refused it, and the type says so here.
  if (found.read.withheld) return {ok: false, outcome: "refused", refusal: "artifact_release_blocked"};
  return {ok: true, read: found.read, revision: serving.revision, exact: revisionId !== null, target: found.target};
}

export function refusalText(copy: ArtifactDownloadCopy, refusal: ArtifactRefusal): string {
  return refusal === "artifact_source_restricted" ? copy.sourceRestricted : copy.releaseBlocked;
}

/**
 * Whether this route can produce what the revision's manifest names: no pinned bytes (the route's
 * own serializer, nothing verified), a stored object where the route serves stored bytes, or a
 * registered renderer of a family the route uses. Anything else cannot be reproduced here.
 */
export function revisionRendererAllowed(
  revision: ArtifactRevision,
  allowed: {storage?: boolean; families: readonly ArtifactRendererEntry["family"][]},
): boolean {
  const renderer = resolveRenderer(revision);
  if (!renderer.ok) return false;
  if (renderer.source === "unpinned") return true;
  if (renderer.source === "storage") return allowed.storage === true;
  return allowed.families.includes(artifactRenderers[renderer.renderer].family);
}

/** The historical row a legacy revision names, when it is a row of this store. */
export function legacyRowId(revision: ArtifactRevision, table: NonNullable<ArtifactRevision["legacyRef"]>["table"]): string | null {
  return revision.legacyRef?.table === table ? revision.legacyRef.id : null;
}

export type RevisionTemplate =
  | {ok: true; template: InstitutionalPresentationTemplate | undefined; pinned: boolean}
  | {ok: false};

const templateVersionSchema = z.object({
  version_id: z.uuid(),
  template_id: z.uuid(),
  scope: z.enum(["organization", "project"]),
  version_no: z.number().int().positive(),
  definition: z.unknown(),
  structure: z.unknown(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  created_at: z.string(),
});

/**
 * The identity a revision renders with. A pinned template is the exact stored version the manifest
 * names (`read_presentation_template_version_v1`, readable even after a newer version or a
 * retirement), with its fingerprint and its logo verified; a version that cannot be read, has
 * another fingerprint or lost its logo cannot reproduce the pinned file and is refused. The house
 * template is pinned by its own name. A revision that pins none keeps what the route used before:
 * the project's current identity, or the house template for the materials.
 */
export async function templateForRevision(
  supabase: SupabaseClient<Database>,
  projectId: string,
  revision: ArtifactRevision,
  unpinned: "project" | "house",
): Promise<RevisionTemplate> {
  const pin = revision.manifest.template;
  if (pin === null) {
    return unpinned === "house" ? {ok: true, template: undefined, pinned: false}
      : {ok: true, template: (await presentationTemplateForProject(supabase, projectId)).template, pinned: false};
  }
  if (pin.templateVersionId === `${houseDocumentTemplate.id}@${houseDocumentTemplate.version}`) return {ok: true, template: undefined, pinned: true};
  if (!z.uuid().safeParse(pin.templateVersionId).success) return {ok: false};
  const {data, error} = await supabase.rpc("read_presentation_template_version_v1", {p_version_id: pin.templateVersionId});
  const version = templateVersionSchema.safeParse(data);
  if (error || !version.success || version.data.version_id !== pin.templateVersionId || version.data.fingerprint !== pin.fingerprint) return {ok: false};
  const definition = presentationTemplateFromStored(version.data.definition);
  const structure = presentationStructureFromStored(version.data.structure);
  if (!definition || !structure) return {ok: false};
  const resolved = await resolvePresentationTemplate(supabase, {
    templateId: version.data.template_id, scope: version.data.scope, fingerprint: version.data.fingerprint, definition, structure,
    versionId: version.data.version_id, versionNo: version.data.version_no, versionCreatedAt: version.data.created_at, versions: [],
  });
  return resolved.logoOmitted ? {ok: false} : {ok: true, template: resolved.template, pinned: true};
}
