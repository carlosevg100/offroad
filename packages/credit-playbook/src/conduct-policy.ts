import {createHash} from "node:crypto";

/**
 * Deterministic controls compiled from House Playbook LC-01 to LC-13.
 *
 * This module does not decide whether a transaction is good credit. It only decides whether a
 * claim or communication is fit to leave its current gate. Semantic review may add findings, but
 * it cannot waive one of these controls.
 */

export const conductPolicyVersion = "2026.08.25-v1";
export const advisoryDisclaimerId = "offroad-dcm-advisory-boundary-2026-08-25";

export type ConductClaimKind = "fact" | "calculation" | "premise" | "judgment" | "market_reference";
export type ConductSeverity = "block" | "review";
export type ConductChannel = "internal_material" | "external_material" | "external_communication";

export type ConductClaim = {
  id: string;
  text: string;
  kind: ConductClaimKind;
  material: boolean;
  supportIds: readonly string[];
  /** Explicit basis for a qualitative adjective, separate from a generic citation. */
  qualifierBasis?: readonly string[];
  /** Human approval tied to this exact claim fingerprint when the claim is a judgment. */
  approvedFingerprint?: string;
};

export type BilingualStatement = {
  id: string;
  pt: string;
  en: string;
};

export type DiligenceSurprise = {
  id: string;
  description: string;
  responsibleProcedureId?: string;
  correctiveActionId?: string;
};

export type ConductAuditInput = {
  artifactId: string;
  channel: ConductChannel;
  claims: readonly ConductClaim[];
  bilingualStatements?: readonly BilingualStatement[];
  sourceOrganizationId: string;
  targetOrganizationId: string;
  sourceCaseId: string;
  targetCaseId: string;
  recipientAuthorized: boolean;
  disclaimerId?: string;
  conflictStatus: "clear" | "disclosed_accepted" | "unresolved";
  riskSectionPosition?: number;
  promotionalSectionPosition?: number;
  hasMaterialCommitment?: boolean;
  writtenRecordId?: string;
  knowledgeState?: "known" | "partially_known" | "unknown";
  resolutionDueOn?: string;
  diligenceSurprises?: readonly DiligenceSurprise[];
  /** Acronyms defined in the artifact or approved by the house glossary. */
  definedAcronyms?: readonly string[];
};

export type ConductFinding = {
  ruleId: `LC-${string}`;
  code: string;
  severity: ConductSeverity;
  message: string;
  claimId?: string;
  statementId?: string;
};

export type ConductAudit = {
  status: "pass" | "blocked" | "review";
  version: string;
  fingerprint: string;
  findings: ConductFinding[];
};

const MATERIAL_QUALIFIERS = [
  /\brobust[oa]s?\b/iu,
  /\bforte(?:s)?\b/iu,
  /\bsólid[oa]s?\b/iu,
  /\bresiliente(?:s)?\b/iu,
  /\batrativ[oa]s?\b/iu,
  /\blideran(?:ça|te(?:s)?)\b/iu,
  /\brobust\b/iu,
  /\bstrong\b/iu,
  /\bsolid\b/iu,
  /\bresilient\b/iu,
  /\battractive\b/iu,
  /\bleading\b/iu,
] as const;

const OUTCOME_PROMISES = [
  /\b(?:crédito|operação|financiamento)\s+(?:está\s+|foi\s+)?aprova(?:do|da)\b/iu,
  /\b(?:captação|financiamento|funding)\s+(?:está\s+|foi\s+)?garanti(?:do|da)\b/iu,
  /\ba\s+offroad\s+(?:aprova|garante|compromete\s+capital|recomenda\s+o\s+investimento)\b/iu,
  /\b(?:credit|transaction|financing)\s+(?:is\s+|was\s+)?approved\b/iu,
  /\b(?:funding|financing)\s+(?:is\s+|was\s+)?guaranteed\b/iu,
  /\boffroad\s+(?:approves|guarantees|commits\s+capital|recommends\s+the\s+investment)\b/iu,
] as const;

const FINAL_TERM_CLAIMS = [
  /\btermos?\s+finais?\b/iu,
  /\bpreço\s+fechado\b/iu,
  /\bfinal\s+terms?\b/iu,
  /\bcommitted\s+pricing\b/iu,
] as const;

const RELATIVE_DATES = [
  /\brecentemente\b/iu,
  /\bnos\s+últimos\s+tempos\b/iu,
  /\bem\s+breve\b/iu,
  /\brecently\b/iu,
  /\bsoon\b/iu,
  /\bin\s+recent\s+months\b/iu,
] as const;

const DEFAULT_ACRONYMS = new Set([
  "BRL", "USD", "EUR", "CDI", "IPCA", "CNPJ", "CPF", "EBITDA", "CFADS", "DSCR",
  "LTV", "FIDC", "CRI", "CRA", "CCB", "NCE", "ERP", "IFRS", "CPC", "DCM", "NDA",
  "M&A", "S.A.", "LTDA", "PT", "EN", "Q&A",
  "CSLL", "ITR", "CFO", "DSO", "DIO", "DPO",
]);

export function auditConduct(input: ConductAuditInput): ConductAudit {
  const findings: ConductFinding[] = [];

  for (const claim of input.claims) auditClaim(claim, findings);
  for (const statement of input.bilingualStatements ?? []) auditBilingual(statement, findings);

  if (input.channel !== "internal_material") {
    if (input.disclaimerId !== advisoryDisclaimerId) {
      findings.push(block("LC-06", "missing_advisory_disclaimer", "Material externo sem o disclaimer versionado da fronteira de assessoria."));
    }
    if (!input.recipientAuthorized) {
      findings.push(block("LC-08", "recipient_not_authorized", "Destinatário não autorizado para esta versão do material."));
    }
    if (input.sourceOrganizationId !== input.targetOrganizationId || input.sourceCaseId !== input.targetCaseId) {
      findings.push(block("LC-08", "cross_case_disclosure", "O contexto de destino não corresponde à organização e ao case de origem."));
    }
    if (input.conflictStatus === "unresolved") {
      findings.push(block("LC-09", "unresolved_conflict", "Conflito de interesse ainda não resolvido ou aceito pelas partes aplicáveis."));
    }
  }

  if (
    input.riskSectionPosition !== undefined &&
    input.promotionalSectionPosition !== undefined &&
    input.riskSectionPosition > input.promotionalSectionPosition
  ) {
    findings.push(review("LC-03", "risk_after_promotion", "Riscos aparecem depois da narrativa promocional; a ordem institucional deve nomear primeiro a restrição material."));
  }

  if (input.channel === "external_communication" && input.hasMaterialCommitment && !input.writtenRecordId?.trim()) {
    findings.push(block("LC-10", "material_commitment_not_recorded", "Compromisso material sem registro escrito e datado no case."));
  }

  if ((input.knowledgeState === "unknown" || input.knowledgeState === "partially_known") && !isIsoDate(input.resolutionDueOn)) {
    findings.push(review("LC-11", "unknown_without_due_date", "Resposta parcial ou desconhecida sem data absoluta para resolução."));
  }

  for (const surprise of input.diligenceSurprises ?? []) {
    if (!surprise.responsibleProcedureId || !surprise.correctiveActionId) {
      findings.push(review("LC-12", "unattributed_diligence_surprise", "Surpresa de diligência sem procedimento responsável e ação corretiva.", {claimId: surprise.id}));
    }
  }

  auditAcronyms(input, findings);

  const status = findings.some((finding) => finding.severity === "block")
    ? "blocked"
    : findings.length > 0
      ? "review"
      : "pass";
  return {
    status,
    version: conductPolicyVersion,
    fingerprint: sha256(stableJson({version: conductPolicyVersion, input, findings})),
    findings,
  };
}

function auditClaim(claim: ConductClaim, findings: ConductFinding[]) {
  const text = claim.text.trim();
  if (claim.material && claim.supportIds.length === 0) {
    findings.push(block("LC-01", "material_claim_without_support", "Afirmação material sem fonte ou calculation trace.", {claimId: claim.id}));
  }
  if (claim.kind === "judgment" && claim.material && !isSha256(claim.approvedFingerprint)) {
    findings.push(block("LC-01", "judgment_without_exact_approval", "Julgamento material sem aprovação vinculada ao fingerprint exato.", {claimId: claim.id}));
  }
  if (MATERIAL_QUALIFIERS.some((pattern) => pattern.test(text)) && (claim.qualifierBasis?.length ?? 0) === 0) {
    findings.push(review("LC-02", "unbased_material_qualifier", "Adjetivo material sem base explícita e verificável.", {claimId: claim.id}));
  }
  if (OUTCOME_PROMISES.some((pattern) => pattern.test(text))) {
    findings.push(block("LC-05", "outcome_promise", "Texto implica aprovação, compromisso de capital ou garantia de captação.", {claimId: claim.id}));
  }
  if (FINAL_TERM_CLAIMS.some((pattern) => pattern.test(text)) && !/indicativ|preliminar|non-binding|subject to/iu.test(text)) {
    findings.push(block("LC-04", "final_terms_claim", "Termo preliminar apresentado como final ou fechado.", {claimId: claim.id}));
  }
  if (text.includes("\u2014")) {
    findings.push(block("LC-13", "em_dash", "Travessão proibido pela forma da casa.", {claimId: claim.id}));
  }
  if (RELATIVE_DATES.some((pattern) => pattern.test(text))) {
    findings.push(review("LC-13", "relative_date", "Data relativa deve ser substituída por data absoluta.", {claimId: claim.id}));
  }
}

function auditBilingual(statement: BilingualStatement, findings: ConductFinding[]) {
  const pt = economicTokens(statement.pt);
  const en = economicTokens(statement.en);
  if (!sameMultiset(pt, en)) {
    findings.push(block("LC-07", "bilingual_economic_divergence", "As versões PT e EN não carregam os mesmos números, moedas, percentuais e múltiplos.", {statementId: statement.id}));
  }
  if (statement.pt.includes("\u2014") || statement.en.includes("\u2014")) {
    findings.push(block("LC-13", "em_dash", "Travessão proibido pela forma da casa.", {statementId: statement.id}));
  }
}

function auditAcronyms(input: ConductAuditInput, findings: ConductFinding[]) {
  const defined = new Set([...DEFAULT_ACRONYMS, ...(input.definedAcronyms ?? []).map((item) => item.toUpperCase())]);
  const text = [
    ...input.claims.map((claim) => claim.text),
    ...(input.bilingualStatements ?? []).flatMap((statement) => [statement.pt, statement.en]),
  ].join("\n");
  const acronyms = [...new Set(text.match(/\b[A-ZÁÉÍÓÚÇ][A-ZÁÉÍÓÚÇ0-9&]{2,}\b/gu) ?? [])];
  for (const acronym of acronyms) {
    if (!defined.has(acronym.toUpperCase())) {
      findings.push(review("LC-13", "undefined_acronym", `Sigla ${acronym} não foi aberta nem consta do glossário aprovado.`));
    }
  }
}

function economicTokens(text: string): string[] {
  const normalized = text
    .replace(/\b(?:dois\s+terços|two[-\s]thirds)\b/giu, " 2/3 ")
    .replace(/R\$/gu, " BRL ")
    .replace(/US\$/gu, " USD ")
    .replace(/\s+/gu, " ");
  const raw = normalized.match(/\b(?:BRL|USD|EUR)\b|\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?\s*(?:%|x|bps)?/giu) ?? [];
  return raw.map(normalizeEconomicToken).sort();
}

function normalizeEconomicToken(token: string): string {
  const trimmed = token.trim().toUpperCase();
  if (/^(?:BRL|USD|EUR)$/u.test(trimmed)) return trimmed;
  const suffix = trimmed.match(/(?:%|X|BPS)$/u)?.[0] ?? "";
  const raw = trimmed.replace(/(?:%|X|BPS)$/u, "").trim();
  const lastDot = raw.lastIndexOf(".");
  const lastComma = raw.lastIndexOf(",");
  let decimal = raw;
  if (lastDot >= 0 && lastComma >= 0) {
    const decimalMark = lastDot > lastComma ? "." : ",";
    decimal = raw.replace(decimalMark === "." ? /,/gu : /\./gu, "").replace(decimalMark, ".");
  } else if (lastComma >= 0) {
    decimal = /,\d{3}$/u.test(raw) && !suffix ? raw.replace(/,/gu, "") : raw.replace(",", ".");
  } else if (lastDot >= 0 && /\.\d{3}$/u.test(raw) && !suffix) {
    decimal = raw.replace(/\./gu, "");
  }
  return `${Number(decimal)}${suffix}`;
}

function sameMultiset(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function block(ruleId: `LC-${string}`, code: string, message: string, extra: Partial<ConductFinding> = {}): ConductFinding {
  return {ruleId, code, severity: "block", message, ...extra};
}

function review(ruleId: `LC-${string}`, code: string, message: string, extra: Partial<ConductFinding> = {}): ConductFinding {
  return {ruleId, code, severity: "review", message, ...extra};
}

function isSha256(value: string | undefined): boolean {
  return Boolean(value && /^[a-f0-9]{64}$/u.test(value));
}

function isIsoDate(value: string | undefined): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  return !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
