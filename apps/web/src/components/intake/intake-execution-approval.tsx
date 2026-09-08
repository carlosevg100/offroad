"use client";

import {useEffect, useRef} from "react";
import {useRouter} from "next/navigation";
import {useTranslations} from "next-intl";
import {approveAdvisorExecutionBrief, requestAdvisorExecutionBriefEdit} from "@/app/[locale]/app/advisor-actions";
import {ExecutionBriefCard} from "@/components/advisor/execution-brief-card";
import type {IntakeExecutionApprovalState} from "@/lib/intake/execution-approval";

export function IntakeExecutionApproval({state, locale}: {state: IntakeExecutionApprovalState; locale: string}) {
  const router = useRouter();
  const t = useTranslations("Intake.executionApproval");
  const editCommand = useRef<{key: string; id: string} | null>(null);
  const command = useRef<{key: string; id: string} | null>(null);
  useEffect(() => {
    if (!state.active) return;
    const timer = window.setInterval(() => router.refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [router, state.active]);
  const brief = state.brief;
  return <section className="intake-form" data-testid="intake-execution-approval">
    {brief ? <ExecutionBriefCard key={brief.id} brief={brief.value} version={brief.version} approval={brief.approval}
      disabled={state.planning} onRefresh={() => router.refresh()}
      onRequestEdit={async (content) => {
        const normalized = content.trim();
        const key = JSON.stringify([brief.id, brief.value.fingerprint, normalized]);
        if (editCommand.current?.key !== key) editCommand.current = {key, id: crypto.randomUUID()};
        const result = await requestAdvisorExecutionBriefEdit({locale, projectId: state.projectId, executionBriefId: brief.id,
          expectedFingerprint: brief.value.fingerprint, messageId: editCommand.current.id, content: normalized});
        if (result.ok) router.refresh();
        return result.ok ? {ok: true} : {ok: false, error: t(result.error === "stale" ? "stale" : "editFailed")};
      }}
      onApprove={async ({expectedFingerprint}) => {
        const key = `${brief.id}:${expectedFingerprint}`;
        if (command.current?.key !== key) command.current = {key, id: crypto.randomUUID()};
        const result = await approveAdvisorExecutionBrief({locale, projectId: state.projectId, executionBriefId: brief.id,
          expectedFingerprint, commandId: command.current.id});
        if (result.ok) router.refresh();
        return result.ok ? {ok: true} : {ok: false, error: t(result.error === "stale" ? "stale" : "failed")};
      }} /> : <div className="form-notice" role="status"><strong>{t(state.planning ? "preparingTitle" : "unavailableTitle")}</strong><p>{t(state.planning ? "preparingBody" : "unavailableBody")}</p></div>}
    {state.active && !state.planning ? <p role="status">{t("running")}</p> : null}
    {!state.active ? <button className="button button--ghost" type="button" onClick={() => router.refresh()}>{t("refresh")}</button> : null}
  </section>;
}
