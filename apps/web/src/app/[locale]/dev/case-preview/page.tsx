import {notFound} from "next/navigation";

import {IntakeDeliveryMap, type DeliveryMapChecklist} from "@/components/intake/intake-delivery-map";
import {IntakeCommittee} from "@/components/intake/intake-committee";
import {IntakeDataRoom} from "@/components/intake/intake-data-room";
import {IntakeDesk} from "@/components/intake/intake-desk";
import {SoundingBoard} from "@/components/sounding/sounding-board";
import {syntheticInvestors, shortlist} from "@offroad/investor-base";
import {auditTrail, buildBook, trackSounding, type SoundingEvent} from "@offroad/sounding";
import {rateCredit, stressTable} from "@offroad/credit-analysis";
import {instrumentVerdicts} from "@offroad/credit-playbook";
import {designCollateralPackage} from "@offroad/deal-structure";
import {planDataRoom} from "@offroad/data-room";
import {auroraDeskState} from "@/lib/intake/dev/aurora-desk";
import {nimbusDeskState} from "@/lib/intake/dev/nimbus-desk";

/**
 * Development-only preview of the desk panel, fed with Aurora's state.
 *
 * Exists so the panel can be designed by looking at it rather than by imagining it. Returns
 * 404 outside development; there is no data here that matters, but a preview route that ships
 * is a route nobody remembers to remove.
 */
/** A sounding as it looks mid-process: five investors, four NDAs, three indications. */
function soundingPreview(deal: {archetypeId: string; amount: string; tenorMonths: number; rating: "strong" | "adequate" | "watch" | "weak" | "distressed"; sector: string; secured: boolean}) {
  const investors = syntheticInvestors.slice(0, 5);
  const ids = investors.map((investor) => investor.id);
  const at = (minute: number) => `2026-09-01T10:${String(minute).padStart(2, "0")}:00Z`;
  const desk = "analista@offroad.capital";
  const events: SoundingEvent[] = [
    ...ids.map((id, i) => ({investorId: id, type: "listed" as const, at: at(i), actor: desk})),
    ...ids.map((id, i) => ({investorId: id, type: "teaser_sent" as const, at: at(10 + i), actor: desk})),
    ...ids.slice(0, 4).map((id, i) => ({investorId: id, type: "nda_signed" as const, at: at(20 + i), actor: `${investors[i]!.name.toLowerCase().replace(/\W+/g, ".")}@fundo`})),
    {investorId: ids[4]!, type: "declined", at: at(24), actor: "gestao@fundo", note: "fora de tese"},
    ...ids.slice(0, 4).map((id, i) => ({investorId: id, type: "room_opened" as const, at: at(30 + i), actor: desk})),
    {investorId: ids[0]!, type: "indication_received", at: at(40), actor: "credito@fundo", indication: {investorId: ids[0]!, amount: "20000000", tenorMonths: 48, graceMonths: 12, pricing: {type: "cdi_plus", spreadPct: "3.90"}, firm: true}},
    {investorId: ids[1]!, type: "indication_received", at: at(41), actor: "mesa@banco", indication: {investorId: ids[1]!, amount: "15000000", tenorMonths: 48, graceMonths: 12, pricing: {type: "cdi_plus", spreadPct: "4.40"}, firm: true}},
    {investorId: ids[2]!, type: "indication_received", at: at(42), actor: "comite@fo", indication: {investorId: ids[2]!, amount: "25000000", tenorMonths: 48, graceMonths: 12, pricing: {type: "cdi_plus", spreadPct: "4.10"}, firm: false}},
  ];
  const tracks = trackSounding(ids, events);
  const indications = tracks.flatMap((track) => (track.latestIndication ? [track.latestIndication] : []));
  const basis = {cdiPct: "10.50", ipcaPct: "4.00"};
  const book = buildBook({target: deal.amount, indications, investors, basis});
  const listed = new Set(investors.map((investor) => investor.name));
  return {
    sounding: {id: "preview", organization_id: "org", intake_session_id: "preview", target_amount: Number(deal.amount), currency: "BRL", cdi_pct: 10.5, ipca_pct: 4, method: "price_priority", status: "open", created_by: "u", created_at: at(0), updated_at: at(0)},
    investors,
    tracks,
    book,
    trail: auditTrail(tracks, investors),
    candidates: shortlist(syntheticInvestors.filter((investor) => !listed.has(investor.name)), {instrument: "debenture", ...deal}),
  };
}

async function noop() {
  "use server";
}

export default async function CasePreviewPage({params, searchParams}: {params: Promise<{locale: string}>; searchParams: Promise<{case?: string}>}) {
  if (process.env.NODE_ENV === "production") notFound();
  const {locale} = await params;
  const {case: which} = await searchParams;
  // `?case=nimbus` shows the cash-burning profile; anything else, Aurora.
  const state = which === "nimbus" ? nimbusDeskState() : auroraDeskState();
  const deal = {archetypeId: which === "nimbus" ? "venture_debt" : "growth_expansion", amount: which === "nimbus" ? "15000000" : "42300000", tenorMonths: which === "nimbus" ? 36 : 48, rating: "adequate" as const, sector: which === "nimbus" ? "software" : "materiais de construção", secured: which !== "nimbus", ...(which === "nimbus" ? {ventureBacked: true} : {})};
  const item = (id: string, label: string, satisfied: boolean, satisfiedBy: string[] = [], response?: "partial" | "not_applicable") => ({
    id, label, satisfied, satisfiedBy, level: "minimum" as const, source: "document" as const, stage: "now" as const,
    rationale: "", purposes: [], accepts: [], ...(response ? {response} : {}),
  });
  const previewItems = [
        item("financials_historical", "Demonstrações financeiras dos últimos exercícios", true, ["02_Demonstracoes_Auditadas_2023_2025.pdf"]),
        item("financials_interim", "Posição contábil recente", true, ["03_Balancete_Gerencial_Jul2026.xls"]),
        item("debt_schedule", "Mapa de dívida com cronograma e garantias", true, ["04_Mapa_Divida_Jul2026.xlsx"]),
        item("corporate_identity", "Documentos societários", false),
        item("project_plan", "Plano do projeto com premissas e orçamento", false, [], "partial"),
        item("tax_clearance", "Certidões negativas", true, [], "not_applicable"),
  ];
  const checklist: DeliveryMapChecklist = {
    activeBatch: previewItems.filter((entry) => !entry.satisfied),
    resolved: previewItems.filter((entry) => entry.satisfied),
    unmatched: [{name: "09_Fotos_do_Galpao.zip", kind: "outro"}],
  };
  const documents = [
    {id: "1", original_name: "02_Demonstracoes_Auditadas_2023_2025.pdf", byte_size: 112488},
    {id: "2", original_name: "03_Balancete_Gerencial_Jul2026.xls", byte_size: 4608},
    {id: "3", original_name: "04_Mapa_Divida_Jul2026.xlsx", byte_size: 19031},
    {id: "4", original_name: "09_Fotos_do_Galpao.zip", byte_size: 2_400_000},
    {id: "5", original_name: "Contrato_Social.pdf", byte_size: 380_000},
  ];
  return (
    <main className="app-main" style={{margin: "0 auto", maxWidth: 980, padding: "32px 20px"}}>
      <IntakeDeliveryMap checklist={checklist} documents={documents} locale={locale} sessionStatus="open" />
      <IntakeDesk clientQuestions={state.clientQuestions} desk={state.desk} deskMissing={state.deskMissing} locale={locale} trajectory={state.trajectory} />
      <IntakeCommittee
        collateral={state.desk ? designCollateralPackage({assets: [{description: "Recebíveis de clientes", type: "receivables", value: state.desk.encumbrance.receivablesBase, encumbered: state.desk.encumbrance.encumbered}, {description: "CD de São José dos Campos", type: "property", value: "28000000", appraised: true}, {description: "Estoques", type: "inventory", value: "42180000"}], amount: "42300000"}) : null}
        instruments={instrumentVerdicts({legalForm: which === "nimbus" ? "sa" : "ltda", archetypeId: which === "nimbus" ? "venture_debt" : "growth_expansion", amount: which === "nimbus" ? "15000000" : "42300000", ...(which === "nimbus" ? {ventureBacked: true} : {})})}
        locale={locale}
        rating={state.desk ? rateCredit({desk: state.desk, trajectory: state.trajectory, financialExpenses: "6140000", priorEbitda: "14924000", topCustomerShare: "0.181", evidenceRank: "1.8"}) : null}
        stress={state.desk && state.desk.profile === "cash_generative" ? stressTable({desk: state.desk, revenue: "191200000", topCustomerShare: "0.181"}) : []}
      />
      <SoundingBoard actions={{open: noop, addInvestor: noop, recordEvent: noop}} deal={deal} locale={locale} sessionId="preview" view={soundingPreview(deal)} />
      <IntakeDataRoom
        locale={locale}
        plan={planDataRoom({
          materials: [],
          materialsBlockedBy: ["brief_unavailable"],
          documents: documents.map((document, index) => ({
            id: document.id,
            kind: (["audited_financial_statements", "trial_balance", "debt_schedule", null, "corporate_docs"] as const)[index] ?? null,
            originalName: document.original_name,
            sha256: index === 3 ? null : `${index}f3a9c1e7b2d4a6c8e0f1a2b3c4d5e6f7`,
            sha256VerifiedAt: index === 3 ? null : "2026-08-21T00:00:00Z",
            byteSize: document.byte_size,
          })),
          exceptions: [],
          readiness: {state: "in_progress", score: 0.7, components: [], blockers: [{id: "receivables_aging", labels: {pt: "Aging de recebíveis", en: "Receivables aging"}}]},
        })}
      />
    </main>
  );
}
