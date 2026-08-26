import {z} from "zod";

const locale = z.enum(["pt-BR", "en-US"]);
const intakeJourney = z.enum(["company", "originator"]);
const intakeSurface = z.enum(["onboarding", "workspace"]);
const intakeStage = z.enum(["start", "company", "operation", "request", "documents", "review"]);
const intakeState = z.enum(["open", "processing", "failed", "review_ready"]);
const evidenceBand = z.enum(["none", "single", "two_to_five", "six_plus"]);
const requestBand = z.enum(["none", "one_to_two", "three_to_five"]);

export const productEventSchemas = {
  marketing_demo_viewed: z.object({locale, origin: z.enum(["landing", "workspace"])}).strict(),
  auth_started: z.object({locale, method: z.enum(["password", "signup", "email_code", "recovery_code"])}).strict(),
  onboarding_completed: z.object({locale, journey: z.enum(["company", "originator", "capital_provider"])}).strict(),
  workspace_viewed: z.object({
    locale,
    role: z.enum(["owner", "admin", "member", "analyst", "relationship_manager", "compliance"]),
  }).strict(),
  opportunity_intake_created: z.object({locale, currency: z.string().regex(/^[A-Z]{3}$/)}).strict(),
  intake_journey_stage_viewed: z.object({
    locale,
    surface: intakeSurface,
    journey: intakeJourney,
    stage: intakeStage,
    state: intakeState,
    evidenceBand,
    requestBand,
  }).strict(),
  intake_request_batch_viewed: z.object({
    locale,
    archetype: z.enum([
      "growth_expansion",
      "working_capital",
      "refinance",
      "acquisition",
      "equipment_finance",
      "venture_debt",
      "other",
    ]),
    state: z.enum(["ready", "awaiting_evidence", "complete"]),
    activeCount: z.number().int().min(0).max(5),
    hiddenOpenCount: z.number().int().min(0).max(100),
  }).strict(),
} as const;

export type ProductEventName = keyof typeof productEventSchemas;
export type ProductEventProperties<Name extends ProductEventName> = z.infer<(typeof productEventSchemas)[Name]>;

export function parseProductEvent(name: string, properties: unknown) {
  if (!(name in productEventSchemas)) return null;
  const schema = productEventSchemas[name as ProductEventName];
  const result = schema.safeParse(properties);
  return result.success ? result.data : null;
}

export function isAllowedProductEvent(name: string): name is ProductEventName {
  return name in productEventSchemas;
}
