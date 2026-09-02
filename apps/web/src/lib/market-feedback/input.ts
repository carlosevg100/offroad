import {z} from "zod";

export const marketFeedbackInputSchema = z.object({
  projectId: z.uuid(),
  sessionId: z.uuid(),
  introductionId: z.uuid(),
  eventType: z.enum(["introduction_accepted", "case_declined", "diligence_requested", "process_advanced", "proposal_issued", "funded"]),
  // Tenant users may report what a lender, company, or advisor told them. "offroad" and
  // "system" are reserved for platform-verified observations and cannot be self-asserted here.
  sourceKind: z.enum(["lender", "company", "advisor"]),
  verificationState: z.enum(["reported", "confirmed"]),
  reasonCode: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/).optional(),
  note: z.string().trim().max(4_000).optional(),
  requestedInformationCount: z.coerce.number().int().min(1).max(500).optional(),
  amount: z.coerce.number().nonnegative().optional(),
  currency: z.enum(["BRL", "USD"]).optional(),
  occurredAt: z.string().trim().max(40).optional(),
}).superRefine((input, context) => {
  if (input.eventType === "case_declined" && !input.reasonCode) {
    context.addIssue({code: "custom", path: ["reasonCode"], message: "decline reason is required"});
  }
  if (input.eventType === "diligence_requested" && !input.requestedInformationCount) {
    context.addIssue({code: "custom", path: ["requestedInformationCount"], message: "request count is required"});
  }
  if (["proposal_issued", "funded"].includes(input.eventType) && input.amount === undefined) {
    context.addIssue({code: "custom", path: ["amount"], message: "amount is required"});
  }
  if (input.amount !== undefined && !input.currency) {
    context.addIssue({code: "custom", path: ["currency"], message: "currency is required with amount"});
  }
});

export type MarketFeedbackInput = z.infer<typeof marketFeedbackInputSchema>;
