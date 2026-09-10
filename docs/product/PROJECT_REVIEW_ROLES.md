# Project review roles and the common work entry

Status: implemented on branch `feat/task-capability-registry-and-review-roles` (10 September 2026).
Migration `20260910230211_project_review_roles.sql` applied to the staging branch only, where it was recorded as version `20260910193505`.

## Why

Until this change, `private.can_access_capital_project` admitted any active member of the
organization, and the approval command reused that access. A team could not express that an
analyst prepares and a responsible person reviews or approves. Standalone work was limited to a
documentary-only control that refused calculations without offering the executor that performs
them.

## Roles

Three responsibilities exist per capital project, additive per person:

| Role | May |
|---|---|
| preparer | request new work (common entry, documentary revision, institutional setup submission, provider case-fit request) and adjust a plan |
| reviewer | return a plan version for adjustments |
| approver | approve a plan version or an institutional configuration; may also return |

Organization owners and admins (`private.can_manage_organization`) assign roles and change the
self-approval setting. A commercial or professional profile (CFO, banker, analyst, investor)
never grants a role, data access or approval power by itself.

## Policy

* **Open mode.** A project with no assignment keeps the behavior that existed before this
  change: every active member with project access may prepare, return and approve, including the
  person who prepared the version. This is the explicit compatibility policy for historical
  plans, approvals already recorded and single-person projects. Nothing needs to be configured.
* **Assigned mode.** The first assignment switches the project. Preparing requires `preparer`,
  returning requires `reviewer` or `approver`, approving requires `approver`. The person who
  prepared a version may approve it only when the effective self-approval setting allows it.
* **Self-approval.** Effective value = project setting when explicit (`allowed` or
  `forbidden`), otherwise the organization setting, otherwise `false`.
* **Preparer of a version.** The actor of the latest plan-edit request recorded before that
  version existed; for the first version, the person who created the plan.
* **Approval record.** The execution brief dispatch persists `prepared_by`, `reviewed_by`,
  `reviewed_at`, `review_decision` (`approved` or `returned`), `approved_brief_version` and
  `approved_brief_fingerprint`. Existing accepted dispatches were backfilled from their history.
* **Change after approval.** Unchanged: any material change of inputs or payload supersedes the
  approval through the existing fingerprints, and the next version is approved again by an
  approver. A reviewer's return also invalidates the version.
* **Idempotency.** Assignment, policy, approval and work-request commands replay without a
  second effect; a reused work-request id with a different objective is refused.

## Enforcement points (Postgres, security definer, `set search_path = ''`)

`private.assert_capital_project_review_action` is called inside:
`approve_advisor_execution_brief_v1` (approve), `submit_advisor_execution_brief_edit_v1`
(prepare or return, recording the return), `request_documentary_work_revision_v1` (prepare),
`submit_institutional_model_setup_v1` (prepare), `review_institutional_configuration_and_calculate_v1`
(approve or return; the preparer is the configuration submitter),
`start_provider_case_fit_project_v1` when it targets an existing project (prepare), and
`record_capital_project_work_request_v1` (prepare). Every check that existed before remains.
The conversation turn itself is not gated.

Tables: `organization_review_policies`, `capital_project_review_policies`,
`capital_project_review_assignments`, `capital_project_work_requests`. All have RLS enabled and
forced, select limited to project or organization members, explicit deny policies for writes,
audit and `updated_at` triggers. Writes happen only through the commands above.

## Common work entry

`packages/work-plan/src/project-capability-registry.ts` lists the three capabilities a project can
execute today (documentary reading, financial result, provider research) with their executor,
inputs, approval gate, supported deliverable types, plan, expected result, limits and the declared
behavior when data is missing or the request is unsupported. `dispatchProjectWork` runs in the
browser for the preview and again on the server before `record_capital_project_work_request_v1`.
Calculations inside a documentary request are refused there and routed to the financial result.
Deliverable types are the hook for the later format policy and client templates.

## Verification

* `supabase/tests/project_review_roles.sql` (CI database job; also executed on staging inside a
  rolled-back transaction): open-mode compatibility, management denial for plain members,
  cross-organization denial, read-only member, preparer and reviewer denied approval, reviewer
  return recorded and version invalidated, self-approval forbidden by default and allowed only
  through the explicit setting (organization inherited, project override in both directions),
  approver approval persisted once with idempotent replay, change after approval superseding the
  version, role gates on the documentary, institutional, provider and work-request commands,
  tenant boundary on the new tables.
* Vitest: registry dispatch, review-context projection, work-request history, approval record,
  the entry and roles components in both locales.
* Playwright (CI): `institutional-setup.spec.ts` uses the entry for a documentary request
  (explained, not started) and a financial request (routed and recorded), then assigns roles and
  proves that self-approval is refused until the setting allows it.

Production (project `ifnogpksgdadruooqydi`) recorded the same statement as version `20260910230211` on 10 September 2026; the local file name follows that stamp, staging keeps its own stamp `20260910193505` with identical SQL.
