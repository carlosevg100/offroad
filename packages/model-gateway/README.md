# @offroad/model-gateway

The only door to LLM providers (P1 plan §13.3, §15). Nothing in the monorepo calls
`@anthropic-ai/sdk` or `openai` directly — every model call goes through
`createModelGateway(...).complete(request)`.

## What it enforces

- **Model policy** — per task: primary, shadow (second opinion, other provider),
  fallback and an **escalation ladder**. Production allowlist: `claude-opus-5`,
  `claude-sonnet-5`, `gpt-5.6-sol`, `gpt-5.6-terra`. **Haiku, mini and nano are denied
  by pattern** (founder decision, 18 Aug 2026) and can never be used, not even in a
  sweep. Everything else (GPT-4o, GPT-4.1, Luna, Sonnet 4.6) is simply outside the
  production allowlist and reachable only through `experimentalModels`, which the
  evals sweep sets. Overrides are checked against the same rules.
- **Escalate on evidence, not precaution** — `nextEscalation(task, current)` returns the
  next step of the ladder (`extract_fields`: Sonnet 5 `medium` → Opus 5 `high` →
  GPT-5.6 Sol `high`). The pipeline calls it when the verifier reports weak evidence
  for a material document, never because a value "looks wrong".
- **Structured outputs** — the request carries a zod schema; Anthropic receives it as
  `output_config.format` (`zodOutputFormat`), OpenAI as a strict `json_schema`
  (optional fields become nullable and nulls are stripped before validation). The
  gateway validates every output with zod; invalid output triggers the fallback.
- **Refusals** — `stop_reason: refusal` (either provider) is never turned into a
  result; the fallback runs and the attempt is recorded.
- **Budgets** — per gateway instance (one instance per processing run): max cost and
  max calls; list-price cost accounting per call (`pricing.ts`, prices dated).
- **Minimization** — CPFs and e-mails in text parts are masked before leaving the
  perimeter (CNPJs and amounts are kept). Disable only for tasks whose object is the
  identifier itself.
- **Privacy defaults** — OpenAI requests set `store: false`; system prompts carry a
  cache breakpoint but never client data; call logs contain usage/cost/latency and
  ids only, never content.
- **Provider data policy** — every production request declares a data class and purpose.
  With enforcement enabled, primary, shadow and fallback candidates are checked independently
  against a current, versioned assurance record before any content is sent. Non-public data
  requires `no_store`, training use must be prohibited, and the exact purpose/class must be
  approved. Assurance records are supplied by Offroad from real contract review; the package
  never hard-codes a vendor promise.
- **Cassettes** — `record` / `replay` / `off` for deterministic tests and CI
  (`FileCassetteStore` under a fixtures directory; only synthetic content may be
  recorded into the repository).

## Environment

Adapters read the provider keys from the environment when not injected:
`ANTHROPIC_API_KEY` and `OPENAI_API_KEY`. They are secrets of the worker/evals
runtime, not of the web app; keep them out of `.env*` files that are committed and
out of logs.

## Usage

```ts
import {createModelGateway, createAnthropicAdapter, createOpenAIAdapter, providerDataPolicyVersion} from "@offroad/model-gateway";
import {z} from "zod";

const gateway = createModelGateway({
  adapters: {anthropic: createAnthropicAdapter(), openai: createOpenAIAdapter()},
  budget: {maxCostUsd: 15},
  onCall: (log) => metrics.record(log),
});

const result = await gateway.complete({
  task: "classify_document",
  system: CLASSIFY_SYSTEM_PROMPT,
  input: [{type: "text", text: layerExcerpt}],
  schema: z.object({kind: z.string(), confidence: z.number()}),
  schemaName: "document_profile",
  dataHandling: {
    classification: "restricted",
    purpose: "document_processing",
    requiredPolicyVersion: providerDataPolicyVersion,
  },
  metadata: {runId, documentId},
});
```

The worker can activate enforcement with `ENFORCE_PROVIDER_DATA_POLICY=true` and one JSON
assurance record for each configured provider. It refuses to boot when enforcement is on but the
record is missing. Keep enforcement off until DPA/ZDR, retention, training-use and legal-basis
facts have actually been reviewed and encoded; a placeholder record defeats the control.
