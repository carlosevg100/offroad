"use client";
import {useRef, useState, useTransition} from "react";
import {useLocale, useTranslations} from "next-intl";
import {useRouter} from "next/navigation";
import {reviewActionAllowed} from "@offroad/domain-contracts";
import {reviewMaterialPackage} from "@/app/[locale]/app/projects/[projectId]/material-package-review-actions";
import type {MaterialPackageReviewContext} from "@/lib/artifacts/material-package-review-context";

export function MaterialPackageReview({basis, userId}: {basis: MaterialPackageReviewContext; userId: string}) {
  const t = useTranslations("ArtifactRevisionReview"), m = useTranslations("MaterialPackageReview");
  const locale = useLocale(), router = useRouter();
  const [declared, setDeclared] = useState(false), [note, setNote] = useState("");
  const [error, setError] = useState<"denied" | "changed" | "save" | null>(null);
  const [pending, start] = useTransition();
  const attempt = useRef<{key: string; commandId: string} | null>(null);
  const context = basis.review;
  const active = context.reviews.filter(r => basis.activeApprovalReviewIds.includes(r.id));
  const allowed = (act: "approve" | "revoke_approval") => reviewActionAllowed({act, regime: context.policy, roles: context.policy.roles,
    preparedBy: basis.preparedBy, reviewerId: userId, selfApprovalDeclared: declared, workAccess: true, sourceAccess: true,
    hasSubstance: true, manageAccess: false}).allowed;
  function submit(act: "approve" | "revoke_approval", basisReviewId: string | null = null) {
    const key = JSON.stringify({revisionId: basis.revisionId, fingerprint: basis.manifestFingerprint, act, declared, note, basisReviewId});
    if (attempt.current?.key !== key) attempt.current = {key, commandId: crypto.randomUUID()};
    const commandId = attempt.current.commandId;
    setError(null);
    start(async () => {
      try {
        const result = await reviewMaterialPackage({locale, projectId: basis.workId, revisionId: basis.revisionId,
          fingerprint: basis.manifestFingerprint, act, declared, commandId, note, basisReviewId});
        if (!result.ok) setError(result.error); else {attempt.current = null; setNote(""); router.refresh();}
      } catch {setError("save");}
    });
  }
  return <section data-testid="material-package-native-review" className="advisor-private-materials__decision">
    <h3>{m("title")}</h3><p>{m(active.length ? "approved" : "scope")}</p>
    <p>{t(context.policy.assignmentRequired ? "assigned" : "individual")}</p>
    {basis.preparedBy === userId && context.policy.selfApprovalAllowed ? <label><input type="checkbox" checked={declared}
      disabled={pending} onChange={e => setDeclared(e.target.checked)} />{t("declaration")}</label> : null}
    {basis.preparedBy === userId && !context.policy.selfApprovalAllowed ? <p>{t("differentReviewer")}</p> : null}
    <label>{t("note")}<textarea value={note} maxLength={5000} disabled={pending} onChange={e => setNote(e.target.value)} /></label>
    {!active.length ? <button disabled={pending || !allowed("approve")} onClick={() => submit("approve")}>{t("approve")}</button> : null}
    <ul>{context.reviews.map(r => <li key={r.id}>{t(`acts.${r.act}`)}{r.note ? <p>{r.note}</p> : null}
      {active.some(v => v.id === r.id) ? <button disabled={pending || !allowed("revoke_approval")}
        onClick={() => submit("revoke_approval", r.id)}>{t("revoke")}</button> : null}</li>)}</ul>
    {error ? <p role="alert">{t(`errors.${error}`)}</p> : null}
  </section>;
}
