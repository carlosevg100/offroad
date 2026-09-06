import type {ExecutionBriefNarrative} from "@offroad/work-plan";
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it} from "vitest";

import {ExecutionBriefActivity} from "./execution-brief-activity";

const base: ExecutionBriefNarrative["events"][number] = {
  eventKey: "a".repeat(64),
  position: 0,
  label: "Entender a companhia e o contexto",
  purpose: "Ler fontes públicas, separar fatos e registrar lacunas.",
  output: "Contexto confirmado para a análise",
  kind: "started",
  occurredAt: "2026-09-06T15:30:00.000Z",
  carriedForward: false,
};

describe("ExecutionBriefActivity", () => {
  it("narrates real work in the visible plan language", () => {
    const html = renderToStaticMarkup(<ExecutionBriefActivity active event={base} locale="pt-BR" />);
    expect(html).toContain("Trabalho iniciado");
    expect(html).toContain("Comecei “Entender a companhia e o contexto”");
    expect(html).toContain("Ler fontes públicas, separar fatos e registrar lacunas.");
    expect(html).toContain("class=\"lucide lucide-loader-circle spin\"");
    expect(html).not.toMatch(/TaskSpec|taskId|executor|provider|processing_job/);
  });

  it("marks inherited completion without pretending the work just ran", () => {
    const html = renderToStaticMarkup(<ExecutionBriefActivity
      active={false}
      event={{...base, kind: "completed", carriedForward: true}}
      locale="pt-BR"
    />);
    expect(html).toContain("Frente concluída");
    expect(html).toContain("já estava concluída e foi preservada nesta versão");
    expect(html).toContain("Resultado: Contexto confirmado para a análise");
    expect(html).not.toContain("Comecei");
  });

  it("distinguishes a user dependency from an execution issue", () => {
    const waiting = renderToStaticMarkup(<ExecutionBriefActivity active={false} event={{...base, kind: "waiting_user"}} locale="pt-BR" />);
    const attention = renderToStaticMarkup(<ExecutionBriefActivity active={false} event={{...base, kind: "needs_attention"}} locale="pt-BR" />);
    expect(waiting).toContain("Aguardando você");
    expect(waiting).toContain("aguarda uma informação sua");
    expect(attention).toContain("Requer atenção");
    expect(attention).toContain("precisa ser resolvido");
  });
});
