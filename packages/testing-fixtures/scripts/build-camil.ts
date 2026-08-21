/**
 * The one document in the Camil case that is not a public filing: the request.
 *
 * The two filings in `assets/camil` are real and public (ITR 1T26 and the 2026 AGOE management
 * proposal, both from CVM/RI). A listed company does not send a CFO letter to a platform, so
 * the transaction itself is simulated here, stated as such in the document's first line, and
 * dimensioned against what the filings show: R$ 1,23 bilhão of amortisation between June 2026
 * and May 2027, a 4,0x covenant tested in February, and a pro forma 4,72x at May 2026.
 *
 *   pnpm --filter @offroad/testing-fixtures camil
 */
import {createHash} from "node:crypto";
import {mkdirSync, writeFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

import {writeDocx, type DocxBlock} from "../src/fakeco/docx";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "assets", "camil");
mkdirSync(outDir, {recursive: true});

export const camilRequest = {
  amount: 1_500_000_000,
  termMonths: 84,
  graceMonths: 24,
  expectedRate: "CDI + 1,25% a.a.",
  uses: [
    {item: "Resgate antecipado das parcelas Jun/26 a Mai/27 (empréstimos bilaterais e CCBs)", amount: 1_229_828_000},
    {item: "Reforço de caixa para a safra 2026/27", amount: 270_172_000},
  ],
} as const;

const brl = (value: number) => `R$ ${value.toLocaleString("pt-BR", {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

const blocks: DocxBlock[] = [
  {kind: "heading", text: "Camil Alimentos S.A. – Diretoria Financeira e de Relações com Investidores"},
  {kind: "paragraph", text: "SIMULAÇÃO PARA TESTE DE PLATAFORMA. Este pedido é fictício e foi redigido para exercitar a análise de crédito sobre demonstrações públicas reais. Nenhuma operação aqui descrita foi proposta pela companhia."},
  {kind: "paragraph", text: "São Paulo, 10 de agosto de 2026."},
  {kind: "heading", text: "Pedido"},
  {kind: "paragraph", text: `A Camil Alimentos S.A. (CNPJ 64.904.295/0001-03) solicita a estruturação de uma captação de ${brl(camilRequest.amount)} (um bilhão e quinhentos milhões de reais), por meio de Certificados de Recebíveis do Agronegócio lastreados em debêntures de emissão da companhia, com prazo de ${camilRequest.termMonths} meses e carência de ${camilRequest.graceMonths} meses para amortização de principal.`},
  {kind: "paragraph", text: `A expectativa de custo é de ${camilRequest.expectedRate}, em linha com as últimas emissões da companhia em CDI (11ª emissão a CDI + 1,55%; 13ª emissão, 1ª série, a CDI + 0,65%).`},
  {kind: "heading", text: "Destinação dos recursos"},
  {kind: "table", rows: [["Item", "Valor"], ...camilRequest.uses.map((use) => [use.item, brl(use.amount)])]},
  {kind: "paragraph", text: "As parcelas a resgatar correspondem ao vencimento contratual consolidado de Jun/26 a Mai/27 informado na nota 15 das informações trimestrais de 31 de maio de 2026 (R$ 1.229.828 mil)."},
  {kind: "heading", text: "Racional"},
  {kind: "paragraph", text: "O endividamento bruto consolidado em 31 de maio de 2026 era de R$ 5.670.186 mil, com caixa e aplicações de R$ 1.455.809 mil. A alavancagem pro forma medida pela companhia era de 4,72x, acima do limite de 4,0x exigido nos principais instrumentos, cuja próxima medição ocorre com base nas demonstrações de 28 de fevereiro de 2027. A sazonalidade da safra concentra compra de matéria-prima no primeiro semestre fiscal e o caixa recompõe-se ao longo do ano."},
  {kind: "paragraph", text: "A operação alonga o perfil de vencimentos, substitui dívida bancária de curto prazo por dívida de mercado de capitais com carência e evita a pressão de refinanciamento no ano-safra 2026/27. A companhia está aberta a discutir covenant de alavancagem com escalonamento e a garantia quirografária usual de suas emissões."},
  {kind: "paragraph", text: "Atenciosamente, Flavio Vargas, Diretor Financeiro e de Relações com Investidores (personagem da simulação; não representa declaração da companhia)."},
];

const bytes = await writeDocx(blocks);
const name = "03_Pedido_Simulado_CRA_2026.docx";
writeFileSync(join(outDir, name), bytes);
console.log(`${name} ${bytes.byteLength} bytes sha256=${createHash("sha256").update(bytes).digest("hex")}`);
