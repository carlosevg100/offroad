# Especificação canônica da vertical de recebíveis

Versão: `2026.08.27-v1`

Este documento resolve as ambiguidades entre os materiais da vertical e é a fonte
canônica para implementação. Os demais documentos continuam sendo manuais de mesa,
pesquisa e treinamento. Quando houver conflito, esta especificação prevalece até que
uma nova versão seja aprovada.

## 1. Mandato e lado da mesa

A Offroad representa a companhia ou o assessor por ela autorizado. Analisa a
companhia, a carteira e a operação, propõe alternativas, prepara materiais e conduz
introduções autorizadas. Não administra FIDC, não compromete capital, não substitui a
análise do financiador e não emite parecer de aprovação de crédito.

O instrumento e a porta de financiamento são resultados da análise. Nunca são
tratados como escolha técnica obrigatória no início do intake.

## 2. Unidade de especialização

A unidade é a **célula**, formada por `categoria de recebível × porta de
financiamento`. Uma companhia pode ter mais de uma categoria e a recomendação pode
combinar mais de uma célula. A classificação é, portanto, multilabel.

A matriz possui **39 células sustentáveis**. As oito células core, na ordem de
construção, são:

1. A1 · venda mercantil B2B × FIDC multicedente
2. E1 · cartão e adquirente × FIDC multicedente
3. B2 · fornecedor de grande grupo × risco sacado
4. C1 · serviço a PJ × FIDC multicedente
5. L1 · carteira de crédito originada × FIDC multicedente
6. D4 · contrato recorrente × securitizadora
7. G4 · mensalidade contra PF × securitizadora
8. J3 · obra e medição × gestora de crédito

O banco mínimo contém 12 casos por célula core e seis por célula não core: 282
casos. Casos adicionais, como os 20 já especificados para A1, são mantidos como
cobertura incremental e não alteram o mínimo das demais células.

## 3. Arquitetura em cinco camadas

| Camada | Responsabilidade | Executor |
|---|---|---|
| 1. Classificação | Identificar categorias e células candidatas | Modelo com catálogo fechado e saída estruturada |
| 2. Cálculo | Produzir métricas financeiras e operacionais | Código determinístico no `financial-core` |
| 3. Elegibilidade | Aplicar regras versionadas nos escopos corretos | Código determinístico |
| 4. Recomendação | Comparar alternativas, condicionantes e ajustes | Chamada de modelo restrita às saídas 1 a 3 |
| 5. Materiais | Redigir saídas padronizadas por destinatário | Templates versionados e chamada de modelo restrita |

Papéis de análise são namespaces de procedimentos e passes de revisão. Não são
agentes autônomos conversando entre si. A execução permanece um pipeline
determinístico, auditável e reprodutível.

`packages/receivables-analysis` é a camada de orquestração, não uma segunda fonte de
matemática. O estado anterior à presente especificação está auditado em
[`CURRENT-STATE-AUDIT.md`](CURRENT-STATE-AUDIT.md). Seus cálculos locais precisam ser
migrados para o `financial-core` antes de promoção.

## 4. Datas canônicas

Toda análise declara separadamente:

- `reporting_date`: data de corte escolhida para o relatório e para a posição em
  aberto;
- `latest_origination_date`: emissão mais recente presente na base;
- `data_start_date`: início do histórico efetivamente analisado;
- `data_end_date`: fim do histórico efetivamente analisado.

`reporting_date` nunca é inferida silenciosamente da última emissão. Quando uma
métrica precisar da última emissão, ela usa `latest_origination_date` explicitamente.
O caso Vertentes precisa registrar 28/06/2026 como última emissão e 30/06/2026 como
data de relatório, se essas duas datas forem confirmadas pelo gerador e pelo acervo.

## 5. Universo e aging

Uma métrica sempre declara universo, data de corte, inclusões e exclusões. O aging
canônico usa dias corridos desde o vencimento na `reporting_date`:

| Código | Regra |
|---|---|
| `not_due` | dias em atraso ≤ 0 |
| `past_due_1_15` | 1 a 15 |
| `past_due_16_30` | 16 a 30 |
| `past_due_31_60` | 31 a 60 |
| `past_due_61_90` | 61 a 90 |
| `past_due_91_180` | 91 a 180 |
| `past_due_over_180` | acima de 180 |

Prorrogação não apaga o vencimento original. O sistema preserva vencimento original,
vencimento vigente e eventos de extensão para produzir as duas leituras quando
necessário.

Cada família de eventos de performance e cessão declara cobertura `complete`, `partial` ou
`not_provided`, com intervalo, base e limitações. Array vazio só significa zero quando
a cobertura é completa; nos demais estados significa ausência ou insuficiência de
evidência.

Roll rate mensal parte da exposição bruta ainda não resolvida em cada faixa no fim do
mês e reconcilia 100% desse saldo com a faixa do mês seguinte ou `resolved`. Usa o
vencimento original. Safra usa o mês de emissão e mede a exposição ainda não resolvida
em 30, 60, 90, 120, 180 e 360 dias após o vencimento original. É uma curva de não
pagamento e deve ser monotonicamente não crescente; não é chamada de perda realizada.
Write-off só existe como série quando a data do evento de baixa foi fornecida.

## 6. Procedência

Toda afirmação numérica ou normativa é `[M]` medida, `[C]` citada ou `[E]` estimada.
`Desconhecido` e `não avaliado` são estados de decisão, não uma quarta classe de
afirmação.

### Medido

Carrega hash do dataset, âncoras de origem, universo, data de corte, exclusões,
fórmula e versão. Quando aplicável, carrega numerador, denominador, unidade e regra de
arredondamento.

### Citado

Carrega documento ou URL, hash quando disponível, página, cláusula ou parágrafo,
data de vigência, data de consulta e status da fonte.

### Estimado

Carrega método, conjunto de fontes, data-base, responsável, nível de confiança e
validade. Estimativa não decide elegibilidade rígida e não pode ser apresentada como
cotação ou política confirmada.

## 7. Escopos das regras de elegibilidade

Cada regra declara exatamente um escopo e o denominador que utiliza:

- título;
- sacado;
- grupo econômico;
- carteira;
- cedente;
- veículo;
- classe ou subclasse;
- operacional ou jurídico;
- mandato e capacidade atual.

O sistema não compara concentração na carteira do cedente com limite expresso como
percentual do PL do fundo. Quando o denominador necessário não estiver disponível, a
regra retorna `não avaliado`.

## 8. Estados de aderência ao comprador

O resultado não é um booleano único. Os estados permitidos são:

1. `technically_eligible`: atende critérios regulatórios e estruturais citados;
2. `policy_fit_confirmed`: política do comprador confirmada e atendida;
3. `live_appetite_confirmed`: apetite e capacidade atuais confirmados;
4. `conditionally_eligible`: depende de ajuste ou condição explícita;
5. `not_evaluated`: evidência ou denominador insuficiente;
6. `ineligible`: viola regra citada, com motivo e âncora.

Uma fonte pública pode comprovar elegibilidade normativa. Não comprova, por si só,
política interna, capacidade disponível ou apetite atual.

## 9. Diretório normalizado de mercado

O diretório separa:

- instituição ou grupo;
- entidade legal e CNPJ;
- gestora;
- fundo ou veículo;
- classe e subclasse;
- administrador e custodiante;
- mandato;
- contatos e responsabilidades;
- fonte, data, validade, responsável e status.

Tickets, pricing, tempos de aprovação e apetite descritos em prosa são hipóteses de
pesquisa até serem promovidos ao registro governado de referências. Nenhuma lista é
chamada de exaustiva sem cobertura, data de corte e processo de atualização.

## 10. Economia das alternativas

Limiares fixos de volume não decidem isoladamente se um FIDC dedicado, uma cessão
bilateral ou outra estrutura é viável. A comparação considera, no mínimo, volume
mensal de cessão, prazo médio, carteira média, custo fixo, subordinação retida,
número de sacados, complexidade operacional e economia líquida para a companhia.

A empresa é cedente em um FIDC multicedente. Seu ticket é limite ou volume de cessão,
não valor de cota. Desreconhecimento contábil depende da transferência de riscos e
benefícios e da análise aplicável, nunca apenas do nome do instrumento.

## 11. Gate da Fase 1

A calculadora A1 somente é aprovada quando:

- todas as métricas definidas têm gabarito completo e igualdade determinística;
- 100% dos números carregam procedência;
- aging, concentração e elegibilidade preservam escopo e denominador;
- dados ausentes geram alerta ou abstenção, nunca preenchimento silencioso;
- o replay do mesmo caso produz saída idêntica;
- testes de fronteira e invariantes passam;
- o conjunto de testes existente no repositório permanece verde.
