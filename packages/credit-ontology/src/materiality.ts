import {z} from "zod";
import type {Materiality} from "./fields";

export const anchorPrecisionSchema = z.enum(["cell", "row", "block", "page", "document"]);
export type AnchorPrecision = z.infer<typeof anchorPrecisionSchema>;

/**
 * Auto-accept policy v1 (P1 plan §6.5, decision D-014). Data + one pure
 * function so the policy is testable, versioned, and reviewable by non-engineers.
 * The product still requires a human "Confirmar" for the case; auto-acceptance is
 * always visible and reversible.
 */
export const autoAcceptPolicyV1 = {
  version: "auto-accept-v1",
  material: {
    minCalibratedConfidence: 0.95,
    allowedPrecision: ["cell", "row", "block"] as AnchorPrecision[],
    requireAnchorVerified: true,
    requireNoOpenConflict: true,
    requireShadowAgreementWhenAvailable: true,
    /** Confidence cap for values read only visually (page-level anchor, unverifiable). */
    pageOnlyConfidenceCap: 0.8,
  },
  supporting: {
    minCalibratedConfidence: 0.9,
    allowedPrecision: ["cell", "row", "block", "page"] as AnchorPrecision[],
    requireAnchorVerified: true,
    requireNoOpenConflict: false,
    requireShadowAgreementWhenAvailable: false,
    pageOnlyConfidenceCap: 0.8,
  },
} as const;

export type AutoAcceptInput = {
  materiality: Materiality;
  anchorVerified: boolean;
  anchorPrecision: AnchorPrecision;
  calibratedConfidence: number;
  hasOpenConflict: boolean;
  /** undefined when no shadow pass ran; boolean when it did. */
  shadowAgreement?: boolean | undefined;
};

export type AutoAcceptDecision = {
  accept: boolean;
  reasons: string[];
  policyVersion: string;
  /** Confidence after applying caps (e.g. page-only anchors). */
  effectiveConfidence: number;
};

export function autoAcceptDecision(input: AutoAcceptInput): AutoAcceptDecision {
  const rules = autoAcceptPolicyV1[input.materiality];
  const reasons: string[] = [];
  let effectiveConfidence = clamp01(input.calibratedConfidence);
  if (input.anchorPrecision === "page" || input.anchorPrecision === "document") {
    effectiveConfidence = Math.min(effectiveConfidence, rules.pageOnlyConfidenceCap);
  }
  if (rules.requireAnchorVerified && !input.anchorVerified) reasons.push("anchor_not_verified");
  if (!rules.allowedPrecision.includes(input.anchorPrecision)) reasons.push(`precision_${input.anchorPrecision}_not_allowed`);
  if (effectiveConfidence < rules.minCalibratedConfidence) reasons.push("confidence_below_threshold");
  if (rules.requireNoOpenConflict && input.hasOpenConflict) reasons.push("open_conflict");
  if (rules.requireShadowAgreementWhenAvailable && input.shadowAgreement === false) reasons.push("shadow_disagreement");
  return {accept: reasons.length === 0, reasons, policyVersion: autoAcceptPolicyV1.version, effectiveConfidence};
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
