import {
  advisoryDisclaimerId,
  auditConduct,
  conductPolicyVersion,
  type ConductAudit,
  type DiligenceSurprise,
} from "@offroad/credit-playbook";
import {createHash} from "node:crypto";

import type {Material} from "./compile";
import {materialPackageFingerprint} from "./truth";

export const languageConductTruthVersion = "2026.08.26-v1";

export type ConductPolicyState = {
  version: string;
  status: "active" | "invalidated";
  disclaimerId: string;
  validFrom: string;
  validUntil: string | null;
};

export type ConflictReview = {
  caseFingerprint: string;
  status: "clear" | "disclosed_accepted" | "unresolved";
  reviewedBy: string;
  reviewedAt: string;
};

export type ExternalCommunicationContext = {
  targetOrganizationId: string;
  targetCaseId: string;
  recipientId: string;
  recipientAuthorized: boolean;
  packageFingerprint: string;
  hasMaterialCommitment: boolean;
  writtenRecordId?: string;
};

export type LanguageConductGovernance = {
  organizationId: string;
  policy?: ConductPolicyState | null;
  conflictReview?: ConflictReview | null;
  externalCommunication?: ExternalCommunicationContext | null;
  diligenceSurprises?: readonly DiligenceSurprise[];
};

export type ConductProcedureResult = {
  procedureId: `LC-${string}`;
  status: "completed" | "review" | "blocked" | "not_applicable";
  findingCodes: string[];
};

export type LanguageConductTruthSet = {
  version: string;
  fingerprint: string;
  packageFingerprint: string;
  policy: {version: string | null; status: "active" | "invalidated" | "missing"};
  status: "complete" | "review" | "blocked";
  internalMaterialsAllowed: boolean;
  externalReleaseAllowed: boolean;
  qualifiedIntroductionAllowed: boolean;
  blockerCodes: string[];
  reviewCodes: string[];
  artifactAudits: Array<{artifactId: string; fingerprint: string; status: ConductAudit["status"]; findingCodes: string[]}>;
  externalAudit: ConductAudit | null;
  procedureCoverage: ConductProcedureResult[];
};

export function buildLanguageConductTruthSet(input: {
  caseId: string;
  referenceDate: string;
  caseFingerprint: string;
  materials: readonly Material[];
  dataRoom: Parameters<typeof materialPackageFingerprint>[0]["dataRoom"];
  governance?: LanguageConductGovernance;
}): LanguageConductTruthSet {
  const packageFingerprint = materialPackageFingerprint({materials: input.materials, dataRoom: input.dataRoom});
  const artifactAudits = input.materials.map((material) => ({
    artifactId: material.kind,
    fingerprint: sha(material),
    status: material.conductAudit?.status ?? "blocked" as const,
    findingCodes: (material.conductAudit?.findings ?? []).map((finding) => finding.code).sort(),
  }));
  const findings = input.materials.flatMap((material) => material.conductAudit?.findings ?? []);
  const governance = input.governance;
  const policy = governance?.policy;
  const policyCurrent = Boolean(
    policy &&
    policy.status === "active" &&
    policy.version === conductPolicyVersion &&
    policy.disclaimerId === advisoryDisclaimerId &&
    policy.validFrom <= input.referenceDate && (!policy.validUntil || policy.validUntil >= input.referenceDate)
  );
  const conflictCurrent = Boolean(
    governance?.conflictReview &&
    governance.conflictReview.caseFingerprint === input.caseFingerprint,
  );
  const external = governance?.externalCommunication;
  const externalAudit = external && governance
    ? auditConduct({
        artifactId: `package:${packageFingerprint}`,
        channel: "external_communication",
        claims: [],
        sourceOrganizationId: governance.organizationId,
        targetOrganizationId: external.targetOrganizationId,
        sourceCaseId: input.caseId,
        targetCaseId: external.targetCaseId,
        recipientAuthorized: external.recipientAuthorized,
        ...(policy?.disclaimerId ? {disclaimerId: policy.disclaimerId} : {}),
        conflictStatus: conflictCurrent ? governance.conflictReview!.status : "unresolved",
        hasMaterialCommitment: external.hasMaterialCommitment,
        ...(external.writtenRecordId ? {writtenRecordId: external.writtenRecordId} : {}),
        diligenceSurprises: governance.diligenceSurprises ?? [],
        knowledgeState: "known",
      })
    : null;
  const allFindings = [...findings, ...(externalAudit?.findings ?? [])];
  const blockerCodes = [...new Set([
    ...allFindings.filter((finding) => finding.severity === "block").map((finding) => finding.code),
    ...(!policyCurrent ? [policy?.status === "invalidated" ? "conduct_policy_invalidated" : "conduct_policy_unavailable"] : []),
    ...(!conflictCurrent ? ["conflict_review_stale_or_missing"] : []),
    ...(!external ? ["external_communication_context_missing"] : []),
    ...(external && external.packageFingerprint !== packageFingerprint ? ["external_package_fingerprint_mismatch"] : []),
  ])].sort();
  const reviewCodes = [...new Set(allFindings.filter((finding) => finding.severity === "review").map((finding) => finding.code))].sort();
  const internalMaterialsAllowed = artifactAudits.length > 0 && artifactAudits.every((audit) => audit.status !== "blocked");
  const externalReleaseAllowed = internalMaterialsAllowed && blockerCodes.length === 0 && externalAudit?.status === "pass";
  const coverage = Array.from({length: 13}, (_, index): ConductProcedureResult => {
    const procedureId = `LC-${String(index + 1).padStart(2, "0")}` as `LC-${string}`;
    const procedureFindings = allFindings.filter((finding) => finding.ruleId === procedureId);
    const codes = procedureFindings.map((finding) => finding.code).sort();
    if (procedureFindings.some((finding) => finding.severity === "block")) return {procedureId, status: "blocked", findingCodes: codes};
    if (procedureFindings.length) return {procedureId, status: "review", findingCodes: codes};
    if (procedureId === "LC-12" && !(governance?.diligenceSurprises?.length)) return {procedureId, status: "not_applicable", findingCodes: []};
    if (["LC-06", "LC-08", "LC-09", "LC-10"].includes(procedureId) && !external) return {procedureId, status: "blocked", findingCodes: ["external_communication_context_missing"]};
    return {procedureId, status: "completed", findingCodes: []};
  });
  const payload = {
    version: languageConductTruthVersion,
    packageFingerprint,
    policy: {version: policy?.version ?? null, status: policy?.status ?? "missing" as const},
    status: blockerCodes.length ? "blocked" as const : reviewCodes.length ? "review" as const : "complete" as const,
    internalMaterialsAllowed,
    externalReleaseAllowed,
    qualifiedIntroductionAllowed: externalReleaseAllowed,
    blockerCodes,
    reviewCodes,
    artifactAudits,
    externalAudit,
    procedureCoverage: coverage,
  };
  return {...payload, fingerprint: sha(payload)};
}

function stable(value: unknown): string {
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(",")}}`;
  return JSON.stringify(value) ?? "undefined";
}

const sha = (value: unknown) => createHash("sha256").update(stable(value)).digest("hex");
