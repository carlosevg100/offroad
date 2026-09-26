import "server-only";

import {houseDocumentTemplate} from "@offroad/case-export";
import type {InstitutionalPresentationTemplate} from "@offroad/case-export/presentation-template";
import type {ArtifactKind, ArtifactRevision} from "@offroad/domain-contracts";
import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";

import enMessages from "../../../messages/en-US.json";
import ptMessages from "../../../messages/pt-BR.json";
import {loadPresentationTemplateContext, presentationTemplateForProject, resolvePresentationTemplate} from "@/lib/advisor/presentation-template";
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
  | {ok: true; read: ServedRead; revision: ArtifactRevision; exact: boolean}
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
  const result = revisionId === null ? await readArtifactHead(supabase, target) : await readArtifactRevision(supabase, {revisionId});
  if (!result.ok) return {ok: false, outcome: revisionId === null ? "head_missing" : "not_found"};
  if (!revisionBelongsTo(result.read, target)) return {ok: false, outcome: "not_found"};
  const serving = artifactServing(result.read);
  if (!serving.serve) return {ok: false, outcome: "refused", refusal: serving.refusal};
  // A withheld read is never served; the serving rule already refused it, and the type says so here.
  if (result.read.withheld) return {ok: false, outcome: "refused", refusal: "artifact_release_blocked"};
  return {ok: true, read: result.read, revision: serving.revision, exact: revisionId !== null};
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

/**
 * The identity a revision renders with. A pinned template must still be the one the project
 * resolves to (or the Offroad house template); until versioned templates exist a changed record
 * cannot reproduce the pinned file and is refused. A revision that pins none keeps what the route
 * used before: the project's current identity, or the house template for the materials.
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
  const context = await loadPresentationTemplateContext(supabase, projectId);
  const effective = context?.effective ?? null;
  if (!effective || effective.fingerprint !== pin.fingerprint) return {ok: false};
  const resolved = await resolvePresentationTemplate(supabase, effective);
  return resolved.logoOmitted ? {ok: false} : {ok: true, template: resolved.template, pinned: true};
}
