import {z} from "zod";
import type {SupabaseClient} from "@supabase/supabase-js";
import {retentionMatrixVersion, processingProviderSchema, type ModelPurpose, type ProcessingEligibilityDecision, type ProcessingResource} from "@offroad/model-gateway";
import type {ClaimedJob} from "./queue";

const connectionSchema = z.object({
  accountRef: z.string().min(1).max(200), projectRef: z.string().min(1).max(200),
  credentialBinding: z.string().min(1).max(200), region: z.string().min(1).max(200),
}).strict();
export const providerConnectionsSchema = z.partialRecord(processingProviderSchema, connectionSchema);
export type ProviderConnections = z.infer<typeof providerConnectionsSchema>;
/** The one endpoint each provider route declares; assurances are recorded against exactly these. */
export const providerEndpoints = {anthropic: "https://api.anthropic.com/v1/messages", openai: "https://api.openai.com/v1/responses", perplexity: "https://api.perplexity.ai/search", firecrawl: "https://api.firecrawl.dev/v2/scrape"} as const;
const endpoints = providerEndpoints;
const decisionSchema = z.object({allowed: z.boolean(), policyVersion: z.literal(retentionMatrixVersion), assuranceId: z.uuid().nullable(), reasons: z.array(z.string().regex(/^[a-z_:]+$/))});

/** The job capability, source rights, classification floor and expiry are rechecked in SQL.
 * The model never receives the capability or a means of authoring an assurance. */
export function createProviderProcessingAuthorizer(supabase: SupabaseClient, job: ClaimedJob, connections: ProviderConnections) {
  return async (input: {provider: keyof typeof endpoints; model: string; resources: ProcessingResource[]; purpose: ModelPurpose}): Promise<ProcessingEligibilityDecision> => {
    const connection = connections[input.provider];
    if (!connection) return {allowed: false, policyVersion: retentionMatrixVersion, assuranceId: null, reasons: ["processing_connection_unverified"]};
    const {data, error} = await supabase.rpc("worker_authorize_provider_processing_v1", {
      p_job_id: job.job_id, p_capability_token: job.capability_token,
      p_route: {...connection, provider: input.provider, model: input.model, endpoint: endpoints[input.provider]},
      p_resources: input.resources, p_purpose: input.purpose,
    });
    if (error) throw new Error("processing_authority_unavailable");
    const decision = decisionSchema.safeParse(data);
    if (!decision.success) throw new Error("processing_authority_invalid_response");
    return decision.data;
  };
}
