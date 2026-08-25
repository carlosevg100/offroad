# Revisão técnica do House Playbook v2

Data: 25/08/2026

Fonte promovida: `packages/credit-playbook/knowledge/HOUSE-PLAYBOOK-COMPLETO-v2.md`

Versão editorial: v2.1 governado

## 1. Veredito executivo

O v2 é substancialmente melhor que o v1. Intake, leitura da companhia, qualidade dos números,
operação, estruturação, materiais e mercado passaram de listas de experiência para métodos com
mais passos, verificações e produtos explícitos.

O rótulo original "completo e executável" ainda não era verdadeiro. O arquivo misturava tipos
diferentes de conhecimento e prometia que todas as 270 entradas possuíam o mesmo contrato, quando
isso não ocorria. Havia ainda regras técnicas perigosas, números fixos no texto, referências de
etapa não definidas, confusão entre FIDC e carteira, e atividades pós-introdução descritas como se
fossem runtime atual.

A versão corrigida é agora a fonte editorial canônica. Ela não é executada diretamente e não
promove nenhuma entrada automaticamente. Cada unidade será compilada segundo sua natureza e
continuará bloqueada até satisfazer contrato, dados de referência, testes, revisão e fronteira.

## 2. Evidência objetiva da evolução

| Medida | v1 | v2 recebido | v2.1 corrigido |
|---|---:|---:|---:|
| Linhas | 1.661 | 1.971 | 2.112 |
| Bytes | 102.507 | 157.685 | 181.206 |
| Entradas | 270 | 270 | 270 |
| IDs duplicados | 0 | 0 | 0 |
| Referências internas quebradas | 0 | 0 | 0 |
| Entradas com `Autoridade` explícita | 16 | 255 | 270 |
| Entradas com `Executa` explícito | 0 | 206 | 221 |
| Entradas com `Verificação` explícita | 0 | 193 | 208 |
| Entradas com `Saída` explícita | 0 | 190 | 205 |
| Entradas com `A jusante` explícito | 12 | 205 | 220 |
| Referências legadas `E##` | 5 tipos | 6 tipos | 0 |
| Travessões | 0 | 0 | 0 |

As colunas de forma não são uma régua universal. Uma lente setorial, um cálculo, um fragmento de
template e uma regra de conduta exigem contratos diferentes. A correção importante foi retirar a
alegação de uniformidade e preservar a taxonomia de formas executáveis.

## 3. Correções materiais incorporadas

### 3.1 Uma fonte canônica, execução compilada

O playbook passa a declarar que é fonte governada, não prompt nem skill. Papéis continuam
namespaces de responsabilidade. Ordem, estado, retry, orçamento e gates pertencem ao pipeline
determinístico.

### 3.2 Elegibilidade jurídica não nasce de atalho textual

Foram retiradas frases de atalho como "ltda fecha debênture" e "bem usado fecha portas".
Natureza jurídica, ativo, finalidade e veículo alimentam um catálogo vigente com fonte oficial,
validade e revisão especializada. Isso não elimina restrições legais atuais. Sob a Lei 6.404,
por exemplo, uma sociedade limitada não emite debênture sem antes se transformar em sociedade
anônima. A diferença é que a conclusão vem do catálogo jurídico versionado e não de uma regra
solta ou de gosto comercial.

### 3.3 Intake sem conclusão automática por um único número

A hipótese de operação de liquidez agora depende de base reconciliada, decomposição do déficit,
política versionada e conversa registrada. Cobertura abaixo de um piso não altera silenciosamente
o arquétipo.

### 3.4 Dados pessoais e integridade

Dependência de pessoa-chave passou a olhar função, sucessão, delegação e continuidade, sem inferir
saúde ou longevidade por idade. Background checks exigem finalidade, fonte permitida, confirmação
de identidade, contraditório, controle de acesso e decisão humana.

### 3.5 CFADS e ponte de caixa completos

`Q-02` passou a exigir:

1. EBITDA mesa e itens sem efeito caixa;
2. imposto efetivamente pago;
3. capital de giro por conta;
4. capex de manutenção e compromissos mínimos;
5. convenção consistente de arrendamento;
6. caixa restrito, distribuições e fluxos fora do perímetro;
7. reconciliação com balanço, DFC, serviço, investimento e financiamento;
8. período, entidade, moeda, cenário, fonte e confiança.

### 3.6 Capex de manutenção sem proxy universal

`Q-03` não usa mais depreciação como piso. O método considera registro de ativos, idade,
utilização, reposição, manutenção, engenharia, inflação, leasing, software e capex represado.
Ausência de dado produz faixa e cenário, não precisão falsa.

### 3.7 Concentração como cenário, não equivalência de crédito

Percentuais automáticos saíram de `EMP-03` e `Q-06`. A leitura agora combina contrato,
qualidade, substituibilidade, margem, prazo, dependência mútua e cenário de redução ou perda.

### 3.8 Debt ledger e múltiplas visões

`D-17` a `D-31` foram reescritos no nível operacional. `D-24` agora cria um ledger único e
visões reconciliadas:

1. dívida financeira bruta e líquida;
2. dívida conforme cada covenant;
3. obrigações de caixa para capacidade;
4. quase dívida;
5. contingências e exposições fora de balanço;
6. visão específica por instrumento ou financiador.

Arrendamento, risco sacado, cessão, parcelamento, earn-out e provisão exigem regra de inclusão,
finalidade e prevenção de dupla contagem.

### 3.9 FIDC separado de ativo, documento e mecanismo

O playbook agora separa:

1. direito creditório;
2. documento da obrigação;
3. cessão, financiamento ou securitização;
4. veículo, como FIDC;
5. gestor, administrador, custodiante, registradora e servicer;
6. investidor e mandato.

Retenção subordinada é medida por coobrigação, recompra, first loss, suporte de liquidez,
consolidação e perda máxima retida. A mera existência de cota subordinada não soma toda a carteira
à dívida.

### 3.10 Cenários de juros sem choque fixo eterno

`D-27` deixou de impor `+300 bps`. Cenários passam a ser dados versionados por regime,
indexador, curva, moeda e exposição, com fonte, validade e dono.

### 3.11 Pricing com abstenção real

Amostra, recência, comparabilidade, pesos e largura de banda foram retirados do texto fixo. Célula
insuficiente responde "sem referência confiável". O sistema não extrapola ou cria preço para
preencher material.

### 3.12 QC de material não é parecer

`MA-32` libera uma versão específica por consistência, claims, revisão técnica e autorização da
companhia. Não aprova crédito, não recomenda investimento e não compromete capital.

### 3.13 Fronteira pós-introdução explícita

`MK-19` a `MK-28` foram marcados como referência futura e não executável no produto atual. NDA,
competição, negociação final, book, alocação, closing e monitoramento exigem nova decisão de
produto e controles próprios. A runtime atual termina na introdução qualificada autorizada.

Procedimentos anteriores à introdução também deixaram de depender dessa camada futura. Sizing,
pricing, definições, intercreditor, materiais e matching agora terminam em análise, desenho
indicativo, autorização e introdução. O catálogo testa que nenhuma unidade de runtime atual
referencia `MK-19` a `MK-28`.

## 4. O que ainda não deve ser chamado de production

1. As 270 entradas continuam `readyToCompile: false` como fonte.
2. As 20 unidades da vertical expansão e capex continuam `candidate`.
3. Parâmetros de mercado, política, cenários e elegibilidade permanecem bloqueados enquanto não
   tiverem fonte, valor, data, validade e dono.
4. Templates de teaser, memo e term sheet precisam ser fechados junto das respectivas unidades.
5. Promoção requer unitários, integração, gold, adversarial, revisão independente, revisão de
   template e revisão jurídica quando aplicável.
6. Nenhum LLM decide sequência, altera um cálculo ou preenche evidência ausente.

## 5. Ordem de aprofundamento recomendada

1. M10, controles transversais e linguagem.
2. M0, intake, suficiência e próxima melhor solicitação.
3. M2 e M3, base financeira, ledger e cálculos.
4. M4 e M5, operação, capacidade e alternativas.
5. M7, templates e auditoria de materiais.
6. M9, red flags e apresentabilidade.
7. M1, lentes necessárias aos gold cases.
8. M6 e M8, pricing, mandato e introdução.

A régua não é quantidade de procedimentos escritos. É uma vertical que atravessa casos limpos,
sujos, negativos, multi-entidade e bilíngues sem inventar fatos, sem quebrar identidades e sem
ultrapassar a fronteira da Offroad.

## 6. Fontes oficiais que exigem governança

Afirmações legais e contábeis partem de fonte oficial e ainda exigem revisão especializada no uso:

1. Lei 6.404 compilada:
   https://www.planalto.gov.br/ccivil_03/leis/l6404compilada.htm
2. Lei 14.430:
   https://planalto.gov.br/ccivil_03/_ato2019-2022/2022/lei/l14430.htm
3. Resolução CVM 175 consolidada:
   https://conteudo.cvm.gov.br/legislacao/resolucoes/resol175.html
4. Resolução CVM 240, ajuste de março de 2026 no Anexo II sobre FIDC:
   https://www.gov.br/cvm/pt-br/assuntos/noticias/2026/cvm-edita-norma-com-ajustes-pontuais-no-anexo-ii-da-resolucao-175-sobre-fidc/
5. CPC 06 (R2):
   https://www.cpc.org.br/CPC/Documentos-emitidos/Pronunciamentos/Pronunciamento?Id=37

## 7. Decisão

O v2 corrigido substitui o v1 como fonte editorial canônica. O v1 permanece no repositório como
snapshot histórico. A promoção do conhecimento para runtime continua individual, versionada e
comprovada por procedimento e por caso.

## 8. Validação executada

1. SHA-256 da fonte: `fa985fe9c8ffc5e3d0853a112dde34904d86b0daad0c8fd540705f17c69f9fb6`.
2. Testes do playbook: 107 aprovados.
3. Testes de evals: 32 aprovados.
4. `pnpm check` com Node 24.19.0 aprovado nos 38 pacotes do Turbo.
5. Lint, typecheck, todos os testes e build de produção aprovados.
6. Build web gerou 30 páginas e rotas estáticas ou dinâmicas sem erro.
