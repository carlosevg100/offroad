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

const system = "You classify one sentence into the requested JSON. Return the requested JSON only.";
const input: AdapterRequest["input"] = [{type: "text", text: JSON.stringify({latestUserMessage: "Preciso preparar uma reunião com a Companhia Fictícia sobre refinanciamento das debêntures."})}];

async function main() {
  const adapter = createAnthropicAdapter();
  const variants: Array<{label: string; request: AdapterRequest}> = [];
  for (const effort of ["low", "medium"] as const) {
    for (const thinking of ["off", "adaptive"] as const) {
      for (const [schemaName, schema] of [["flat", flat], ["nested", nested]] as const) {
        variants.push({
          label: `effort=${effort} thinking=${thinking} schema=${schemaName}`,
          request: {
            model: "claude-sonnet-5", effort, system, input, schema, schemaName: `probe_${schemaName}`, maxOutputTokens: 1_500, timeoutMs: 60_000,
            ...(thinking === "off" ? {thinking: "off" as const} : {}),
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
