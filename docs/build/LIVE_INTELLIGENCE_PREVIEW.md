# live_intelligence_preview: o próximo gate

Estado em 5 de setembro de 2026. O PR #443 entregou o esqueleto de ponta a ponta do Caso 01
dentro do produto: conversa, plano, tarefas, runs e artefatos no mesmo projeto; nove executores
encadeados; persistência entre turnos; replay por fingerprint; alteração incremental de premissa;
progresso na tela; rastreabilidade de números; isolamento por concessão. Ele não prova
inteligência: a execução usa evidência congelada da Camil, workflow fixo do Caso 01, roteador
por expressões regulares e zero chamadas de modelo.

O gate seguinte, ainda interno e com orçamento limitado, transforma esse esqueleto em um
vertical slice com inteligência real. A decisão do fundador está registrada aqui como contrato.

## 1. O que muda

| # | Requisito | Onde entra |
|---|-----------|------------|
| 1 | Roteador por regex substituído pelo Intent Router semântico | o classificador de sombra (`intent-shadow.ts`, envelope v1) passa a decidir no projeto em prévia viva |
| 2 | O roteador produz o envelope e o compilador escolhe o workflow, sem receber `caseId=gc01` | compilador por composição nomeada (`namedCompositions`) e evidência disponível |
| 3 | Resolver a companhia citada e associar o corpus correto | registro de source packs congelados (Camil = `camil`) mais resolução oficial (CVM); companhia sem corpus nunca recebe dados da Camil |
| 4 | Variações do pedido com a mesma intenção | cinco paráfrases chegam à mesma composição econômica |
| 5 | Perguntas a partir das lacunas de cobertura e do contexto | chamada de modelo sobre as lacunas declaradas pelos objetos, não três perguntas fixas |
| 6 | Resposta do usuário altera escopo, audiência, profundidade e plano | o classificador lê as perguntas abertas; o plano recompila |
| 7 | Pesquisa e recuperação reais, source pack como baseline e cache | modo `frozen` por projeto (`gold_case_bindings`) para a Camil; pesquisa viva para companhia sem pack, quando houver provedor |
| 8 | Cálculos, conciliações, traces e fingerprints determinísticos | os executores e o `financial-core` não mudam |
| 9 | Modelo só onde há interpretação ou julgamento | routing e entendimento, lacunas e plano, síntese, material |
| 10 | Pelo menos um arquivo real | memo DOCX (`case-export`) e planilha XLSX (SheetJS) gerados dos objetos assinados |
| 11 | Contexto preservado e alteração incremental no arquivo | nova versão do arquivo com registro do que mudou, por fingerprint dos objetos |
| 12 | Custo, modelo, fallback, latência e chamadas por etapa | ledger do gateway por etapa, gravado no run e no relatório do gate |

Orçamento da primeira execução: uma chamada para routing e entendimento; uma para lacunas e
plano; uma para síntese; uma para material, se necessária. Cache e snapshots reutilizados. Sem
dezenas de chamadas e sem ciclos de revisão matemática.

## 2. O teste do gate

Uma execução gravada, com worker e banco locais e chaves obtidas por OIDC na própria CI (nunca
em segredo do GitHub, nunca em `.env`), contendo:

1. cinco paráfrases do pedido do analista de IB, todas chegando à mesma composição econômica;
2. uma mensagem sobre outra companhia, que não pode receber os dados da Camil;
3. uma intenção diferente, como CFO preparando conselho;
4. uma resposta do usuário mudando o escopo;
5. uma pergunta sobre a origem de um número;
6. uma solicitação de material;
7. uma alteração de premissa;
8. atualização do material existente.

Entrega: transcrição completa, outputs, arquivo gerado, envelope produzido, workflow compilado,
fontes recuperadas, chamadas de modelo, custo total e os pontos em que o sistema se absteve.

## 3. Fatias de entrega

- **A. Escopo da concessão** (este PR): concessão por projeto; a Cedro deixa de ser desviada;
  projeto dedicado de validação.
- **B. Roteador vivo**: modo `live` no projeto em prévia; envelope decide; resolução de
  companhia; compilação por composição; abstenção honesta para companhia sem corpus; telemetria
  por turno; workflow de CI com chaves por OIDC e teto de gasto; teste com as paráfrases, a outra
  companhia e o CFO.
- **C. Perguntas e respostas**: lacunas viram perguntas; resposta altera o plano.
- **D. Síntese e arquivo**: síntese de banker validada contra os objetos; DOCX e XLSX;
  atualização incremental do arquivo.
- **E. Pesquisa viva** para companhia sem pack, quando houver provedor com chave.

## 4. O que continua fora

Liberação a clientes, aprovação ou parecer. A trilha de revisão independente segue em paralelo,
limitada a P0 e checkpoints consolidados, e não bloqueia este gate.
