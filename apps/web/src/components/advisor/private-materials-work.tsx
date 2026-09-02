"use client";

import {Check, Download, FileText, LoaderCircle, ShieldCheck} from "lucide-react";
import {useActionState} from "react";
import {useFormStatus} from "react-dom";
import {useTranslations} from "next-intl";

import {
  approvePrivateProjectMaterialPackage,
  approvePrivateProjectProductionPlan,
  type PrivateGovernedDecisionState,
} from "@/app/[locale]/app/projects/[projectId]/actions";
import type {GovernedMaterialPackage} from "@/lib/deal-state/materials";
import type {DealStateWorkbench} from "@/lib/deal-state/workbench";

import {privateMaterialArtifacts} from "./private-material-artifacts";

type Props = {
  governed: GovernedMaterialPackage | null;
  isProcessing: boolean;
  locale: "pt-BR" | "en-US";
  packageReview: DealStateWorkbench["packageReview"];
  productionPlan: DealStateWorkbench["productionPlan"];
  projectId: string;
  sessionId: string;
  structureConfirmed: boolean;
};

const initialState: PrivateGovernedDecisionState = {ok: false};

export function PrivateMaterialsWork(props: Props) {
  if (!props.structureConfirmed) return null;
  if (props.governed) return <PackageReview {...props} governed={props.governed} />;
  if (props.productionPlan?.row.status === "pending_confirmation") return <ProductionPlan {...props} plan={props.productionPlan} />;
  if (props.isProcessing || props.productionPlan?.row.status === "approved") return <MaterialsProcessing />;
  return null;
}

function ProductionPlan({locale, plan, projectId, sessionId}: Props & {plan: NonNullable<Props["productionPlan"]>}) {
  const t = useTranslations("App.privateCase");
  const [state, action] = useActionState(approvePrivateProjectProductionPlan, initialState);
  return (
    <section className="advisor-private-materials">
      <header><span>{t("productionKicker")}</span><h2>{t("productionTitle")}</h2><p>{t("productionBody")}</p></header>
      <div className="advisor-private-materials__plan">
        {plan.value.artifacts.map((artifact, index) => <section key={artifact}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{t(`artifacts.${artifact}.title`)}</strong><p>{t(`artifacts.${artifact}.description`)}</p></div></section>)}
      </div>
      <form action={action} className="advisor-private-materials__decision">
        <input name="locale" type="hidden" value={locale} />
        <input name="project_id" type="hidden" value={projectId} />
        <input name="session_id" type="hidden" value={sessionId} />
        <input name="plan_fingerprint" type="hidden" value={plan.row.object_fingerprint} />
        <div><FileText aria-hidden="true" size={16} /><span><strong>{t("productionApprovalTitle")}</strong><p>{t("productionApprovalBody")}</p></span></div>
        <SubmitButton idle={t("productionApprove")} pending={t("productionApproving")} />
      </form>
      <p className="advisor-private-materials__boundary"><ShieldCheck aria-hidden="true" size={13} />{t("productionBoundary")}</p>
      {!state.ok && state.code ? <p className="form-notice form-notice--error" role="alert">{t(`governedErrors.${state.code}`)}</p> : null}
    </section>
  );
}

function PackageReview({governed, locale, packageReview, projectId, sessionId}: Props & {governed: GovernedMaterialPackage}) {
  const t = useTranslations("App.privateCase");
  const [state, action] = useActionState(approvePrivateProjectMaterialPackage, initialState);
  const artifacts = privateMaterialArtifacts(governed, locale, sessionId);
  const complete = artifacts.every((artifact) => artifact.available);
  const approved = packageReview?.status === "approved";
  return (
    <section className="advisor-private-materials">
      <header><span>{approved ? t("materialsApprovedKicker") : t("materialsKicker")}</span><h2>{approved ? t("materialsApprovedTitle") : t("materialsTitle")}</h2><p>{approved ? t("materialsApprovedBody") : t("materialsBody")}</p></header>
      <div className="advisor-private-materials__files">
        {artifacts.map((artifact, index) => <section className={artifact.available ? "is-ready" : "is-blocked"} key={artifact.id}><span>{artifact.available ? <Check aria-hidden="true" size={13} /> : String(index + 1).padStart(2, "0")}</span><div><strong>{t(`artifacts.${artifact.id}.title`)}</strong><p>{artifact.available ? t("materialsReady") : t("materialsPending")}</p></div>{artifact.available ? <div className="advisor-private-materials__file-actions">{artifact.actions.map((item) => <a href={item.href} key={item.kind} rel="noreferrer" target="_blank"><Download aria-hidden="true" size={13} />{t(`materialActions.${item.kind}`)}</a>)}</div> : <small>{t("materialsBlocked")}</small>}</section>)}
      </div>
      {complete && !approved ? <form action={action} className="advisor-private-materials__decision">
        <input name="locale" type="hidden" value={locale} />
        <input name="project_id" type="hidden" value={projectId} />
        <input name="session_id" type="hidden" value={sessionId} />
        <input name="artifact_fingerprint" type="hidden" value={governed.artifactFingerprint} />
        <div><ShieldCheck aria-hidden="true" size={16} /><span><strong>{t("materialsApprovalTitle")}</strong><p>{t("materialsApprovalBody")}</p></span></div>
        <SubmitButton idle={t("materialsApprove")} pending={t("materialsApproving")} />
      </form> : !complete ? <p className="advisor-private-materials__incomplete">{t("materialsIncomplete")}</p> : null}
      <p className="advisor-private-materials__boundary"><ShieldCheck aria-hidden="true" size={13} />{t("materialsBoundary")}</p>
      {!state.ok && state.code ? <p className="form-notice form-notice--error" role="alert">{t(`governedErrors.${state.code}`)}</p> : null}
    </section>
  );
}

function MaterialsProcessing() {
  const t = useTranslations("App.privateCase");
  return <section className="advisor-private-materials advisor-private-materials--processing" aria-live="polite"><LoaderCircle aria-hidden="true" className="spin" size={18} /><div><span>{t("productionKicker")}</span><strong>{t("materialsProcessingTitle")}</strong><p>{t("materialsProcessingBody")}</p></div></section>;
}

function SubmitButton({idle, pending}: {idle: string; pending: string}) {
  const status = useFormStatus();
  return <button className="button" disabled={status.pending} type="submit">{status.pending ? <LoaderCircle aria-hidden="true" className="spin" size={14} /> : null}{status.pending ? pending : idle}</button>;
}
