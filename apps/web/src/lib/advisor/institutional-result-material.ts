import {auditCompiledMaterial, institutionalFinancialModelMaterial, type Material} from "@offroad/case-materials";
import {buildInstitutionalFinancialModel, type InstitutionalWorkbookArtifact} from "@offroad/financial-model";

/** Display-only appendices from the same verified snapshot used for workbook replay. */
export function institutionalResultMaterial(artifact: InstitutionalWorkbookArtifact, lang: "pt" | "en"): Material {
  const label = (pt: string, en: string) => ({pt, en});
  const material = institutionalFinancialModelMaterial({lang, artifactFingerprint: artifact.fingerprint, supportIds: artifact.supportIds,
    scenarios: artifact.institutional.scenarios.map(scenario => ({name: scenario.input.assumptionBook.scenarioName, currency: scenario.input.currency, periods: buildInstitutionalFinancialModel(scenario.input).periods})),
  });
  const appendices: Material["blocks"] = artifact.institutional.scenarios.flatMap(scenario => [
    {type: "heading" as const, text: label(`${scenario.input.assumptionBook.scenarioName} · Premissas aprovadas`, `${scenario.input.assumptionBook.scenarioName} · Approved assumptions`)},
    {type: "paragraph" as const, text: label("Valores exatos da revisão aprovada. Percentuais são frações decimais: 0,5 corresponde a 50%. Valores monetários usam a moeda do cenário, em unidades.", "Exact values from the approved review. Percentages are decimal fractions: 0.5 means 50%. Monetary values use the scenario currency, in units.")},
    {type: "table" as const, caption: label("Premissas e justificativas", "Assumptions and rationales"),
      head: [label("Premissa", "Assumption"), label("Unidade", "Unit"), label("Período", "Period"), label("Valor exato", "Exact value"), label("Justificativa", "Rationale")],
      rows: scenario.input.assumptionBook.assumptions.flatMap(assumption => Object.entries(assumption.values).map(([period, value]) => [assumption.label[lang], assumption.unit, period, value, assumption.rationale])),
    },
    {type: "heading" as const, text: label("Fontes revisadas", "Reviewed sources")},
    ...scenario.sourceBindings.map((source, index) => ({type: "kv" as const, caption: label(`Fonte ${index + 1}`, `Source ${index + 1}`), rows: [
      {label: label("Documento e versão", "Document and version"), value: label(`${source.sourceDocument} · ${source.version}`, `${source.sourceDocument} · ${source.version}`)},
      {label: label("Data-base", "As of"), value: label(source.asOfDate, source.asOfDate)},
      {label: label("Moeda e escala revisadas", "Reviewed currency and scale"), value: label(`${source.currency} · unidades`, `${source.currency} · units`)},
      {label: label("Evidência dos metadados", "Metadata evidence"), value: label(source.metadataEvidence.locator, source.metadataEvidence.locator), note: label(source.metadataEvidence.rationale, source.metadataEvidence.rationale)},
      {label: label("Revisão", "Review"), value: label(source.reviewedAt, source.reviewedAt), note: label(source.reviewedBy, source.reviewedBy)},
      {label: label("SHA-256", "SHA-256"), value: label(source.hash, source.hash)},
    ]})),
    {type: "table" as const, caption: label("Conciliação dos históricos", "Historical input reconciliation"),
      head: [label("Destino", "Target"), label("Perímetro", "Entity scope"), label("Período", "Period"), label("Valor exato", "Exact value"), label("Documento, versão e localizador", "Document, version and locator")],
      rows: scenario.lineage.map(line => {
        const sourceIndex = scenario.sourceBindings.findIndex(source => source.sourceDocument === line.sourceDocument && source.version === line.sourceVersion && source.hash === line.sourceHash);
        const source = sourceIndex >= 0 ? `${lang === "pt" ? "Fonte" : "Source"} ${sourceIndex + 1}` : `${line.sourceDocument} · ${line.sourceVersion}`;
        const anchor = line.anchor && typeof line.anchor === "object" && !Array.isArray(line.anchor) ? line.anchor as Record<string, unknown> : null;
        const locator = anchor && Object.keys(anchor).every(key => key === "sheet" || key === "cell") && typeof anchor.sheet === "string" && typeof anchor.cell === "string"
          ? `${anchor.sheet} · ${anchor.cell}` : JSON.stringify(line.anchor);
        return [line.targetPath, `${line.entityName} / ${line.entityScope}`, line.periodStart ? `${line.periodStart} - ${line.periodEnd}` : line.periodEnd, line.value, `${source} · ${locator}`];
      }),
    },
    {type: "kv" as const, caption: label("Registro da aprovação", "Approval record"), rows: [
      {label: label("Configuração", "Configuration"), value: label(scenario.configurationId, scenario.configurationId)},
      {label: label("Revisão", "Review"), value: label(`${scenario.revision} · ${scenario.reviewedAt}`, `${scenario.revision} · ${scenario.reviewedAt}`), note: label(scenario.reviewedBy, scenario.reviewedBy)},
      {label: label("Identificador da configuração", "Configuration fingerprint"), value: label(scenario.configurationFingerprint, scenario.configurationFingerprint)},
      {label: label("Identificador do resultado", "Output fingerprint"), value: label(scenario.outputFingerprint, scenario.outputFingerprint)},
    ]},
  ]);
  const blocks = [...material.blocks.slice(0, -1), ...appendices, ...material.blocks.slice(-1)];
  const output = {...material, blocks};
  // Appendices preserve the approved values and evidence without rewriting the snapshot.
  return {...output, conductAudit: auditCompiledMaterial(output)};
}
