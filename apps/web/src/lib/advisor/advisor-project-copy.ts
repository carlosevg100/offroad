import "server-only";
import {getTranslations} from "next-intl/server";
import type {AdvisorProjectCopy} from "@/components/advisor/advisor-project";

export async function advisorProjectCopy(locale: string): Promise<AdvisorProjectCopy> {
  const t = await getTranslations({locale, namespace: "App.advisorProject"});
  const copy: AdvisorProjectCopy = {
    advisor: t("advisor"), context: t("context"), conversation: t("conversation"), documents: t("documents"), noDocuments: t("noDocuments"), plan: t("plan"), activity: t("activity"), evidence: t("evidence"), decisions: t("decisions"), verified: t("verified"), notExamined: t("notExamined"), openRequirements: t("openRequirements"), materiality: {blocking: t("materiality.blocking"), high: t("materiality.high"), medium: t("materiality.medium"), low: t("materiality.low")}, openIssues: t("openIssues"), artifacts: t("artifacts"), contextQuestion: t("contextQuestion"), awaitingAnswer: t("awaitingAnswer"), noArtifacts: t("noArtifacts"), openWork: t("openWork"), placeholder: t("placeholder"), attach: t("attach"), send: t("send"), close: t("close"), private: t("private"), public: t("public"), working: t("working"), ready: t("ready"), needsAttention: t("needsAttention"), messageFailed: t("messageFailed"),
    errors: {invalid: t("errors.invalid"), denied: t("errors.denied"), role: t("errors.role"), duplicate: t("errors.duplicate"), not_found: t("errors.notFound"), save: t("errors.save"), processing: t("errors.processing"), stale: t("errors.stale"), upload: t("errors.upload")},
    informationRequest: {
      eyebrow: t("informationRequest.eyebrow"), why: t("informationRequest.why"), impact: t("informationRequest.impact"), evidence: t("informationRequest.evidence"), attachEvidence: t("informationRequest.attachEvidence"), attachEvidenceHelp: t("informationRequest.attachEvidenceHelp"), other: t("informationRequest.other"), placeholder: t("informationRequest.placeholder"), submit: t("informationRequest.submit"), submitting: t("informationRequest.submitting"), unavailable: t("informationRequest.unavailable"), unavailableMessage: t("informationRequest.unavailableMessage"), remaining: t("informationRequest.remaining"), confirmYes: t("informationRequest.confirmYes"), confirmNo: t("informationRequest.confirmNo"),
    },
    proposal: {
      preview: t("proposal.preview"), impact: t("proposal.impact"), accept: t("proposal.accept"), reject: t("proposal.reject"), applying: t("proposal.applying"), rejecting: t("proposal.rejecting"), applied: t("proposal.applied"), rejected: t("proposal.rejected"), stale: t("proposal.stale"), monthValue: t("proposal.monthValue"),
      errors: {invalid: t("proposal.errors.invalid"), stale: t("proposal.errors.stale"), save: t("proposal.errors.save"), processing: t("proposal.errors.processing")},
      fields: {
        objective: t("proposal.fields.objective"), requestedAmount: t("proposal.fields.requestedAmount"), currency: t("proposal.fields.currency"), urgency: t("proposal.fields.urgency"), requestedTermMonths: t("proposal.fields.requestedTermMonths"), requestedGraceMonths: t("proposal.fields.requestedGraceMonths"), consequenceIfNotExecuted: t("proposal.fields.consequenceIfNotExecuted"), sector: t("proposal.fields.sector"), geography: t("proposal.fields.geography"), instruments: t("proposal.fields.instruments"), collateralKinds: t("proposal.fields.collateralKinds"), expectedRate: t("proposal.fields.expectedRate"),
      },
    },
  };
  return copy;
}
