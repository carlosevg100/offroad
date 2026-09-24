import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

import {COST_RESERVATION_SAFETY_FACTOR, conservativeTextReservationUsd, estimateCostUsd, estimateRequestInputTokens, listPrices, redactPersonalIdentifiers, textComposition} from "@offroad/model-gateway";
import {sourcePackSchema} from "@offroad/public-research";

import {
  BASELINE_SYSTEM_PROMPT,
  baselineInformationBaseSchema,
  baselineOutputSchema,
  baselineRunRecordSchema,
  renderInformationBase,
  renderTurnMessage,
  sha256Hex,
  type BaselineSource,
} from "./gold-baseline";
import {baselinePdfText, baselineSourceFromPackEntry} from "./gold-baseline-materials";

/**
 * The largest calibration sample of the gateway's input-token rule is the gc01 baseline run of
 * 4 Sep 2026: Claude Opus 5 billed 508,910 and 515,321 input tokens for its two turns
 * (`docs/product/gold-cases/runs/gc01/baseline/2026-09-04-23-18-46/run.json`). This test rebuilds
 * the exact bytes of those two requests from the committed files, proves them by the recorded
 * hashes, and checks that the gateway's estimate bounds the real count from above and stays
 * within 20% of it. The base of that run had the twenty sources of the first pack, a line with the
 * requester's profile, and the hash of an empty buffer for both documents (the parser had consumed
 * them before hashing); the run record names every one of those inputs.
 */
const repo = resolve(import.meta.dirname, "..", "..", "..");
const runDir = resolve(repo, "docs/product/gold-cases/runs/gc01/baseline/2026-09-04-23-18-46");
const camil = resolve(repo, "packages/testing-fixtures/assets/camil");
const record = baselineRunRecordSchema.parse(JSON.parse(readFileSync(resolve(runDir, "run.json"), "utf8")));

describe("gold baseline calibration sample of 4 Sep 2026", () => {
  it("rebuilds the exact requests of the run and bounds their real input tokens from above", async () => {
    expect(sha256Hex(BASELINE_SYSTEM_PROMPT)).toBe(record.systemPromptSha256);
    const documents = [];
    for (const [id, title, fileName] of [
      ["itr_1t26", "ITR 31/05/2026 com release de resultados (versão da companhia)", "01_ITR_1T26_31mai2026.pdf"],
      ["proposta_agoe_2026", "Proposta da administração para a AGOE de 2026", "02_Proposta_Administracao_AGOE_2026.pdf"],
    ] as const) {
      const {text, pages} = await baselinePdfText(new Uint8Array(readFileSync(resolve(camil, fileName))), fileName, id);
      documents.push({id, title, fileName, sha256: record.inputs.documents.find((document) => document.id === id)!.sha256, pages, text});
    }
    const packDir = resolve(camil, "source-pack");
    const pack = sourcePackSchema.parse(JSON.parse(readFileSync(resolve(packDir, "source-pack.json"), "utf8")));
    const sources: BaselineSource[] = [];
    for (const input of record.inputs.sources) {
      const entry = pack.entries.find((candidate) => candidate.id === input.id)!;
      // The pack's later versions replaced one archive; the run names the bytes it had.
      sources.push({...await baselineSourceFromPackEntry(packDir, entry, /CAMIL/i), sha256: input.sha256});
    }
    const base = baselineInformationBaseSchema.parse({caseId: record.caseId, caseVersion: record.caseVersion, language: "pt-BR", asOfDate: record.asOfDate,
      turns: [
        {id: "gc01-t01", text: "Sou analista no time de Investment Banking. Meu VP me pediu para preparar material para uma reunião com a Camil na segunda. Ele falou em refinanciamento, mas não disse que tese quer levar nem que formato espera."},
        {id: "gc01-t02", text: "Meu VP quer três páginas de pitch: situação atual, alternativas e impacto nos indicadores."},
      ], documents, sources});
    const lines = renderInformationBase(base).split("\n");
    lines.splice(2, 0, "Perfil profissional de quem pede: formas de uso institutional_work; funções banker; áreas investment_banking, dcm; objetivos prepare_meetings.");
    const rendered = lines.join("\n");
    expect(rendered.length).toBe(record.informationBaseChars);
    expect(sha256Hex(rendered)).toBe(record.informationBaseSha256);

    const deliverable = readFileSync(resolve(runDir, "gc01-t01.output.md"), "utf8").replace(/\n$/, "");
    expect(sha256Hex(deliverable)).toBe(record.turns[0]!.outputSha256);
    const messages = base.turns.map((turn, index) => renderTurnMessage(turn, index));
    messages.forEach((message, index) => expect(sha256Hex(message)).toBe(record.turns[index]!.messageSha256));
    const conversations = [[rendered, messages[0]!], [rendered, messages[0]!, `## Resposta ao turno 1 (sua entrega anterior)\n\n${deliverable}`, messages[1]!]];
    conversations.forEach((parts, index) => {
      const request = {model: record.model, effort: "high" as const, system: BASELINE_SYSTEM_PROMPT, schema: baselineOutputSchema, schemaName: "baseline_deliverable",
        input: parts.map((text) => ({type: "text" as const, text: redactPersonalIdentifiers(text, {}).text})), maxOutputTokens: 32_000, timeoutMs: 1};
      const real = record.turns[index]!.inputTokens;
      const estimate = estimateRequestInputTokens("anthropic", request).inputTokens;
      expect(estimate).toBeGreaterThanOrEqual(real);
      expect(estimate / real).toBeLessThan(1.2);
      // What the gateway reserves for this exact request, production and evaluations alike, is
      // above what Claude Opus 5 billed for it at list price even without the 10% price margin.
      const billed = estimateCostUsd(record.model, {inputTokens: real, outputTokens: record.turns[index]!.outputTokens, cachedInputTokens: record.turns[index]!.cachedInputTokens});
      expect(conservativeTextReservationUsd("anthropic", request, listPrices) / COST_RESERVATION_SAFETY_FACTOR).toBeGreaterThanOrEqual(billed);
      // The composition the gateway's calibration fixture records for this sample.
      const {bytes, dense} = parts.reduce((sum, text) => {
        const part = textComposition(redactPersonalIdentifiers(text, {}).text);
        return {bytes: sum.bytes + part.bytes, dense: sum.dense + part.dense};
      }, {bytes: 0, dense: 0});
      expect(bytes).toBeGreaterThan(1_000_000);
      expect(dense / bytes).toBeGreaterThan(0.17);
    });
  // Parses twenty PDFs of the fixture; the CI runner is slower than a laptop.
  }, 120_000);
});
