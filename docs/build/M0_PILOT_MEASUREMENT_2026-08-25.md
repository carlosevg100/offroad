# M0 pilot measurement contract

Date: 25/08/2026
Scope: guided intake for companies and advisors
Status: implemented measurement contract; real production cohort still required

## 1. What is measured

The M0 funnel is measured by the allow-listed event `intake_journey_stage_viewed`:

1. `start`: the guided entry point was shown;
2. `operation`: the company or advisor is framing the capital need;
3. `request`: the short transaction brief is being completed;
4. `documents`: the operation-specific information request and upload area are visible;
5. `review`: processed suggestions, conflicts and evidence are ready for assisted review.

Every event carries only finite categories:

- locale: `pt-BR` or `en-US`;
- surface: onboarding or an existing workspace;
- journey: company or advisor;
- stage and session state;
- document volume as `none`, `single`, `two_to_five` or `six_plus`;
- active request volume as `none`, `one_to_two` or `three_to_five`.

It never carries an organization, case, person, e-mail, filename, document content, amount,
financial metric, free-form answer or database identifier. PostHog autocapture, page capture,
page-leave capture, replay, persistent storage and person profiles remain disabled. Browser DNT is
respected.

## 2. How abandonment is read

Abandonment is a funnel observation, not a browser unload event. A page close is ambiguous: the
client may be gathering a document, waiting for an advisor or returning later. We therefore do not
emit a misleading `abandoned` fact.

For the pilot, read conversion between consecutive stage views and segment by surface, journey,
locale, session state and evidence band. A stage is a friction candidate when its cohort reaches the
stage but does not reach the next stage within the agreed observation window. Confirm actual case
state in the Offroad database before contacting or classifying an individual client. PostHog remains
aggregate product telemetry and is never a shadow data room.

Recommended pilot windows:

- same-session completion for `start` to `operation` and `operation` to `request`;
- 24 hours for `request` to `documents`;
- seven days for `documents` to `review`, because evidence collection is not an immediate UI task.

## 3. Pilot acceptance criteria

The first real pilot is accepted only when all of the following are evidenced:

1. the company can start with one file and receives credit only for what the file supports;
2. the visible request batch never exceeds the governed maximum of five;
3. an unclassified or duplicated file does not close a requirement;
4. a new upload invalidates stale request-ladder work and causes recomputation;
5. an advisor's client, perimeter and authority remain isolated by case;
6. document-supported entities remain suggestions until an authorized decision;
7. suspected disguised liquidity remains a review flag and never changes the route silently;
8. every screen remains usable in Portuguese and English, desktop and mobile;
9. no sensitive or case-level property reaches PostHog or Sentry;
10. no M0 procedure is promoted to institutional production without independent review of its exact
    version and gold evidence.

## 4. What this increment does not claim

This closes the engineering measurement and adversarial-test gap for M0. It does not by itself prove
that the intake wording, request cadence or client experience is institutionally mature. That proof
requires a real company or advisor pilot, observed friction, an independent reviewer and explicit
procedure-by-procedure promotion evidence.
