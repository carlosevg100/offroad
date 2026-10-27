import {describe, expect, it} from "vitest";
import {prepareBoardCapitalDiscussionPacket} from "./board-capital-discussion-packet";
import {boardCapitalDiscussionPacketExecutorContracts} from "./board-capital-discussion-contracts";
import {boardPacketInput} from "./board-capital-discussion-runs.test-support";

const current = (p: ReturnType<typeof prepareBoardCapitalDiscussionPacket>) => p.result.discussion!.versions.at(-1)!;

describe("board capital discussion packet (ficha C47)", {timeout: 120000}, () => {
  it("turn 1: proposes the four deliberations in urgency order and asks only what changes the material, without producing it", () => {
    const p = prepareBoardCapitalDiscussionPacket(boardPacketInput(1));
    expect(p.status).toBe("framed");
    expect(p.readings!.materialWithheld).toBe(true);
    expect(p.result.discussion!.versions).toEqual([]);
    expect(p.readings!.deliberations.map((d) => d.text)).toEqual([
      "não emitir o pedido de compra até as cotações firmes, e enviar ao fornecedor atual o aviso para renegociar o contrato até 2/out",
      "financiar a safra pelos programas de antecipação das redes A e B, com a conta garantida para o aperto de caixa da safra e a linha bancária só como reserva, e aderir aos programas até 16/out",
      "autorizar a sondagem de uma debênture com teto de R$ 80 milhões, com prazo de 7 anos, com o alongamento bancário como plano alternativo, e concluir a sondagem até 31/out e decidir a rota até 15/nov",
      "definir qual EBITDA mede o limite de 2,5x"]);
    expect(p.result.discussion!.outline.narrative).toEqual(["decisions", "situation", "constraint", "topic", "alternatives", "recommendation", "risk", "what_changes", "next_steps"]);
    expect(p.readings!.questionsBeforeMaterial.map((q) => q.code)).toEqual(["template", "agenda_minutes", "board_has_seen"]);
  });
  it("turn 2: twelve pages read from the reviewed results, the line before the recommendation, nothing pending", () => {
    const p = prepareBoardCapitalDiscussionPacket(boardPacketInput(2));
    expect(p.status).toBe("prepared_for_human_review");
    expect(p.readings!.material!.mainPages).toBe(12);
    expect(p.readings!.material!.fitsAgenda).toBe(true);
    const line = current(p).pages.find((x) => x.id === "linha")!;
    expect(line.lines[0]).toBe("Retorno de 16% ao ano contra custo de capital de 15% ao ano; VPL de R$ 0,7 milhão.");
    expect(current(p).pages.find((x) => x.id === "politica")!.lines).toEqual(["Pelo EBITDA gerencial, 2,0x; pela definição da escritura, 2,2x em dez/26."]);
    expect(p.result.discussion!.identity.every((x) => x.matches)).toBe(true);
    expect(p.gaps).toEqual([]);
    expect(p.result.sources.map((s) => [s.id, s.methodId, s.methodVersion])).toEqual([["tabela-divida", "build-company-debt-table", "2026.10.23-v1"],
      ["covenant", "measure-covenant-headroom", "2026.10.23-v1"], ["caixa-semanal", "project-weekly-cash", "2026.10.23-v1"], ["linha-embalagem", "analyze-investment-project", "2026.10.09-v2"],
      ["projecao", "build-operating-projection", "2026.10.26-v1"], ["plano-fpa", "challenge-financial-projection", "2026.10.26-v1"],
      ["recebiveis", "monetize-receivables-for-working-capital", "2026.10.26-v1"], ["custo-relativo", "analyze-relative-debt-cost", "2026.10.19-v2"], ["plano-2027", "evaluate-financing-paths", "2026.10.27-v1"]]);
  });
  it("turn 3: withdraws the recommendation, keeps the facts and the notice, and keeps the first version", () => {
    const p = prepareBoardCapitalDiscussionPacket(boardPacketInput(3));
    expect(p.readings!.omissions).toEqual([{id: "linha-sem-recomendacao", outcome: "applied", reason: "Retirei a recomendação; a página mostra as opções com os critérios e os números, e os fatos materiais continuam.",
      keptFigureIds: ["irr", "wacc", "npv", "payback", "peak-need", "npv-economy", "npv-capex", "npv-slow", "npv-defer", "irr-defer"]}]);
    expect(p.result.discussion!.versions.map((v) => v.version)).toEqual([1, 2]);
    expect(p.readings!.material!.priorVersionFingerprint).toBe(p.result.discussion!.versions[0]!.fingerprint);
    expect(current(p).deliberations[0]!.text).toBe("decidir o caminho da linha de embalagem, e enviar ao fornecedor atual o aviso para renegociar o contrato até 2/out");
  });
  it("is deterministic and publishes its contracts", () => {
    expect(prepareBoardCapitalDiscussionPacket(boardPacketInput(3)).fingerprint).toBe(prepareBoardCapitalDiscussionPacket(boardPacketInput(3)).fingerprint);
    const c = boardCapitalDiscussionPacketExecutorContracts();
    expect(c.executor).toEqual({module: "@offroad/financial-model", exportName: "prepareBoardCapitalDiscussionPacket", version: "2026.10.27-v1"});
    expect(c.inputs.id).toBe("board-capital-discussion-packet-input");
  });
});
