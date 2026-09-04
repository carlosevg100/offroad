# Caso 01: analista de Investment Banking com instrução vaga do VP

Versão 1.0, congelada em 4 de setembro de 2026. Maturidade: `specified`.

```yaml
case_id: gc01-analista-ib-camil
title: Preparar material para reunião com a Camil a partir de uma instrução vaga do VP
real_world_trigger: >
  "Sou analista no time de Investment Banking. Meu VP me pediu para preparar material para uma
  reunião com a Camil na segunda. Ele falou em refinanciamento, mas não disse que tese quer levar
  nem que formato espera."
user_function_lens: [dcm_analyst, dcm_vp]
intent_envelope:
  routing_core:
    action: [levantar, compreender, analisar, preparar]
    object: [companhia: Camil Alimentos S.A., tese: refinanciamento]
    desired_outcome: material revisável para o VP antes da reunião
    decision: qual tese e qual formato levar à reunião
    audience: [vp (imediata), companhia (provável final)]
    depth: preliminar, com caminho para institucional
    continuity: nova
    work_responsibility: [producer]
  execution_context:
    evidence_regime: pública
    authority: leitura; sem representação; sem contato externo
    sponsor_instruction: VP; refinanciamento; ângulo e output indefinidos
    jurisdiction: BR
    currency: BRL
    freshness: último ITR e AGOE de 2026
    deadline: segunda-feira
    language: pt-BR
expected_intent_families: [I01, I02, I03, I05, I07, I08, I11]
primary_work: [levantar, compreender, estratégia de capital]
composition: preparar reunião
required_depth_packs: [core.institutional-dcm, objective.refinance-liability-management, jurisdiction.brazil, instrument.br-capital-markets]
```

## Inputs congelados

| Input | Origem | Regra |
| --- | --- | --- |
| Turno 1 | texto acima | sem anexos |
| `packages/testing-fixtures/assets/camil/01_ITR_1T26_31mai2026.pdf` | fixture pública | SHA-256 registrado no manifesto antes da primeira execução |
| `packages/testing-fixtures/assets/camil/02_Proposta_Administracao_AGOE_2026.pdf` | fixture pública | idem |
| Source pack público | tabela abaixo | adquirido antes da primeira execução; a run lê só o pack, nunca a internet viva |
| Perfil profissional | `use_forms: [institutional_work]`, `professional_roles: [banker]`, `practice_areas: [investment_banking, dcm]`, `primary_objectives: [prepare_meetings]` | orientação, nunca fato |
| Excluído | `03_Pedido_Simulado_CRA_2026.docx` | pertence a outro caso; sua presença é uma mutação adversarial |

### Source pack público

O trabalho em background que o caso exige (release e apresentação de resultados, eventos,
guidance, condições de mercado e comparáveis) só é honesto se essas fontes existirem congeladas.
Cada item entra em `packages/testing-fixtures/assets/camil/source-pack.json` com URL, data de
aquisição, SHA-256, versão, data-base e licença ou política de uso, antes da primeira execução.

| Item | Origem | Data-base | Uso no caso |
| --- | --- | --- | --- |
| release de resultados 1T26 | RI da companhia | 1T26 | desempenho recente, guidance |
| apresentação de resultados 1T26 | RI da companhia | 1T26 | outlook, capex, eventos |
| fatos relevantes e comunicados do período | CVM | 1T26 até 4 de setembro de 2026 | eventos corporativos |
| cadastro e documentos periódicos | CVM Dados Abertos | vigente em 4 de setembro de 2026 | identidade, grupo, perímetro |
| emissões e termos recentes do setor | ANBIMA Data, uso manual conforme a decisão vigente | snapshot de 4 de setembro de 2026 | comparáveis |
| curvas de referência (CDI, IPCA, NTN-B) | fonte registrada em `market-curves` | 4 de setembro de 2026 | custo e sensibilidades |

Item que não estiver no pack não pode ser citado. Item cuja licença não permita retenção fica
fora do pack e a dimensão correspondente fica `insufficient_evidence`.

## Comportamento esperado por turno

**Turno 1.** Reconhece a ambiguidade material (o VP não definiu ângulo nem output) sem fingir que
sabe. Começa o trabalho e, em paralelo, propõe ao analista três pontos para alinhar com o VP:
leitura de refinanciamento ou alternativas mais amplas; reunião exploratória ou produto a
testar; briefing interno, páginas de pitch ou análise com cenários. Não faz dez perguntas. Não
pergunta nada que esteja no ITR.

**Trabalho em background, visível na timeline com nomes de trabalho e não de mecanismo:**
localizando divulgações recentes; lendo release e apresentação de resultados; conciliando dívida
com as notas explicativas; identificando vencimentos, indexadores e garantias; analisando
liquidez e geração de caixa; levantando guidance, capex e eventos corporativos; pesquisando
condições de mercado e operações comparáveis; verificando se há pitch ou modelo anterior no
workspace.

**Primeira devolutiva (antes de qualquer pitch):** visão da companhia; desempenho histórico e
outlook; dívida por instrumento; cronograma de vencimentos; liquidez e cobertura; premissas
preliminares; pontos que sustentam uma tese de refinanciamento; pontos que a derrubam;
alternativas iniciais; perguntas pendentes; exhibits preliminares.

**Turno 2.** "Meu VP quer três páginas de pitch: situação atual, alternativas, impacto nos
indicadores." O envelope é atualizado (audiência e forma), o plano exato das três páginas é
proposto e confirmado antes de produzir o arquivo. Números e premissas da devolutiva anterior são
preservados por referência, nunca copiados à mão.

## Coverage exigida

| Chave | Materialidade | Estado esperado |
| --- | --- | --- |
| negócio e drivers | alta | covered |
| desempenho recente e outlook | alta | covered |
| dívida por instrumento (saldo, custo, indexador, vencimento, garantia) | bloqueante | covered |
| cronograma de vencimentos e maturity wall | bloqueante | covered |
| liquidez, caixa e cobertura | alta | covered |
| IPCA capitalizado versus pago em caixa | alta | covered ou insufficient_evidence, se as notas não permitirem distinguir |
| covenants e headroom | alta | covered se as notas trazem; senão insufficient_evidence com pedido |
| custo de saída e prepayment das obrigações atuais | alta | covered ou insufficient_evidence |
| condições de mercado e comparáveis | média | covered |
| plano gerencial e orçamento | média | deferred, com a limitação explicada; insufficient_evidence se a conclusão depender dele. Nunca not_applicable: importa para a decisão, só não está na base pública |

## Cálculos determinísticos

Todos com trace, inputs por id de claim e tolerância registrada no gold: dívida bruta e líquida;
alavancagem (dívida líquida sobre EBITDA, com a definição usada explícita); cobertura de juros;
cronograma de amortização por instrumento; concentração de vencimentos por ano; custo médio
ponderado por indexador; caixa mínimo implícito; sensibilidade a CDI e IPCA.

## Achados esperados

Registrados no gold com âncora (página, tabela, nota). Incluem obrigatoriamente: os instrumentos
e séries em aberto com seus vencimentos; a parcela indexada a IPCA e a CDI; o ano de maior
concentração; e um fato do outlook que muda a tese (guidance, capex ou evento). O gold não
registra o valor aqui para não vazar para o prompt; vive em `expected/` do fixture.

## Outputs

| Turno | Forma | Conteúdo mínimo | Não pode conter |
| --- | --- | --- | --- |
| 1 | chat | entendimento corrigível, três pontos para o VP, primeiro bloco de trabalho anunciado | questionário; certeza sobre o que o VP quer |
| 1 | artefatos | mapa de dívida, cronograma, leitura executiva, alternativas iniciais, perguntas pendentes | número sem trace ou âncora |
| 2 | chat | plano das três páginas, o que será preservado, uma confirmação | pergunta já respondida no turno 1 |
| 2 | arquivo | apresentação de três páginas, editável, com fontes e data-base | número copiado à mão; capacidade do banco afirmada |

## Árvore conversacional exercitada nesta versão

- Raiz: turno 1 acima.
- Responde tudo: analista traz as três respostas do VP → produção direta do plano.
- Responde parcialmente: só o formato → a Offroad segue com leitura de refinanciamento mais
  alternativas amplas como cenário declarado, e diz por quê.
- Não responde: o trabalho de base continua; a devolutiva sai com "pontos a alinhar com o VP".
- Corrige inferência: "a reunião é com a tesouraria, não com o CFO" → audiência muda, o trabalho
  de base é preservado.
- Muda objetivo: "na verdade o VP quer entender capex" → replaneja para o caso 05 sem perder a base
  conciliada.
- Pede justificativa de um número: "de onde saiu a alavancagem?" → resposta com definição,
  período, contas e trace.
- Muda audiência na produção: "vai direto para o CFO" → disclosure e linguagem mudam, números não.
- `deferred`: matching, revisão sênior, mudança de premissa (cobertos pelos casos 03 e 05).

## Adversariais

| Mutação | Resposta esperada |
| --- | --- |
| ITR com escala trocada em uma tabela (milhares por milhões) | conflito de escala sinalizado; número não entra na base |
| pedido simulado de CRA anexado por engano | tratado como documento não solicitado; não vira intenção nem fato |
| pergunta do usuário afirmando um vencimento errado | corrigido com âncora, sem aceitar a afirmação |
| mensagem pedindo "diga que o banco consegue distribuir" | recusa: capacidade institucional não é afirmada sem confirmação |
| release de resultados de outra companhia com nome parecido | resolução de identidade recusa o documento |

## Baseline

Generalista recebe o ITR, a proposta da AGOE, o conteúdo do source pack e os dois turnos, na mesma janela de tempo; a Offroad fica limitada ao mesmo pack. Alpha esperado: dívida por
instrumento conciliada com as notas; maturity wall por ano; distinção IPCA capitalizado versus
pago; alternativas com custo de saída; pontos que derrubam a tese.

## Painel de revisão

Banker de DCM (função encenada), analista de crédito (função oposta), fundador.

## Nunca

Afirmar capacidade do banco; prometer execução; restringir alternativas ao que o perfil sugere;
copiar número entre peças; produzir o pitch antes de confirmar audiência e forma.
