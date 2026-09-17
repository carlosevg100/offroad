import type {DealRequest, ResolvedMandate} from "@offroad/fund-mandate";
import {assessMandateFit} from "@offroad/fund-mandate";
import {z} from "zod";
import type {RetrievalResult} from "./schema";

/** Exact database response consumed by the production worker. No JS-side authorization or
 * ranking accepts an array of untrusted chunks. SQL filters rights before ranking. */
export const authorizedRetrievalContextSchema = z.object({
  playbook_version: z.string().nullable(),
  results: z.array(z.object({
    source: z.enum(["case", "house_playbook", "mandate_note", "precedent"]),
    id: z.string().min(1), content: z.string().min(1).max(12_000),
    citation: z.object({key: z.string().min(1), label: z.string().min(1)}).passthrough(),
    score: z.coerce.number().finite(),
  })).max(50),
  abstained: z.boolean(),
}).refine((value) => value.abstained === (value.results.length === 0), {message: "Inconsistent retrieval result"});
export type AuthorizedRetrievalContext = z.infer<typeof authorizedRetrievalContextSchema>;

const requestSchema = z.strictObject({
  jobId: z.uuid(), capability: z.string().min(32), query: z.string().trim().min(2).max(2000),
  allowedFundIds: z.array(z.uuid()).max(1000).default([]),
  precedentPurpose: z.string().min(1).max(120).nullable().default(null),
  limit: z.number().int().min(1).max(50).default(20),
});
export async function retrieveGoverned(
  request: z.input<typeof requestSchema>,
  call: (name: string, args: Record<string, unknown>) => Promise<unknown>,
): Promise<AuthorizedRetrievalContext> {
  const input = requestSchema.parse(request);
  const result = await call("worker_load_retrieval_context", {
    p_job_id: input.jobId, p_capability_token: input.capability, p_query: input.query,
    p_allowed_fund_ids: input.allowedFundIds, p_precedent_purpose: input.precedentPurpose, p_limit: input.limit,
  });
  return authorizedRetrievalContextSchema.parse(result);
}

export function mandateIdsPassingHardFilters(
  mandates: readonly ResolvedMandate[],
  request: DealRequest,
): string[] {
  return mandates
    .map((mandate) => assessMandateFit(mandate, request))
    .filter((fit) => fit.verdict === "fits")
    .map((fit) => fit.fundId)
    .sort();
}

export function validateGroundedStatements(
  statements: readonly {text: string; citationKeys: readonly string[]}[],
  result: RetrievalResult,
): {status: "grounded"; statements: typeof statements} | {status: "abstained"; reason: string} {
  if (result.abstained) return {status: "abstained", reason: result.abstentionReason ?? "no_governed_evidence"};
  const allowed = new Set(result.citations.map((citation) => citation.key));
  for (const statement of statements) {
    if (!statement.text.trim()) continue;
    if (statement.citationKeys.length === 0) {
      return {status: "abstained", reason: "uncited_statement"};
    }
    if (statement.citationKeys.some((key) => !allowed.has(key))) {
      return {status: "abstained", reason: "citation_outside_retrieval"};
    }
  }
  return {status: "grounded", statements};
}
