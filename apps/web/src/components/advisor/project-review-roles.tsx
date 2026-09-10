"use client";

import {projectReviewRoleSchema, type ProjectReviewRole} from "@offroad/work-plan";
import {useTranslations} from "next-intl";
import {useRouter} from "next/navigation";
import {useState, useTransition} from "react";

import {setOrganizationReviewPolicy, setProjectReviewAssignment, setProjectReviewPolicy, type ReviewSettingsResult} from "@/app/[locale]/app/projects/[projectId]/review-actions";
import {reviewMemberLabel, type ProjectReviewContext} from "@/lib/advisor/project-review-context";

import styles from "./project-review-roles.module.css";

const roles = projectReviewRoleSchema.options;

/** Configuration only. The commands in Postgres decide every prepare, return and approve; this
 * surface records who holds which responsibility and whether self-approval is allowed. */
export function ProjectReviewRoles({context, locale, projectId}: {context: ProjectReviewContext; locale: "pt-BR" | "en-US"; projectId: string}) {
  const t = useTranslations("ProjectReviewRoles");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<"invalid" | "denied" | "not_found" | "save" | null>(null);
  const editable = context.canManage && !pending;

  function run(action: () => Promise<ReviewSettingsResult>) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) setError(result.error);
        else router.refresh();
      } catch {
        setError("save");
      }
    });
  }

  const callerRoles = context.caller.roles.length ? context.caller.roles.map((role) => t(`roles.${role}`)).join(", ") : t("none");
  return <section className={styles.roles} data-mode={context.mode} data-testid="project-review-roles">
    <h2>{t("title")}</h2>
    <p>{t(`mode.${context.mode}`)}</p>
    <p className={styles.policy} data-testid="project-review-self-approval" data-effective={String(context.selfApproval.effective)}>
      {t("selfApproval.effective", {state: t(context.selfApproval.effective ? "selfApproval.allowed" : "selfApproval.forbidden")})}
    </p>
    <p className={styles.muted}>{t("yourRoles", {roles: callerRoles})}</p>
    <div className={styles.wrap}><table className={styles.table}>
      <thead><tr><th scope="col">{t("member")}</th>{roles.map((role) => <th key={role} scope="col">{t(`roles.${role}`)}</th>)}</tr></thead>
      <tbody>{context.members.map((member) => {
        const label = reviewMemberLabel(member);
        return <tr data-member-email={member.email ?? ""} data-user-id={member.userId} key={member.userId}>
          <th scope="row">{label}<small>{t.has(`membership.${member.membershipRole}`) ? t(`membership.${member.membershipRole}`) : member.membershipRole}</small></th>
          {roles.map((role: ProjectReviewRole) => <td key={role}>
            <input
              aria-label={`${label}: ${t(`roles.${role}`)}`}
              checked={member.roles.includes(role)}
              disabled={!editable}
              name="review_role"
              onChange={(event) => run(() => setProjectReviewAssignment({locale, projectId, userId: member.userId, role, assigned: event.target.checked}))}
              type="checkbox"
              value={role}
            />
          </td>)}
        </tr>;
      })}</tbody>
    </table></div>
    {context.canManage ? <div className={styles.settings}>
      <label>{t("selfApproval.project")}
        <select disabled={pending} name="project_self_approval" onChange={(event) => run(() => setProjectReviewPolicy({locale, projectId, selfApproval: event.target.value as "inherit" | "allowed" | "forbidden"}))} value={context.selfApproval.project}>
          {(["inherit", "allowed", "forbidden"] as const).map((option) => <option key={option} value={option}>{t(`selfApproval.options.${option}`)}</option>)}
        </select>
      </label>
      <label><input checked={context.selfApproval.organization} disabled={pending} name="organization_self_approval" onChange={(event) => run(() => setOrganizationReviewPolicy({locale, projectId, selfApprovalAllowed: event.target.checked}))} type="checkbox" />{t("selfApproval.organization")}</label>
    </div> : <p className={styles.muted}>{t("readOnly")}</p>}
    <p className={styles.muted}>{t("profileNote")}</p>
    {pending ? <p className={styles.muted} role="status">{t("saving")}</p> : null}
    {error ? <p role="alert">{t(`errors.${error}`)}</p> : null}
  </section>;
}
