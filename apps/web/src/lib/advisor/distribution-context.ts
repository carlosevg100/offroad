import {distributionResponseSchema} from "@offroad/market-feedback";
import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";

import {buildDistributionView, type DistributionCandidate, type DistributionView} from "@/components/advisor/distribution-view";
import {
  houseTemplateIdentity,
  informationPackItems,
  type InformationPackItemInput,
  type PresentationTemplateIdentity,
} from "@/components/advisor/information-pack-items";
import type {GovernedMaterialPackage} from "@/lib/deal-state/materials";
import type {Database} from "@/types/database";

type Tables = Database["public"]["Tables"];
export type InformationPackRevisionRow = Tables["information_pack_revisions"]["Row"];
export type InformationPackItemRow = Tables["information_pack_items"]["Row"];
export type PackDistributionAuthorizationRow = Tables["pack_distribution_authorizations"]["Row"];
export type PackDistributionShareRow = Tables["pack_distribution_shares"]["Row"];
export type PackAccessEventRow = Tables["pack_access_events"]["Row"];
export type QualifiedContactPreparationRow = Tables["qualified_contact_preparations"]["Row"];
export type PackRecipientResponseRow = Tables["pack_recipient_responses"]["Row"];
export type PackDistributionNextStepRow = Tables["pack_distribution_next_steps"]["Row"];

export type DistributionContext = {
  revisions: InformationPackRevisionRow[];
  currentRevision: InformationPackRevisionRow | null;
  currentItems: InformationPackItemRow[];
  authorizations: PackDistributionAuthorizationRow[];
  activeAuthorization: PackDistributionAuthorizationRow | null;
  shares: PackDistributionShareRow[];
  accessEvents: PackAccessEventRow[];
  preparations: QualifiedContactPreparationRow[];
  responses: PackRecipientResponseRow[];
  nextSteps: PackDistributionNextStepRow[];
};

const empty: DistributionContext = {
  revisions: [],
  currentRevision: null,
  currentItems: [],
  authorizations: [],
  activeAuthorization: null,
  shares: [],
  accessEvents: [],
  preparations: [],
  responses: [],
  nextSteps: [],
};

/**
 * Everything the issuer side needs to read about its own distribution. Each query is scoped by the
 * tenant and the project session; the database policies are the boundary, this is only the read.
 */
export async function loadDistributionContext(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  sessionId: string,
): Promise<DistributionContext> {
  const [revisions, authorizations, shares, accessEvents, preparations, responses, nextSteps] = await Promise.all([
    supabase.from("information_pack_revisions").select("*")
      .eq("organization_id", organizationId).eq("intake_session_id", sessionId)
      .order("revision_number", {ascending: false}),
    supabase.from("pack_distribution_authorizations").select("*")
      .eq("organization_id", organizationId).eq("intake_session_id", sessionId)
      .order("created_at", {ascending: false}),
    supabase.from("pack_distribution_shares").select("*")
      .eq("organization_id", organizationId).eq("intake_session_id", sessionId)
      .order("position", {ascending: true}),
    supabase.from("pack_access_events").select("*")
      .eq("organization_id", organizationId).eq("intake_session_id", sessionId)
      .order("accessed_at", {ascending: false}).limit(200),
    supabase.from("qualified_contact_preparations").select("*")
      .eq("organization_id", organizationId).eq("intake_session_id", sessionId)
      .order("prepared_at", {ascending: true}),
    supabase.from("pack_recipient_responses").select("*")
      .eq("organization_id", organizationId).eq("intake_session_id", sessionId)
      .order("occurred_at", {ascending: true}),
    supabase.from("pack_distribution_next_steps").select("*")
      .eq("organization_id", organizationId).eq("intake_session_id", sessionId)
      .order("recorded_at", {ascending: false}),
  ]);

  const revisionRows = revisions.data ?? [];
  const currentRevision = revisionRows.find((revision) => revision.status === "current") ?? null;
  const {data: items} = currentRevision
    ? await supabase.from("information_pack_items").select("*")
      .eq("organization_id", organizationId).eq("pack_revision_id", currentRevision.id)
      .order("position", {ascending: true})
    : {data: []};

  return {
    ...empty,
    revisions: revisionRows,
    currentRevision,
    currentItems: items ?? [],
    authorizations: authorizations.data ?? [],
    activeAuthorization: (authorizations.data ?? []).find((row) => row.status === "active") ?? null,
    shares: shares.data ?? [],
    accessEvents: accessEvents.data ?? [],
    preparations: preparations.data ?? [],
    responses: responses.data ?? [],
    nextSteps: nextSteps.data ?? [],
  };
}

/** The shape `@offroad/market-feedback` expects for the shares of one project. */
export function distributionShareRefs(shares: readonly PackDistributionShareRow[]) {
  return shares
    .filter((share) => share.recipient_organization_id !== null)
    .map((share) => ({
      shareId: share.id,
      recipientOrganizationId: share.recipient_organization_id!,
      packRevisionId: share.pack_revision_id,
    }));
}

/** The persisted response rows read as the package contract, dropping anything malformed. */
export function distributionResponseInputs(rows: readonly PackRecipientResponseRow[]) {
  return rows.map((row) => ({
    id: row.id,
    shareId: row.share_id,
    packRevisionId: row.pack_revision_id,
    recipientOrganizationId: row.recipient_organization_id,
    responseState: row.response_state,
    ...(row.note ? {note: row.note} : {}),
    ...(row.ticket_amount !== null ? {ticketAmount: Number(row.ticket_amount).toFixed(2)} : {}),
    ...(row.ticket_currency ? {ticketCurrency: row.ticket_currency} : {}),
    ...(row.tenor_months !== null ? {tenorMonths: row.tenor_months} : {}),
    ...(row.pricing_basis ? {pricingBasis: row.pricing_basis} : {}),
    ...(row.pricing_min !== null ? {pricingMin: Number(row.pricing_min).toFixed(4)} : {}),
    ...(row.pricing_max !== null ? {pricingMax: Number(row.pricing_max).toFixed(4)} : {}),
    requestedConditions: structuredEntries(row.requested_conditions),
    termObjections: structuredEntries(row.term_objections),
    ...(row.supersedes_response_id ? {supersedesResponseId: row.supersedes_response_id} : {}),
    occurredAt: new Date(row.occurred_at).toISOString(),
  }));
}

function structuredEntries(value: unknown): Array<{code: string; note?: string}> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || !("code" in entry)) return [];
    const code = (entry as {code: unknown}).code;
    if (typeof code !== "string") return [];
    const note = "note" in entry ? (entry as {note: unknown}).note : undefined;
    return [{code, ...(typeof note === "string" && note.trim() ? {note: note.trim()} : {})}];
  });
}


const storedTemplateSchema = z.object({
  template_key: z.string(),
  template_version: z.string(),
  fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  definition: z.object({origin: z.enum(["offroad_house", "client_supplied"])}).loose(),
});

/**
 * The visual identity bound to the project, when the product already stores one. Until then the
 * pack records the Offroad house template, which is what the exported files actually carry.
 */
export async function projectTemplateIdentity(
  supabase: SupabaseClient<Database>,
  projectId: string,
): Promise<PresentationTemplateIdentity> {
  const {data, error} = await supabase.rpc("read_presentation_template_v1", {p_project_id: projectId});
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return houseTemplateIdentity;
  const parsed = storedTemplateSchema.safeParse((data as Record<string, unknown>).effective);
  if (!parsed.success) return houseTemplateIdentity;
  return {
    key: parsed.data.template_key,
    version: parsed.data.template_version,
    origin: parsed.data.definition.origin,
    fingerprint: parsed.data.definition.origin === "client_supplied" ? parsed.data.fingerprint : null,
  };
}

const candidateSchema = z.object({
  targetId: z.uuid(),
  position: z.number().int().positive(),
  providerName: z.string(),
  rationale: z.string(),
  recipientKind: z.enum(["registered_organization", "directory_entry"]),
  recipientOrganizationId: z.uuid().nullable(),
  recipientDirectoryId: z.uuid().nullable(),
  deliverable: z.boolean(),
  shareId: z.uuid().nullable(),
  sharedRevisionId: z.uuid().nullable(),
  preparationId: z.uuid().nullable(),
  preparationStatus: z.enum(["prepared", "released"]).nullable(),
  candidateFit: z.enum(["eligible", "hypothesis"]).nullable(),
});

/** The shortlist targets resolved into recipients that can open a pack, or that cannot. */
export async function loadDistributionCandidates(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  sessionId: string,
): Promise<DistributionCandidate[]> {
  const {data, error} = await supabase.rpc("resolve_pack_distribution_candidates", {
    p_organization_id: organizationId,
    p_session_id: sessionId,
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return [];
  const parsed = z.array(candidateSchema).safeParse((data as Record<string, unknown>).candidates);
  return parsed.success ? parsed.data : [];
}

/** The exported files a pack revision would carry if it were recorded now. */
export async function informationPackProposal(input: {
  governed: GovernedMaterialPackage;
  locale: "pt-BR" | "en-US";
  projectId: string;
  sessionId: string;
  sourceResultIds: readonly string[];
  supabase: SupabaseClient<Database>;
}): Promise<InformationPackItemInput[]> {
  return informationPackItems({
    governed: input.governed,
    locale: input.locale,
    sessionId: input.sessionId,
    sourceResultIds: input.sourceResultIds,
    template: await projectTemplateIdentity(input.supabase, input.projectId),
    titles: {},
  });
}

/** Everything the issuer distribution section renders, assembled once on the server. */
export async function loadProjectDistributionView(input: {
  governed: GovernedMaterialPackage;
  locale: "pt-BR" | "en-US";
  organizationId: string;
  projectId: string;
  representationVerified: boolean;
  sessionId: string;
  sourceResultIds: readonly string[];
  supabase: SupabaseClient<Database>;
}): Promise<DistributionView> {
  const [context, candidates, proposedItems] = await Promise.all([
    loadDistributionContext(input.supabase, input.organizationId, input.sessionId),
    loadDistributionCandidates(input.supabase, input.organizationId, input.sessionId),
    informationPackProposal({
      governed: input.governed,
      locale: input.locale,
      projectId: input.projectId,
      sessionId: input.sessionId,
      sourceResultIds: input.sourceResultIds,
      supabase: input.supabase,
    }),
  ]);
  const responses = distributionResponseInputs(context.responses)
    .flatMap((row) => {
      const parsed = distributionResponseSchema.safeParse(row);
      return parsed.success ? [parsed.data] : [];
    });
  return buildDistributionView({
    accessEvents: context.accessEvents,
    authorizations: context.authorizations,
    candidates,
    items: context.currentItems,
    nextSteps: context.nextSteps,
    proposedItems,
    representationVerified: input.representationVerified,
    responses,
    revisions: context.revisions,
    shares: context.shares,
  });
}
