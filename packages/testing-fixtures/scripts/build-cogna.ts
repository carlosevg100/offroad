/**
 * The one document in the Cogna case that is not a public filing: the request.
 *
 * The release in `assets/cogna` is real and public (2T26 earnings release, August 2026). A
 * listed company does not send a CFO letter to a platform, so the transaction is simulated,
 * says so in its first line, and is dimensioned against what the release shows: R$ 2,14 bilhões
 * of amortisation in 2028, a weighted cost of CDI + 1,59%, and leverage of 1,10x against the
 * debenture covenants.
 *
 *   pnpm --filter @offroad/testing-fixtures cogna
 */
import {createHash} from "node:crypto";
import {mkdirSync, writeFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

import {writeDocx, type DocxBlock} from "../src/fakeco/docx";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "assets", "cogna");
mkdirSync(outDir, {recursive: true});

export const cognaRequest = {
  amount: 1_800_000_000,
  termMonths: 84,
  graceMonths: 36,
  expectedRate: "CDI + 1,40% a.a.",
  refinancing: 2_140_000_000,
  uses: [
    {item: "Resgate antecipado das debêntures com vencimento em 2028", amount: 1_800_000_000},
  ],
} as const;

const brl = (value: number) => `R$ ${value.toLocaleString("pt-BR", {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

const blocks: DocxBlock[] = [
  {kind: "heading", text: "Cogna Educação S.A. – Diretoria Financeira e de Relações com Investidores"},
  {kind: "paragraph", text: "SIMULAÇÃO PARA TESTE DE PLATAFORMA. Este pedido é fictício e foi redigido para exercitar a análise de crédito sobre um release de resultados público real. Nenhuma operação aqui descrita foi proposta pela companhia."},
  {kind: "paragraph", text: "São Paulo, 20 de agosto de 2026."},
  {kind: "heading", text: "Pedido"},
  {kind: "paragraph", text: `A Cogna Educação S.A. solicita a estruturação de uma emissão de debêntures simples, não conversíveis, no montante de ${brl(cognaRequest.amount)} (um bilhão e oitocentos milhões de reais), prazo de ${cognaRequest.termMonths} meses e carência de ${cognaRequest.graceMonths} meses para amortização de principal, com remuneração alvo de ${cognaRequest.expectedRate}.`},
  {kind: "heading", text: "Destinação dos recursos"},
  {kind: "table", rows: [["Item", "Valor"], ...cognaRequest.uses.map((use) => [use.item, brl(use.amount)])]},
  {kind: "paragraph", text: `O cronograma de amortização divulgado no release do 2T26 concentra R$ 2.140 milhões em 2028. A emissão resgata a maior parte dessa parcela e desloca o pico de vencimentos para 2031 em diante, preservando a duration média acima de 36 meses.`},
  {kind: "heading", text: "Racional"},
  {kind: "paragraph", text: "Ao final do 2T26 a dívida líquida consolidada era de R$ 2.775,4 milhões e a alavancagem, apurada conforme as escrituras (dívida líquida sobre EBITDA ajustado dos últimos doze meses), era de 1,10x, contra 1,22x no 2T25. O custo médio ponderado da dívida era de CDI + 1,59% com duration de 29 meses. A operação não aumenta a dívida bruta de forma relevante: é troca de passivo com alongamento."},
  {kind: "paragraph", text: "A companhia está aberta a discutir covenant de alavancagem em linha com as escrituras vigentes (dívida líquida sobre EBITDA ajustado) e garantia quirografária, como nas emissões anteriores."},
  {kind: "paragraph", text: "Atenciosamente, Frederico Villa, Diretor Financeiro (personagem da simulação; não representa declaração da companhia)."},
];

const bytes = await writeDocx(blocks);
const name = "02_Pedido_Simulado_Debentures_2026.docx";
writeFileSync(join(outDir, name), bytes);
console.log(`${name} ${bytes.byteLength} bytes sha256=${createHash("sha256").update(bytes).digest("hex")}`);
