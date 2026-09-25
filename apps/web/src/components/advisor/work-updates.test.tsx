import {renderToStaticMarkup} from "react-dom/server";
import {NextIntlClientProvider} from "next-intl";
import {describe, expect, it, vi} from "vitest";

import en from "../../../messages/en-US.json";
import pt from "../../../messages/pt-BR.json";
import {selectClientMessages} from "@/i18n/client-messages";
import type {WorkUpdatesModel} from "@/lib/advisor/work-updates";

vi.mock("next/navigation", () => ({useRouter: () => ({refresh: vi.fn(), push: vi.fn()})}));
vi.mock("@/app/[locale]/app/projects/[projectId]/work-update-actions", () => ({adoptWorkUpdate: vi.fn(), authorizeWorkUpdate: vi.fn(), declineWorkUpdate: vi.fn()}));
const {WorkUpdates} = await import("./work-updates");
const {ContinuationQuestion} = await import("./continuation-question");

const id = (n: number) => `a4230000-0000-4000-9000-${String(n).padStart(12, "0")}`;
const dashes = new RegExp(`[${String.fromCodePoint(0x2014)}${String.fromCodePoint(0x2013)}]`);

const model: WorkUpdatesModel = {
  awaitingDecision: 2,
  open: [
    {
      updateId: id(1), status: "ready", revision: 5, updatedAt: "2026-09-25T12:09:00+00:00", open: true,
      changes: [{key: "s", kind: "source_version", name: "balancete.xlsx", from: "1", to: "3", gap: null, executions: ["Estrutura de capital", "Liquidez"]}],
      recomputed: [{candidateId: id(2), label: "Estrutura de capital", state: "settled", produced: true, resultReady: true, reason: null},
        {candidateId: id(3), label: "Covenants", state: "failed", produced: false, resultReady: false, reason: "requester_not_authorized:execution_access_denied"}],
      stayedValid: ["Cenário de juros"],
      awaitingAuthorization: [],
      holds: [{kind: "basis_behind_source", execution: "Liquidez"}],
      canAdopt: true, canDecline: true, declineReason: null, decidedAt: null,
    },
    {
      updateId: id(4), status: "awaiting_authorization", revision: 2, updatedAt: "2026-09-25T12:11:00+00:00", open: true,
      changes: [{key: "m", kind: "method_release", name: "prepare-capital-structure-decision", from: "pcsd-v3", to: "pcsd-v4", gap: null, executions: ["Estrutura de capital"]}],
      recomputed: [], stayedValid: [],
      awaitingAuthorization: [{candidateId: id(5), revision: 1, label: "Estrutura de capital", maxCostMicrousd: 250000, maxModelCalls: 3}],
      holds: [], canAdopt: false, canDecline: true, declineReason: null, decidedAt: null,
    },
  ],
  closed: [{
    updateId: id(6), status: "declined", revision: 4, updatedAt: "2026-09-25T12:14:00+00:00", open: false, changes: [], recomputed: [], stayedValid: [],
    awaitingAuthorization: [], holds: [], canAdopt: false, canDecline: false, declineReason: "cost_not_justified", decidedAt: "2026-09-25T12:14:00+00:00",
  }, {
    // A later change the recomputation of an earlier update already covers: 3B supersedes it
    // pointing at that earlier update, so the wording names no direction in time.
    updateId: id(7), status: "superseded", revision: 2, updatedAt: "2026-09-25T12:15:00+00:00", open: false, changes: [], recomputed: [], stayedValid: [],
    awaitingAuthorization: [], holds: [], canAdopt: false, canDecline: false, declineReason: null, decidedAt: null,
  }],
};

function render(locale: "pt-BR" | "en-US", node: React.ReactNode) {
  const messages = selectClientMessages(locale === "pt-BR" ? pt : en as typeof pt);
  return renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={messages} timeZone="America/Sao_Paulo">{node}</NextIntlClientProvider>);
}

describe("the update section of a work", () => {
  it("shows what changed, what was redone, what stayed valid and what waits, with the decisions behind a confirmation", () => {
    const html = render("pt-BR", <WorkUpdates locale="pt-BR" model={model} />);
    for (const text of [
      "Atualizações do trabalho", "Pronta para adoção", "Aguardando autorização",
      "Fonte balancete.xlsx: a versão 1 foi substituída pela versão 3", "Afeta: Estrutura de capital, Liquidez",
      "Estrutura de capital: refeita a partir da execução original, com os insumos atuais",
      "Covenants: o recálculo não foi concluído", "Quem pediu a execução original não tem mais acesso a este trabalho.",
      "Cenário de juros", "Liquidez: aguardando uma revisão da base de trabalho que use a versão nova",
      "Método prepare-capital-structure-decision: a release pcsd-v3 foi substituída pela release pcsd-v4",
      "Estrutura de capital: recálculo com teto de US$", "3 chamadas de modelo", "Autorizar este recálculo", "Recusar este recálculo",
      "Adotar atualização", "Recusar atualização", "Motivo: O custo não se justifica.",
      "Incorporada a outra atualização", "As mudanças de insumo desta atualização estão cobertas por outra atualização deste trabalho.",
    ]) expect(html).toContain(text);
    // Nothing is decided on the first click: the confirmation buttons are not rendered yet.
    expect(html).not.toContain("Confirmar adoção");
    expect(html).not.toMatch(dashes);
  });

  it("says when nothing changed and when the updates could not be read, in both languages", () => {
    expect(render("pt-BR", <WorkUpdates locale="pt-BR" model={{open: [], closed: [], awaitingDecision: 0}} />)).toContain("Nenhuma mudança de insumo afetou este trabalho até agora.");
    const unavailable = render("en-US", <WorkUpdates locale="en-US" model={null} />);
    expect(unavailable).toContain("role=\"alert\"");
    expect(unavailable).toContain("The updates of this work could not be read right now.");
    expect(render("en-US", <WorkUpdates locale="en-US" model={model} />)).toContain("Ready to adopt");
  });
});

describe("the continuation question", () => {
  const options = [
    {milestoneId: id(10), decisionId: id(11), revision: 3, label: "Alongamento com os bancos atuais"},
    {milestoneId: id(12), decisionId: id(13), revision: 2, label: "Alongamento com debêntures"},
  ];
  it("offers the approved bases, sending as a message and going back, and records nothing by itself", () => {
    const html = render("pt-BR", <ContinuationQuestion disabled={false} onChoose={() => {}} onDismiss={() => {}} onSendAsMessage={() => {}}
      question={{text: "Aprofundar o alongamento", code: "ambiguous_base", options}} />);
    for (const text of ["A partir de qual decisão aprovada?", "Mais de uma decisão aprovada corresponde ao pedido.", "Aprofundar o alongamento",
      "Alongamento com os bancos atuais (revisão 3)", "Alongamento com debêntures (revisão 2)", "Continuar a partir desta base", "Enviar como mensagem comum", "Voltar ao texto"]) {
      expect(html).toContain(text);
    }
    expect(html).toContain("type=\"radio\"");
    expect(html).not.toMatch(dashes);
  });

  it("explains a work without an approved base and offers only the ordinary message", () => {
    const html = render("en-US", <ContinuationQuestion disabled={false} onChoose={() => {}} onDismiss={() => {}} onSendAsMessage={() => {}}
      question={{text: "Deepen the plan", code: "no_approved_base", options: []}} />);
    expect(html).toContain("This work has no approved decision to serve as a basis yet.");
    expect(html).not.toContain("Continue from this basis");
    expect(html).toContain("Send as an ordinary message");
  });
});
