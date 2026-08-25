import {auditConduct, type BilingualStatement, type ConductAudit, type ConductClaim} from "@offroad/credit-playbook";

import type {Material, MaterialBlock} from "./compile";

/**
 * Runs the deterministic M10 controls before a compiled artifact can move to a release gate.
 * Recipient, conflict and disclosure authorization are checked later, when a destination exists.
 */
export function auditCompiledMaterial(material: Material): ConductAudit {
  const extracted = material.blocks.flatMap((block, index) => extractBlock(block, `${material.kind}.${index + 1}`));
  return auditConduct({
    artifactId: `${material.kind}:${material.template?.id ?? "legacy"}:${material.template?.version ?? "unversioned"}`,
    channel: "internal_material",
    claims: extracted.flatMap((item) => item.claims),
    bilingualStatements: extracted.flatMap((item) => item.statements),
    sourceOrganizationId: "compile-context",
    targetOrganizationId: "compile-context",
    sourceCaseId: "compile-context",
    targetCaseId: "compile-context",
    recipientAuthorized: true,
    conflictStatus: "clear",
    knowledgeState: "known",
  });
}

type Extracted = {claims: ConductClaim[]; statements: BilingualStatement[]};

function extractBlock(block: MaterialBlock, prefix: string): Extracted {
  const pairs: Array<{id: string; pt: string; en: string; material?: boolean; supportIds?: string[]}> = [];
  if (block.type === "heading" || block.type === "paragraph" || block.type === "disclaimer") {
    pairs.push({
      id: prefix,
      pt: block.text.pt,
      en: block.text.en,
      ...(block.type === "paragraph" && block.claimId ? {material: true} : {}),
      ...(block.type === "paragraph" && block.supportIds ? {supportIds: block.supportIds} : {}),
    });
  } else if (block.type === "metrics") {
    for (const [index, item] of block.items.entries()) {
      pairs.push({id: `${prefix}.metric.${index + 1}.label`, pt: item.label.pt, en: item.label.en});
      pairs.push({id: `${prefix}.metric.${index + 1}.value`, pt: item.formatted.pt, en: item.formatted.en, material: true, supportIds: item.supportIds});
    }
  } else if (block.type === "table") {
    pairs.push({id: `${prefix}.caption`, pt: block.caption.pt, en: block.caption.en});
    for (const [index, cell] of block.head.entries()) pairs.push({id: `${prefix}.head.${index + 1}`, pt: cell.pt, en: cell.en});
  } else if (block.type === "list") {
    for (const [index, item] of block.items.entries()) pairs.push({id: `${prefix}.item.${index + 1}`, pt: item.pt, en: item.en});
  } else if (block.type === "kv") {
    if (block.caption) pairs.push({id: `${prefix}.caption`, pt: block.caption.pt, en: block.caption.en});
    for (const [index, row] of block.rows.entries()) {
      pairs.push({id: `${prefix}.row.${index + 1}.label`, pt: row.label.pt, en: row.label.en});
      pairs.push({id: `${prefix}.row.${index + 1}.value`, pt: row.value.pt, en: row.value.en, material: true, supportIds: row.supportIds ?? []});
      if (row.note) pairs.push({id: `${prefix}.row.${index + 1}.note`, pt: row.note.pt, en: row.note.en});
    }
  } else if (block.type === "callout") {
    pairs.push({id: `${prefix}.title`, pt: block.title.pt, en: block.title.en});
    for (const [index, item] of block.items.entries()) {
      pairs.push({id: `${prefix}.item.${index + 1}.label`, pt: item.label.pt, en: item.label.en});
      pairs.push({id: `${prefix}.item.${index + 1}.value`, pt: item.value.pt, en: item.value.en});
    }
  }

  return {
    claims: pairs.flatMap((pair) => [
      {
        id: `${pair.id}.pt`,
        text: pair.pt,
        kind: "fact" as const,
        material: pair.material ?? false,
        supportIds: pair.supportIds ?? [],
      },
      {
        id: `${pair.id}.en`,
        text: pair.en,
        kind: "fact" as const,
        material: pair.material ?? false,
        supportIds: pair.supportIds ?? [],
      },
    ]),
    statements: pairs.map((pair) => ({id: pair.id, pt: pair.pt, en: pair.en})),
  };
}
