/**
 * Structured-output probe: calls the Anthropic adapter with synthetic input across the request
 * shapes the routing tasks use (effort low or medium, thinking off or adaptive, a flat schema or
 * the nested envelope-like schema with a $ref) and prints the provider's verdict per variant.
 * The input is a fixed sentence about a fictional company; nothing here is customer content, so
 * the provider's error message can be printed in full. Runs in the probe workflow with the key
 * read by OIDC; never locally.
 */
import {createAnthropicAdapter, type AdapterRequest} from "@offroad/model-gateway";
import {z} from "zod";

const flat = z.object({
  intent: z.string(),
  confidence: z.number(),
  company: z.string().nullable(),
});

const inferred = <T extends z.ZodTypeAny>(value: T) => z.object({
  value,
  state: z.enum(["explicit", "inferred", "ambiguous", "unknown", "not_applicable"]),
  confidence: z.number().min(0).max(1),
  basis: z.string().max(200).optional(),
});

const nested = z.object({
  routingCore: z.object({
    action: inferred(z.array(z.string().min(1).max(60)).min(1).max(8)),
    desiredOutcome: inferred(z.string().min(1).max(300)),
    decision: inferred(z.string().max(300).nullable()),
    depth: inferred(z.enum(["point", "preliminary", "institutional"])),
  }),
  inferableContext: z.object({
    asOfDate: inferred(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()),
    currency: inferred(z.string().length(3).nullable()),
    constraints: inferred(z.array(z.string().max(200)).max(20)),
  }),
  primaryWorks: z.array(z.object({work: z.enum(["understand", "analyze", "capital_strategy"]), confidence: z.number().min(0).max(1)})).min(1).max(3),
  composition: z.string().max(60).nullable(),
  firstQuestion: z.string().max(300).nullable(),
  abstain: z.boolean(),
  abstainReason: z.string().max(300).nullable(),
});


// The routing schema at its real size: the envelope's eight core fields and eight inferable
// context fields, each an object of four keys, plus the works and the abstention. Sixty-odd
// properties: the probe tells whether size, not shape, is what the provider rejects.
const objectKinds = ["organization", "user", "company", "project", "operation", "instrument", "document", "claim", "model", "asset_or_pool", "scenario", "alternative", "material", "market", "provider", "mandate", "process", "decision"] as const;
const works = ["find_and_organize", "extract_and_reconcile", "understand", "analyze", "model", "capital_strategy", "read_documents", "market", "capital_match"] as const;
const responsibilities = ["producer", "coordinator", "reviewer", "decision_maker", "sponsor", "recipient", "external_authorizer"] as const;
const fullSize = z.object({
  routingCore: z.object({
    action: inferred(z.array(z.string().min(1).max(60)).min(1).max(8)),
    object: inferred(z.array(z.object({kind: z.enum(objectKinds), reference: z.string().max(200).optional()})).min(1).max(12)),
    desiredOutcome: inferred(z.string().min(1).max(300)),
    decision: inferred(z.string().max(300).nullable()),
    audience: inferred(z.array(z.string().min(1).max(80)).min(1).max(6)),
    depth: inferred(z.enum(["point", "preliminary", "institutional"])),
    continuity: inferred(z.enum(["new", "refresh", "monitor", "comparison", "resume"])),
    workResponsibility: inferred(z.array(z.enum(responsibilities)).min(1).max(4)),
  }),
  inferableContext: z.object({
    jurisdiction: inferred(z.array(z.string().min(2).max(8)).max(4)),
    asOfDate: inferred(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()),
    currency: inferred(z.string().length(3).nullable()),
    deadline: inferred(z.string().max(80).nullable()),
    sponsorInstruction: inferred(z.string().max(500).nullable()),
    constraints: inferred(z.array(z.string().max(200)).max(20)),
    urgency: inferred(z.enum(["now", "today", "this_week", "ongoing"]).nullable()),
    availableInputs: inferred(z.array(z.string().max(120)).max(40)),
  }),
  primaryWorks: z.array(z.object({work: z.enum(works), confidence: z.number().min(0).max(1)})).min(1).max(3),
  composition: z.string().max(60).nullable(),
  firstQuestion: z.string().max(300).nullable(),
  abstain: z.boolean(),
  abstainReason: z.string().max(300).nullable(),
});

const system = "You classify one sentence into the requested JSON. Return the requested JSON only.";
const input: AdapterRequest["input"] = [{type: "text", text: JSON.stringify({latestUserMessage: "Preciso preparar uma reunião com a Companhia Fictícia sobre refinanciamento das debêntures."})}];

async function main() {
  const adapter = createAnthropicAdapter();
  const variants: Array<{label: string; request: AdapterRequest}> = [];
  for (const effort of ["low", "medium"] as const) {
    for (const thinking of ["off", "adaptive"] as const) {
      for (const [schemaName, schema, outputMode] of [["flat", flat, "structured"], ["nested", nested, "structured"], ["full", fullSize, "structured"], ["full-prompted", fullSize, "prompted_json"]] as const) {
        variants.push({
          label: `effort=${effort} thinking=${thinking} schema=${schemaName}`,
          request: {
            model: "claude-sonnet-5", effort, system, input, schema, schemaName: `probe_${schemaName}`, maxOutputTokens: 1_500, timeoutMs: 60_000,
            ...(thinking === "off" ? {thinking: "off" as const} : {}),
            outputMode,
          },
        });
      }
    }
  }
  for (const variant of variants) {
    const startedAt = Date.now();
    try {
      const response = await adapter.complete(variant.request);
      console.log(`OK    ${variant.label} model=${response.model} ms=${Date.now() - startedAt} keys=${Object.keys((response.output as Record<string, unknown>) ?? {}).join(",")}`);
    } catch (error) {
      const value = error && typeof error === "object" ? error as Record<string, unknown> : {};
      const nestedError = value.error && typeof value.error === "object" ? value.error as Record<string, unknown> : {};
      const innermost = nestedError.error && typeof nestedError.error === "object" ? nestedError.error as Record<string, unknown> : nestedError;
      console.log(`ERROR ${variant.label} status=${String(value.status ?? "")} type=${String(innermost.type ?? value.type ?? "")} message=${String(innermost.message ?? value.message ?? "").slice(0, 400)}`);
    }
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
