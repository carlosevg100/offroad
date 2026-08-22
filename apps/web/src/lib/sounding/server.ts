import type {SupabaseClient} from "@supabase/supabase-js";

import {syntheticInvestors, shortlist, type Investor, type InvestorKind, type RatingBand} from "@offroad/investor-base";
import {auditTrail, buildBook, trackSounding, type AllocationMethod, type Book, type Indication, type InvestorTrack, type SoundingEvent, type SoundingEventType} from "@offroad/sounding";

import type {Database, Json} from "@/types/database";

/**
 * The market stage, persisted: the list, the log and the book for one intake session.
 *
 * Every write goes through the domain first. An event is inserted only after replaying the
 * log shows the process allows it, so the table never holds an allocation without an
 * indication or a room opened before the NDA. Reads rebuild the tracks and the book from the
 * log on every request; the log is small and the arithmetic is cheap, and a book computed
 * from the events cannot drift from them.
 */

export type SoundingRuntime = {
  supabase: SupabaseClient<Database>;
  organizationId: string;
  userId: string;
  sessionId: string;
};

export type SoundingErrorCode = "not_found" | "validation" | "transition" | "save";

export type SoundingOutcome<T = void> = {ok: true; value: T} | {ok: false; error: SoundingErrorCode; detail?: string};

type SoundingRow = Database["public"]["Tables"]["soundings"]["Row"];
type InvestorRow = Database["public"]["Tables"]["sounding_investors"]["Row"];

export type SoundingView = {
  sounding: SoundingRow;
  investors: Investor[];
  tracks: InvestorTrack[];
  book: Book;
  trail: ReturnType<typeof auditTrail>;
  /** Investors of the base not yet on the list, best fit first. */
  candidates: ReturnType<typeof shortlist>;
};

const investorOf = (row: InvestorRow): Investor => {
  const known = syntheticInvestors.find((investor) => investor.name === row.investor_name);
  return known ? {...known, id: row.id} : {id: row.id, name: row.investor_name, kind: row.investor_kind as InvestorKind, appetite: {archetypes: [], instruments: [], ticket: {min: "0", max: "0"}, tenorMonths: {min: 0, max: 0}, minimumRating: "distressed"}};
};

export async function loadSounding(runtime: SoundingRuntime, deal: {archetypeId: string; amount: string; tenorMonths: number; rating: RatingBand; sector: string; secured: boolean; ventureBacked?: boolean}): Promise<SoundingView | null> {
  const {supabase, organizationId, sessionId} = runtime;
  const {data: sounding} = await supabase.from("soundings").select("*").eq("organization_id", organizationId).eq("intake_session_id", sessionId).maybeSingle();
  if (!sounding) return null;
  const [{data: investorRows}, {data: eventRows}] = await Promise.all([
    supabase.from("sounding_investors").select("*").eq("organization_id", organizationId).eq("sounding_id", sounding.id).order("created_at"),
    supabase.from("sounding_events").select("*").eq("organization_id", organizationId).eq("sounding_id", sounding.id).order("occurred_at"),
  ]);
  const investors = (investorRows ?? []).map(investorOf);
  const events: SoundingEvent[] = (eventRows ?? []).map((row) => ({
    investorId: row.investor_id,
    type: row.event_type as SoundingEventType,
    at: row.occurred_at,
    actor: row.actor,
    ...(row.note ? {note: row.note} : {}),
    ...(row.question_id ? {questionId: row.question_id} : {}),
    ...(row.indication ? {indication: row.indication as unknown as Indication} : {}),
  }));
  const tracks = trackSounding(investors.map((investor) => investor.id), events);
  const indications = tracks.flatMap((track) => (track.latestIndication && track.stage !== "declined" && track.stage !== "dropped" ? [track.latestIndication] : []));
  const book = buildBook({
    target: String(sounding.target_amount),
    indications,
    investors,
    basis: {cdiPct: String(sounding.cdi_pct), ...(sounding.ipca_pct !== null ? {ipcaPct: String(sounding.ipca_pct)} : {})},
    method: sounding.method as AllocationMethod,
  });
  const listed = new Set(investors.map((investor) => investor.name));
  const candidates = shortlist(syntheticInvestors.filter((investor) => !listed.has(investor.name)), {instrument: "debenture", ...deal});
  return {sounding, investors, tracks, book, trail: auditTrail(tracks, investors), candidates};
}

export async function openSounding(runtime: SoundingRuntime, input: {targetAmount: string; cdiPct: string; ipcaPct?: string; method: AllocationMethod}): Promise<SoundingOutcome<string>> {
  const {supabase, organizationId, sessionId, userId} = runtime;
  const target = Number(input.targetAmount);
  const cdi = Number(input.cdiPct);
  if (!Number.isFinite(target) || target <= 0 || !Number.isFinite(cdi) || cdi <= 0) return {ok: false, error: "validation"};
  const {data, error} = await supabase
    .from("soundings")
    .insert({organization_id: organizationId, intake_session_id: sessionId, target_amount: target, cdi_pct: cdi, ipca_pct: input.ipcaPct ? Number(input.ipcaPct) : null, method: input.method, created_by: userId})
    .select("id")
    .single();
  if (error || !data) return {ok: false, error: "save", detail: error?.message};
  return {ok: true, value: data.id};
}

export async function addInvestor(runtime: SoundingRuntime, input: {soundingId: string; name: string; kind: InvestorKind; actor: string}): Promise<SoundingOutcome<string>> {
  const {supabase, organizationId, sessionId, userId} = runtime;
  if (!input.name.trim()) return {ok: false, error: "validation"};
  const {data, error} = await supabase
    .from("sounding_investors")
    .insert({organization_id: organizationId, intake_session_id: sessionId, sounding_id: input.soundingId, investor_name: input.name.trim(), investor_kind: input.kind})
    .select("id")
    .single();
  if (error || !data) return {ok: false, error: "save", detail: error?.message};
  const listed = await supabase.from("sounding_events").insert({organization_id: organizationId, intake_session_id: sessionId, sounding_id: input.soundingId, investor_id: data.id, event_type: "listed", actor: input.actor, created_by: userId});
  if (listed.error) return {ok: false, error: "save", detail: listed.error.message};
  return {ok: true, value: data.id};
}

export async function recordEvent(runtime: SoundingRuntime, input: {soundingId: string; investorId: string; type: SoundingEventType; actor: string; note?: string; questionId?: string; indication?: Indication}): Promise<SoundingOutcome> {
  const {supabase, organizationId, sessionId, userId} = runtime;
  if (input.type === "indication_received" && !input.indication) return {ok: false, error: "validation"};
  // Replay first: the table only ever holds what the process allowed.
  const {data: eventRows} = await supabase.from("sounding_events").select("investor_id, event_type, occurred_at, actor, indication").eq("organization_id", organizationId).eq("sounding_id", input.soundingId).eq("investor_id", input.investorId).order("occurred_at");
  const history: SoundingEvent[] = (eventRows ?? []).map((row) => ({investorId: row.investor_id, type: row.event_type as SoundingEventType, at: row.occurred_at, actor: row.actor}));
  const now = new Date().toISOString();
  const [track] = trackSounding([input.investorId], [...history, {investorId: input.investorId, type: input.type, at: now, actor: input.actor}]);
  if (!track || track.refused.length > 0) return {ok: false, error: "transition", detail: track?.refused[0]?.reason.pt};
  const {error} = await supabase.from("sounding_events").insert({
    organization_id: organizationId,
    intake_session_id: sessionId,
    sounding_id: input.soundingId,
    investor_id: input.investorId,
    event_type: input.type,
    actor: input.actor,
    occurred_at: now,
    note: input.note ?? null,
    question_id: input.questionId ?? null,
    indication: (input.indication ?? null) as unknown as Json,
    created_by: userId,
  });
  if (error) return {ok: false, error: "save", detail: error.message};
  // The stage column is a convenience for lists; the log is the truth.
  await supabase.from("sounding_investors").update({stage: track.stage}).eq("organization_id", organizationId).eq("id", input.investorId);
  return {ok: true, value: undefined};
}
