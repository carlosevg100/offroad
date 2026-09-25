/**
 * Model-spend ceilings of production jobs, in USD per attempt of one job (a retried job starts a
 * fresh gateway), re-derived on 24 Sep 2026 when production started to reserve every attempt with
 * the calibrated upper bound of `conservative-reservation.ts`. Because no call is admitted unless
 * its reservation still fits, a ceiling is the most one attempt of the job can spend.
 *
 * How each value is derived, the same way for every job:
 * - The largest request the job can build, at the caps its own code applies: 40,000-character
 *   extraction windows beside the widest field catalogue (the `other` kind, 494 fields), public
 *   research at five sources per query with every snippet at its cut, conversations of twelve
 *   8,000-character messages, the Camil gold case of 170 facts for the case brief. Measured on the
 *   repository's own documents and gold fields by `apps/document-worker/src/production-budgets.test.ts`.
 * - The worst legitimate attempt over those requests: every earlier attempt billed at its full
 *   upper bound (its reservation without the 10% price margin), one request allowed to fail at its
 *   ceiling and go through its same-model repair (prompted JSON) and its provider fallback, bounded
 *   by the job's call ceiling.
 * - Plus 10%, plus the public-research reserve the worker keeps for that job, rounded up to five
 *   cents. Where the database already grants more, its value stays: nothing here tightens a
 *   budget the measured requests do not need.
 *
 * The worker enforces the smallest of this ceiling, the job's database budget and the optional
 * MODEL_MAX_COST_USD_PER_JOB override. Values the database also holds are named in each entry; the
 * migration `production_budget_ceilings` writes the ones this derivation raised, and
 * `production-budgets.test.ts` holds its numbers to these constants.
 */
export const productionModelCeilingsUsd = {
  /**
   * Per document. Old ceiling 0.75 (web run budget and database default), 8 calls. Largest
   * classification 0.0732 (GPT-5.6 Terra, 0.0602 under the old estimate); largest extraction
   * window 0.2094 (Sonnet 5, 0.1402 old).
   * Worst attempt: classification plus seven windows at their bound, 1.4184; x1.10 = 1.5602.
   * The largest ratio of new to old reservation over these requests is 1.49, so 1.60 also admits
   * every call the old 0.75 admitted. The single 8.32 USD document on record is out of reach of the
   * call ceiling of #310 (28 Aug 2026): three attempts of eight calls, each at its calibrated bound
   * and at the Sonnet 5 price then recorded, come to about 6.9 USD. It ran under the former
   * 12 USD / 800 calls per job; admitting it again would mean undoing #310, not calibrating.
   */
  documentPipeline: 1.6,
  /**
   * Old ceiling 1.00 (web and database `case_max_cost_usd`) less 0.10 of research. Largest request
   * the case brief of the Camil gold case (170 facts), 1.1793 on Claude Opus 5 (0.9808 old, already
   * above the old 0.90). Worst attempt on the primary routes, structure design (0.3205), brief,
   * audit with revision on GPT-5.6 Sol (0.8017) and fresh audit on Opus (0.6114), each earlier one
   * at its bound: 2.7038; x1.10 = 2.9741. The model calls get 3.00, the case engine's own run
   * policy (`executeCaseEngine`, 3 USD and 4 calls), since the engine fails a stage whose spend
   * passes it; plus 5 research queries at 0.02.
   */
  caseAnalysis: 3.1,
  /**
   * Database: 0.90 (`private.enqueue_primary_case_analysis`), 2 calls. Largest request 0.2530
   * (Sonnet 5, 0.1505 old); worst attempt with the GPT-5.6 Terra fallback (0.2588) 0.4889; x1.10
   * plus 0.10 of research = 0.6378. The database value covers it and stays.
   */
  preliminaryAnalysis: 0.9,
  /**
   * No database budget: this value is the job's only ceiling (was the 1.00 environment default).
   * Largest requests with every context field at its cap: route_intent 0.1680, semantic objects
   * 0.1454, the brief 0.3703 on Sonnet 5 and 0.7178 on the GPT-5.6 Sol fallback (0.0838, 0.0728,
   * 0.1768 and 0.3537 old). Worst attempt, both shadow requests then the brief failing, repaired
   * (0.3710) and answered by Sol: 1.6767; x1.10 = 1.8443. The historical maximum, 0.2245 per job,
   * plus the largest request fits with room. Only a turn in which the shadow requests fail too at
   * that size (every request through its whole chain, about 2.1) would reach the ceiling.
   */
  agentOperationBrief: 1.85,
  /**
   * Database: 0.25 and 1 call (`private.enqueue_work_turn_v1`, and a literal of the worker's job
   * schema). Largest request 0.1867 (Sonnet 5, 0.0886 old); x1.10 = 0.2054. The value stays.
   */
  workConversation: 0.25,
  /**
   * Database: 1.55 and 2 calls (trigger `private.normalize_origination_runtime_budget_v1`, 1.50
   * before the migration), but the worker held it at the 1.00 environment default less 0.24 of
   * research. Largest request 0.7993 on GPT-5.6 Sol (0.6313 old); worst attempt, Sol truncated and
   * answered by Terra: 1.1792; x1.10 = 1.2971; plus 12 research queries at 0.02 = 1.5371. A job
   * written before the migration keeps 1.50, which still admits that attempt with 6.9% to spare.
   */
  originationThesis: 1.55,
  /** A revision is one call on the prior research, no new search; the trigger gives it 1.55 as well. */
  originationThesisRevision: 1.55,
  /**
   * Database: 0.95 and 2 calls (`private.start_public_company_debt_view_v1`). Largest request
   * 0.2096 (Sonnet 5, 0.1301 old); worst attempt with the Terra fallback 0.4040; x1.10 plus 8
   * research queries at 0.02 = 0.6044. The database value stays.
   */
  companyDebtView: 0.95,
  /** Database: 0.85 and 1 call (`private.request_company_debt_view_revision_v1`); one Sonnet 5 call on the prior research. */
  companyDebtViewRevision: 0.85,
  /**
   * Database: 0.95 and 2 calls (`private.worker_activate_advisor_specialized_job_v2`). Largest
   * request 0.2038 (Sonnet 5, 0.1281 old); worst attempt with the Terra fallback 0.3914; x1.10 plus
   * 8 research queries at 0.02 = 0.5906. The database value stays.
   */
  capitalPlanning: 0.95,
  /** Database: 0.80 and 1 call (`private.request_capital_planning_revision_v1`); one Sonnet 5 call on the prior research. */
  capitalPlanningRevision: 0.8,
  /**
   * Database: 0.60 and 4 calls (`private.worker_activate_integration_preview_run_v1`, 0.50 before
   * the migration). The live preview asks at most the questions (0.0527, 0.0330 old) and the
   * synthesis (0.2464 on Sonnet 5, 0.2487 on the Terra fallback; 0.1378 old). Worst attempt,
   * synthesis failing and answered by Terra: 0.5206; x1.10 = 0.5726. It runs on the frozen case
   * and never researches, so no research is reserved. A job written before the migration keeps
   * 0.50, which admits the primary path (0.2943) and degrades a failed synthesis to its
   * deterministic skeleton, as the code intends.
   */
  integrationPreview: 0.6,
} as const;

/**
 * The economic contract of a document run, as the web app sends it to `begin_processing_run`. The
 * database gives each paid document the smaller of `document_max_cost_usd` and what the run leaves
 * after the case analysis, divided by the documents: 16.00 = 3.10 + 8 x 1.60 lets a data room of
 * eight documents (the Rede Horizonte acceptance room) keep the whole per-document ceiling, where
 * the old 5.00 = 1.00 + 4.00 did that for five documents at 0.75. Calls are unchanged. Every value
 * sits inside the bounds the database validates (at most 25 USD, the case below the run), and the
 * same numbers are the database's defaults for a run its own callers start without a budget.
 */
export const productionRunBudget = {
  max_cost_usd: 16,
  max_calls: 160,
  document_max_cost_usd: productionModelCeilingsUsd.documentPipeline,
  document_max_calls: 8,
  case_max_cost_usd: productionModelCeilingsUsd.caseAnalysis,
  case_max_calls: 4,
} as const;
