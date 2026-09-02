import {fingerprintJson} from "@offroad/case-understanding";
import {z} from "zod";

export const interventionCauseSchema = z.enum([
  "missing_product_capability",
  "model_quality_failure",
  "data_quality_failure",
  "workflow_failure",
  "client_request",
  "required_professional_judgment",
  "exception_handling",
]);
export type InterventionCause = z.infer<typeof interventionCauseSchema>;

export const humanInterventionSchema = z.object({
  caseId: z.string().min(1),
  taskId: z.string().min(1),
  cause: interventionCauseSchema,
  minutes: z.number().positive(),
  captured: z.boolean(),
  changedCanonicalState: z.boolean(),
  reviewed: z.boolean(),
});
export type HumanIntervention = z.infer<typeof humanInterventionSchema>;

export const interventionSummarySchema = z.object({
  caseCount: z.number().int().nonnegative(),
  eventCount: z.number().int().nonnegative(),
  totalMinutes: z.number().nonnegative(),
  untrackedMinutes: z.number().nonnegative(),
  minutesPerCase: z.number().nonnegative(),
  recurringCauses: z.array(z.object({cause: interventionCauseSchema, count: z.number().int().positive(), minutes: z.number().positive()})),
  falseVictoryRisk: z.boolean(),
  blockers: z.array(z.string().min(1)),
  summaryFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
});
export type InterventionSummary = z.infer<typeof interventionSummarySchema>;

/** Makes analyst/founder labour visible before SaaS economics are claimed. */
export function summarizeHumanIntervention(input: {
  events: HumanIntervention[];
  maxMinutesPerCase: number;
  recurringCauseThreshold: number;
}): InterventionSummary {
  const events = z.array(humanInterventionSchema).parse(input.events);
  const maxMinutesPerCase = z.number().nonnegative().parse(input.maxMinutesPerCase);
  const recurringCauseThreshold = z.number().int().positive().parse(input.recurringCauseThreshold);
  const caseCount = new Set(events.map((event) => event.caseId)).size;
  const totalMinutes = events.reduce((sum, event) => sum + event.minutes, 0);
  const untrackedMinutes = events.filter((event) => !event.captured).reduce((sum, event) => sum + event.minutes, 0);
  const minutesPerCase = caseCount === 0 ? 0 : totalMinutes / caseCount;
  const byCause = new Map<InterventionCause, {count: number; minutes: number}>();
  for (const event of events) {
    const current = byCause.get(event.cause) ?? {count: 0, minutes: 0};
    current.count += 1;
    current.minutes += event.minutes;
    byCause.set(event.cause, current);
  }
  const recurringCauses = [...byCause.entries()]
    .filter(([, value]) => value.count >= recurringCauseThreshold)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([cause, value]) => ({cause, ...value}));
  const blockers: string[] = [];
  if (untrackedMinutes > 0) blockers.push("uncaptured_human_intervention_present");
  if (minutesPerCase > maxMinutesPerCase) blockers.push("manual_minutes_per_case_above_limit");
  if (recurringCauses.some((entry) => entry.cause !== "required_professional_judgment" && entry.cause !== "client_request")) {
    blockers.push("recurring_product_or_quality_work_is_manual");
  }
  if (events.some((event) => event.changedCanonicalState && !event.reviewed)) blockers.push("unreviewed_manual_canonical_change");
  const payload = {
    caseCount,
    eventCount: events.length,
    totalMinutes,
    untrackedMinutes,
    minutesPerCase,
    recurringCauses,
    falseVictoryRisk: blockers.length > 0,
    blockers,
  };
  return interventionSummarySchema.parse({...payload, summaryFingerprint: fingerprintJson(payload)});
}
