/**
 * Conditions precedent and the road to disbursement, with an owner, a due date and evidence.
 *
 * The list is assembled from three places a desk already has: the playbook's closing tier
 * (approvals, certificates, registration, legal opinion, evidence of CPs), the security the
 * term sheet asks for (each item becomes a constitution and registration CP), and whatever the
 * investor's term sheet adds. Every status change is an event with an actor and a time, and
 * disbursement is "ready" only when every blocking CP carries evidence. Nothing is waived
 * silently: a waiver is a status with a reason.
 */

import {commonClosing} from "@offroad/credit-playbook";

export type ConditionStatus = "open" | "in_progress" | "satisfied" | "waived";
export type ConditionOwner = "company" | "investor" | "counsel" | "desk" | "registrar";

export type Condition = {
  id: string;
  labels: {pt: string; en: string};
  rationale: {pt: string; en: string};
  owner: ConditionOwner;
  /** ISO date by which it must be satisfied; absent when it is "before disbursement". */
  due?: string;
  blocking: boolean;
  source: "playbook" | "security" | "term_sheet" | "manual";
};

export type ConditionEvent = {
  conditionId: string;
  at: string;
  actor: string;
  status: ConditionStatus;
  /** The document or fact that satisfies it; required for `satisfied`. */
  evidence?: string;
  /** Required for `waived`. */
  reason?: string;
};

export type ConditionTrack = Condition & {
  status: ConditionStatus;
  evidence: string | null;
  reason: string | null;
  updatedAt: string | null;
  refused: Array<{event: ConditionEvent; reason: {pt: string; en: string}}>;
};

export type DisbursementReadiness = {
  ready: boolean;
  blockingOpen: ConditionTrack[];
  satisfied: number;
  waived: number;
  total: number;
  summary: {pt: string; en: string};
};

const slug = (text: string) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

export function conditionsPrecedent(input: {
  /** Security package lines the term sheet asks for, as the company reads them. */
  security: readonly {pt: string; en: string}[];
  /** Extra conditions from the investor's term sheet, already worded. */
  fromTermSheet?: readonly {pt: string; en: string; owner?: ConditionOwner; blocking?: boolean}[];
  manual?: readonly Condition[];
}): Condition[] {
  const playbook: Condition[] = commonClosing.map((requirement) => ({
    id: requirement.id,
    labels: requirement.labels,
    rationale: requirement.rationale,
    owner: requirement.id === "closing_legal_opinion" ? "counsel" : requirement.id === "closing_security_registration" ? "registrar" : "company",
    blocking: requirement.id !== "closing_disbursement_evidence",
    source: "playbook",
  }));
  const security: Condition[] = input.security.map((line) => ({
    id: `security:${slug(line.en)}`,
    labels: {pt: `Constituição e registro: ${line.pt}`, en: `Constitution and registration: ${line.en}`},
    rationale: {pt: "Garantia prometida no term sheet só vale depois de constituída e registrada; até lá o credor está quirografário.", en: "Security promised in the term sheet counts only once constituted and registered; until then the lender is unsecured."},
    owner: "company",
    blocking: true,
    source: "security",
  }));
  const termSheet: Condition[] = (input.fromTermSheet ?? []).map((line) => ({
    id: `term_sheet:${slug(line.en)}`,
    labels: {pt: line.pt, en: line.en},
    rationale: {pt: "Condição do term sheet final.", en: "Condition from the final term sheet."},
    owner: line.owner ?? "company",
    blocking: line.blocking ?? true,
    source: "term_sheet",
  }));
  return [...playbook, ...security, ...termSheet, ...(input.manual ?? [])];
}

/** Replays the events into one track per condition; evidence and reasons are required where the status needs them. */
export function trackConditions(conditions: readonly Condition[], events: readonly ConditionEvent[]): ConditionTrack[] {
  const tracks = new Map<string, ConditionTrack>(conditions.map((condition) => [condition.id, {...condition, status: "open", evidence: null, reason: null, updatedAt: null, refused: []}]));
  for (const event of [...events].sort((a, b) => a.at.localeCompare(b.at))) {
    const track = tracks.get(event.conditionId);
    if (!track) continue;
    if (event.status === "satisfied" && !event.evidence) {
      track.refused.push({event, reason: {pt: "Satisfeita sem evidência", en: "Satisfied without evidence"}});
      continue;
    }
    if (event.status === "waived" && !event.reason) {
      track.refused.push({event, reason: {pt: "Dispensa sem motivo", en: "Waiver without a reason"}});
      continue;
    }
    track.status = event.status;
    track.evidence = event.evidence ?? null;
    track.reason = event.reason ?? null;
    track.updatedAt = event.at;
  }
  return [...tracks.values()];
}

export function disbursementReadiness(tracks: readonly ConditionTrack[]): DisbursementReadiness {
  const blockingOpen = tracks.filter((track) => track.blocking && track.status !== "satisfied" && track.status !== "waived");
  const satisfied = tracks.filter((track) => track.status === "satisfied").length;
  const waived = tracks.filter((track) => track.status === "waived").length;
  const ready = blockingOpen.length === 0;
  return {
    ready,
    blockingOpen,
    satisfied,
    waived,
    total: tracks.length,
    summary: ready
      ? {pt: `Pronto para desembolso: ${satisfied} condições satisfeitas${waived ? `, ${waived} dispensadas com motivo` : ""}.`, en: `Ready to disburse: ${satisfied} conditions satisfied${waived ? `, ${waived} waived with a reason` : ""}.`}
      : {pt: `${blockingOpen.length} condição(ões) bloqueante(s) em aberto de ${tracks.length}.`, en: `${blockingOpen.length} blocking condition(s) open out of ${tracks.length}.`},
  };
}
