import {z} from "zod";

const locale = z.enum(["pt-BR", "en-US"]);

export const productEventSchemas = {
  marketing_demo_viewed: z.object({locale, origin: z.enum(["landing", "workspace"])}).strict(),
  auth_started: z.object({locale, method: z.enum(["password", "magic_link", "signup"])}).strict(),
  onboarding_completed: z.object({locale, journey: z.enum(["company", "originator", "capital_provider"])}).strict(),
  workspace_viewed: z.object({
    locale,
    role: z.enum(["owner", "admin", "member", "analyst", "relationship_manager", "compliance"]),
  }).strict(),
  opportunity_intake_created: z.object({locale, currency: z.string().regex(/^[A-Z]{3}$/)}).strict(),
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
