import {notFound} from "next/navigation";

import {IntakeDeliveryMap, type DeliveryMapChecklist} from "@/components/intake/intake-delivery-map";
import {IntakeCommittee} from "@/components/intake/intake-committee";
import {IntakeDesk} from "@/components/intake/intake-desk";
import {rateCredit, stressTable} from "@offroad/credit-analysis";
import {instrumentVerdicts} from "@offroad/credit-playbook";
import {designCollateralPackage} from "@offroad/deal-structure";
import {auroraDeskState} from "@/lib/intake/dev/aurora-desk";
import {nimbusDeskState} from "@/lib/intake/dev/nimbus-desk";

/**
 * Development-only preview of the desk panel, fed with Aurora's state.
 *
 * Exists so the panel can be designed by looking at it rather than by imagining it. Returns
 * 404 outside development; there is no data here that matters, but a preview route that ships
 * is a route nobody remembers to remove.
 */
export default async function CasePreviewPage({params, searchParams}: {params: Promise<{locale: string}>; searchParams: Promise<{case?: string}>}) {
  if (process.env.NODE_ENV === "production") notFound();
  const {locale} = await params;
  const {case: which} = await searchParams;
  // `?case=nimbus` shows the cash-burning profile; anything else, Aurora.
  const state = which === "nimbus" ? nimbusDeskState() : auroraDeskState();
  const item = (id: string, label: string, satisfied: boolean, satisfiedBy: string[] = [], response?: "partial" | "not_applicable") => ({
    id, label, satisfied, satisfiedBy, level: "minimum" as const, source: "document" as const, stage: "now" as const,
    rationale: "", purposes: [], accepts: [], ...(response ? {response} : {}),
  });
  const checklist: DeliveryMapChecklist = {
    byStage: {
      now: [
        item("financials_historical", "Demonstrações financeiras dos últimos exercícios", true, ["02_Demonstracoes_Auditadas_2023_2025.pdf"]),
        item("financials_interim", "Posição contábil recente", true, ["03_Balancete_Gerencial_Jul2026.xls"]),
        item("debt_schedule", "Mapa de dívida com cronograma e garantias", true, ["04_Mapa_Divida_Jul2026.xlsx"]),
        item("corporate_identity", "Documentos societários", false),
        item("project_plan", "Plano do projeto com premissas e orçamento", false, [], "partial"),
        item("tax_clearance", "Certidões negativas", true, [], "not_applicable"),
      ],
      diligence: [],
      closing: [],
    },
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
    </main>
  );
}
