import {z} from "zod";

import {dcmWorkEffectSchema, type DcmWorkEffect} from "./work-system";

/**
 * Autonomy is granted by degrees, and each degree is a set of effects the system may produce
 * on its own. The ladder is data so that a plan, a TaskSpec and a gate can all point at the
 * same level, and so that promotion between levels is a recorded decision rather than a prompt.
 *
 * The top of the ladder never moves: the system does not send materials, contact investors or
 * take a financial decision. Sharing and introduction happen only with a specific, recorded
 * authorization for the exact material, version and recipient.
 */
export const autonomyLevelSchema = z.enum([
  "read_and_flag",
  "calculate_and_test",
  "prepare_drafts",
  "propose_changes",
  "apply_after_approval",
  "prepare_external",
  "share_or_introduce",
]);
export type AutonomyLevel = z.infer<typeof autonomyLevelSchema>;

export const autonomyLadder: readonly {
  level: AutonomyLevel;
  rank: number;
  description: string;
  effects: readonly DcmWorkEffect[];
  requiresHumanApproval: boolean;
}[] = [
  {level: "read_and_flag", rank: 1, description: "Researches, extracts, reconciles and finds questions.", effects: ["none"], requiresHumanApproval: false},
  {level: "calculate_and_test", rank: 2, description: "Updates models and runs deterministic scenarios.", effects: ["none"], requiresHumanApproval: false},
  {level: "prepare_drafts", rank: 3, description: "Produces drafts of analyses, models and materials.", effects: ["none", "propose_state"], requiresHumanApproval: false},
  {level: "propose_changes", rank: 4, description: "Suggests a change of assumption, structure or material.", effects: ["propose_state"], requiresHumanApproval: false},
  {level: "apply_after_approval", rank: 5, description: "Updates the approved object or artifact after a person approved it.", effects: ["propose_state", "commit"], requiresHumanApproval: true},
  {level: "prepare_external", rank: 6, description: "Organizes material and counterparty for a connection, without contact.", effects: ["propose_state", "commit"], requiresHumanApproval: true},
  {level: "share_or_introduce", rank: 7, description: "Shares or introduces, only with a specific authorization for material, version and recipient.", effects: ["propose_state", "commit", "external"], requiresHumanApproval: true},
];

export function autonomyRank(level: AutonomyLevel): number {
  return autonomyLadder.find((entry) => entry.level === level)!.rank;
}

/** The lowest level at which an effect is permitted at all. */
export function minimumAutonomyForEffect(effect: DcmWorkEffect): AutonomyLevel {
  return autonomyLadder.find((entry) => entry.effects.includes(effect))!.level;
}

/**
 * Whether a granted level permits an effect. `external` is never permitted by a level alone;
 * it also needs the authorization gate, which this function does not replace.
 */
export function effectWithinAutonomy(granted: AutonomyLevel, effect: DcmWorkEffect): boolean {
  const entry = autonomyLadder.find((candidate) => candidate.level === granted)!;
  return entry.effects.includes(effect);
}

export const autonomyGrantSchema = z.object({
  level: autonomyLevelSchema,
  /** Who granted it and when; a grant without a person behind it is not a grant. */
  grantedBy: z.string().uuid(),
  grantedAt: z.string().datetime({offset: true}),
  scope: z.enum(["organization", "project"]),
  effect: dcmWorkEffectSchema.optional(),
});
export type AutonomyGrant = z.infer<typeof autonomyGrantSchema>;
