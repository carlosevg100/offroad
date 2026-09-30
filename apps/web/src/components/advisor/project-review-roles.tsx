"use client";

import {projectReviewRoleSchema, type ProjectReviewRole} from "@offroad/work-plan";
import {useTranslations} from "next-intl";
import {useRouter} from "next/navigation";
import {useState, useTransition} from "react";
import {setOrganizationReviewPolicyV2, setProjectReviewAssignment, setProjectReviewPolicyV2, type ReviewSettingsResult} from "@/app/[locale]/app/projects/[projectId]/review-actions";
import {projectReviewPolicyCommand, organizationReviewPolicyCommand} from "@/lib/advisor/project-review-policy-command";
import type {ProjectReviewPolicyContext} from "@/lib/advisor/project-review-policy-context";
import styles from "./project-review-roles.module.css";

const roles = projectReviewRoleSchema.options;

/** Configures content-review policy; an exact revision reader still decides every available act. */
export function ProjectReviewRoles({context, locale, projectId}: {context: ProjectReviewPolicyContext; locale: "pt-BR" | "en-US"; projectId: string}) {
  const t = useTranslations("ProjectReviewRoles");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<"invalid" | "denied" | "not_found" | "save" | "policy_changed" | null>(null);
  const editable = context.canManage && !pending;
  function run(action: () => Promise<ReviewSettingsResult>) {
    setError(null);
    startTransition(async () => {
      try {const result = await action(); if (!result.ok) {setError(result.error); if (result.error === "policy_changed") router.refresh();} else router.refresh();}
      catch {setError("save");}
    });
  }
  const callerRoles = context.caller.roles.length ? context.caller.roles.map(role => t(`roles.${role}`)).join(", ") : t("none");
  return <section className={styles.roles} data-regime={context.regime} data-testid="project-review-roles">
    <h2>{t("contentTitle")}</h2><p>{t("contentScope")}</p><p>{t(`regime.${context.regime}`)}</p>
    <div className={styles.policy} data-testid="project-review-assignment-required" data-effective={String(context.assignmentRequired.effective)}>
      <p>{t("assignmentRequired.effective", {state: t(context.assignmentRequired.effective ? "assignmentRequired.required" : "assignmentRequired.notRequired")})}</p>
      <p>{t("assignmentRequired.origins", {project: t(`assignmentRequired.options.${context.assignmentRequired.project}`), organization: t(context.assignmentRequired.organization ? "assignmentRequired.required" : "assignmentRequired.notRequired")})}</p>
    </div>
    <div className={styles.policy} data-testid="project-review-self-approval" data-effective={String(context.selfApproval.effective)}>
      <p>{t("selfApproval.effective", {state: t(context.selfApproval.effective ? "selfApproval.allowed" : "selfApproval.forbidden")})}</p>
      <p>{t("selfApproval.origins", {project: t(`selfApproval.options.${context.selfApproval.project}`), organization: t(context.selfApproval.organization ? "selfApproval.allowed" : "selfApproval.forbidden")})}</p>
    </div>
    <p className={styles.muted}>{t("yourRoles", {roles: callerRoles})}</p>
    {context.membersTruncated ? <p className={styles.muted} role="status">{t("membersTruncated")}</p> : null}
    <div className={styles.wrap}><table className={styles.table}>
      <thead><tr><th scope="col">{t("member")}</th>{roles.map(role => <th key={role} scope="col">{t(`roles.${role}`)}</th>)}</tr></thead>
      <tbody>{context.members.map((member, index) => {const label = member.fullName?.trim() || member.email?.trim() || t("unnamedMember", {number: index + 1}); return <tr data-member-email={member.email ?? ""} data-user-id={member.userId} key={member.userId}>
        <th scope="row">{label}<small>{t.has(`membership.${member.membershipRole}`) ? t(`membership.${member.membershipRole}`) : member.membershipRole}</small></th>
        {roles.map((role: ProjectReviewRole) => <td key={role}><input aria-label={`${label}: ${t(`roles.${role}`)}`} checked={member.roles.includes(role)} disabled={!editable}
          name="review_role" onChange={event => run(() => setProjectReviewAssignment({locale, projectId, userId: member.userId, role, assigned: event.target.checked}))} type="checkbox" value={role}/></td>)}
      </tr>;})}</tbody>
    </table></div>
    {context.canManage ? <div className={styles.settings}>
      <label>{t("assignmentRequired.project")}<select disabled={pending} name="project_assignment_required" value={context.assignmentRequired.project}
        onChange={event => run(() => setProjectReviewPolicyV2(projectReviewPolicyCommand(context, locale, {assignmentRequired: event.target.value as "inherit" | "required" | "not_required"})))}>
        {(["inherit", "required", "not_required"] as const).map(option => <option key={option} value={option}>{t(`assignmentRequired.options.${option}`)}</option>)}
      </select></label>
      <label>{t("selfApproval.project")}<select disabled={pending} name="project_self_approval" value={context.selfApproval.project}
        onChange={event => run(() => setProjectReviewPolicyV2(projectReviewPolicyCommand(context, locale, {selfApproval: event.target.value as "inherit" | "allowed" | "forbidden"})))}>
        {(["inherit", "allowed", "forbidden"] as const).map(option => <option key={option} value={option}>{t(`selfApproval.options.${option}`)}</option>)}
      </select></label>
      <label><input checked={context.assignmentRequired.organization} disabled={pending} name="organization_assignment_required" type="checkbox"
        onChange={event => run(() => setOrganizationReviewPolicyV2(organizationReviewPolicyCommand(context, locale, {assignmentRequired: event.target.checked})))}/>{t("assignmentRequired.organization")}</label>
      <label><input checked={context.selfApproval.organization} disabled={pending} name="organization_self_approval" type="checkbox"
        onChange={event => run(() => setOrganizationReviewPolicyV2(organizationReviewPolicyCommand(context, locale, {selfApprovalAllowed: event.target.checked})))}/>{t("selfApproval.organization")}</label>
    </div> : <p className={styles.muted}>{t("contentReadOnly")}</p>}
    <p className={styles.muted}>{t("profileNote")}</p>
    {pending ? <p className={styles.muted} role="status">{t("saving")}</p> : null}
    {error ? <p role="alert">{t(`errors.${error}`)}</p> : null}
  </section>;
}
