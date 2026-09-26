/**
 * The semantic structure of a presentation template: ordered sections, each with the fields a
 * rendered deck must carry for that section, the audiences the section is meant for, and a
 * title per locale.
 *
 * The structure is data, versioned with the visual definition in
 * `public.presentation_template_versions`. The house structure below is the single source for
 * the migration default (`private.presentation_template_house_structure_v1`) and for the web;
 * `presentation-structure.test.ts` proves the SQL literal equals this export.
 *
 * Applying a structure to a governed deck never invents content: a section without a block
 * renders nothing but its required fields as named gaps, and a required field the block cannot
 * satisfy becomes a named gap in the render audit and on the slide.
 */

export const presentationStructureSchemaVersion = "2026.09.27-structure-v1";

export const presentationFieldKinds = ["text", "number", "table", "chart", "source_list"] as const;
export type PresentationFieldKind = (typeof presentationFieldKinds)[number];

export const presentationAudiences = ["internal", "advisor", "external"] as const;
export type PresentationAudience = (typeof presentationAudiences)[number];

export type PresentationLocale = "pt-BR" | "en-US";
export type PresentationLocalizedTitle = Record<PresentationLocale, string>;

export type PresentationStructureField = {
  key: string;
  kind: PresentationFieldKind;
  required: boolean;
  title: PresentationLocalizedTitle;
};

export type PresentationStructureSection = {
  key: string;
  title: PresentationLocalizedTitle;
  audiences: PresentationAudience[];
  fields: PresentationStructureField[];
};

export type PresentationStructure = {
  schemaVersion: string;
  sections: PresentationStructureSection[];
};

export const presentationStructureLimits = {maxSections: 40, maxFields: 40, maxTitle: 120} as const;
const structureKeyPattern = /^[a-z0-9][a-z0-9-]{0,62}$/;

const everyone: PresentationAudience[] = ["internal", "advisor", "external"];

/**
 * The sections the house deck renders today (`preview-decision-artifact.ts`, presentation view),
 * keyed by the block ids the renderer receives, so a client structure can reorder them, mark
 * what is required and choose who each section is for without renaming anything.
 */
export const offroadHousePresentationStructure: PresentationStructure = {
  schemaVersion: presentationStructureSchemaVersion,
  sections: [
    {
      key: "decision-headline",
      title: {"pt-BR": "Situação e implicação", "en-US": "Situation and implication"},
      audiences: [...everyone],
      fields: [
        {key: "headline-metrics", kind: "number", required: true, title: {"pt-BR": "Indicadores da leitura financeira", "en-US": "Financial view indicators"}},
      ],
    },
    {
      key: "maturity-wall",
      title: {"pt-BR": "Vencimentos contratuais", "en-US": "Contractual maturities"},
      audiences: [...everyone],
      fields: [
        {key: "maturity-series", kind: "chart", required: false, title: {"pt-BR": "Série de vencimentos", "en-US": "Maturity series"}},
        {key: "peak-maturity", kind: "number", required: false, title: {"pt-BR": "Pico de vencimentos", "en-US": "Peak maturity"}},
      ],
    },
    {
      key: "analytical-direction",
      title: {"pt-BR": "Direção analítica", "en-US": "Analytical direction"},
      audiences: ["internal", "advisor"],
      fields: [
        {key: "leading-alternative", kind: "text", required: false, title: {"pt-BR": "Alternativa em destaque", "en-US": "Leading alternative"}},
      ],
    },
    {
      key: "open-gaps",
      title: {"pt-BR": "O que ainda muda a decisão", "en-US": "What still changes the decision"},
      audiences: ["internal", "advisor"],
      fields: [
        {key: "gap-list", kind: "table", required: false, title: {"pt-BR": "Pontos em aberto", "en-US": "Open items"}},
      ],
    },
    {
      key: "source-register",
      title: {"pt-BR": "Fontes e data-base", "en-US": "Sources and reference date"},
      audiences: [...everyone],
      fields: [
        {key: "sources", kind: "source_list", required: true, title: {"pt-BR": "Fontes citadas", "en-US": "Cited sources"}},
      ],
    },
  ],
};

export type PresentationStructureIssue =
  | {code: "invalid_structure"; detail: string}
  | {code: "empty_sections"; detail: string}
  | {code: "duplicate_key"; detail: string}
  | {code: "unknown_kind"; detail: string}
  | {code: "required_without_key"; detail: string}
  | {code: "unknown_audience"; detail: string};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function titleIssues(value: unknown, where: string): PresentationStructureIssue[] {
  if (!isRecord(value)) return [{code: "invalid_structure", detail: `${where}.title`}];
  const issues: PresentationStructureIssue[] = [];
  for (const locale of ["pt-BR", "en-US"] as const) {
    const text = value[locale];
    if (typeof text !== "string" || text.trim().length === 0 || text.length > presentationStructureLimits.maxTitle) {
      issues.push({code: "invalid_structure", detail: `${where}.title.${locale}`});
    }
  }
  return issues;
}

/**
 * The same rules `private.validate_presentation_template_structure_v1` enforces, available before
 * a write so the settings surface explains the problem instead of surfacing a constraint error.
 * Accepts unknown input so a stored record is checked by the same code.
 */
export function presentationStructureIssues(value: unknown): PresentationStructureIssue[] {
  const issues: PresentationStructureIssue[] = [];
  if (!isRecord(value)) return [{code: "invalid_structure", detail: "root"}];
  if (typeof value.schemaVersion !== "string" || value.schemaVersion.trim().length === 0) issues.push({code: "invalid_structure", detail: "schemaVersion"});
  const sections = value.sections;
  if (!Array.isArray(sections)) return [...issues, {code: "invalid_structure", detail: "sections"}];
  if (sections.length === 0) return [...issues, {code: "empty_sections", detail: "sections"}];
  if (sections.length > presentationStructureLimits.maxSections) issues.push({code: "invalid_structure", detail: "sections.length"});
  const sectionKeys = new Set<string>();
  sections.forEach((section, index) => {
    const where = `sections[${index}]`;
    if (!isRecord(section)) {issues.push({code: "invalid_structure", detail: where}); return;}
    const key = typeof section.key === "string" ? section.key : "";
    if (!structureKeyPattern.test(key)) issues.push({code: "invalid_structure", detail: `${where}.key`});
    else if (sectionKeys.has(key)) issues.push({code: "duplicate_key", detail: key});
    sectionKeys.add(key);
    issues.push(...titleIssues(section.title, where));
    const audiences = section.audiences;
    if (!Array.isArray(audiences) || audiences.length === 0) issues.push({code: "invalid_structure", detail: `${where}.audiences`});
    else {
      for (const audience of audiences) {
        if (typeof audience !== "string" || !(presentationAudiences as readonly string[]).includes(audience)) issues.push({code: "unknown_audience", detail: String(audience)});
      }
      if (new Set(audiences).size !== audiences.length) issues.push({code: "duplicate_key", detail: `${where}.audiences`});
    }
    const fields = section.fields;
    if (!Array.isArray(fields) || fields.length === 0) {issues.push({code: "empty_sections", detail: key || where}); return;}
    if (fields.length > presentationStructureLimits.maxFields) issues.push({code: "invalid_structure", detail: `${where}.fields.length`});
    const fieldKeys = new Set<string>();
    fields.forEach((field, fieldIndex) => {
      const fieldWhere = `${where}.fields[${fieldIndex}]`;
      if (!isRecord(field)) {issues.push({code: "invalid_structure", detail: fieldWhere}); return;}
      const fieldKey = typeof field.key === "string" ? field.key : "";
      const required = field.required === true;
      if (typeof field.required !== "boolean") issues.push({code: "invalid_structure", detail: `${fieldWhere}.required`});
      if (!structureKeyPattern.test(fieldKey)) issues.push(required ? {code: "required_without_key", detail: `${key || where}`} : {code: "invalid_structure", detail: `${fieldWhere}.key`});
      else if (fieldKeys.has(fieldKey)) issues.push({code: "duplicate_key", detail: `${key}.${fieldKey}`});
      fieldKeys.add(fieldKey);
      if (typeof field.kind !== "string" || !(presentationFieldKinds as readonly string[]).includes(field.kind)) issues.push({code: "unknown_kind", detail: String(field.kind)});
      issues.push(...titleIssues(field.title, fieldWhere));
    });
  });
  return issues;
}

/** A stored structure becomes a typed one only when it passes the same rules the database applied. */
export function presentationStructureFromStored(value: unknown): PresentationStructure | null {
  if (presentationStructureIssues(value).length > 0) return null;
  const record = value as {schemaVersion: string; sections: Array<Record<string, unknown>>};
  return {
    schemaVersion: record.schemaVersion,
    sections: record.sections.map((section) => ({
      key: section.key as string,
      title: {...(section.title as PresentationLocalizedTitle)},
      audiences: [...(section.audiences as PresentationAudience[])],
      fields: (section.fields as Array<Record<string, unknown>>).map((field) => ({
        key: field.key as string,
        kind: field.kind as PresentationFieldKind,
        required: field.required as boolean,
        title: {...(field.title as PresentationLocalizedTitle)},
      })),
    })),
  };
}

/** The structure is stored as it is typed; this only strips anything a caller may have attached. */
export function presentationStructureToStored(structure: PresentationStructure): Record<string, unknown> {
  return {
    schemaVersion: structure.schemaVersion,
    sections: structure.sections.map((section) => ({
      key: section.key,
      title: {"pt-BR": section.title["pt-BR"], "en-US": section.title["en-US"]},
      audiences: [...section.audiences],
      fields: section.fields.map((field) => ({key: field.key, kind: field.kind, required: field.required, title: {"pt-BR": field.title["pt-BR"], "en-US": field.title["en-US"]}})),
    })),
  };
}

/** What a rendered block can offer to each field kind, computed by the renderer from the contract. */
export type PresentationBlockContent = {
  id: string;
  content: Record<PresentationFieldKind, boolean>;
};

export type PresentationStructureGap = {
  sectionKey: string;
  fieldKey: string;
  kind: PresentationFieldKind;
  /** The block that should have carried the field, when the section has one. */
  blockId: string | null;
};

export type PresentationStructureApplication = {
  /** Block ids in the order the structure prescribes; only blocks the structure names. */
  order: string[];
  /** Sections that name no block of this deck; their required fields are gaps. */
  sectionsWithoutBlock: string[];
  /** Blocks the deck has but the structure does not name; they are left out, never renamed. */
  omittedBlockIds: string[];
  gaps: PresentationStructureGap[];
};

/**
 * Applies a structure to the blocks of a governed deck. Pure: it decides order, omission and the
 * named gaps; the renderer draws them. A block matches a section by key, so the house keys keep
 * matching the house blocks and a client key that matches nothing yields only named gaps.
 */
export function applyPresentationStructure(structure: PresentationStructure, blocks: PresentationBlockContent[]): PresentationStructureApplication {
  const byId = new Map(blocks.map((block) => [block.id, block]));
  const order: string[] = [];
  const sectionsWithoutBlock: string[] = [];
  const gaps: PresentationStructureGap[] = [];
  for (const section of structure.sections) {
    const block = byId.get(section.key);
    if (block) order.push(block.id); else sectionsWithoutBlock.push(section.key);
    for (const field of section.fields) {
      if (!field.required) continue;
      if (!block || !block.content[field.kind]) gaps.push({sectionKey: section.key, fieldKey: field.key, kind: field.kind, blockId: block?.id ?? null});
    }
  }
  const named = new Set(structure.sections.map((section) => section.key));
  return {order, sectionsWithoutBlock, omittedBlockIds: blocks.map((block) => block.id).filter((id) => !named.has(id)), gaps};
}

/** Moves a section one place up or down; out-of-range moves return the same array. */
export function moveStructureSection(structure: PresentationStructure, key: string, direction: "up" | "down"): PresentationStructure {
  const index = structure.sections.findIndex((section) => section.key === key);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= structure.sections.length) return structure;
  const sections = [...structure.sections];
  const [moved] = sections.splice(index, 1);
  sections.splice(target, 0, moved!);
  return {...structure, sections};
}
