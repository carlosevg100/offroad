import {IntakeReview, IntakeStartChoice} from "@/app/[locale]/onboarding/page";
import {DocumentIntakeUploader} from "@/components/document-intake-uploader";
import {requireWorkspace} from "@/lib/auth/workspace";
import type {Database} from "@/types/database";
import {ArrowLeft, ArrowRight, Info, ShieldCheck} from "lucide-react";
import type {Metadata} from "next";
import Link from "next/link";
import {getTranslations} from "next-intl/server";
import {redirect} from "next/navigation";

import {
  acceptWorkspaceIntakeCandidates,
  chooseWorkspaceManualIntake,
  confirmWorkspaceDocumentIntake,
  createOpportunity,
  processWorkspaceDocumentIntake,
  resolveWorkspaceIntakeIssue,
  reviewWorkspaceIntakeCandidate,
  startWorkspaceDocumentIntake,
} from "./actions";

type Props = {
  params: Promise<{locale: string}>;
  searchParams: Promise<{error?: string; mode?: string; session?: string}>;
};
type IntakeSession = Database["public"]["Tables"]["document_intake_sessions"]["Row"];
type IntakeCandidate = Database["public"]["Tables"]["intake_field_candidates"]["Row"];
type IntakeIssue = Database["public"]["Tables"]["intake_issues"]["Row"];
type IntakeDocument = Pick<Database["public"]["Tables"]["source_documents"]["Row"], "id" | "original_name" | "byte_size" | "object_path"> & {signedUrl?: string};

export const dynamic = "force-dynamic";
export const metadata: Metadata = {title: "New Opportunity", robots: {index: false, follow: false}};

function errorMessage(error: string | undefined, locale: string) {
  const isPt = locale === "pt-BR";
  if (error === "documents") return isPt ? "Adicione pelo menos um documento para iniciar a análise." : "Add at least one document to start the analysis.";
  if (error === "processing") return isPt ? "Não foi possível concluir o processamento. Seus arquivos continuam salvos; tente novamente." : "Processing could not be completed. Your files remain saved; please try again.";
  if (error === "confirmation") return isPt ? "Confirme os campos essenciais e a declaração final antes de criar o case." : "Confirm the required fields and final declaration before creating the case.";
  if (error === "validation") return isPt ? "Revise o valor informado e tente novamente." : "Review the entered value and try again.";
  if (error === "session") return isPt ? "Não foi possível abrir a sessão documental." : "The document session could not be opened.";
  if (error) return isPt ? "Não foi possível salvar esta etapa. Tente novamente." : "This step could not be saved. Please try again.";
  return null;
}

export default async function NewOpportunityPage({params, searchParams}: Props) {
  const {locale} = await params;
  const state = await searchParams;
  const t = await getTranslations({locale, namespace: "App"});
  const {supabase, organization, userId} = await requireWorkspace(locale);
  if (organization.organization_type === "capital_provider") redirect(`/${locale}/app`);

  const notice = errorMessage(state.error, locale);
  const mode = state.mode === "manual" || state.mode === "documents" ? state.mode : "choice";
  let intakeSession: IntakeSession | null = null;
  let intakeDocuments: IntakeDocument[] = [];
  let intakeCandidates: IntakeCandidate[] = [];
  let intakeIssues: IntakeIssue[] = [];

  if (mode === "documents" && state.session) {
    const [sessionResult, documentsResult, candidatesResult, issuesResult] = await Promise.all([
      supabase.from("document_intake_sessions").select("*").eq("organization_id", organization.id).eq("id", state.session).maybeSingle(),
      supabase.from("source_documents").select("id, original_name, byte_size, object_path").eq("organization_id", organization.id).eq("intake_session_id", state.session).order("created_at"),
      supabase.from("intake_field_candidates").select("*").eq("organization_id", organization.id).eq("intake_session_id", state.session).order("field_group").order("field_path").order("evidence_rank"),
      supabase.from("intake_issues").select("*").eq("organization_id", organization.id).eq("intake_session_id", state.session).order("priority").order("created_at"),
    ]);
    intakeSession = sessionResult.data;
    intakeDocuments = documentsResult.data ?? [];
    intakeCandidates = candidatesResult.data ?? [];
    intakeIssues = issuesResult.data ?? [];
    if (intakeSession?.status === "confirmed" && intakeSession.opportunity_id) redirect(`/${locale}/app/opportunities/${intakeSession.opportunity_id}`);

    const signedEntries = await Promise.all(intakeDocuments.map(async (document) => {
      const {data} = await supabase.storage.from("opportunity-documents").createSignedUrl(document.object_path, 900);
      return [document.id, data?.signedUrl] as const;
    }));
    const signedById = new Map(signedEntries);
    intakeDocuments = intakeDocuments.map((document) => ({...document, signedUrl: signedById.get(document.id)}));
  }

  return (
    <main className="app-canvas intake-page">
      <Link className="text-link" href={`/${locale}/app`}><ArrowLeft aria-hidden="true" size={14} />{t("overview")}</Link>
      {notice ? <p className="form-notice form-notice--error" role="alert">{notice}</p> : null}

      {mode === "choice" ? <IntakeStartChoice context="case" locale={locale} manualAction={chooseWorkspaceManualIntake} startAction={startWorkspaceDocumentIntake} /> : null}

      {mode === "documents" ? (
        !intakeSession ? (
          <section className="intake-form"><p className="form-notice form-notice--error">{locale === "pt-BR" ? "Esta sessão não foi encontrada ou não pertence ao seu ambiente." : "This session was not found or does not belong to your workspace."}</p><Link className="button button--ghost" href={`/${locale}/app/new`}>{locale === "pt-BR" ? "Voltar" : "Back"}</Link></section>
        ) : intakeSession.status === "review_ready" ? (
          <IntakeReview
            actions={{accept: acceptWorkspaceIntakeCandidates, confirm: confirmWorkspaceDocumentIntake, process: processWorkspaceDocumentIntake, resolve: resolveWorkspaceIntakeIssue, review: reviewWorkspaceIntakeCandidate}}
            candidates={intakeCandidates}
            documents={intakeDocuments}
            issues={intakeIssues}
            locale={locale}
            manualHref={`/${locale}/app/new?mode=manual&session=${intakeSession.id}`}
            session={intakeSession}
          />
        ) : (
          <section className="intake-form intake-collect">
            <div className="intake-collect__intro"><span className="section-kicker">{locale === "pt-BR" ? "DOCUMENTOS PRIMEIRO" : "DOCUMENTS FIRST"}</span><h3>{locale === "pt-BR" ? "Envie o que você já tem" : "Upload what you already have"}</h3><p>{locale === "pt-BR" ? "Não é necessário renomear ou organizar os arquivos. O sistema preserva o documento original e vincula cada sugestão à sua evidência." : "You do not need to rename or organize files. The original document is preserved and every suggestion remains linked to its evidence."}</p></div>
            <DocumentIntakeUploader initialDocuments={intakeDocuments} locale={locale} organizationId={organization.id} sessionId={intakeSession.id} userId={userId} />
            <div className="intake-collect__process">
              <div><ShieldCheck size={15} /><span>{locale === "pt-BR" ? "Nada é enviado ao mercado durante esta etapa." : "Nothing is sent to market during this step."}</span></div>
              <form action={processWorkspaceDocumentIntake}><input name="locale" type="hidden" value={locale} /><input name="session_id" type="hidden" value={intakeSession.id} /><button className="button" disabled={!intakeDocuments.length} type="submit">{locale === "pt-BR" ? "Analisar documentos" : "Analyze documents"}<ArrowRight size={15} /></button></form>
            </div>
          </section>
        )
      ) : null}

      {mode === "manual" ? (
        <>
          <header className="intake-header"><p className="section-kicker">{t("newEyebrow")}</p><h1>{t("newTitle")}</h1></header>
          <div className="intake-layout">
            <form action={createOpportunity} className="intake-form">
              <input name="locale" type="hidden" value={locale} />
              {state.session ? <input name="session_id" type="hidden" value={state.session} /> : null}
              <label className="field field--wide"><span>{t("legalName")}</span><input minLength={2} name="legal_name" required /></label>
              <label className="field"><span>{t("sector")}</span><select defaultValue="food_retail" name="sector"><option value="food_retail">Food retail</option><option value="logistics">Logistics</option><option value="manufacturing">Manufacturing</option><option value="technology">Technology</option><option value="healthcare">Healthcare</option></select></label>
              <label className="field field--wide"><span>{t("purpose")}</span><textarea minLength={3} name="purpose" required rows={4} /></label>
              <label className="field"><span>{t("requestedAmount")}</span><input inputMode="decimal" name="requested_amount" placeholder="50000000" required /></label>
              <label className="field"><span>{t("currency")}</span><select defaultValue="BRL" name="currency"><option value="BRL">BRL</option><option value="USD">USD</option><option value="EUR">EUR</option></select></label>
              <label className="field"><span>{t("term")}</span><input defaultValue={48} max={360} min={1} name="desired_term_months" required type="number" /></label>
              <button className="button intake-submit" type="submit">{t("submit")}<ArrowRight aria-hidden="true" size={16} /></button>
            </form>
            <aside className="intake-note"><Info aria-hidden="true" size={20} /><p>{t("requestNote")}</p><div><span>01</span><p>Growth capex</p></div><div><span>02</span><p>Working capital</p></div><div><span>03</span><p>Refinancing</p></div><div><span>04</span><p>Acquisition finance</p></div></aside>
          </div>
        </>
      ) : null}
    </main>
  );
}
