# M2: primeira série pública de ponta a ponta (ADR 0023)

Estado em 21/10/2026: fundação (PR #924) e job de aquisição (PR #925) em produção, transporte fechado.
O gate de série (PR #926) tirou o CDI do caminho aberto. Este plano fixa as decisões de desenho do M2
antes do código, depois da primeira rodada da revisão independente. Cada parte é uma PR com migração,
os testes nomeados abaixo, revisão independente, prova em staging e produção, manifesto e catálogo.

## Objeto, unidade e consumidor

**Primeira série: meta Selic definida pelo Copom (SGS 432).** Licença `odc-odbl` no catálogo do Banco
Central (evidência `bcb-catalog-meta-selic-432`), valor publicado em percentual ao ano, um valor por
dia corrido que muda nas reuniões do Copom. Ela tem consumidor econômico hoje: a meta Selic que a
referência de precificação da casa carrega fixa no código (`selicTargetPct` e `selicTargetSince` em
`packages/credit-playbook/src/reference-data-proposals/pricing-market.ts`). O M2 troca esse número fixo
pelo objeto de mercado datado, com fonte e atribuição. A segunda série é a Selic acumulada no mês
anualizada base 252 (SGS 4189, `odc-odbl`), que a calibração dos cenários da casa já usa. A Selic diária
em percentual ao dia (SGS 11) fica fora do M2: não tem consumidor e exige unidade e convenção próprias.

Cada série é um contrato fechado na revisão da fonte: código SGS, endpoint, parâmetros, unidade
(`percent_per_year`), escala, convenção (`meta_copom` ou `acumulada_mes_anualizada_252`), parser,
identidade lógica e evidência de licença. A URL é construída pelo banco a partir desse contrato; o
enfileiramento não recebe URL livre. Uma URL de outra série no mesmo host é recusada (teste: CDI 12 e
4389 em `api.bcb.gov.br` sob a fonte da meta Selic). A evidência antiga `bcb-open-data` não serve de
licença para nenhuma série.

A outra correção do mesmo arquivo de referência fica registrada para o fundador: ele cita o CDI da série
4389 como fonte, e o CDI não tem licença aberta.

## Decisões de desenho

1. **Disponibilidade sem retroatividade.** `available_at` só usa base comprovada. Sem evidência da data
   em que aquele valor ficou público, vale a aquisição (`observed_at_acquisition`). Para a meta Selic há
   evidência pública e versionada de quando cada valor passou a valer (ata e comunicado do Copom); a
   base `copom_decision` só é aceita quando a observação traz a data da decisão e esta é anterior à
   aquisição, e a regra entra no fingerprint. A leitura com data-base D exige `available_at <= D` e
   `acquired_at <= D`, como o contrato `observationsAvailableAsOf` já faz. Testes: republicação posterior
   a D, mudança de meta entre D e a aquisição, corte em `America/Sao_Paulo`.

2. **Confirmação única com versão.** A confirmação atual (só o bruto) é substituída, não acompanhada:
   a nova RPC grava, numa transação e sob os mesmos locks, lease, gate da fonte, delegação, verificação
   física e limite de 5 MiB, o recibo, a versão, as entradas, as observações, o selo e o evento de
   qualidade. A RPC antiga passa a recusar toda confirmação na mesma migração, e o worker passa a exigir
   a nova capacidade de runtime (`market-version-commit.v1`) antes de qualquer abertura. O replay compara
   o recibo, o fingerprint canônico, o parser e a política de qualidade e devolve as mesmas identidades.
   Falha estrutural do parser é falha da tentativa (`parse_failed`, sem versão); observações válidas com
   regra de qualidade violada viram versão em quarentena.

3. **Canônico versionado.** O texto canônico ganha uma versão (`market-canonical.v2`) que inclui a revisão
   da fonte, o contrato da série (código, unidade, escala, convenção), a base e a regra de disponibilidade
   e a política de qualidade. Selos anteriores continuam verificáveis pela versão 1. Teste: adulterar
   qualquer um desses campos com datas e valores iguais muda o fingerprint e recusa o selo.

4. **Seleção por período determinística.** Janela inclusiva `[início, fim]`, dividida em blocos de no
   máximo 10 anos (limite da API). A chave econômica é (objeto lógico, período). Para cada período a
   observação servida vem da versão aprovada de maior `(revisão da fonte, acquired_at, id da versão)`
   que contém aquele período; a conclusão do job não decide. Versões não se supersedem por inteiro: uma
   janela parcial só substitui os períodos que contém. Quarentena, revogação e expurgo retiram a versão
   da seleção e a seleção volta à anterior elegível. Toda leitura e toda entrega fixam um manifesto
   (lista de pares período, versão) com hash. Teste: janelas sobrepostas confirmadas em ordem inversa.

5. **Qualidade, frescor e direito, três estados.** Qualidade vem de regras versionadas por série (para a
   meta Selic: valor entre 0 e 100, variação só em datas de reunião do calendário do Copom publicado,
   série sem buraco de dia corrido na janela). Frescor vem da revisão da fonte: calendário (dias corridos
   para a 432), horário esperado, latência tolerada e prazo máximo de uso; passado o prazo, o resolvedor
   devolve a lacuna nomeada `market_reference_stale`. Uma nova aquisição de valor antigo não o torna
   fresco: frescor é medido pelo último período coberto, não pelo momento da busca. Direito vem da
   licença e dos entitlements vigentes no momento da leitura. Aprovação manual de quarentena registra a
   exceção e não mexe em frescor nem direito. Monitoramento: atraso, mudança de formato, quarentena e
   vencimento de licença viram eventos na outbox.

6. **ODbL tratada por conjunto.** O registro de cada série documenta: base original (o conjunto do Banco
   Central), base derivada (as observações normalizadas da Offroad), base coletiva (a camada de mercado
   que reúne conjuntos separados) e obra produzida (o resultado de um método que usa o número). Avisos e
   o link da licença acompanham objeto, entrega, resultado e exportação. A oferta da base derivada ou do
   método de transformação (cláusulas 4.4 e 4.6), quando exigível, é o parser versionado e o manifesto da
   versão, publicados em página pública própria, sem dado de tenant nem dado contratado.

7. **Retenção: exceção restrita e verificada.** O expurgo de objetos confirmados não entra no M2. Entra
   uma exceção formal: só fontes abertas com retenção sem prazo e `retainAdoptedValues` verdadeiro podem
   ser enfileiradas, confirmadas e entregues; a recusa vale no banco em todos esses caminhos e lê também
   os entitlements de licença contratada. Temporários e órfãos já têm a varredura do M1b; versões em
   quarentena ficam retidas como evidência. Se a revisão da fonte mudar as condições, novas aquisições
   param e a exceção cai até o expurgo existir. O handoff e a ADR passam a registrar essa exceção no lugar
   da condição anterior.

8. **Outbox com autoridade própria.** Evento e linha de outbox nascem na mesma transação, com chave
   idempotente (evento, sujeito, sequência) e ordem pela sequência do evento. Supersessão muda a seleção
   e as propostas, nunca invalida pino histórico; revogação e expurgo bloqueiam leitura. O fechamento
   recusa direito e revogação de forma síncrona, sem depender do atraso da outbox. O consumidor tem
   autoridade estreita própria (sem acesso geral a tenants) e grava recibo de consumo. Eventos de fonte e
   aquisição entram na outbox, e a propagação segue as dependências dos derivados.

9. **Entrega e adoção (decisão 10 da ADR).** O recibo de entrega por organização fixa manifesto, versões,
   dependências, direito resolvido e dimensões (unidade, escala, convenção, período) com FK composta,
   imutável, autorizado pelo trabalho. A adoção ganha referência discriminada e opcional ao recibo; o
   banco confere valor e dimensões. O carregador autorizado resolve recibo, versão, direito e dependências
   em proposta, adoção, execução e leitura, inclusive depois de revogação. Testes: recibo de outro tenant
   e de outro trabalho, referência adulterada, valor ou unidade diferentes, troca de pino entre etapas,
   revogação entre etapas, e ausência de cópia numérica quando a retenção não é permitida.

10. **Agendador com delegação identificável.** O cron executa uma função de plataforma sob uma delegação
    de agendamento (fonte, série, janela relativa, horário em `America/Sao_Paulo`, concedente registrado,
    revogação serializada). A chave de idempotência é (delegação, série, janela), não um UUID novo por
    disparo. Recupera janelas perdidas desde o último período coberto. Testes: disparo duplicado,
    revogação concorrente, indisponibilidade de dias.

## Sequência

| Parte | Entrega | Efeito |
|---|---|---|
| 0 | Contratos da série (unidade, convenção, disponibilidade, seleção por período, canônico v2) em `packages/market-reference` e SQL | Nenhum |
| 1 | Parser, confirmação única com versão, qualidade, recusa da RPC antiga, capacidade nova | Transporte fechado |
| 3 | Outbox e exceção de retenção em todos os caminhos | Transporte fechado |
| 5 | Entrega, adoção, snapshot e fechamento | Nenhum consumidor ligado |
| 6 | Consumidor: referência de precificação lê a meta Selic do objeto | Desligado até a abertura |
| 2 | Agendador com delegação | Desligado |
| 4 | Atos de produção: publicadora, revisão da fonte, delegações, prova integrada em staging, abertura da chave por último | Abre |

Os atos da parte 4 usam identidade de fundador ou operador; o registro da publicadora é comando de
fundador. A chave só abre depois da outbox consumida, do fechamento e da prova integrada em staging.
