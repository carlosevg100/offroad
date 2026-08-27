import {createHash} from "node:crypto";

import type {IsoDate, ReceivablesUniverse, SourceAnchor} from "@offroad/financial-core";
import Decimal from "decimal.js";

import type {ReceivablesCase} from "./schema";

const ZERO = new Decimal(0);
const isoDate = (value: string): IsoDate => value as IsoDate;

export type CanonicalLegacyAdapter = {
  universe: ReceivablesUniverse;
  datasetHash: string;
  limitations: readonly string[];
};

function eventSource(input: ReceivablesCase, documentId: string, anchor: string): SourceAnchor {
  return {
    kind: "event",
    eventId: `${documentId}:${anchor}`,
    sourceSystem: "legacy-receivables-analysis",
    occurredAt: `${input.referenceDate}T00:00:00.000Z`,
  };
}

export function canonicalizeLegacyReceivablesCase(input: ReceivablesCase): CanonicalLegacyAdapter {
  const sorted = [...input.portfolio].sort((left, right) => left.id.localeCompare(right.id));
  const dataStartDate = isoDate(sorted.reduce((earliest, item) => item.originDate < earliest ? item.originDate : earliest, sorted[0]!.originDate));
  const latestOriginationDate = isoDate(sorted.reduce((latest, item) => item.originDate > latest ? item.originDate : latest, sorted[0]!.originDate));
  const obligorSource = new Map<string, SourceAnchor>();
  const groupMembers = new Map<string, Set<string>>();
  for (const item of sorted) {
    const source = eventSource(input, item.sourceDocumentId, item.sourceAnchor);
    obligorSource.set(item.debtorId, obligorSource.get(item.debtorId) ?? source);
    const groupId = item.debtorGroupId ?? item.debtorId;
    const members = groupMembers.get(groupId) ?? new Set<string>();
    members.add(item.debtorId);
    groupMembers.set(groupId, members);
  }

  const universe: ReceivablesUniverse = {
    id: `legacy-${input.id}`,
    dates: {
      reportingDate: isoDate(input.referenceDate),
      latestOriginationDate,
      dataStartDate,
      dataEndDate: latestOriginationDate,
    },
    currency: "BRL",
    receivables: sorted.map((item) => ({
      id: item.id,
      currency: "BRL",
      faceValue: item.originalAmount,
      openValue: item.outstandingBalance,
      issueDate: isoDate(item.originDate),
      originalDueDate: isoDate(item.dueDate),
      currentDueDate: isoDate(item.dueDate),
      obligorId: item.debtorId,
      economicGroupId: item.debtorGroupId ?? item.debtorId,
      status: new Decimal(item.outstandingBalance).gt(ZERO) ? "open" : "settled",
      source: eventSource(input, item.sourceDocumentId, item.sourceAnchor),
    })),
    settlements: [],
    dilutions: [],
    extensions: [],
    repurchases: [],
    assignmentsAndLiens: [],
    obligors: [...obligorSource.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([id, source]) => ({
      id,
      legalName: id,
      economicGroupId: sorted.find((item) => item.debtorId === id)?.debtorGroupId ?? id,
      relatedParty: sorted.some((item) => item.debtorId === id && item.relatedParty),
      source,
    })),
    economicGroups: [...groupMembers.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([id, members]) => ({
      id,
      name: id,
      obligorIds: [...members].sort(),
      source: obligorSource.get([...members][0]!)!,
    })),
  };

  return {
    universe,
    datasetHash: createHash("sha256").update(JSON.stringify(input)).digest("hex"),
    limitations: [
      "legacy_input_has_no_original_due_date_history",
      "legacy_input_has_no_content_hash_source_anchor",
      "legacy_input_aggregates_dilution_repurchase_and_substitution_on_titles",
    ],
  };
}
