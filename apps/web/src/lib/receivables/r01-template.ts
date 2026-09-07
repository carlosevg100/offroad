import {receivablesDocumentSupplementContract} from "@offroad/receivables-analysis";
import * as XLSX from "xlsx";

type Locale = "pt-BR" | "en-US";

const descriptions: Record<string, {pt: string; en: string; format: string}> = {
  CEDENTE_ID: {pt: "Identificador estável do cedente", en: "Stable cedent identifier", format: "texto / text"},
  RAZAO_SOCIAL: {pt: "Razão social do titular dos créditos", en: "Legal name of the receivables owner", format: "texto / text"},
  PAPEL_SERVICING: {pt: "Quem administra e cobra a carteira", en: "Who services and collects the pool", format: "cedente | terceiro | compartilhado"},
  NUM_TITULO: {pt: "Identificador único do título", en: "Unique receivable identifier", format: "texto / text"},
  CNPJ_SACADO: {pt: "CNPJ do devedor", en: "Obligor tax ID", format: "14 dígitos"},
  NOME_SACADO: {pt: "Nome ou razão social do devedor", en: "Obligor legal or trading name", format: "texto / text"},
  DT_EMISSAO: {pt: "Data de emissão", en: "Issue date", format: "AAAA-MM-DD"},
  DT_VENCIMENTO: {pt: "Vencimento atual", en: "Current due date", format: "AAAA-MM-DD"},
  VLR_TITULO: {pt: "Valor original", en: "Original face amount", format: "número não negativo"},
  SITUACAO: {pt: "Situação atual do título", en: "Current receivable status", format: "aberto | liquidado | cancelado | recomprado | perda"},
  DT_PAGAMENTO: {pt: "Data do pagamento, se liquidado", en: "Payment date, when settled", format: "AAAA-MM-DD ou vazio"},
  VLR_PAGO: {pt: "Valor já pago", en: "Amount paid to date", format: "número não negativo"},
  SETOR_SACADO: {pt: "Setor econômico do devedor", en: "Obligor economic sector", format: "texto / text"},
  VLR_RECEBIDO_PERIODO: {pt: "Recebimentos no período analisado", en: "Collections during the analysis period", format: "número não negativo"},
  SALDO_INADIMPLENTE: {pt: "Saldo inadimplente na data-base", en: "Defaulted balance at the reporting date", format: "número não negativo"},
  RECUPERADO_PERIODO: {pt: "Recuperações no período", en: "Recoveries during the period", format: "número não negativo"},
  DILUICAO_PERIODO: {pt: "Devoluções, descontos e outras diluições", en: "Returns, discounts and other dilutions", format: "número não negativo"},
  RECOMPRA_PERIODO: {pt: "Recompras no período", en: "Repurchases during the period", format: "número não negativo"},
  SUBSTITUICAO_PERIODO: {pt: "Substituições no período", en: "Substitutions during the period", format: "número não negativo"},
  CEDIVEL: {pt: "O título pode ser cedido?", en: "Is the receivable assignable?", format: "sim | não"},
  LASTRO_VERIFICADO: {pt: "O lastro foi verificado?", en: "Was supporting evidence verified?", format: "sim | não"},
  REGISTRO: {pt: "Situação do registro", en: "Registration status", format: "registrado | não aplicável | ausente | conflito"},
  ONUS: {pt: "Situação de ônus ou cessão prévia", en: "Lien or prior-assignment status", format: "livre | penhorado | cedido | desconhecido"},
  DISPUTADO: {pt: "Há disputa sobre o título?", en: "Is the receivable disputed?", format: "sim | não"},
  PARTE_RELACIONADA: {pt: "O devedor é parte relacionada?", en: "Is the obligor a related party?", format: "sim | não"},
  ID_RECEBIMENTO: {pt: "Identificador único do recebimento", en: "Unique receipt identifier", format: "texto / text"},
  DATA_RECEBIMENTO: {pt: "Data do recebimento", en: "Receipt date", format: "AAAA-MM-DD"},
  VALOR_RECEBIMENTO: {pt: "Valor recebido", en: "Receipt amount", format: "número não negativo"},
  CONTA_VINCULADA: {pt: "O valor transitou pela conta vinculada?", en: "Did cash flow through the linked account?", format: "sim | não"},
  DUPLICADO_DE: {pt: "ID do recebimento original, se duplicado", en: "Original receipt ID, if duplicated", format: "texto ou vazio"},
  SALDO_CONTAS_A_RECEBER: {pt: "Saldo bruto contábil de contas a receber", en: "Gross accounting receivables balance", format: "número não negativo"},
  PROVISAO: {pt: "Saldo da provisão na mesma data-base", en: "Allowance balance at the same reporting date", format: "número não negativo"},
  RECEBIMENTOS_PERIODO: {pt: "Recebimentos reconhecidos contabilmente no período", en: "Accounting collections during the period", format: "número não negativo"},
};

function appendSheet(workbook: XLSX.WorkBook, name: string, headers: readonly string[]) {
  const sheet = XLSX.utils.aoa_to_sheet([[...headers]]);
  sheet["!cols"] = headers.map((header) => ({wch: Math.max(16, Math.min(30, header.length + 3))}));
  XLSX.utils.book_append_sheet(workbook, sheet, name);
}

export function buildReceivablesR01Template(locale: Locale): ArrayBuffer {
  const english = locale === "en-US";
  const contract = receivablesDocumentSupplementContract;
  const workbook = XLSX.utils.book_new();
  workbook.Props = {
    Title: english ? "Offroad R01 receivables input" : "Offroad R01 — dados de recebíveis",
    Subject: `R01 ${contract.version}`,
    Author: "Offroad Capital",
  };
  const allFields = [...new Set([
    ...contract.sheets.cedent.requiredHeaders,
    ...contract.sheets.titles.sourceHeaders,
    ...contract.sheets.titles.requiredHeaders,
    ...contract.sheets.cashReceipts.requiredHeaders,
    ...contract.sheets.accounting.requiredHeaders,
  ])];
  const readme = XLSX.utils.aoa_to_sheet([
    [english ? "Offroad R01 — guided receivables input" : "Offroad R01 — entrada guiada de recebíveis"],
    [english ? "Purpose" : "Objetivo", english ? "Organize the minimum evidence used to reconcile and test a receivables pool. This template does not replace contracts, bank statements or supporting evidence." : "Organizar a evidência mínima usada para conciliar e testar uma carteira de recebíveis. O modelo não substitui contratos, extratos ou documentos de lastro."],
    [english ? "How to use" : "Como usar", english ? "Keep sheet and column names unchanged. Use one row per receivable or receipt. Leave a cell blank when the information is unknown; never enter zero merely because data is missing." : "Mantenha os nomes das abas e colunas. Use uma linha por título ou recebimento. Deixe a célula vazia quando não souber; nunca informe zero apenas porque o dado não foi entregue."],
    [english ? "Reporting date" : "Data-base", english ? "Use one consistent reporting date across the pool, accounting and cash files." : "Use a mesma data-base para carteira, contabilidade e caixa."],
    [english ? "Privacy" : "Privacidade", english ? "Upload the completed file only inside the corresponding private Offroad project." : "Envie o arquivo preenchido apenas dentro do projeto privado correspondente na Offroad."],
    [],
    [english ? "FIELD" : "CAMPO", english ? "MEANING" : "SIGNIFICADO", english ? "FORMAT" : "FORMATO"],
    ...allFields.map((field) => [field, english ? descriptions[field]?.en ?? "" : descriptions[field]?.pt ?? "", descriptions[field]?.format ?? ""]),
  ]);
  readme["!cols"] = [{wch: 32}, {wch: 72}, {wch: 42}];
  XLSX.utils.book_append_sheet(workbook, readme, "LEIA-ME");

  appendSheet(workbook, contract.sheets.cedent.name, contract.sheets.cedent.requiredHeaders);
  appendSheet(workbook, contract.sheets.titles.name, [...new Set([...contract.sheets.titles.sourceHeaders, ...contract.sheets.titles.requiredHeaders])]);
  appendSheet(workbook, contract.sheets.cashReceipts.name, contract.sheets.cashReceipts.requiredHeaders);
  appendSheet(workbook, contract.sheets.accounting.name, contract.sheets.accounting.requiredHeaders);
  return XLSX.write(workbook, {bookType: "xlsx", type: "array"}) as ArrayBuffer;
}
