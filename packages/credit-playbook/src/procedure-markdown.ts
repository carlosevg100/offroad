import {createHash} from "node:crypto";
import {readdirSync, readFileSync} from "node:fs";
import {join, relative} from "node:path";

import {z} from "zod";

import {canonicalProcedureSchema, type CanonicalProcedure} from "./procedure-contract";
import {aiIndependentReviewSchema, reviewCountsForPromotion, type AiIndependentReview} from "./review-record";

/**
 * A method is written by a person, in Markdown, one file per method, and compiled into the
 * canonical procedure contract the runtime obeys. The Markdown is the human-auditable source;
 * the compiled object is what executors, gold cases and promotion gates see. Nothing in the
 * runtime reads the prose directly.
 *
 * The format is deliberately narrow: a frontmatter of `key: value` lines (arrays inline as
 * `[a, b]`), then top-level `# ` sections with a fixed vocabulary. A section the contract needs
 * and the file lacks is a compile error, not a default.
 */
const frontmatterSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{2,79}$/),
  version: z.string().regex(/^\d{4}\.\d{2}\.\d{2}-v\d+$/),
  maturity: z.enum(["draft", "candidate", "implemented", "ai_reviewed", "tested", "ready_for_founder", "production"]),
  title_pt: z.string().min(1),
  title_en: z.string().min(1),
  role: z.enum(["intake_evidence", "financial_analysis", "credit_structuring", "institutional_materials", "market_distribution", "independent_quality_control"]),
  blueprint_stage: z.coerce.number().int().min(1).max(12),
  owner_role: z.string().min(1),
  approved_by: z.string().min(1).optional(),
  effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  house_procedure_ids: z.array(z.string().regex(/^(IN|EMP|Q|D|OP|ES|PR|MA|MK|RF|LC)-\d{2}$/)).default([]),
  authorities: z.array(z.enum(["LEI", "DEF", "CASA", "MERCADO", "HEURÍSTICA"])).default([]),
  reference_data_keys: z.array(z.string().regex(/^[a-z][a-z0-9_.-]*$/)).default([]),
  legal_review_required: z.coerce.boolean().default(false),
  /** TaskSpecs of the work plan this method executes. The binding lives here, next to the method. */
  task_specs: z.array(z.string().regex(/^[A-Z][0-9]{2}$/)).default([]),
  calculation_ids: z.array(z.string().regex(/^[a-z][a-z0-9_.-]*$/)).default([]),
  gold_cases: z.array(z.string().min(1)).default([]),
  dependencies: z.array(z.string().regex(/^[a-z][a-z0-9-]{2,79}$/)).default([]),
  templates: z.array(z.string().regex(/^[a-z][a-z0-9-]{2,79}$/)).default([]),
  /**
   * Executable evidence, required from `implemented` up: the executor module and export, the
   * result contract, the product states it connects to, how results persist and the evaluation
   * ids that back it. Prose never substitutes for these.
   */
  implementation_module: z.string().min(1).optional(),
  implementation_export: z.string().regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/).optional(),
  result_contract: z.string().min(1).optional(),
  connected_states: z.array(z.string().regex(/^[a-z][a-z0-9_]*$/)).default([]),
  persistence_mode: z.enum(["persisted", "derived_on_demand"]).optional(),
  persistence_target: z.string().min(1).optional(),
  unit_test_files: z.array(z.string().min(1)).default([]),
  gold_case_ids: z.array(z.string().min(1)).default([]),
  adversarial_case_ids: z.array(z.string().min(1)).default([]),
  e2e_scenario_ids: z.array(z.string().min(1)).default([]),
  cost_eval_ids: z.array(z.string().min(1)).default([]),
  /** Ids of independent reviews on record under `knowledge/reviews/<id>.json`. */
  review_ids: z.array(z.string().regex(/^[a-z0-9][a-z0-9_.-]{2,120}$/)).default([]),
  gold_run_ids: z.array(z.string().min(1)).default([]),
  adversarial_run_ids: z.array(z.string().min(1)).default([]),
  consistency_run_ids: z.array(z.string().min(1)).default([]),
  max_model_calls: z.coerce.number().int().min(0).max(3).default(0),
  model_purpose: z.array(z.string().min(1)).default([]),
  allowed_tools: z.array(z.string().min(1)).default([]),
}).strict();
export type MethodFrontmatter = z.infer<typeof frontmatterSchema>;

export type MethodDocument = {
  /** Path relative to the knowledge root, stable across machines. */
  sourcePath: string;
  sourceHash: string;
  frontmatter: MethodFrontmatter;
  procedure: CanonicalProcedure;
  /** Questions that change the work; recorded for the question policy, never asked by default. */
  questions: string[];
  /** Minimum inputs and their accepted substitutes. */
  inputs: string[];
};

export class MethodCompileError extends Error {
  constructor(readonly sourcePath: string, message: string) {
    super(`${sourcePath}: ${message}`);
  }
}

const SECTIONS = {
  objective: "Objetivo",
  product: "Produto",
  activate: "Quando ativar",
  doNotActivate: "Quando não ativar",
  inputs: "Inputs mínimos e substitutos",
  sequence: "Sequência operacional",
  calculations: "Cálculos determinísticos",
  judgments: "Julgamentos permitidos",
  questions: "Perguntas que mudam o trabalho",
  redFlags: "Red flags",
  stopConditions: "Stop conditions",
  outputs: "Outputs",
  examples: "Exemplos",
  tests: "Testes",
  evidence: "Evidência",
} as const;

function parseScalar(raw: string): string | string[] {
  const value = raw.trim();
  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1).trim();
    return inner.length === 0 ? [] : inner.split(",").map((item) => item.trim()).filter((item) => item.length > 0);
  }
  return value;
}

export function parseFrontmatter(text: string, sourcePath: string): {frontmatter: MethodFrontmatter; body: string} {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!match) throw new MethodCompileError(sourcePath, "frontmatter fenced by --- is required");
  const raw: Record<string, string | string[]> = {};
  for (const line of match[1]!.split("\n")) {
    if (line.trim().length === 0 || line.trim().startsWith("#")) continue;
    const separator = line.indexOf(":");
    if (separator <= 0) throw new MethodCompileError(sourcePath, `frontmatter line without key: ${line}`);
    raw[line.slice(0, separator).trim()] = parseScalar(line.slice(separator + 1));
  }
  const parsed = frontmatterSchema.safeParse(raw);
  if (!parsed.success) throw new MethodCompileError(sourcePath, `frontmatter invalid: ${parsed.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`).join("; ")}`);
  return {frontmatter: parsed.data, body: match[2]!};
}

type Section = {title: string; lines: string[]; subsections: Map<string, string[]>};

function splitSections(body: string): Map<string, Section> {
  const sections = new Map<string, Section>();
  let current: Section | null = null;
  let currentSub: string | null = null;
  for (const line of body.split("\n")) {
    if (line.startsWith("# ")) {
      current = {title: line.slice(2).trim(), lines: [], subsections: new Map()};
      currentSub = null;
      sections.set(current.title, current);
      continue;
    }
    if (!current) continue;
    if (line.startsWith("## ")) {
      currentSub = line.slice(3).trim();
      current.subsections.set(currentSub, []);
      continue;
    }
    if (currentSub) current.subsections.get(currentSub)!.push(line);
    else current.lines.push(line);
  }
  return sections;
}

const items = (lines: readonly string[]): string[] => lines
  .map((line) => line.trim())
  .filter((line) => /^(-|\d+\.)\s+/.test(line))
  .map((line) => line.replace(/^(-|\d+\.)\s+/, "").trim());

const paragraph = (lines: readonly string[]): string => lines.map((line) => line.trim()).filter((line) => line.length > 0).join(" ");

function requireSection(sections: Map<string, Section>, title: string, sourcePath: string): Section {
  const section = sections.get(title);
  if (!section) throw new MethodCompileError(sourcePath, `section "# ${title}" is required`);
  return section;
}

function requireItems(section: Section, sourcePath: string): string[] {
  const list = items(section.lines);
  if (list.length === 0) throw new MethodCompileError(sourcePath, `section "# ${section.title}" needs at least one list item`);
  return list;
}

function subItems(section: Section, name: string, sourcePath: string): string[] {
  const lines = section.subsections.get(name);
  if (!lines) throw new MethodCompileError(sourcePath, `section "# ${section.title}" needs a "## ${name}" subsection`);
  const list = items(lines);
  if (list.length === 0) throw new MethodCompileError(sourcePath, `subsection "## ${name}" of "# ${section.title}" needs at least one list item`);
  return list;
}

/** `[mode] Title :: instruction ; instruction | tools: a, b | evidence: x, y` */
function parseStep(item: string, index: number, sourcePath: string): CanonicalProcedure["procedure"][number] {
  const match = /^\[(deterministic|model_assisted|human_judgment)\]\s*([^:]+?)\s*::\s*(.+)$/.exec(item);
  if (!match) throw new MethodCompileError(sourcePath, `step ${index + 1} must read "[mode] Title :: instruction ; instruction": ${item.slice(0, 80)}`);
  const [, mode, title, rest] = match;
  const [instructionPart, ...extras] = rest!.split("|").map((part) => part.trim());
  let tools: string[] = [];
  let evidenceInputs: string[] = [];
  for (const extra of extras) {
    if (extra.startsWith("tools:")) tools = extra.slice(6).split(",").map((tool) => tool.trim()).filter(Boolean);
    else if (extra.startsWith("evidence:")) evidenceInputs = extra.slice(9).split(",").map((input) => input.trim()).filter(Boolean);
    else throw new MethodCompileError(sourcePath, `step ${index + 1} has an unknown qualifier: ${extra}`);
  }
  const id = title!.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return {
    id: /^[a-z]/.test(id) ? id : `step-${index + 1}`,
    title: title!.trim(),
    instructions: instructionPart!.split(";").map((instruction) => instruction.trim()).filter(Boolean),
    mode: mode as "deterministic" | "model_assisted" | "human_judgment",
    tools,
    evidenceInputs,
  };
}

/** `field_id (type, required|optional): description` with an optional `values: a, b` tail. */
function parseOutputField(item: string, sourcePath: string): CanonicalProcedure["output"]["fields"][number] {
  const match = /^([a-z][a-z0-9_.-]*)\s*\((string|number|decimal_string|boolean|date|enum|object|array),\s*(required|optional)\)\s*:\s*(.+)$/.exec(item);
  if (!match) throw new MethodCompileError(sourcePath, `output field must read "field_id (type, required|optional): description": ${item.slice(0, 80)}`);
  const [, id, type, requirement, tail] = match;
  const [description, valuesPart] = tail!.split("| values:").map((part) => part.trim());
  const field: CanonicalProcedure["output"]["fields"][number] = {id: id!, type: type as never, required: requirement === "required", description: description!, evidenceRequired: true};
  if (valuesPart) field.allowedValues = valuesPart.split(",").map((value) => value.trim()).filter(Boolean);
  return field;
}

export type ReviewLookup = (reviewId: string) => AiIndependentReview | null;

export function compileMethodDocument(text: string, sourcePath: string, lookupReview: ReviewLookup = () => null): MethodDocument {
  const {frontmatter, body} = parseFrontmatter(text, sourcePath);
  const reviews = frontmatter.review_ids.map((reviewId) => {
    const record = lookupReview(reviewId);
    if (!record) throw new MethodCompileError(sourcePath, `review ${reviewId} is not on record`);
    if (record.subject.kind !== "method" || record.subject.id !== frontmatter.id) throw new MethodCompileError(sourcePath, `review ${reviewId} is about ${record.subject.kind} ${record.subject.id}, not this method`);
    return {reviewId, kind: "ai_independent_review" as const, result: reviewCountsForPromotion(record) ? record.result : "fail" as const, recordPath: `knowledge/reviews/${reviewId}.json`};
  });
  const sections = splitSections(body);
  const sequence = requireItems(requireSection(sections, SECTIONS.sequence, sourcePath), sourcePath).map((item, index) => parseStep(item, index, sourcePath));
  const outputs = requireItems(requireSection(sections, SECTIONS.outputs, sourcePath), sourcePath).map((item) => parseOutputField(item, sourcePath));
  const tests = requireSection(sections, SECTIONS.tests, sourcePath);
  const evidence = requireSection(sections, SECTIONS.evidence, sourcePath);
  const examples = sections.get(SECTIONS.examples);
  const owner: CanonicalProcedure["owner"] = {role: frontmatter.owner_role};
  if (frontmatter.approved_by) owner.approvedBy = frontmatter.approved_by;
  const implementationFields = [frontmatter.implementation_module, frontmatter.implementation_export, frontmatter.result_contract, frontmatter.persistence_mode, frontmatter.persistence_target];
  const hasImplementation = implementationFields.some((field) => field !== undefined);
  if (hasImplementation && implementationFields.some((field) => field === undefined)) {
    throw new MethodCompileError(sourcePath, "implementation evidence needs module, export, result contract, persistence mode and target together");
  }
  const implementation = hasImplementation ? {
    executor: {module: frontmatter.implementation_module!, exportName: frontmatter.implementation_export!},
    resultContract: frontmatter.result_contract!,
    connectedProductStates: frontmatter.connected_states,
    persistence: {mode: frontmatter.persistence_mode!, target: frontmatter.persistence_target!},
    evaluation: {
      unitTestFiles: frontmatter.unit_test_files,
      goldCaseIds: frontmatter.gold_case_ids,
      adversarialCaseIds: frontmatter.adversarial_case_ids,
      e2eScenarioIds: frontmatter.e2e_scenario_ids,
      costEvalIds: frontmatter.cost_eval_ids,
    },
  } : undefined;

  const candidate = {
    id: frontmatter.id,
    version: frontmatter.version,
    maturity: frontmatter.maturity,
    title: {pt: frontmatter.title_pt, en: frontmatter.title_en},
    role: frontmatter.role,
    blueprintStage: frontmatter.blueprint_stage,
    owner,
    objective: paragraph(requireSection(sections, SECTIONS.objective, sourcePath).lines),
    product: paragraph(requireSection(sections, SECTIONS.product, sourcePath).lines),
    procedure: sequence,
    output: {schemaId: `method.${frontmatter.id}`, fields: outputs},
    evidence: {
      hierarchy: subItems(evidence, "Hierarquia", sourcePath),
      rules: subItems(evidence, "Regras", sourcePath),
      materialClaimsRequireSupport: true as const,
    },
    tests: {
      unit: subItems(tests, "Unit", sourcePath),
      gold: subItems(tests, "Gold", sourcePath),
      adversarial: subItems(tests, "Adversarial", sourcePath),
      acceptance: subItems(tests, "Aceitação", sourcePath),
    },
    source: {path: sourcePath, effectiveDate: frontmatter.effective_date},
    knowledge: {
      houseProcedureIds: frontmatter.house_procedure_ids,
      authorities: frontmatter.authorities,
      referenceDataKeys: frontmatter.reference_data_keys,
      legalReviewRequired: frontmatter.legal_review_required,
    },
    prerequisites: items(requireSection(sections, SECTIONS.activate, sourcePath).lines),
    dependencies: frontmatter.dependencies,
    decisionRules: items(sections.get(SECTIONS.judgments)?.lines ?? []),
    redFlags: items(sections.get(SECTIONS.redFlags)?.lines ?? []),
    stopConditions: items(sections.get(SECTIONS.stopConditions)?.lines ?? []),
    exceptions: items(sections.get(SECTIONS.doNotActivate)?.lines ?? []),
    templates: frontmatter.templates,
    examples: {
      positive: examples ? items(examples.subsections.get("Bom") ?? []) : [],
      negative: examples ? items(examples.subsections.get("Ruim") ?? []) : [],
    },
    runtime: {
      orchestration: "deterministic_pipeline" as const,
      peerHandoffs: false as const,
      maxModelCalls: frontmatter.max_model_calls,
      modelPurpose: frontmatter.model_purpose,
      allowedTools: frontmatter.allowed_tools,
    },
    reviews,
    testRuns: {gold: frontmatter.gold_run_ids, adversarial: frontmatter.adversarial_run_ids, consistency: frontmatter.consistency_run_ids},
    ...(implementation ? {implementation} : {}),
  };
  const parsed = canonicalProcedureSchema.safeParse(candidate);
  if (!parsed.success) throw new MethodCompileError(sourcePath, `contract invalid: ${parsed.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`).join("; ")}`);
  return {
    sourcePath,
    sourceHash: createHash("sha256").update(text).digest("hex"),
    frontmatter,
    procedure: parsed.data,
    questions: items(sections.get(SECTIONS.questions)?.lines ?? []),
    inputs: items(sections.get(SECTIONS.inputs)?.lines ?? []),
  };
}

function walk(directory: string, root: string, out: string[]): void {
  for (const entry of readdirSync(directory, {withFileTypes: true})) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) walk(full, root, out);
    else if (entry.name.endsWith(".md")) out.push(relative(root, full));
  }
}

/** Compiles every method under a knowledge root, in a stable order, and hashes the library. */
export function loadReviewRecords(reviewsRoot: string): Map<string, AiIndependentReview> {
  const records = new Map<string, AiIndependentReview>();
  let entries: string[] = [];
  try {
    entries = readdirSync(reviewsRoot).filter((name) => name.endsWith(".json")).sort();
  } catch {
    return records;
  }
  for (const name of entries) {
    const record = aiIndependentReviewSchema.parse(JSON.parse(readFileSync(join(reviewsRoot, name), "utf8")));
    if (`${record.reviewId}.json` !== name) throw new Error(`review record ${name} does not match its reviewId ${record.reviewId}`);
    records.set(record.reviewId, record);
  }
  return records;
}

export function loadMethodLibrary(root: string, reviewsRoot?: string): {methods: MethodDocument[]; reviews: Map<string, AiIndependentReview>; libraryHash: string} {
  const reviews = loadReviewRecords(reviewsRoot ?? join(root, "..", "reviews"));
  const paths: string[] = [];
  walk(root, root, paths);
  paths.sort();
  const methods = paths.map((path) => compileMethodDocument(readFileSync(join(root, path), "utf8"), path, (reviewId) => reviews.get(reviewId) ?? null));
  const seen = new Set<string>();
  for (const method of methods) {
    if (seen.has(method.procedure.id)) throw new MethodCompileError(method.sourcePath, `duplicate method id ${method.procedure.id}`);
    seen.add(method.procedure.id);
  }
  const libraryHash = createHash("sha256").update(JSON.stringify(methods.map((method) => [method.sourcePath, method.sourceHash]))).digest("hex");
  return {methods, reviews, libraryHash};
}

/** A method may run in staging from `tested` up; below that it is documentation. */
export function methodMayRunInStaging(method: MethodDocument): boolean {
  return ["tested", "ready_for_founder", "production"].includes(method.procedure.maturity);
}

/** A TaskSpec may only be promoted to production on the back of a production method bound to it. */
export function assertTaskHasProductionMethod(taskId: string, methods: readonly MethodDocument[]): MethodDocument {
  const bound = methods.filter((method) => method.frontmatter.task_specs.includes(taskId));
  if (bound.length === 0) throw new Error(`task ${taskId} has no method bound to it; an executor may not improvise one`);
  const production = bound.find((method) => method.procedure.maturity === "production" && method.procedure.implementation);
  if (!production) throw new Error(`task ${taskId} is bound to ${bound.map((method) => `${method.procedure.id}@${method.procedure.version} (${method.procedure.maturity})`).join(", ")}; none is in production with implementation evidence`);
  return production;
}
