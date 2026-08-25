# House Playbook Offroad · v2.1 governado

> Fonte canônica governada do conhecimento operacional da mesa. Este arquivo não é
> executado diretamente. Cada entrada é compilada para o contrato de procedimento conforme
> sua natureza: workflow, cálculo determinístico, método de análise, regra de decisão,
> lente setorial, referência de mercado, template ou controle. A forma compilada precisa
> declarar objetivo, produto, passos, evidência, saída estruturada, testes, limites e dono.
> Promoção exige revisão técnica independente, aprovação de conteúdo, gold cases,
> adversariais, dados de referência resolvidos e template compatível conforme o ADR 0013.
> Onde o texto diz "versionado" ou "parâmetro da casa", o número vive em dado com fonte,
> data, validade e dono, nunca como verdade fixa no texto. Este arquivo substitui o v1 como
> fonte editorial, mas não promove automaticamente nenhuma entrada para `production`.

| Autoridade | Significa |
|---|---|
| LEI | Regra jurídica/regulatória, com fonte e vigência; revisão especializada antes de imprimir |
| DEF | Definição financeira ou contábil |
| CASA | Política da Offroad, versionada |
| MERCADO | Prática observada, com fonte, data e validade definida para aquele campo; dado vencido não decide nem aparece como vigente |
| HEURÍSTICA | Atalho de mesa, contestável com justificativa |

Módulos: M0 intake (IN) · M1 empresa e setor (EMP) · M2 números (Q) · M3 dívida (D) ·
M4 operação (OP) · M5 estruturação (ES) · M6 pricing (PR) · M7 materiais (MA) ·
M8 mercado (MK) · M9 red flags (RF) · M10 linguagem e conduta (LC). 270 procedimentos.


---

# MÓDULO 0 · INTAKE E PEDIDO DE INFORMAÇÃO (IN-01 a IN-26)

### IN-01 · A captura do pedido
- **Executa**: coletar exatamente sete campos: (1) CNPJ; (2) valor em faixas fixas da casa; (3) uso, pelo menu de dono (IN-03); (4) para quando, em faixas (até 3m / 3-6m / 6-12m / sem pressa); (5) prazo de pagamento que faria sentido, em faixas; (6) garantias disponíveis, menu múltiplo (imóveis livres / recebíveis / máquinas e veículos / aval / nada / não sei); (7) quem financia hoje, texto livre opcional.
- **Verificação**: conclusão em menos de 10 minutos (telemetria); abandono por campo monitorado; campo além dos sete só com decisão da mesa registrada.
- **Proibições**: perguntar faturamento, EBITDA, dívida ou margem (vêm dos documentos; o número da memória conflita com o documento e cria a pior conversa do processo).
- **Saída**: {cnpj, valor_faixa, uso, urgência, prazo_desejado, garantias[], financiadores?} datado (IN-26).
- **A jusante**: IN-02, IN-03, IN-18.
- **Autoridade**: CASA.

### IN-02 · Resolução do CNPJ
- **Executa**: (1) resolver na fonte pública: razão social, natureza jurídica (S.A./ltda/outra), CNAE principal e secundários, data de abertura, capital, quadro societário e participações; (2) mapear o grupo aparente (sócios PJ, participações); (3) comparar CNAE com a descrição do uso.
- **Verificação**: natureza jurídica alimenta a elegibilidade preliminar no catálogo jurídico versionado; nenhuma rota é aberta ou fechada por regra textual sem fonte oficial vigente e revisão especializada. Divergência CNAE × descrição vira pergunta interna; CNPJ de holding com operação em controlada dispara IN-24.
- **Armadilha**: analisar a entidade errada; "qual empresa fatura e qual tomaria a dívida" se resolve com organograma, não suposição.
- **Saída**: ficha cadastral + grupo aparente + flags (holding?, múltiplas operadoras?).
- **A jusante**: EMP-10, ES-36, elegibilidade.
- **Autoridade**: DEF.

### IN-03 · Do uso declarado ao arquétipo
- **Executa**: mapear menu → arquétipo: "expandir ou construir"→expansão/capex; "reforçar o caixa do dia a dia"→giro; "comprar uma empresa"→aquisição; "trocar dívida cara ou curta"→refinanciamento; "comprar máquinas"→equipamentos; "investidor de venture, precisamos de prazo"→venture debt; "antecipar recebíveis em escala"→recebíveis; "outro"→texto livre + mesa em D+1.
- **Verificação**: arquétipo provisório retestado quando os números chegam (IN-23, OP-01); mudança gera versão (OP-14).
- **Saída**: {arquétipo, confiança, gatilho_de_reteste}.
- **A jusante**: lista dia-zero (IN-04 a 10), lente setorial (M1).
- **Autoridade**: CASA.

### IN-04 · Lista dia-zero: expansão/capex
- **Executa**: emitir com o porquê por item: (1) balanços fechados dos 3 últimos anos com notas ("é a base; sem eles nenhum fundo abre conversa"); (2) balancete do ano ("os fundos não decidem só com o ano passado"); (3) relação de dívidas se existir ("se não tiver, montamos dos documentos"); (4) orçamento e cronograma do projeto ("fundo financia projeto, não planilha"); (5) contratos relevantes assinados do projeto; (6) faturamento mensal 24m ("tendência e sazonalidade"). Perguntas (máx 4): quanto já foi gasto e com quê; licença/alvará pendente?; funciona com menos dinheiro?; quem executa a obra?
- **Verificação**: 6 documentos + até 4 perguntas; item extra exige decisão da mesa; porquê visível em cada item.
- **Saída**: lista emitida com estados (pendente/recebido/não tenho).
- **A jusante**: Etapa 2, plano guiado de informações; IN-12.
- **Autoridade**: CASA.

### IN-05 · Lista dia-zero: capital de giro
- **Executa**: balanços; balancete; faturamento mensal 24m; abertura de clientes e fornecedores por prazo se o sistema emitir; extratos/limites das linhas curtas. Perguntas: aperto sazonal ou permanente?; prazo de algum cliente grande mudou?; existe antecipação a fornecedor em uso (forma-pergunta de D-06)?
- **Verificação**: captura o estoque de linhas curtas (alimenta D-05); "permanente" + linhas curtas grandes dispara IN-23.
- **Saída**: lista + flags precoces.
- **A jusante**: D-05/06, IN-23.
- **Autoridade**: CASA.

### IN-06 · Lista dia-zero: refinanciamento
- **Executa**: balanços; balancete; relação COMPLETA de contratos com cronograma (essencial: sem ela não há caso); contratos das dívidas relevantes (covenants); certidões de gravame das garantias dadas. Perguntas: o que motiva (custo, prazo, covenant, concentração)?; waiver ou repactuação em curso?; garantia fica livre com a quitação?
- **Verificação**: sem a relação, a régua não atinge mínimo; covenants chegam antes da estrutura (D-20, ES-42).
- **Saída**: lista + mapa preliminar de gravames.
- **A jusante**: D-19/20, ES-22.
- **Autoridade**: CASA.

### IN-07 · Lista dia-zero: aquisição
- **Executa**: dia-zero de expansão para a compradora + da adquirida: balanços disponíveis, faturamento, LOI/contrato, DD existente. Perguntas: preço e forma de pagamento; earn-out?; dívida da adquirida assumida ou quitada?; sinergias no plano (tratadas como premissa, Q-01/Q-10)?
- **Verificação**: não avança à estrutura sem mecanismo de preço claro e tratamento da dívida da adquirida definido.
- **Saída**: lista dupla + termos da transação.
- **A jusante**: OP-02/03 (pró-forma combinado), OP-09.
- **Autoridade**: CASA.

### IN-08 · Lista dia-zero: equipamentos
- **Executa**: proformas/orçamentos dos bens; balanços; balancete. Perguntas: nacional ou importado?; novo ou usado?; o bem gera receita própria mensurável?; prazo de entrega?
- **Verificação**: origem, condição, credenciamento, fornecedor, finalidade e regras vigentes alimentam o catálogo de elegibilidade. Nenhuma linha FINAME ou alternativa é aberta automaticamente, e bem usado não fecha todas as rotas por regra genérica.
- **Saída**: lista + ficha do bem (ES-15, elegibilidade).
- **A jusante**: ES-15, catálogo.
- **Autoridade**: CASA.

### IN-09 · Lista dia-zero: venture debt
- **Executa**: gerencial/balanços; métricas mensais (MRR/ARR, churn, queima, runway); cap table; termos da última rodada. Perguntas: runway em meses?; próxima rodada mapeada?; board aprova dívida?; warrant aceitável?
- **Verificação**: sponsor institucional, rodada, recorrência, runway e rota de saída são fatores de elegibilidade e aderência, não veto isolado. O sistema compara rotas viáveis e encaminha a exceção para análise técnica, sem fingir que todo caso de tecnologia é venture debt.
- **Saída**: lista + ficha venture {sponsor, rodada, runway}.
- **A jusante**: MK-10, elegibilidade.
- **Autoridade**: MERCADO.

### IN-10 · Lista dia-zero: recebíveis
- **Executa**: aging; analítico (loan tape) no formato que o sistema do cliente emitir; política de crédito e cobrança; perdas 24m+; balanços. Perguntas: sacados típicos?; carteira já cedida (forma-pergunta de D-07)?; performa na entrega ou por medição?
- **Verificação**: loan tape em qualquer formato aceito (organizar é nosso); cessão prévia é bloqueadora para a estrutura (ES-22).
- **Saída**: lista + handoff para a vertical de recebíveis.
- **A jusante**: vertical própria; ES-11/12.
- **Autoridade**: CASA.

### IN-11 · Mínimo vs ideal
- **Executa**: manter, por arquétipo, as duas listas versionadas: mínimo (teste por item: qual decisão fica impossível sem ele?) e ideal (o que muda preço/velocidade); comunicar: "com isto avaliamos; com aquilo defendemos o preço".
- **Verificação**: item do mínimo que não bloqueia decisão é rebaixado (auditoria periódica); o início da análise NUNCA espera item do ideal.
- **Saída**: as listas com o teste de bloqueio documentado por item.
- **A jusante**: IN-12; Etapa 2, plano guiado de informações.
- **Autoridade**: CASA.

### IN-12 · A régua de suficiência
- **Executa**: computar por classificação automática: documento classificado na Etapa 3, recebimento e inventário documental, marca os itens que satisfaz no mapa versionado item para tipos aceitos; exibir "mínimo N de M, ideal X de Y" com o que falta em linguagem de dono; recomputar a cada chegada.
- **Verificação**: nunca por checkbox do cliente; botão "já enviei isto" roteia para revisão de classificação, nunca discussão.
- **Armadilha**: item satisfeito por classificação errada; revisão amostral da mesa nos casos de confiança baixa.
- **Saída**: estado da régua + trilha (que documento satisfez que item).
- **A jusante**: gate da Etapa 5, conciliação e base financeira, e da Etapa 7, análise da companhia e da transação.
- **Autoridade**: CASA.

### IN-13 · A escada, operacionalizada
- **Executa**: antes de qualquer pergunta: (1) buscar na sala classificada (tipo de documento + campo da ontologia); (2) tentar derivação declarada (fórmula sobre fatos, com trace); (3) fonte pública registrada; (4) só então redigir (IN-15), gravando o motivo da descida (o que foi buscado e não achado).
- **Verificação**: toda pergunta emitida carrega o rastro dos degraus 1-3; sem rastro, bloqueada; amostra auditada pela mesa.
- **Saída**: {pergunta, rastro, degrau_final}.
- **A jusante**: Etapa 6, resolução focada de lacunas.
- **Autoridade**: CASA.

### IN-14 · Regras do lote
- **Executa**: aplicar o máximo ativo definido na política de lotes, sempre limitado a cinco itens, ordenados: bloqueador de entendimento > muda capacidade/estrutura > muda aderência > melhora material. Item de diligência do financiador ou fechamento nunca entra; o próximo lote só nasce quando o atual estiver resolvido ou explicitamente dispensado.
- **Verificação**: telemetria: lotes por caso (alvo ≤ 3 até a análise), tempo de resposta, taxa de "não tenho" (alta = lista pedindo demais, revisar IN-11).
- **Saída**: o lote com prioridade e prazo sugerido.
- **A jusante**: Etapa 6, resolução focada de lacunas.
- **Autoridade**: CASA (Constituição 2.2).

### IN-15 · Como se escreve a pergunta
- **Executa**: anatomia fixa: pergunta simples (sem sigla fechada) + porquê em uma frase + o que destrava + como responder (texto / anexo como estiver / "não tenho"); a forma-pergunta de cada procedimento técnico escrita uma vez no procedimento e reusada (canônico: a de D-06).
- **Verificação**: uma pergunta = uma informação (duas na frase bloqueia); teste de leitura: empresário sem CFO entende sem ligar para ninguém.
- **Saída**: a pergunta pronta, ligada ao procedimento de origem.
- **A jusante**: Etapa 6, resolução focada de lacunas; biblioteca de formas-pergunta.
- **Autoridade**: CASA.

### IN-16 · Ausência registrada
- **Executa**: aceitar "não tenho", "não se aplica", "só após NDA" (nota opcional); registrar com data e autor; propagar: recalcular o que conclui sem o item, marcar teto de compradores quando estrutural (sem auditoria → MK-01 fecha), reportar no memo quando material.
- **Verificação**: item nunca re-perguntado sem fato novo; ausência material aparece no memo (o fundo não pode descobri-la sozinho, LC-12).
- **Saída**: {item, tipo, nota, efeitos_propagados[]}.
- **A jusante**: Etapa 6, resolução focada de lacunas; MA-07.
- **Autoridade**: CASA.

### IN-17 · Nunca pedir o que já chegou
- **Executa**: antes de emitir lote, cruzar cada item contra a sala classificada E o histórico de respostas; conflito remove do lote e loga o quase-erro.
- **Verificação**: pedido de item satisfeito que escape é incidente operacional com registro, causa e correção. A meta de qualidade é zero, medida como SLO e nunca apresentada como garantia de ausência futura de erro.
- **Saída**: log de supressões.
- **A jusante**: confiança do cliente.
- **Autoridade**: CASA.

### IN-18 · A devolução do dia zero
- **Executa**: ao concluir o intake: (1) "o que entendemos" (a operação em uma frase, botão corrigir); (2) "operações como a sua" (faixas honestas de prazo, garantia e formato, da grade PR-07 em modo faixa-larga, SEM taxa pontual); (3) a lista dia-zero com porquês.
- **Verificação**: taxa de correção do "o que entendemos" monitorada; faixas citadas vêm de células com data (PR-12).
- **Saída**: a devolução registrada (para comparar com o desfecho: expectativa auditável).
- **A jusante**: calibragem contínua; PR-09.
- **Autoridade**: CASA.

### IN-19 · Triagem precoce
- **Executa**: aplicar na saída do intake: tíquete abaixo do piso, com alternativas coerentes como banco, factoring, plataforma de antecipação ou financiador especializado; urgência de dias com sala vazia, com prazo realista; uso fora do ofício, com indicação quando apropriada; combinação sem rota observável de valor, garantia e prazo. FIDC é tratado como veículo com política e mandato próprios, nunca como sinônimo genérico de crédito pulverizado.
- **Verificação**: nenhuma triagem silenciosa: recusa precoce com motivo e alternativa quando existe; registrada (funil, RF-19).
- **Saída**: {decisão: segue/roteia/declina, motivo, mensagem}.
- **A jusante**: funil, RF-20.
- **Autoridade**: CASA.

### IN-20 · O assessor como usuário
- **Executa**: intake em nome do cliente com papel declarado e autorização registrada (quem, quando, escopo); listas e lotes roteados ao assessor (que repassa ou responde); visibilidade segregada por caso mesmo dentro da carteira do mesmo assessor.
- **Verificação**: nenhum dado cruza casos (teste de tenancy); autorização precede processamento.
- **Saída**: vínculo assessor-caso com autorização.
- **A jusante**: LC-08; Etapa 12, autorização e introdução qualificada.
- **Autoridade**: CASA/LEI.

### IN-21 · O que não se pede cedo
- **Executa**: lista negativa do intake: dados nominais de clientes do cliente, contratos de terceiros sob NDA, dados pessoais de sócios além do societário público, folha; estágio próprio (diligência avançada, MA-25); o sistema recusa incluí-los em lote precoce.
- **Verificação**: lote com item da lista negativa não compila; minimização LGPD desde o primeiro dado.
- **Saída**: a lista negativa versionada.
- **A jusante**: MA-25.
- **Autoridade**: LEI.

### IN-22 · Urgência declarada vs real
- **Executa**: testar a urgência contra: cronograma (D-03: parede datada?), cobertura (D-26), evento externo nomeado (fechamento com data). Com causa documentada: calendário muda (MK-17 comprime, OP-10 avalia ponte). Sem causa: item de calibragem (IN-18), não de aceleração.
- **Verificação**: compressão só com causa registrada; nunca pula verificações (RF-16).
- **Saída**: {urgência, causa_verificada?, efeito_no_calendário}.
- **A jusante**: MK-17, RF-16.
- **Autoridade**: CASA.

### IN-23 · A operação de liquidez disfarçada
- **Executa**: no primeiro fechamento de números, comparar a cobertura de curto prazo de D-26 com o piso versionado e decompor o déficit entre serviço da dívida existente, capital de giro, capex e contingências. Se a insuficiência pré-existe ao projeto, abrir a hipótese de liquidez ou reperfilamento e levar a conta à companhia antes de alterar o arquétipo.
- **Verificação**: a reclassificação nunca é automática por uma razão isolada. Exige base reconciliada, causa do déficit, conversa registrada e nova versão em OP-14. Nenhum caso segue à estrutura com rótulo sabidamente inconsistente.
- **Saída**: {teste, resultado, reclassificação?, conversa_registrada}.
- **A jusante**: OP-13, MA-11.
- **Autoridade**: CASA.

### IN-24 · Grupo detectado no intake
- **Executa**: quando IN-02 sinaliza grupo: expandir a lista dia-zero para as entidades relevantes (balanços das operadoras materiais, organograma) ANTES da análise; definir internamente qual entidade tomaria a dívida e qual tem fluxo e ativos.
- **Verificação**: análise não inicia na entidade errada (o retrabalho mais caro do processo).
- **Saída**: perímetro de análise {entidades, papéis}.
- **A jusante**: EMP-10, ES-36/37, D-10/11.
- **Autoridade**: CASA.

### IN-25 · Piso e teto operacionais
- **Executa**: manter versionados o piso (abaixo do qual o processo não se paga para ninguém) e o teto de conforto de distribuição (acima do qual exige sindicato/co-assessoria explícita desde o início); aplicar na triagem (IN-19) com mensagens padrão.
- **Verificação**: valores revisados trimestralmente com dono; mensagens dizem o porquê e o caminho.
- **Saída**: parâmetros versionados.
- **A jusante**: IN-19, MK-17.
- **Autoridade**: CASA.

### IN-26 · O pedido como fato datado
- **Executa**: registrar tudo que o cliente declarou como fatos datados com autor; quando os documentos contarem outra história: computar a divergência declarado × verificado como diagnóstico de qualidade da informação (EMP-15/16), nunca editar o declarado.
- **Verificação**: registro original imutável; divergências relevantes na análise interna.
- **Saída**: o registro + tabela de divergências.
- **A jusante**: OP-01/14, RF-14.
- **Autoridade**: CASA.

---

# MÓDULO 1 · LEITURA DA EMPRESA E DO SETOR (EMP-01 a EMP-30)

O crédito é pago pelo negócio, não pela planilha. Cada procedimento produz uma saída que
alimenta a seção "empresa" do memo e as perguntas de diligência antecipadas.

### EMP-01 · O modelo de negócio em uma página
- **Executa**: escrever em texto próprio (nunca colado da apresentação): o que vende, para quem, como cobra, o que diferencia, por que o cliente não troca; validar cada afirmação contra a composição real da receita (analítico).
- **Verificação**: a descrição bate com os números ("empresa de tecnologia" com 80% da receita em revenda de hardware é distribuidora e será descrita assim); teste do parágrafo: um gestor entende o negócio em 30 segundos.
- **Armadilha**: aceitar a autodescrição; o memo de quem entendeu o negócio se nota na segunda linha.
- **Saída**: o parágrafo canônico do negócio + tabela {linha_de_receita, %, margem} que o sustenta.
- **A jusante**: MA-08, narrativa inteira.
- **Autoridade**: CASA.

### EMP-02 · Cadeia de valor e captura de margem
- **Executa**: (1) mapear a cadeia (insumo → produção → distribuição → cliente) e onde a empresa está; (2) identificar onde a margem nasce (produto, serviço, logística, marca, regulação); (3) comparar margem bruta com os pares da lente setorial; (4) para margem acima dos pares, exigir a causa física (escala, integração, nicho).
- **Verificação**: margem acima do intervalo dos pares sem causa documentada dispara RF-03; a causa aceita entra no memo como argumento, com evidência.
- **Saída**: {posição_na_cadeia, fonte_da_margem, margem_vs_pares, causa}.
- **A jusante**: cenários de compressão da Etapa 7, análise da companhia e da transação; MA-09.
- **Autoridade**: DEF.

### EMP-03 · Clientes: concentração e qualidade
- **Executa**: executar Q-06 e somar a leitura qualitativa: contrato ou pedido a pedido, histórico de renovação e perda, substituibilidade, margem por cliente, prazo praticado e dependência mútua.
- **Verificação**: concentração acima da faixa de materialidade versionada exige análise da contraparte e cenário de redução ou perda. Concentração, sozinha, não transforma automaticamente o risco da companhia no risco do cliente.
- **Saída**: quadro de concentração + análise dos clientes âncora + cenário de redução ou perda na Etapa 7, análise da companhia e da transação.
- **A jusante**: MA-07, ES-11, Q-06.
- **Autoridade**: CASA.

### EMP-04 · Fornecedores e dependências
- **Executa**: (1) top fornecedores por volume; (2) fornecedor único ou dominante: contrato? prazo? alternativas reais e custo de troca?; (3) origem (nacional/importado) e moeda de compra; (4) prazo médio pago real vs setor (gatilho de D-06).
- **Verificação**: dependência sem contrato vira risco nomeado; prazo de fornecedores fora do padrão do setor dispara a investigação de risco sacado (D-06).
- **Saída**: {fornecedor, %, contrato?, origem, moeda, alternativa} + flags.
- **A jusante**: MA-07, D-06, Q-12.
- **Autoridade**: MERCADO.

### EMP-05 · Barreiras de entrada reais
- **Executa**: classificar a barreira alegada em: licença/regulatória, escala/custo, marca/relacionamento, contrato de longo prazo, ativo físico raro, tecnologia proprietária; exigir a evidência de cada uma (a licença, o contrato, o custo de replicação).
- **Verificação**: "nosso atendimento/qualidade" sem evidência não é barreira e o memo não chama de barreira; barreira aceita precisa sobreviver ao prazo da dívida.
- **Saída**: {barreira, classe, evidência, vida_útil_estimada}.
- **A jusante**: sustentação da projeção (Q-10), MA-09.
- **Autoridade**: HEURÍSTICA.

### EMP-06 · Regulação do setor
- **Executa**: (1) mapear o que a regulação dá (preço regulado, reserva de mercado, licença) e tira (teto, obrigação, passivo); (2) dependência de decisão de governo (subsídio, programa, repasse) quantificada em % da receita; (3) histórico de mudanças da regra nos últimos 10 anos.
- **Verificação**: receita dependente de decisão pública acima do limiar vira risco nomeado com o histórico; mudança regulatória em curso (consulta pública, projeto de lei) registrada.
- **Saída**: {regra, efeito, %receita_exposta, histórico_de_mudança}.
- **A jusante**: MA-09, cenários.
- **Autoridade**: LEI (conteúdo) / CASA (obrigação de mapear).

### EMP-07 · Ciclicidade e posição no ciclo
- **Executa**: (1) classificar o setor (cíclico/defensivo/misto) pela lente; (2) situar o momento: os 3 anos de histórico cobrem que fases?; (3) regra da mesa: capacidade calculada com margem média de ciclo, não com a do melhor ano.
- **Verificação**: histórico que só cobre a subida obriga downside mais severo (parâmetro do arquétipo) e a declaração no memo; dívida dimensionada em topo com números de topo é o erro clássico que ES-01 bloqueia.
- **Saída**: {classificação, fase_atual, margem_média_de_ciclo_estimada}.
- **A jusante**: Q-10, ES-01, OP-04.
- **Autoridade**: MERCADO.

### EMP-08 · Sazonalidade intra-ano
- **Executa**: rodar Q-11 (índices) e traduzir para o desenho: meses de pico e vale de receita, estoque e caixa; o mês em que a parcela dói.
- **Verificação**: amplitude acima de 1,5× obriga desenho sazonal na estrutura (ES-08); toda comparação do memo é mesmo-mês.
- **Saída**: calendário sazonal do negócio.
- **A jusante**: ES-08, Q-04.
- **Autoridade**: DEF.

### EMP-09 · Competição e participação
- **Executa**: (1) nomear os 3 a 5 concorrentes reais (não "mercado fragmentado"); (2) participação e movimento dos últimos 3 anos com a evidência disponível; (3) teste da projeção: crescer X% num mercado que cresce Y% = tomar (X−Y) de quem? por quê?
- **Verificação**: projeção que exige tomar mercado de player mais capitalizado sem vantagem nomeada é cortada no cenário-mesa (Q-10).
- **Saída**: {concorrente, porte_relativo, movimento} + o parágrafo de posição competitiva.
- **A jusante**: Q-10, MA-09.
- **Autoridade**: HEURÍSTICA.

### EMP-10 · Estrutura societária completa
- **Executa**: (1) montar o organograma do grupo (IN-02 + IN-24): participações, percentuais; (2) mapear em qual entidade está: o caixa, a dívida, os ativos, a receita, os funcionários; (3) validar contra os balanços de cada entidade relevante; (4) identificar fluxos entre entidades (Q-07, D-11).
- **Verificação**: garantia ofertada em entidade que não é a devedora detectada AQUI (antes de ES); receita numa entidade e ativo noutra sem contrato formal entre elas vira exceção.
- **Armadilha**: o organograma da apresentação omitindo a entidade com o problema; cruzar com participações públicas dos sócios.
- **Saída**: organograma anotado {entidade: caixa, dívida, ativos, receita} + fluxos.
- **A jusante**: ES-36/37/38, D-10/11, RF-09.
- **Autoridade**: DEF.

### EMP-11 · Acordo de acionistas e mudança de controle
- **Executa**: (1) existe acordo? obter ou registrar a recusa (IN-16); (2) ler: venda conjunta, preferência, veto, quóruns qualificados; (3) testar: a dívida proposta e suas garantias disparam alguma cláusula? a execução da garantia de quotas (ES-16) é factível sob o acordo?
- **Verificação**: cláusula de mudança de controle do acordo casada com a definição da dívida (ES-34); conflito entre acordo e estrutura detectado antes do term sheet (ES-42).
- **Saída**: {cláusulas_relevantes, conflitos_com_a_estrutura}.
- **A jusante**: ES-16/34/42.
- **Autoridade**: LEI.

### EMP-12 · Governança de fato
- **Executa**: (1) conselho: existe, se reúne, com que pauta (pedir atas de amostra); (2) auditoria (Q-08) e comitês; (3) família na gestão: papéis reais; (4) o teste da mesa: o último exemplo concreto de decisão do fundador revertida por conselho ou por dado.
- **Verificação**: o memo descreve a governança real, não o organograma decorativo; conselho que nunca reverteu nada em 5 anos é descrito como consultivo.
- **Saída**: o parágrafo de governança + evidências.
- **A jusante**: MA-08, MK-01 (institucional exige).
- **Autoridade**: HEURÍSTICA.

### EMP-13 · Pessoa-chave e sucessão
- **Executa**: (1) identificar funções críticas concentradas em uma pessoa, como relacionamento comercial, tecnologia, operação ou acesso bancário; (2) verificar sucessão formal, delegação, segunda linha, seguro-chave e continuidade operacional; (3) registrar somente informações profissionais pertinentes, fornecidas de forma legítima e necessárias ao caso. Não inferir saúde, longevidade ou risco por idade.
- **Verificação**: dependência funcional não mitigada cujo horizonte conflita com o prazo da dívida vira risco de continuidade nomeado, sem usar dado pessoal sensível como atalho.
- **Saída**: {função_crítica, dependência, mitigantes_existentes, lacuna_de_continuidade}.
- **A jusante**: ES-34, RF-11, MA-07.
- **Autoridade**: MERCADO.

### EMP-14 · Histórico dos sócios
- **Executa**: (1) consultar somente fontes permitidas, documentadas e pertinentes ao risco profissional ou empresarial; (2) mapear empresas anteriores e eventos societários relevantes; (3) submeter achado material a confirmação de identidade, contexto e contraditório com a companhia antes de qualquer uso. Dados pessoais sensíveis, rumores e notícia sem confirmação não alimentam decisão automática.
- **Verificação**: finalidade, base legal, fonte, data, identidade e acesso ficam registrados; achado material confirmado aparece com contexto e desfecho, e achado de integridade grave segue RF-19 para decisão humana.
- **Armadilha**: homônimo, processo rotineiro tratado como integridade, notícia duplicada ou desatualizada e coleta excessiva de dados pessoais.
- **Saída**: {achado, fonte, gravidade, tratamento}.
- **A jusante**: RF-19, MA-08.
- **Autoridade**: CASA.

### EMP-15 · Gestão abaixo do dono
- **Executa**: mapear: CFO próprio ou contador terceirizado? controladoria? comercial estruturado?; usar o proxy operacional: prazo e consistência das respostas do intake (quem respondeu, em quanto tempo, com que qualidade).
- **Verificação**: o proxy é registrado como observação datada; empresa que precisa do dono para todo dado é descrita assim (afeta a execução da operação e o pós-fechamento).
- **Saída**: o quadro de gestão + proxy de qualidade de resposta.
- **A jusante**: MA-08, EMP-16.
- **Autoridade**: HEURÍSTICA.

### EMP-16 · Sistemas e qualidade da informação
- **Executa**: (1) identificar ERP, data de implantação e controles paralelos; (2) medir tempo de fechamento, consistência entre extrações, reconciliação analítico-sintética, completude de campos e estabilidade de versões; (3) classificar confiança com a rubrica versionada da casa, preservando os fatores e não apenas o rótulo.
- **Verificação**: confiança baixa aumenta a amostra de conferência da Etapa 5, conciliação e base financeira, e permanece interna. Tempo de fechamento é uma observação, não um julgamento isolado.
- **Saída**: {erp, idade, paralelas, tempo_de_fechamento, classe_de_confiança}.
- **A jusante**: Etapa 5, conciliação e base financeira; RF-14.
- **Autoridade**: HEURÍSTICA.

### EMP-17 · Ambiental e licenças
- **Executa**: (1) inventário de licenças de operação com validade; (2) passivo ambiental conhecido (autos, TACs, embargos); (3) nos setores de terra/água/resíduo (lentes: agro, química, mineração, frigorífico), seção obrigatória com evidência.
- **Verificação**: licença essencial vencendo dentro do prazo da dívida vira CP ou covenant (renovação); passivo não provisionado quantificado na análise (D-16).
- **Saída**: {licença, validade, status} + passivos.
- **A jusante**: OP-09, ES-33, MA-07.
- **Autoridade**: LEI/CASA.

### EMP-18 · Seguros
- **Executa**: inventário: dano, lucro cessante, responsabilidade civil, D&O, chave; cobertura vs valor dos ativos críticos; beneficiários.
- **Verificação**: ativo essencial sem seguro adequado vira CP típica (endosso com a credora como beneficiária, MA-20); lucro cessante ausente em planta única é risco nomeado.
- **Saída**: {apólice, cobertura, vigência, gap}.
- **A jusante**: OP-09, ES-13/15.
- **Autoridade**: DEF.

### EMP-19 · Obsolescência e substituição
- **Executa**: testar o produto/ativo contra o prazo da dívida: risco de substituição tecnológica, regulatória (transição energética) ou de hábito; vida econômica do ativo principal vs tenor proposto.
- **Verificação**: dívida de 7 anos sobre ativo com vida econômica de 4 é descasamento estrutural que preço não conserta; bloqueia em ES-05 se não tratado (amortização mais curta).
- **Saída**: {ativo/produto, vida_econômica, risco_de_substituição, casamento_com_tenor}.
- **A jusante**: ES-05/06.
- **Autoridade**: HEURÍSTICA.

### EMP-20 · Por que agora
- **Executa**: capturar a história do pedido em uma resposta concreta: contrato assinado, capacidade esgotada (com utilização medida), janela de aquisição, vencimento datado; rejeitar o genérico ("aproveitar oportunidades").
- **Verificação**: o "por que agora" abre o memo (MA-05) e precisa de evidência; sem resposta concreta, a mesa investiga a real (IN-23: liquidez disfarçada?).
- **Saída**: o parágrafo com a evidência.
- **A jusante**: MA-05, IN-23.
- **Autoridade**: CASA.

## Lentes setoriais (EMP-21 a EMP-30)

Cada lente é um checklist executável: as perguntas que a análise responde (ao caso, não ao
cliente), os índices específicos, as armadilhas do setor e os instrumentos naturais. A
lente ativa entra na Etapa 7, análise da companhia e da transação, e alimenta o Q&A antecipado de MA-22.

### EMP-21 · Agro
- **Responde**: produção própria ou originação?; exposição a preço: % do volume com hedge, a que preço, com quem (contraparte do hedge é risco também); armazenagem própria (capacidade vs produção)?; terra própria ou arrendada (prazo dos arrendamentos vs prazo da dívida; arrendamento curto é risco de continuidade); risco climático segurado (% da área)?; Funrural e passivo fundiário conferidos; barter: % das compras e efeito no balanço.
- **Índices**: custo por hectare/cabeça vs referência regional; produtividade vs média da região; % da safra travada.
- **Armadilha**: EBITDA de ano de preço alto tratado como recorrente (EMP-07 severo no agro); estoque de commodity marcado a preço de pico.
- **Instrumentos naturais**: CPR, CRA, NCE se exporta; a lente alimenta a elegibilidade.
- **Autoridade**: MERCADO.

### EMP-22 · Varejo
- **Responde**: same-store sales vs crescimento por abertura (abrir loja compra receita, não eficiência); aluguel: % da receita e efeito IFRS 16 (D-08); estoque por loja e ruptura; e-commerce: canibaliza ou soma (margem por canal); prazo recebido (cartão, crediário próprio?) vs pago; calendário promocional.
- **Índices**: SSS, venda/m², estoque em dias por categoria, margem por canal.
- **Armadilha**: crescimento total escondendo SSS negativo; crediário próprio é operação de crédito dentro do varejo (analisar como carteira, Q-14).
- **Autoridade**: MERCADO.

### EMP-23 · Indústria
- **Responde**: utilização de capacidade real (turnos, gargalo); idade média dos ativos e capex de manutenção verdadeiro (Q-03); energia: % do custo e contrato; insumo importado: % e casamento cambial (Q-12); carteira de pedidos (cobertura em meses); certificações que travam cliente (perda de certificação = perda de receita).
- **Índices**: utilização %, backlog em meses, custo unitário vs pares.
- **Armadilha**: "capacidade para dobrar" com gargalo em utilidade/licença não dito; margem de ano de câmbio favorável.
- **Autoridade**: MERCADO.

### EMP-24 · Serviços recorrentes e software
- **Responde**: receita recorrente REAL (contrato com renovação) vs reapresentada; churn bruto e líquido por safra de cliente; CAC e payback; receita diferida (passivo de serviço a prestar); concentração (Q-06) e prazo dos contratos âncora.
- **Índices**: churn líquido, NRR, CAC payback, % receita contratada 12m à frente.
- **Armadilha**: ARR inflado por contrato anual pago mensal com cancelamento livre; recorrência só vale o churn que a comprova.
- **Autoridade**: MERCADO.

### EMP-25 · Saúde
- **Responde**: mix de fonte pagadora (particular / convênio / público) com prazo REAL de cada uma; glosa histórica (% faturado não recebido) e provisão; risco de descredenciamento dos convênios âncora; corpo clínico: próprio ou aberto (dependência de médico-chave, EMP-13); se operadora: regulação ANS, sinistralidade, reservas.
- **Índices**: glosa %, PMR por pagador, ocupação/produção por unidade.
- **Armadilha**: receita pública contabilizada no faturamento e recebida em 180+ dias; a NCG real é outra (Q-04 por pagador).
- **Autoridade**: MERCADO.

### EMP-26 · Educação
- **Responde**: dependência de financiamento público no histórico e na projeção; evasão por safra de aluno; sazonalidade de matrícula (caixa concentrado no semestre); capacidade física vs base de alunos; EAD: canibaliza mensalidade presencial?
- **Índices**: evasão %, ticket médio líquido de bolsa, ocupação.
- **Armadilha**: receita bruta antes de bolsa/desconto tratada como receita; a líquida é a que paga dívida.
- **Autoridade**: MERCADO.

### EMP-27 · Energia
- **Responde**: contratado (PPA: prazo, contraparte, indexador, cláusulas de término) vs mercado livre (% e risco de preço); risco de geração (GSF em hídrica, P50 vs P90 em solar/eólica: a análise usa P90); O&M contratado com quem; a SPE e a cascata (ES-21); regulatório com prazo (subsídios, MMGD).
- **Índices**: % contratada, prazo médio dos PPAs, geração realizada vs P50/P90.
- **Armadilha**: projeção em P50 (média) quando o serviço da dívida exige P90 (ano ruim); contraparte fraca no PPA (o contrato vale o crédito dela).
- **Instrumento natural**: debênture incentivada, estrutura em SPE.
- **Autoridade**: MERCADO.

### EMP-28 · Imobiliário e incorporação
- **Responde**: landbank: forma de aquisição (permuta reduz caixa mas dilui margem) e prazo; VGV lançado vs vendido vs repassado (a cascata real); distrato histórico %; obra própria ou terceirada (risco de execução); SPEs por projeto e o que consolida (EMP-10 crítico); recebíveis performados vs a performar (ES-12); INCC no custo vs índice da receita (descasamento de indexador).
- **Índices**: VSO, distrato %, custo de obra vs orçado, % vendido das lançadas.
- **Armadilha**: VGV como se fosse receita; margem de projeto antes de distrato e permuta.
- **Instrumento natural**: CRI; a lente alimenta ES-12/13.
- **Autoridade**: MERCADO.

### EMP-29 · Transporte e logística
- **Responde**: frota própria vs agregado (capex vs custo variável); idade média da frota e capex de renovação embutido (Q-03); contrato vs spot (% e prazo); diesel: % do custo e cláusula de repasse; sinistralidade e seguro; dependência de embarcador único (Q-06).
- **Índices**: custo/km vs receita/km, idade média, % contratada.
- **Armadilha**: frota velha com capex de renovação represado: o EBITDA atual embute o capex que não foi feito.
- **Instrumento natural**: AF de frota (ES-15).
- **Autoridade**: MERCADO.

### EMP-30 · Construção pesada e infraestrutura
- **Responde**: backlog assinado vs faturamento anual (cobertura em anos); qualidade do backlog: contratos assinados vs pleitos e aditivos (receita de qualidade inferior); pagador público vs privado e prazo REAL de medição/recebimento; consórcios: responsabilidade solidária mapeada; garantias de performance emitidas consumindo limite bancário.
- **Índices**: backlog/receita, % público, prazo médio de recebimento por pagador, pleitos/receita.
- **Armadilha**: backlog inflado por contrato com ordem de serviço não emitida; pleito contabilizado como receita provável.
- **Autoridade**: MERCADO.

---

# MÓDULO 2 · QUALIDADE DOS NÚMEROS E SPREADING (Q-01 a Q-18)

Formato executável: **Executa** (passo a passo), **Fonte**, **Verificação** (teste objetivo
com limiar), **Armadilha**, **Saída** (o artefato estruturado que o procedimento produz),
**A jusante**, **Autoridade**.

### Q-01 · A régua dos ajustes de EBITDA
- **Executa**: (1) listar todo ajuste proposto pela empresa ou pelo assessor, um a um, com valor e período; (2) classificar cada um contra o catálogo da casa: ACEITO com documento (sinistro com boletim e indenização de seguro; multa contratual única com contrato; reestruturação com plano formal, datas e rescisões pagas; despesa pré-operacional de unidade nova com centro de custo próprio; honorários de transação não recorrentes com nota fiscal), REJEITADO (sinergia futura; "ajustado da administração" sem abertura item a item; aluguel pró-forma de sale-leaseback não assinado; normalização repetida em 2 ou mais exercícios dos últimos 3; ajuste de "mercado difícil"), CASO A CASO com regra (stock compensation: aceita se recorrente for excluída dos dois lados; equivalência: exclui resultado e dividendo recebido entra no fluxo); (3) exigir memória de cálculo e âncora documental de cada aceito; (4) recomputar o EBITDA ajustado da mesa somando só os aceitos.
- **Fonte**: DRE, notas explicativas, razão das contas de despesa citadas, documentos do evento.
- **Verificação**: soma dos aceitos + reportado = ajustado da mesa, sem tolerância econômica; nenhum aceito sem âncora. Materialidade individual, materialidade agregada e recorrência são dados versionados por porte, período e qualidade da base, e governam destaque, confiança e cenário.
- **Armadilha**: o mesmo ajuste "não recorrente" aparecendo em 3 anos seguidos com nomes diferentes; comparar a lista de ajustes entre exercícios antes de aceitar.
- **Saída**: tabela {ajuste_id, descrição, valor, período, classe, âncora, justificativa} + EBITDA reportado, EBITDA mesa, delta %.
- **A jusante**: ES-01, ES-31, MA-10.
- **Autoridade**: CASA (catálogo), MERCADO (o que o comprador aceita).

### Q-02 · Conversão de EBITDA em caixa
- **Executa**: (1) partir do EBITDA mesa de Q-01; (2) abrir ajustes sem efeito caixa e impedir dupla contagem; (3) subtrair IR e CS efetivamente pagos; (4) calcular a variação de capital de giro conta a conta, removendo risco sacado conforme D-06; (5) subtrair capex de manutenção de Q-03 e compromissos operacionais mínimos; (6) aplicar a convenção de arrendamentos escolhida em D-08; (7) separar caixa restrito, distribuições obrigatórias e fluxos fora do perímetro; (8) produzir a ponte operacional até CFADS e a ponte completa de caixa disponível para serviço, por período, entidade, moeda e cenário.
- **Fonte**: DFC, DRE, balanços, balancetes, razão das contas materiais, notas, registro de ativos, impostos pagos, contratos de arrendamento, extratos e mapa de caixa restrito. Na ausência de DFC confiável, reconstruir pelo método indireto com cada movimento rastreável.
- **Verificação**: a ponte completa reconcilia com a variação de caixa do balanço depois de serviço da dívida, investimento, financiamento, distribuições e demais fluxos. Tolerância e materialidade são versionadas por moeda, escala e qualidade da base. Conversão abaixo da faixa de referência exige causa nomeada, não conclusão automática.
- **Armadilha**: usar imposto de competência, tratar caixa restrito como disponível, misturar lease no numerador e no denominador, omitir distribuição ou capex comprometido e chamar saldo de data de liquidez recorrente.
- **Saída**: série {período, entidade, moeda, EBITDA_mesa, itens_sem_caixa, impostos_caixa, variação_NCG, capex_manutenção, arrendamentos_conforme_convenção, outros_fluxos, CFADS, caixa_livre_inicial, caixa_restrito, caixa_disponível_serviço, conversão, reconciliação}.
- **A jusante**: ES-02 (DSCR usa CFADS), MA-13.
- **Autoridade**: DEF.

### Q-03 · Capex de manutenção vs expansão
- **Executa**: (1) reconciliar adições do imobilizado e intangível com o registro de ativos e o fluxo de investimento; (2) classificar projeto a projeto por finalidade: reposição, segurança ou conformidade, manutenção de capacidade, eficiência, expansão ou aquisição; (3) estimar manutenção com histórico por ativo, idade, utilização, plano de reposição, ordens de manutenção e engenharia do negócio; (4) usar depreciação somente como referência de contraste, nunca como piso universal; (5) tratar incerteza com faixa e cenário, sem converter falta de dado em precisão falsa.
- **Fonte**: notas de imobilizado e intangível, registro de ativos, orçamento, ordens de manutenção, plano de reposição, cronograma físico, evidência de capacidade e entrevista técnica registrada.
- **Verificação**: todo projeto material tem finalidade, ativo, período, valor e evidência. Recorrência, reposição atrasada, ativo totalmente depreciado ainda em uso, inflação, componentização, leasing e software capitalizado são testados antes de qualquer proxy.
- **Armadilha**: igualar depreciação a manutenção, aceitar todo projeto chamado de expansão, ignorar capex represado ou misturar investimento de crescimento com conformidade obrigatória.
- **Saída**: {período, projeto, ativo, valor, classe, método, faixa, evidências, confiança} + ponte capex total para manutenção e expansão.
- **A jusante**: Q-02, OP-02, MA-13.
- **Autoridade**: DEF/HEURÍSTICA (fator setorial versionado).

### Q-04 · Capital de giro normalizado
- **Executa**: (1) NCG mensal = clientes + estoques − fornecedores (± operacionais relevantes) com balancetes mensais de 24 meses; (2) média, pico, vale; (3) NCG de 31/12 vs média = efeito foto; (4) dias (PMR, PME, PMP) recalculados sobre médias.
- **Fonte**: balancetes mensais (IN-04/05); na falta, trimestrais com ressalva registrada.
- **Verificação**: materialidade do efeito foto e da divergência de dias segue a política versionada por setor, sazonalidade e qualidade da série. A análise usa média, mediana, pico ou mês comparável conforme a finalidade, sempre com a escolha declarada.
- **Armadilha**: fornecedores inflados por risco sacado (D-06) derrubando a NCG aparente; a normalizada usa fornecedores ex-confirming.
- **Saída**: série mensal + {média, pico, vale, mês_do_pico, efeito_foto%} + dias normalizados.
- **A jusante**: OP-06, ES-08, D-26.
- **Autoridade**: DEF.

### Q-05 · Reconhecimento de receita
- **Executa**: (1) ler a política na nota; (2) teste setorial: construção (POC: evolução × contrato, conferir medições), software (licença vs assinatura, receita diferida), agro (faturamento antecipado vs entrega), indústria (bill and hold); (3) cut-off: receita da última quinzena vs média quinzenal do ano; (4) devoluções e cancelamentos dos 60 dias pós-fechamento.
- **Fonte**: notas, razão de receita por mês, relatórios de medição/entrega.
- **Verificação**: cut-off, concentração de fim de período e devoluções são comparados com limiares versionados por setor e sazonalidade; quebra abre exceção e investigação antes de qualquer ajuste.
- **Armadilha**: receita intercompany (Q-07) contada como mercado.
- **Saída**: {política, testes, exceções, ajustes_propostos}.
- **A jusante**: Q-01, RF-08.
- **Autoridade**: DEF.

### Q-06 · Concentração de clientes
- **Executa**: (1) ranking sobre período comparável agrupando CNPJs do mesmo grupo econômico; (2) top1, top5 e top10; (3) para cada cliente material conforme a política versionada: contrato e prazo, renovações, margem, substituibilidade, prazo praticado e risco público permitido; (4) cruzar com aging de Q-14.
- **Fonte**: analítico de faturamento, contratos.
- **Verificação**: concentração acima da faixa de materialidade dispara análise da contraparte e cenário calibrado de redução ou perda. A severidade considera contrato, qualidade, margem, dependência mútua e substituibilidade, sem equivalência automática de créditos.
- **Armadilha**: concentração diluída por múltiplos CNPJs do mesmo comprador; agrupar antes de rankear.
- **Saída**: {cliente_grupo, %receita, contrato, renovações, PMR_específico, risco} + top1/5/10.
- **A jusante**: MA-07, ES-11, cenários da Etapa 7, análise da companhia e da transação.
- **Autoridade**: CASA (limiares), DEF (método).

### Q-07 · Partes relacionadas na DRE
- **Executa**: (1) lista de CNPJs ligados (EMP-10); (2) filtrar receita e compras contra a lista; (3) margem bruta ex-ligadas; (4) preço dos fluxos relevantes vs terceiro comparável.
- **Fonte**: nota de partes relacionadas, analíticos, quadro societário.
- **Verificação**: materialidade do fluxo e da divergência de margem segue política versionada. O sistema mostra as visões com e sem ligadas e só substitui a base de capacidade quando o tratamento econômico estiver documentado.
- **Armadilha**: a nota listando só o que a auditoria pegou; o cruzamento por CNPJ é o teste real.
- **Saída**: {contraparte, natureza, valor, %linha, preço_vs_mercado} + margens com/sem.
- **A jusante**: RF-09, ES-26/27.
- **Autoridade**: DEF.

### Q-08 · Qualidade da auditoria
- **Executa**: (1) firma, mandato, trocas em 5 anos; (2) opinião por exercício: limpa/ênfase/ressalva/abstenção; (3) transcrever ênfases e ressalvas ligando à conta afetada; (4) efeito: ressalva em estoque/recebível contamina a garantia; incerteza de continuidade muda o caso.
- **Fonte**: relatórios do auditor, 3 exercícios.
- **Verificação**: sem auditoria não bloqueia análise, mas marca o teto de compradores (MK-01) e entra no memo; ressalva repetida sem tratamento é flag composta (RF-05/18).
- **Armadilha**: "revisão limitada" apresentada como auditoria; asseguranças diferentes, o material distingue.
- **Saída**: {ano, firma, opinião, ênfases[], ressalvas[], efeito}.
- **A jusante**: MK-12, RF-05.
- **Autoridade**: DEF.

### Q-09 · Balancete vs auditado
- **Executa**: (1) mapear plano de contas → linhas do auditado; (2) comparar cada linha relevante no mesmo período; (3) listar diferenças acima do limiar; (4) medir o viés direcional.
- **Fonte**: balancete analítico do fechamento e DF auditada do mesmo exercício.
- **Verificação**: materialidade por conta e a régua de viés são versionadas por escala e qualidade da base. Viés persistente abre RF-07 e calibra cenários por método aprovado, sem haircut arbitrário.
- **Armadilha**: ajustes de auditoria lançados no exercício seguinte "melhorando" o balancete corrente; conferir aberturas.
- **Saída**: {conta, gerencial, auditado, delta, direção}[] + índice de viés.
- **A jusante**: Etapa 5, conciliação e base financeira; RF-07.
- **Autoridade**: DEF.

### Q-10 · Projeções contra o histórico
- **Executa**: (1) extrair crescimento, margem e premissas da projeção da empresa; (2) comparar: CAGR projetado vs entregue em 3 anos; margem projetada vs melhor histórica; (3) para cada premissa acima do histórico, exigir driver físico (capacidade com data, contrato assinado, preço contratado); (4) montar o cenário-mesa: histórico como base + drivers comprovados, o resto cortado.
- **Fonte**: modelo da empresa, contratos, orçamento.
- **Verificação**: premissa fora da faixa histórica e sem driver verificável é substituída no cenário mesa por premissa sustentada ou por faixa de sensibilidade. Os limiares de desvio são versionados por arquétipo; o material mostra separadamente a projeção da empresa e o cenário Offroad.
- **Armadilha**: driver circular ("com o dinheiro cresceremos, logo pagamos"); o cenário-mesa aplica ramp-up realista com atraso (ES-09).
- **Saída**: {premissa, valor_empresa, histórico, driver, veredicto, valor_mesa}[] + série da mesa.
- **A jusante**: ES-02, MA-13.
- **Autoridade**: CASA.

### Q-11 · Sazonalidade e o mês da foto
- **Executa**: (1) índice sazonal mensal = receita do mês / média mensal, sobre 24m; (2) idem NCG; (3) toda métrica pontual carimbada com o mês e lida contra o índice.
- **Verificação**: comparações usam mês contra mês ou janela sazonal equivalente; amplitude acima da política versionada obriga testar desenho sazonal em ES-08.
- **Saída**: índices mensais de receita e NCG + amplitude.
- **A jusante**: ES-08, Q-04.
- **Autoridade**: DEF.

### Q-12 · Moeda e descasamento
- **Executa**: (1) mapa receita/custo/dívida por moeda; (2) exposição líquida = (receita − custo) em moeda − serviço da dívida em moeda; (3) conferir derivativos (D-13) contra a exposição.
- **Verificação**: exposição líquida acima da materialidade versionada vira risco nomeado e cenário cambial. A janela de mix usada é definida por sazonalidade e mudança estrutural, não por período fixo universal.
- **Armadilha**: hedge natural que o mix corrente já desfez ou derivativo cujo notional, prazo e contraparte não casam com a exposição.
- **Saída**: {moeda, receita, custo, dívida, exposição} + efeito do choque.
- **A jusante**: MA-07, D-12.
- **Autoridade**: DEF.

### Q-13 · Estoque: giro, idade, provisão
- **Executa**: (1) giro por linha (CPV da linha / estoque médio); (2) idade por faixas; (3) provisão vs perdas efetivas 24m; (4) teste RF-01.
- **Verificação**: descolamento persistente entre estoque e receita, segundo janela e materialidade versionadas, dispara RF-01; provisão é comparada com perdas e obsolescência por linha antes de qualquer ajuste.
- **Saída**: {linha, giro, idade, provisão, perda_efetiva} + veredicto de garantia (ES-14).
- **A jusante**: ES-14, RF-01.
- **Autoridade**: DEF.

### Q-14 · Qualidade do contas a receber
- **Executa**: (1) aging (a vencer, 1-30, 31-60, 61-90, 90+); (2) PDD vs incorrido 24m; (3) renegociados dentro do a-vencer (pergunta interna + razão); (4) PMR por cliente relevante.
- **Verificação**: atraso e cobertura de provisão são testados contra política versionada por carteira, setor e histórico. Renegociado permanece identificado separadamente e seu tratamento depende da evidência de pagamento, sem retorno automático à faixa original.
- **Armadilha**: aging da data boa (logo após o grande pagar); pedir 3 datas espalhadas.
- **Saída**: aging + {provisão, incorrido, gap} + carteira elegível líquida (ES-11).
- **A jusante**: ES-11, RF-02.
- **Autoridade**: DEF.

### Q-15 · Passivo trabalhista recorrente
- **Executa**: (1) desembolso efetivo (acordos + condenações) por ano, 3 anos; (2) média como custo recorrente quando estrutural do setor; (3) provisão vs estoque de processos (D-16).
- **Verificação**: recorrência e materialidade do desembolso seguem política versionada e natureza do passivo. A inclusão no CFADS exige evidência de que o fluxo é operacional recorrente e evita dupla contagem com provisão ou contingência.
- **Saída**: {ano, desembolso, provisão, estoque} + linha recorrente proposta.
- **A jusante**: Q-02, D-16.
- **Autoridade**: DEF/HEURÍSTICA.

### Q-16 · EBITDA por unidade
- **Executa**: (1) abrir receita e margem por unidade/segmento; (2) identificar deficitária persistente; (3) testar subsídio cruzado e o efeito de descontinuação.
- **Verificação**: unidade com desempenho negativo persistente ou consumo material de caixa, segundo a política versionada, vira investigação e cenário com e sem continuidade.
- **Saída**: {unidade, receita, EBITDA, tendência} + cenário.
- **A jusante**: Etapa 7, análise da companhia e da transação; ES-16.
- **Autoridade**: HEURÍSTICA.

### Q-17 · Identidades obrigatórias
- **Executa**: rodar em toda peça: (1) ativo = passivo + PL; (2) lucro concilia com mutação do PL (± dividendos, aportes); (3) depreciação DRE concilia com movimentação do imobilizado; (4) caixa final do fluxo = caixa do balanço; (5) impostos sobre venda coerentes com o regime.
- **Verificação**: cada identidade possui tolerância versionada por natureza, moeda, escala e arredondamento; identidades exatas permanecem com tolerância zero econômica. Falha material bloqueia o uso daquela peça e gera divergência acionável, sem bloquear partes independentes já válidas.
- **Armadilha**: peça "consertada" sem trilha; versão nova entra como versão e a diferença é listada.
- **Saída**: {identidade, esquerda, direita, delta, veredicto} por peça.
- **A jusante**: gate da Etapa 5, conciliação e base financeira.
- **Autoridade**: DEF.

### Q-18 · O spread da casa
- **Executa**: planilha padronizada com histórico mínimo definido por arquétipo, LTM quando suportado e cenários; linhas fixas do layout, incluindo receita, custos, EBITDA reportado e mesa, financeiro aberto, capex, NCG, visões de obrigações de D-24 e métricas indicativas. Cada célula material tem fonte ou cálculo rastreável.
- **Verificação**: 100% das células materiais com fonte, identidades de Q-17 verdes e reprodução independente dentro do critério de aceitação versionado. Velocidade de reprodução é métrica operacional, não substitui exatidão.
- **Saída**: o spread padronizado, anexo do memo (MA-10) e base do modelo (MA-27).
- **A jusante**: tudo; é a base única.
- **Autoridade**: CASA.

---

# MÓDULO 3 · A FOTO REAL DA DÍVIDA (completo, 31 procedimentos)

O balanço brasileiro subdeclara dívida por construção. O trabalho da mesa é reconstruir a
posição verdadeira antes de qualquer conta de capacidade. Um memo que descobre risco sacado
na diligência do fundo, e não antes, queimou a operação e a casa.

## 3.1 Inventário do que está declarado

### D-01 · Relação analítica de contratos
- **Pedir**: planilha contrato a contrato: credor, modalidade, data de contratação, saldo atual, indexador, spread, vencimento final, cronograma de amortização, garantias vinculadas, covenants existentes.
- **Fonte**: nota explicativa de empréstimos; balancete (grupos 2.1 e 2.2); posição consolidada que todo CFO tem para o banco.
- **Verificar**: soma da relação contra notas, balanço e balancete. Divergência acima da tolerância versionada por moeda, escala e arredondamento vira exceção nomeada, nunca ajuste silencioso.
- **Armadilha**: a relação que a empresa manda costuma ser a "dívida bancária", sem debêntures, sem parcelamentos, sem mútuo de sócio.
- **Mercado lê**: relação completa entregue rápido = casa organizada. Três versões diferentes da mesma relação = red flag por si só.
- **A jusante**: alimenta perfil de vencimento, custo médio, covenant de alavancagem e a tabela de dívida do memo.
- **Autoridade**: CASA

### D-02 · Abertura por indexador
- **Pedir**: cada contrato marcado como CDI+, %CDI, pré, IPCA+, TLP, USD ou outra moeda.
- **Verificar**: recomputar o custo médio ponderado; conferir contra a despesa financeira da DRE (custo médio × dívida média deve chegar perto da despesa de juros; desvio grande indica dívida não declarada ou capitalização de juros).
- **Armadilha**: "CDI + 3" e "115% do CDI" não são comparáveis diretamente; normalizar tudo para spread sobre CDI na data.
- **A jusante**: teste de estresse de juros (D-27), pricing da nova dívida, term sheet.
- **Autoridade**: DEF

### D-03 · Cronograma de vencimentos por ano
- **Pedir**: amortizações ano a ano, pelo menos 5 anos, contrato a contrato.
- **Verificar**: soma dos anos = dívida total; parcela em 12 meses = dívida de curto prazo do balanço.
- **Armadilha**: cláusula de vencimento antecipado por quebra de covenant torna dívida longa em dívida à vista; o cronograma contratual não é o cronograma em cenário de quebra.
- **Mercado lê**: concentração material de vencimento segundo a política versionada é uma das primeiras leituras; operações declaradas de expansão podem conter necessidade relevante de reperfilamento, que deve ser decomposta e discutida.
- **A jusante**: define se a operação real é alongamento; desenha a amortização da nova dívida para não criar parede nova.
- **Autoridade**: CASA

### D-04 · Concentração de credor
- **Pedir**: dívida por credor, com limite total e utilizado por banco.
- **Verificar**: concentração acima da faixa versionada por tipo de linha e credor exige teste de não renovação e histórico. Percentual isolado não prova risco sem prazo, garantia, comportamento e alternativas.
- **Mercado lê**: banco grande reduzindo exposição em silêncio é sinal que o fundo pesca; a mesa precisa saber antes e ter a resposta.
- **A jusante**: argumento de diversificação no memo; urgência real da operação.
- **Autoridade**: HEURÍSTICA

### D-05 · Linhas de curto prazo e dependência de rolagem
- **Pedir**: limites aprovados vs utilizados (giro, desconto, conta garantida, ACC).
- **Verificar**: quanto do capital de giro estrutural está financiado por linha que vence em menos de 12 meses e depende de renovação unilateral do banco.
- **Armadilha**: empresa "sem dívida longa" às vezes é empresa que nenhum banco quis alongar.
- **A jusante**: estresse de não-rolagem (D-28); tese de alongamento como uso de recursos legítimo.
- **Autoridade**: CASA

## 3.2 A dívida que não está na linha de dívida

### D-06 · Risco sacado / confirming / forfait
- **Onde se esconde**: na linha de fornecedores, não em empréstimos.
- **Detectar**: prazo médio de fornecedores fora da faixa setorial versionada; nota de fornecedores citando operações com instituições financeiras; contrato, extrato e confirmação operacional do programa; pergunta simples ao CFO sobre antecipação a fornecedores.
- **Tratamento**: identificar obrigação, financiador, prazo, recurso, cancelamento e efeito no capital de giro. Classificar nas visões apropriadas de D-24 conforme substância e definição usada. Não reclassificar automaticamente toda antecipação sem ler a mecânica e a contabilização.
- **Armadilha**: a empresa não considera dívida "porque quem antecipa é o fornecedor". O caixa dela é que sustenta o programa; cancelado o convênio, o prazo volta e o buraco de giro aparece de uma vez.
- **A jusante**: alavancagem pró-forma, covenant de dívida líquida (a definição contábil do covenant precisa capturar risco sacado explicitamente).
- **Autoridade**: MERCADO (consenso das mesas desde os casos Americanas/Light)

### D-07 · Recebíveis cedidos e descontados
- **Detectar**: nota de recebíveis (cessão "com coobrigação" ou "sem coobrigação"); conta redutora; movimentação em FIDC próprio.
- **Tratamento**: medir separadamente coobrigação, obrigação de recompra, first loss, excesso de spread, suporte de liquidez, consolidação ou baixa contábil, subordinação e perda máxima retida. A existência de cota subordinada não autoriza somar automaticamente toda a carteira à dívida; o efeito depende da exposição econômica e da visão de D-24. FIDC é veículo, não sinônimo da carteira ou do instrumento.
- **Armadilha**: "vendemos sem coobrigação" com contrato prevendo recompra de título vencido é coobrigação com outro nome; pedir o contrato de cessão, não a descrição.
- **A jusante**: base de recebíveis livre para garantia da nova operação (o que já está cedido não está disponível, e descobrir isso tarde derruba a estrutura inteira).
- **Autoridade**: DEF

### D-08 · Arrendamentos (IFRS 16)
- **Regra da casa**: declarar a convenção e nunca misturar. Ou dívida incluindo passivo de arrendamento com EBITDA pós-IFRS 16, ou dívida ex-arrendamento com o aluguel de volta no EBITDA. Alavancagem com dívida ex-arrendamento e EBITDA pós-IFRS 16 é o erro mais comum de material amador, e melhora o número artificialmente.
- **Verificar**: nota de arrendamentos; taxa incremental usada; prazo remanescente.
- **A jusante**: covenant precisa da mesma convenção escrita na definição contábil, senão a apuração trimestral vira briga.
- **Autoridade**: DEF

### D-09 · Parcelamentos tributários
- **Detectar**: REFIS, PERT, parcelamentos ordinários; nas notas ou no balancete (tributos parcelados).
- **Tratamento**: obrigação fiscal parcelada com cronograma próprio. Entra na visão de obrigações de caixa e somente entra na visão de dívida ou covenant quando a definição aplicável assim exigir. Senioridade, consequências de inadimplemento e possibilidade de reparcelamento dependem do programa e da lei vigente.
- **Armadilha**: exclusão do parcelamento por inadimplência restaura multa e juros originais, um passivo contingente escondido dentro do parcelamento.
- **A jusante**: cronograma consolidado; CND como condição precedente da operação.
- **Autoridade**: DEF

### D-10 · Fianças, avais e garantias a terceiros
- **Pedir**: nota de compromissos e garantias; perguntar por avais cruzados dentro do grupo.
- **Tratamento**: exposição contingente; se o garantido é empresa do grupo alavancada, a análise consolida a visão de risco mesmo que a contabilidade não consolide.
- **Armadilha**: sócio pessoa física avalista de tudo dilui o valor do aval na nova operação; mapear o estoque de avais existentes.
- **A jusante**: pacote de garantias da nova operação; covenant de limitação de garantias a terceiros.
- **Autoridade**: CASA

### D-11 · Mútuos com partes relacionadas
- **Pedir**: saldos e movimentação de mútuos ativos e passivos com sócios e empresas ligadas, taxa e prazo.
- **Tratamento**: mútuo passivo com sócio pode ser tratado como quase-equity se subordinado formalmente na operação (cláusula de subordinação e trava de pagamento); sem formalização, é dívida que compete com o novo credor.
- **Armadilha**: mútuo ativo com sócio pode representar extração de liquidez, conflito ou operação legítima. Finalidade, taxa, prazo, pagamento e aprovação societária determinam a leitura; o memo não o rotula sem evidência.
- **A jusante**: cláusula de subordinação no term sheet; ajuste do caixa livre real.
- **Autoridade**: MERCADO

### D-12 · ACC/ACE e dívida em moeda
- **Verificar**: dívida em moeda contra receita em moeda (hedge natural) ou contra derivativo de proteção; descasamento vira exposição nomeada no memo.
- **Armadilha**: exportadora com ACC barato e receita em real crescente (mix mudou) carrega descasamento que a média histórica esconde.
- **Autoridade**: DEF

### D-13 · Derivativos
- **Pedir**: posição de derivativos com MTM, finalidade (hedge ou resultado), contraparte e margem.
- **Armadilha**: estruturas alavancadas (target forward e afins) explodiram empresas boas em 2008; qualquer derivativo cuja perda potencial não é limitada vira red flag de governança, não só de caixa.
- **Autoridade**: CASA

### D-14 · Obrigações de aquisição, earn-outs e parcelas a pagar
- **Detectar**: notas de combinação de negócios; contratos de compra e venda.
- **Tratamento**: entra no ledger como obrigação contratual com data, condição e contraparte. A visão de D-24 define se participa de dívida financeira, obrigação de caixa ou cenário contingente.
- **Autoridade**: DEF

### D-15 · Dividendos declarados e não pagos, JCP provisionado
- **Tratamento**: obrigação com acionista a ser aberta por exigibilidade, possibilidade de reversão e restrições. Participa da ponte de caixa e somente da visão de dívida que a definição aplicável exigir.
- **A jusante**: dividend stopper no covenant.
- **Autoridade**: CASA

### D-16 · Contingências prováveis
- **Pedir**: nota de provisões e contingências; abertura por natureza (fiscal, trabalhista, cível) e por probabilidade.
- **Tratamento**: provisão provável permanece em ponte própria de obrigações e caixa. O efeito em dívida, alavancagem, covenant ou downside depende da definição e da expectativa de desembolso, com prevenção de dupla contagem. Contingência possível relevante entra como exposição nomeada, faixa e cenário quando suportados.
- **Armadilha**: empresa que reclassifica contingência de provável para possível na véspera da operação; comparar notas de dois exercícios.
- **Autoridade**: DEF

## 3.3 Custo, perfil e qualidade da dívida

### D-17 · Custo efetivo e custo contábil da dívida
- **Executa**: (1) normalizar por contrato indexador, spread, calendário, fees, custos amortizados, proteção cambial e saldo médio diário ou mensal disponível; (2) calcular separadamente custo caixa, custo contábil e custo all-in; (3) agregar por credor, indexador, moeda, entidade e consolidado; (4) reconciliar com D-25.
- **Fonte**: contratos, extratos, cronogramas, notas, razão de juros, tarifas, derivativos e custos de emissão.
- **Verificação**: todo peso usa saldo médio do mesmo período; indexadores usam curvas e datas coerentes; diferença com D-25 acima da tolerância versionada permanece aberta.
- **Armadilha**: misturar CDI mais spread com percentual do CDI, ignorar fees, anualizar período irregular de forma incorreta ou usar saldo final como saldo médio.
- **Saída**: {contrato, período, saldo_médio, indexador, spread, custo_caixa, custo_contábil, custo_all_in, fonte} + agregações.
- **A jusante**: D-25, PR-11, MA-10.
- **Autoridade**: DEF.

### D-18 · Vida média, duration e concentração temporal
- **Executa**: (1) calcular vida média ponderada pelo principal de cada contrato e do consolidado; (2) calcular duration econômica somente quando fluxo e curva permitirem; (3) separar prazo legal, vida média e concentração de principal; (4) repetir no pró-forma.
- **Fonte**: cronogramas de D-03, taxas de D-17 e curvas versionadas.
- **Verificação**: soma do principal por data concilia com D-01; bullet, balão e amortização extraordinária aparecem explicitamente; duration não é usada como sinônimo de prazo.
- **Armadilha**: defender alongamento apenas pelo vencimento final enquanto a vida média quase não muda.
- **Saída**: {contrato, vencimento_final, vida_média, duration_quando_aplicável, concentração} + comparativo atual e pró-forma.
- **A jusante**: ES-05, ES-10, MA-10.
- **Autoridade**: DEF.

### D-19 · Mapa de garantias, ônus e disponibilidade
- **Executa**: (1) inventariar ativo, titular, entidade devedora, credor beneficiário, tipo de ônus, prioridade, valor garantido, validade e documento; (2) vincular cada garantia ao contrato; (3) identificar sobreposição, cessão prévia, negative pledge e caminho de liberação; (4) separar valor contábil, laudo, valor elegível e disponibilidade jurídica ainda não confirmada.
- **Fonte**: contratos, certidões, registros oficiais, matrículas, registradoras, laudos e posições de gravame.
- **Verificação**: garantia só é marcada livre com evidência vigente; palavra da companhia é informação declarada, não confirmação registral.
- **Armadilha**: contar o mesmo fluxo ou ativo duas vezes, presumir liberação simultânea ou chamar valor residual de livre sem considerar prioridade.
- **Saída**: ledger {ativo, titular, ônus, prioridade, contrato, valor, disponibilidade, evidência, pendências}.
- **A jusante**: ES-11 a ES-22, OP-09, MA-10.
- **Autoridade**: LEI/DEF.

### D-20 · Covenants existentes e definições contratuais
- **Executa**: (1) extrair métrica, fórmula literal, perímetro, datas de teste, nível, cura, waiver, cross-default e consequências; (2) recomputar sobre a base reconciliada e também conforme a definição contratual; (3) medir folga atual e pró-forma; (4) registrar divergência de interpretação para revisão jurídica.
- **Fonte**: contratos e aditivos assinados, certificados de covenant, waivers e demonstrações usadas na apuração.
- **Verificação**: nenhuma métrica é reconstruída por nome genérico; a definição literal governa a visão contratual e permanece separada da visão analítica Offroad.
- **Armadilha**: aplicar a definição da nova estrutura ao contrato antigo ou assumir que waiver permanente altera o texto sem aditivo.
- **Saída**: {contrato, covenant, definição, nível, apuração, folga, cura, waiver, evidência}.
- **A jusante**: D-29, D-30, ES-04, ES-42.
- **Autoridade**: LEI/DEF.

### D-21 · Histórico de renegociação e comportamento de pagamento
- **Executa**: (1) mapear aditivos, carências, waivers, atrasos, pré-pagamentos e reduções de limite na janela versionada; (2) classificar motivo, iniciativa, contrapartida, cura e efeito econômico; (3) distinguir gestão preventiva de estresse recorrente.
- **Fonte**: contratos, aditivos, certificados, extratos, correspondências formais e registro da companhia.
- **Verificação**: cada evento tem data, contrato, causa e desfecho; ausência de evento é declarada somente quando a base permite verificar.
- **Armadilha**: tratar waiver como veto automático ou, no outro extremo, omiti-lo porque a obrigação foi curada.
- **Saída**: linha do tempo {evento, contrato, causa, termos, desfecho, evidência} + leitura de padrão.
- **A jusante**: MA-07, PR-11, MK-13.
- **Autoridade**: CASA.

### D-22 · Dívida e fluxo por entidade
- **Executa**: (1) mapear dívida, caixa, EBITDA, CFADS, garantias e dividendos por entidade; (2) identificar credores em holding e operadoras; (3) modelar restrições de subida de caixa e prioridade de credores; (4) produzir visão individual, consolidada e de subordinação estrutural.
- **Fonte**: organograma, demonstrações por entidade, contratos, acordos societários e fluxos intercompany.
- **Verificação**: eliminações e fluxos têm contrapartida; nenhuma dívida é comparada com caixa ou EBITDA de entidade inacessível sem ponte jurídica e econômica explícita.
- **Armadilha**: consolidar melhora o múltiplo mas esconde que caixa e garantia estão abaixo do credor.
- **Saída**: matriz entidade × {dívida, caixa, CFADS, garantias, restrições} + mapa de prioridade.
- **A jusante**: ES-36 a ES-39, MA-07/10.
- **Autoridade**: DEF.

### D-23 · SCR e confirmação externa autorizada
- **Executa**: quando a companhia disponibilizar legitimamente seus próprios dados, registrar consentimento, data-base e escopo; reconciliar instituições, modalidades, saldos, limites e atrasos com D-01; abrir divergências sem presumir culpa.
- **Fonte**: relatório fornecido pela própria companhia ou canal autorizado, contratos e extratos.
- **Verificação**: dado é usado apenas para a finalidade registrada e dentro da validade; divergência considera datas e critérios de reporte diferentes antes de virar flag.
- **Armadilha**: tratar SCR como verdade em tempo real, solicitar credencial pessoal ou inferir atraso por diferença de data.
- **Saída**: reconciliação {instituição, modalidade, saldo_declarado, saldo_externo, data_base, diferença, explicação}.
- **A jusante**: D-01, RF-14, MA-07.
- **Autoridade**: LEI/DEF.

## 3.4 Testes obrigatórios antes de qualquer estrutura

### D-24 · Ledger reconciliado e visões de obrigações
- **Executa**: (1) construir um ledger único por obrigação com entidade, contraparte, moeda, saldo, cronograma, recurso, garantia e fonte; (2) aplicar regras de inclusão versionadas para produzir, sem dupla contagem: dívida financeira bruta e líquida, dívida por covenant, obrigações de caixa para capacidade, quase dívida, contingências e exposições fora de balanço, além da visão específica do instrumento ou financiador; (3) reconciliar todas as visões à mesma base e explicar cada diferença.
- **Fonte**: D-01 a D-23, Q-02, contratos, demonstrações e evidências externas autorizadas.
- **Verificação**: cada linha aparece uma única vez no ledger e pode participar de várias visões com regra declarada; arrendamento, risco sacado, retenção em cessão, parcelamento, earn-out e provisão nunca entram por automatismo.
- **Armadilha**: somar tudo numa única dívida ajustada, duplicar o efeito no CFADS ou usar a visão mais conveniente sem declarar finalidade.
- **Saída**: {obrigação_id, natureza, entidade, saldo, cronograma, regras_de_inclusão, visões[], evidências} + pontes entre as visões.
- **A jusante**: ES-01/02/03/23, MA-10/21/27.
- **Autoridade**: DEF/CASA.

### D-25 · Ponte da despesa financeira
- **Executa**: (1) partir do custo por contrato de D-17; (2) reconciliar juros caixa e competência; (3) abrir atualização monetária, variação cambial, derivativos, fees, custos amortizados, multas, encargos tributários, arrendamentos, juros capitalizados e receitas financeiras; (4) conciliar com DRE, DFC, balanço e razão.
- **Fonte**: razão financeira, contratos, extratos, notas, DRE, DFC, derivativos e ativo em construção quando houver capitalização.
- **Verificação**: cada componente tem conta, período, sinal e fonte; diferença acima da tolerância versionada abre causa específica, sem concluir automaticamente dívida oculta.
- **Armadilha**: comparar custo médio vezes saldo final com a linha financeira líquida e chamar toda diferença de omissão.
- **Saída**: ponte {componente, valor_calculado, valor_contábil, delta, tratamento, evidência}.
- **A jusante**: D-17, Q-02, MA-10.
- **Autoridade**: DEF.

### D-26 · Cobertura de liquidez e serviço
- **Executa**: (1) definir horizonte e períodos pela política do arquétipo; (2) combinar caixa livre inicial, CFADS de Q-02 e fontes contratadas comprovadas; (3) confrontar juros, principal, arrendamentos conforme convenção, parcelamentos e demais obrigações de caixa da visão aplicável em D-24; (4) rodar base, downside e sem nova operação; (5) decompor qualquer déficit por causa e data.
- **Fonte**: Q-02, D-03, D-08/09/14/15/16, OP-03 e extratos.
- **Verificação**: caixa restrito não cobre serviço; fonte não contratada fica em cenário, não no caso base; piso e horizonte são versionados. Déficit abre hipótese de liquidez, mas a classificação final exige IN-23.
- **Armadilha**: usar EBITDA como caixa, contar linha não comprometida como liquidez certa ou concluir que toda cobertura abaixo de um número é refinanciamento.
- **Saída**: série {período, fontes, serviço, outras_obrigações, cobertura, déficit, causa} por cenário.
- **A jusante**: IN-22/23, OP-04, ES-02.
- **Autoridade**: DEF/CASA.

### D-27 · Cenários de juros, inflação e moeda
- **Executa**: (1) identificar exposição por indexador e moeda em D-02/D-12; (2) aplicar cenários versionados compatíveis com o regime, incluindo curva base, choques paralelos e relativos quando pertinentes; (3) recalcular juros caixa, cobertura, covenants e caixa mínimo; (4) combinar com cenário operacional quando o indexador também afeta receita ou custo.
- **Fonte**: curvas oficiais ou de mercado governadas, contratos e política de cenários com data, validade e dono.
- **Verificação**: nenhum choque fixo é verdade permanente; toda aplicação cita cenário e versão. Dívida prefixada não recebe choque de CDI indevido e dívida cambial considera hedge.
- **Armadilha**: aplicar apenas mais 300 bps por tradição, ignorar curva forward, câmbio, inflação ou efeito correlacionado no negócio.
- **Saída**: matriz {cenário, indexador, período, juros, cobertura, covenant, caixa}.
- **A jusante**: OP-04, ES-02/04, MA-13.
- **Autoridade**: CASA/MERCADO.

### D-28 · Cenário de não renovação
- **Executa**: (1) classificar linhas por compromisso, vencimento, histórico e discricionariedade do credor; (2) aplicar percentuais de renovação versionados por tipo de linha e cenário; (3) modelar saída de caixa, redução de disponibilidade e resposta operacional; (4) medir runway e déficit por data.
- **Fonte**: D-03/05/21, contratos, limites e comportamento observado.
- **Verificação**: linha comprometida e não comprometida não recebem a mesma hipótese; alternativa de funding só conta com evidência.
- **Armadilha**: presumir renovação integral ou zero renovação de todo o estoque sem distinguir produtos.
- **Saída**: {linha, hipótese_renovação, data, efeito_caixa, resposta} + runway.
- **A jusante**: D-26, OP-04/10, MA-13.
- **Autoridade**: CASA.

### D-29 · Grafo de cross-default e aceleração
- **Executa**: (1) extrair eventos, thresholds, cure periods e contratos cobertos de D-20; (2) criar grafo contrato para contrato; (3) simular quebra dos eventos materiais e propagar aceleração; (4) separar cross-default, cross-acceleration e material adverse effect.
- **Fonte**: contratos, aditivos e waivers.
- **Verificação**: a propagação usa texto contratual e revisão jurídica quando ambíguo; evento hipotético não é apresentado como ocorrido.
- **Armadilha**: chamar todo cross-default de aceleração automática ou ignorar thresholds e cura.
- **Saída**: grafo + cenários {evento_inicial, contratos_afetados, valor, prazo_de_cura, interpretação_pendente}.
- **A jusante**: D-30, ES-28/33/42, MA-07.
- **Autoridade**: LEI/DEF.

### D-30 · Compatibilidade da estrutura no dia um
- **Executa**: aplicar a operação indicativa ao pró-forma e testar: covenants existentes, negative pledges, garantias disponíveis, autorizações societárias, prioridade, cronograma e conflitos de entidade; cada falha gera bloqueio ou condição de resolução antes do term sheet indicativo.
- **Fonte**: OP-03, D-19/20/22/29, EMP-11 e catálogo jurídico vigente.
- **Verificação**: todos os checks têm evidência e estado; revisão jurídica confirma interpretação contratual material. A Offroad testa compatibilidade indicativa, não declara fechamento jurídico.
- **Armadilha**: produzir term sheet elegante para uma operação que violaria contrato existente ao nascer.
- **Saída**: checklist {teste, resultado, evidência, bloqueio, caminho_de_resolução}.
- **A jusante**: ES-42, MA-17.
- **Autoridade**: LEI/CASA.

### D-31 · Produto da análise de dívida no memo
- **Executa**: compilar do ledger: pontes entre visões de D-24, perfil atual e pró-forma, custo de D-17/D-25, convenção de arrendamentos, concentração, covenants, garantias comprometidas e riscos de passivo com tratamentos indicativos.
- **Fonte**: D-01 a D-30, sem reintrodução manual de número.
- **Verificação**: cada número material carrega evidência ou cálculo; riscos conhecidos aparecem com incerteza e tratamento. Zero surpresa é meta de qualidade de LC-12, não promessa sobre diligência futura.
- **Armadilha**: publicar uma única dívida ajustada, usar adjetivo de conforto ou afirmar que a diligência não encontrará nada novo.
- **Saída**: seção estruturada + tabelas e gráficos ligados ao ledger.
- **A jusante**: MA-07/10/14/28.
- **Autoridade**: CASA.

---


---

# MÓDULO 4 · A OPERAÇÃO E O SOURCES & USES (OP-01 a OP-14)

### OP-01 · Pedido declarado vs necessidade calculada
- **Executa**: (1) recompor a necessidade: capex orçado (OP-02) + giro incremental (OP-06) + custos de transação (PR-10) + colchão de execução (percentual da casa por tipo de projeto, versionado) − geração própria no período (cenário-mesa Q-10); (2) comparar com o pedido (IN-26); (3) divergência acima do limiar: conversa com o cliente com a conta aberta.
- **Verificação**: divergência acima da materialidade versionada por arquétipo obriga conversa antes da estrutura; o valor que segue é o calculado ou o acordado registrado, nunca o pedido por inércia.
- **Armadilha**: aceitar valor redondo sem conta; e o inverso, "corrigir" sem conversar (o cliente sabe o que a conta não vê; conversa obrigatória, imposição proibida).
- **Saída**: {pedido, calculado, componentes[], divergência, decisão_registrada}.
- **A jusante**: ES-45, MA-11.
- **Autoridade**: CASA.

### OP-02 · Sources & uses fechando ao centavo
- **Executa**: FONTES (dívida nova por tranche, geração no período, aporte com prova, venda de ativo com contrato) = USOS (capex por bloco com orçamento-fonte, giro incremental, refinanciamento por contrato com saldo na data projetada, custos de transação por item, colchão); cada linha material com âncora.
- **Verificação**: igualdade exata; linha residual limitada pela política versionada e sempre aberta quando material; refinanciamento confere com D-03 na data projetada; custos de transação presentes, ou explicitamente pendentes com faixa.
- **Armadilha**: aporte "comprometido" sem prova líquida; sem evidência vira tranche condicional.
- **Saída**: tabela S&U com âncoras + versão para o memo.
- **A jusante**: OP-03, MA-11, ES-45.
- **Autoridade**: DEF.

### OP-03 · Pró-forma completo
- **Executa**: (1) partir do balanço conciliado; (2) aplicar a operação: dívida nova por tranche, refinanciada sai, custos de transação, garantias movem no mapa de ônus (D-19); (3) recalcular: dívida ajustada (D-24), alavancagem (ES-01), perfil (D-03), cobertura (D-26), covenants propostos e existentes.
- **Verificação**: identidades Q-17 verdes no pró-forma; nenhum covenant existente quebrado no dia um (alimenta ES-42).
- **Saída**: balanço e métricas pró-forma com trace por movimento.
- **A jusante**: ES-42, MA-10.
- **Autoridade**: DEF.

### OP-04 · Capacidade sob cenários
- **Executa**: rodar o serviço proposto contra o cenário Offroad de Q-10, downside do arquétipo e os cenários versionados de juros, inflação, moeda e não renovação de D-27/D-28; calcular DSCR e liquidez período a período.
- **Verificação**: DSCR mínimo do cronograma acima do piso da casa no downside (versionado por perfil); violação = redimensionar (ES-40), nunca "aceitar apertado".
- **Saída**: matriz {cenário × ano × DSCR} + ano crítico e folga.
- **A jusante**: ES-02/03, MA-13.
- **Autoridade**: CASA.

### OP-05 · O que resolve, o que não toca, o que cria
- **Executa**: três listas explícitas com números: resolvidos ("alonga 78% do vencimento de 2027"), não tocados (concentração, sucessão), criados (custo acima da média atual, garantia comprometida).
- **Verificação**: o memo contém os não-tocados materiais; omissão descoberta em diligência é LC-12.
- **Saída**: as três listas.
- **A jusante**: MA-07/11, conversa com o cliente.
- **Autoridade**: CASA.

### OP-06 · O giro incremental da expansão
- **Executa**: calcular por conta e período: contas a receber incrementais = receita incremental diária × PMR; estoque incremental = CPV incremental diário × PME; fornecedores incrementais = compras incrementais diárias × PMP; incluir impostos e outras contas operacionais materiais; NCG incremental é a variação líquida entre períodos. Somar ao dimensionamento o pico de caixa, não a soma indiscriminada dos saldos.
- **Verificação**: toda expansão tem esta linha explícita no S&U; sem ela o caso não passa ao gate da estrutura.
- **Armadilha**: usar os dias do negócio atual para um mix que muda (cliente novo maior paga mais devagar; canal novo muda estoque); ajustar por premissa declarada.
- **Saída**: {período, receita_incremental, CPV_incremental, compras_incrementais, dias_por_conta, saldos_incrementais, variação_NCG, pico_de_caixa}.
- **A jusante**: OP-01/02.
- **Autoridade**: DEF.

### OP-07 · O custo de pedir demais
- **Executa**: excedente sobre o calculado além do colchão: quantificar carrego (excedente × custo da dívida − rendimento do caixa) por ano; apresentar tranche comprometida (OP-08) com custo de disponibilidade comparado.
- **Verificação**: excedente acima da materialidade versionada sem justificativa registrada trava a estrutura até a conversa.
- **Saída**: {excedente, carrego_anual, alternativa, decisão}.
- **A jusante**: ES-45.
- **Autoridade**: MERCADO.

### OP-08 · Tranches e liberação por marco
- **Executa**: tranche 1 no fechamento (mínimo operacional); seguintes por marco objetivo (medição independente, licença emitida, conclusão atestada); para cada marco: evidência, quem atesta, prazo de liberação pós-atesto.
- **Verificação**: nenhum marco "a critério" ou "satisfatório" sem critério objetivo; marcos conferem com OP-11.
- **Saída**: tabela {tranche, valor, marco, evidência, atestador, prazo}.
- **A jusante**: MA-20, ES-09.
- **Autoridade**: MERCADO.

### OP-09 · Condições precedentes por uso
- **Executa**: montar do catálogo por arquétipo (versionado): expansão (licenças, contrato de obra, seguro performance, matrícula limpa); aquisição (DD com relatório, aprovação concorrencial se aplicável, preço travado, dívida da adquirida equacionada); refinanciamento (termos de quitação, liberação de gravame simultânea, waivers de cross-default); equipamentos (proforma final, AF registrada). Cada CP com responsável e prazo.
- **Verificação**: CP sem dono não entra no term sheet (MA-20 rejeita).
- **Saída**: {CP, responsável, evidência, prazo, status}[].
- **A jusante**: MA-20, cronograma.
- **Autoridade**: LEI/MERCADO.

### OP-10 · Ponte e take-out
- **Executa**: ponte (curta, garantia forte, custo transitório aceito) + take-out nomeado (emissão definitiva: instrumento, prazo estimado, condições de mercado requeridas) + o risco central escrito (take-out não sai) com plano B (extensão negociada, ativo vendível, garantia executável).
- **Verificação**: ponte sem take-out nomeado e plano B escrito não é estrutura, é aposta; bloqueio.
- **Saída**: {ponte, take_out, risco, plano_B}.
- **A jusante**: MA-12, MK-17.
- **Autoridade**: MERCADO.

### OP-11 · Cronograma de desembolso vs obra
- **Executa**: sobrepor o financeiro (OP-08) ao físico com defasagem realista de medição e liberação (parâmetro da casa); identificar meses descobertos e cobri-los (caixa próprio comprovado ou tranche antecipada).
- **Verificação**: nenhum mês descoberto; desembolso mais de um trimestre à frente da obra volta como OP-07.
- **Saída**: linha do tempo {mês, gasto, liberação, coberto?}.
- **A jusante**: OP-08, ES-09.
- **Autoridade**: HEURÍSTICA.

### OP-12 · Quando a resposta é esperar
- **Executa**: identificar o marco que muda o perfil (auditoria, safra, contrato, tri); quantificar: custo de esperar vs ganho esperado (efeito no spread via PR-03/07, no envelope via ES-01); apresentar as duas colunas e registrar a decisão do cliente.
- **Verificação**: "melhor esperar" sem número não é recomendação da casa.
- **Saída**: {marco, data, custo_de_esperar, ganho_estimado, decisão}.
- **A jusante**: ES-40, PR-09 e plano de introdução de MK-17.
- **Autoridade**: CASA.

### OP-13 · Uso misto e como o mercado lê
- **Executa**: S&U em blocos nomeados (produtivo / saneamento / reforço); narrativa lidera pelo produtivo com o saneamento explícito e quantificado ("X% alonga dívida de custo Y para Z"); nunca diluir refi em "usos gerais".
- **Verificação**: bloco "usos corporativos gerais" limitado ao teto da casa (versionado); acima, abrir a destinação.
- **Saída**: S&U em blocos + parágrafo padrão de narrativa.
- **A jusante**: MA-11, MK-13.
- **Autoridade**: MERCADO.

### OP-14 · A operação declarada, versionada
- **Executa**: manter valor, uso, prazo e garantias pretendidos como registro versionado; mudança material cria versão datada com autor; análise, estrutura e materiais referenciam a versão contra a qual foram produzidos.
- **Verificação**: material compilado contra versão superada é bloqueado (manifesto); mudança sem versão nova é violação de processo.
- **Saída**: histórico de versões.
- **A jusante**: MA-31, manifesto do caso.
- **Autoridade**: CASA.

---

# MÓDULO 5 · ESTRUTURAÇÃO (ES-01 a ES-45)

Cada termo proposto tem base declarada (cálculo, garantia, referência datada); term sheet
sem base é opinião, e opinião não sobrevive à primeira reunião.

## 5.1 Envelope de capacidade

### ES-01 · Alavancagem máxima por perfil
- **Executa**: (1) calcular dívida líquida ajustada (D-24, caixa livre RF-04) / EBITDA mesa (Q-01), sempre pró-forma (OP-03); (2) buscar a banda aceita para o perfil na tabela da casa (dado versionado por: setor/ciclicidade EMP-07, garantia ES-20, porte); (3) posicionar o caso na banda com a justificativa.
- **Verificação**: nunca calculado sobre balanço histórico nem com EBITDA "da administração"; caso acima da banda não segue sem uma das saídas de ES-40.
- **Armadilha**: melhorar a razão trocando a convenção IFRS 16 no meio (D-08: uma convenção, declarada, dos dois lados).
- **Saída**: {alavancagem_pró_forma, banda_do_perfil, posição, justificativa}.
- **A jusante**: ES-03, ES-23, MA-12.
- **Autoridade**: DEF (método) / MERCADO (bandas versionadas).

### ES-02 · Cobertura mínima
- **Executa**: DSCR = CFADS (Q-02, cenário-mesa) / serviço do período, ano a ano do cronograma proposto, no base e no downside (OP-04); ICR auxiliar quando o principal é bullet.
- **Verificação**: o DSCR MÍNIMO do cronograma manda (a dívida quebra no pior ano, não no médio); piso da casa por perfil (versionado) respeitado no downside.
- **Saída**: série {ano, CFADS, serviço, DSCR} nos cenários + o ano crítico.
- **A jusante**: ES-03/05, MA-13.
- **Autoridade**: DEF.

### ES-03 · O menor limite manda
- **Executa**: computar os quatro tetos: por alavancagem (ES-01), por DSCR no downside (ES-02), por LTV da garantia (ES-13/20), por covenant existente (D-20); o envelope é o MENOR; publicar o limitante junto do número.
- **Verificação**: o limitante declarado internamente e ao cliente ("a garantia limita antes da alavancagem: um imóvel a mais destrava X").
- **Saída**: {teto_por_dimensão[], envelope, limitante}.
- **A jusante**: ES-45, conversa com o cliente.
- **Autoridade**: CASA.

### ES-04 · Headroom de covenant
- **Executa**: para cada covenant proposto, calcular a folga sobre o cenário base e testar: o downside (OP-04) quebra? Ajustar o nível para sobreviver ao downside sem quebra (folga mínima versionada por métrica).
- **Verificação**: covenant colado no plano é vender waiver futuro; bloqueio se o downside quebra no ano 1-2.
- **Saída**: {covenant, nível, folga_base, resultado_no_downside}.
- **A jusante**: ES-23/24, MA-17.
- **Autoridade**: MERCADO.

## 5.2 Prazo e amortização

### ES-05 · Amortização casa com o fluxo
- **Executa**: desenhar o cronograma espelhando o CFADS projetado no DOWNSIDE (não no base): projeto com ramp-up ganha carência até a geração chegar (ES-09); sazonal concentra parcelas no semestre forte (ES-08); estável usa SAC/Price; conferir ES-10 (parede consolidada).
- **Verificação**: DSCR por período no downside acima do piso em TODOS os períodos; a amortização errada é a maior causa de reestruturação evitável e este é o teste que a evita.
- **Saída**: cronograma proposto + DSCR por período.
- **A jusante**: ES-02, MA-17.
- **Autoridade**: DEF.

### ES-06 · SAC, Price, bullet, balão
- **Executa**: escolher pela regra: SAC quando a geração inicial comporta (menos juros totais); Price para nivelar serviço; bullet SÓ com fonte de repagamento nomeada e evidenciada (venda de ativo com liquidez, refinanciamento plausível dado o perfil no vencimento, caixa acumulado em conta com trava); balão intermedia.
- **Verificação**: bullet sem fonte nomeada é aposta e não vira proposta da mesa; a fonte do bullet entra no term sheet (cash sweep/trava associada).
- **Saída**: {formato, justificativa, fonte_do_principal_quando_bullet}.
- **A jusante**: ES-29, MA-17.
- **Autoridade**: DEF.

### ES-07 · Carência: paga ou capitalizada
- **Executa**: padrão da casa: carência de principal com juros PAGOS; capitalização (PIK parcial) só com justificativa de fluxo (ramp-up documentado) e com o saldo devedor ano a ano mostrado no term sheet.
- **Verificação**: capitalização escondida em "carência total" é proibida; o efeito no saldo é tabela obrigatória quando houver PIK.
- **Saída**: {tipo_de_carência, prazo, efeito_no_saldo}.
- **A jusante**: MA-17, MA-27.
- **Autoridade**: DEF.

### ES-08 · Desenho sazonal
- **Executa**: quando Q-11 superar a faixa de sazonalidade versionada, testar parcelas casadas ao ciclo ou parcela constante com mecanismo de liquidez como ES-17. O período de apuração de covenant segue a definição que melhor evita ruído sazonal e é testado em ES-24.
- **Verificação**: parcela constante sobre fluxo sazonal sem colchão é vetada (fabrica inadimplência técnica).
- **Saída**: o desenho sazonal escolhido com o calendário.
- **A jusante**: ES-17/24.
- **Autoridade**: MERCADO.

### ES-09 · Ramp-up de projeto
- **Executa**: carência casada ao cronograma físico + margem de atraso da casa por tipo de obra (parâmetro versionado); durante a obra, covenant de conclusão física (marco até data, atestado independente) no lugar de covenant financeiro.
- **Verificação**: a margem de atraso aplicada é declarada; carência menor que obra + margem é bloqueada.
- **Saída**: {carência, marco_físico[], covenant_de_obra}.
- **A jusante**: OP-08/11, MA-17.
- **Autoridade**: MERCADO.

### ES-10 · Não criar a próxima parede
- **Executa**: somar o cronograma proposto ao existente (D-03) e testar concentração: nenhum ano com mais do limiar versionado do total consolidado; o gráfico pró-forma vai ao memo (D-31).
- **Verificação**: parede nova detectada = redesenhar o cronograma antes do term sheet.
- **Saída**: perfil consolidado pró-forma + teste de concentração.
- **A jusante**: D-31, MA-10.
- **Autoridade**: CASA.

## 5.3 Garantias

### ES-11 · Cessão fiduciária de recebíveis
- **Executa**: desenhar com a mecânica completa: (1) trava de domicílio bancário (sacados notificados pagam na conta vinculada); (2) razão de garantia = fluxo mensal cedido / serviço mensal (referência versionada); (3) percentual de trava (quanto retém antes de liberar excedente); (4) régua de recomposição quando a razão cai (prazo, trava de liberação); (5) elegibilidade da carteira cedida: performados (ES-12), concentração (Q-06), líquida de renegociados (Q-14).
- **Verificação**: certidão de que os recebíveis não estão cedidos a outro (D-07); a razão calculada sobre fluxo LÍQUIDO (devoluções e cancelamentos históricos descontados).
- **Armadilha**: trava sobre fluxo bruto quando o líquido é o que existe; carteira "cedida" que o sistema do cliente não consegue segregar por sacado (a trava de domicílio exige identificar quem paga onde).
- **Saída**: {razão, trava%, régua_de_recomposição, elegibilidade, evidências}.
- **A jusante**: MA-17 (cláusula), ES-20.
- **Autoridade**: DEF/MERCADO.

### ES-12 · Performados vs a performar
- **Executa**: separar a carteira: performado (entrega feita, risco só de crédito) vs a performar (risco de execução); haircuts diferentes (tabela versionada), elegibilidades diferentes; em incorporação (EMP-28), a distinção é a espinha do CRI.
- **Verificação**: a performar nunca conta no colateral pelo valor de performado; a evidência de performance (entrega, medição) é auditável.
- **Saída**: carteira segmentada com haircuts aplicados.
- **A jusante**: ES-11/20, ES-44.
- **Autoridade**: DEF.

### ES-13 · Alienação fiduciária de imóvel
- **Executa**: (1) laudo independente recente (validade versionada) com método declarado; (2) LTV pela tabela da casa por tipo (operacional urbano / residencial líquido / terra; valores versionados); (3) teste de liquidez real (imóvel de uso único em praça pequena vale o que o mercado paga, não o laudo: ajustar); (4) matrícula: ônus, penhoras, indisponibilidades; (5) segunda alienação só como reforço, pelo valor residual da primeira.
- **Verificação**: laudo vencido ou de parte relacionada não conta; matrícula suja vira CP de limpeza ou exclui o ativo.
- **Saída**: {imóvel, laudo, LTV_aplicado, valor_para_o_pacote, pendências}.
- **A jusante**: ES-20, MA-17, OP-09.
- **Autoridade**: LEI/DEF.

### ES-14 · Estoque como garantia
- **Executa**: aceitar apenas com: monitoria periódica independente contratada, fiel depositário formal, estoque identificável e revendável (commodity/insumo padronizado sim; acabado de marca própria com desconto severo; perecível/moda praticamente não), haircut da tabela, trava de giro mínimo.
- **Verificação**: o custo da monitoria entra no all-in (PR-10); estoque com flag RF-01 ativa não entra no pacote.
- **Saída**: {elegível?, haircut, monitoria, custo}.
- **A jusante**: ES-20, PR-10.
- **Autoridade**: DEF/MERCADO.

### ES-15 · Equipamentos e frota
- **Executa**: AF do próprio bem (natural em IN-08): valor de revenda real (existe mercado secundário? máquina customizada não tem), idade e vida útil (EMP-19), seguro com a credora beneficiária, gravame registrado (frota: no órgão de trânsito).
- **Verificação**: valor para o pacote = revenda estimada com haircut, nunca o valor de compra; bem sem mercado secundário entra com haircut severo ou não entra.
- **Saída**: {bem, valor_revenda, haircut, seguro, registro}.
- **A jusante**: ES-20, OP-09.
- **Autoridade**: DEF.

### ES-16 · Quotas e ações
- **Executa**: avaliar pelo controle que dá no cenário ruim (não pelo equity value, que despenca quando a garantia executa); conferir acordo de acionistas (EMP-11) e vedações estatutárias; definir direitos na vigência (voto, dividendos).
- **Verificação**: entra como reforço, nunca lastro principal; execução factível sob o acordo é pré-condição.
- **Saída**: {participação, direitos, execução_factível?, papel_no_pacote}.
- **A jusante**: ES-20, EMP-11.
- **Autoridade**: DEF.

### ES-17 · Conta reserva
- **Executa**: dimensionar N meses de serviço (parâmetro por perfil), constituição (no desembolso ou por retenção de fluxo), régua de recomposição com prazo, trava de dividendo enquanto descomposta (liga ES-25).
- **Verificação**: reserva presente em todo caso sazonal (ES-08) e de ramp-up (ES-09); a mecânica completa no term sheet, não "haverá conta reserva".
- **Saída**: {meses, constituição, recomposição, travas}.
- **A jusante**: MA-17.
- **Autoridade**: MERCADO.

### ES-18 · Fiança bancária e seguro garantia
- **Executa**: avaliar o garantidor (rating), prazo da fiança vs prazo da dívida (fiança que vence antes é garantia com validade: exigir renovação como obrigação com antecedência mínima), condições de execução do seguro (exclusões da apólice lidas, não presumidas).
- **Verificação**: custo entra no all-in; descasamento de prazo sem mecânica de renovação bloqueia.
- **Saída**: {garantidor, rating, prazo, mecânica_de_renovação, exclusões_relevantes}.
- **A jusante**: ES-20, PR-10.
- **Autoridade**: DEF.

### ES-19 · O aval
- **Executa**: mapear o estoque de avais já dados pelos sócios (D-10) antes de atribuir valor ao novo; classificar: sinalização (sempre vale) vs execução (vale o patrimônio pessoal líquido e alcançável); registrar a recusa de avalizar como informação de análise.
- **Verificação**: aval nunca substitui garantia real no pacote da casa; patrimônio pessoal declarado não se assume, se evidencia quando o aval for material ao pacote.
- **Saída**: {avalista, estoque_de_avais, valor_atribuído, papel}.
- **A jusante**: ES-20.
- **Autoridade**: MERCADO.

### ES-20 · O pacote combinado
- **Executa**: (1) somar os valores pós-haircut de cada garantia (ES-11 a 19); (2) testar contra o DOWNSIDE: qual ativo sustenta valor no cenário em que a execução acontece (o estoque some junto com a crise; o imóvel fica); (3) cobertura = soma pós-haircut / dívida, contra a referência da casa por perfil; (4) mapear sobreposições e buracos (o mesmo fluxo contado duas vezes?).
- **Verificação**: cobertura e método publicados no term sheet (não só a lista); dupla contagem é erro bloqueante.
- **Saída**: {garantia, valor_pós_haircut}[] + cobertura + análise de downside do pacote.
- **A jusante**: ES-03, MA-12/17.
- **Autoridade**: CASA.

### ES-21 · Fluxo em estrutura dedicada
- **Executa**: quando o crédito é do fluxo e não da empresa (EMP-27/28, projeto): desenhar SPE/patrimônio separado, conta centralizadora, cascata escrita cláusula a cláusula (opex mínimo → serviço → reservas → excedente), e o que dispara retenção total.
- **Verificação**: a segregação custa (jurídico, tempo, PR-10) e o memo compara com a alternativa corporativa; cascata sem definição de opex mínimo é cascata furada.
- **Saída**: o desenho da estrutura + cascata + custo incremental.
- **A jusante**: ES-44, MK-09.
- **Autoridade**: DEF.

### ES-22 · Compartilhamento com dívida existente
- **Executa**: garantia já dada (D-19) só entra com: liberação documentada na quitação (OP-09) ou compartilhamento formal negociado (intercreditor ES-39); verificar por certidão e contrato, nunca pela palavra.
- **Verificação**: prometer garantia comprometida mata a operação na diligência com a reputação junto; o teste documental é anterior ao term sheet.
- **Saída**: {garantia, status_atual, caminho (liberação/compartilhamento), evidência}.
- **A jusante**: ES-39, MA-20.
- **Autoridade**: CASA.

## 5.4 Covenants

### ES-23 · Alavancagem com step-down
- **Executa**: propor dívida líquida/EBITDA começando com a folga de ES-04 e descendo em degraus anuais conforme a amortização projetada; a DEFINIÇÃO contábil escrita: dívida pela ponte D-24 (risco sacado incluído), EBITDA pela régua Q-01, convenção IFRS 16 declarada (D-08).
- **Verificação**: o covenant proposto testado no downside (não quebra nos anos 1-2); definição frouxa ("dívida bancária") é rejeitada pela casa.
- **Saída**: {níveis_por_ano, definição_referenciada, teste_no_downside}.
- **A jusante**: MA-17/21.
- **Autoridade**: DEF.

### ES-24 · Cobertura como covenant
- **Executa**: DSCR ou ICR mínimo por período, com CFADS definido (Q-02); sazonal: apuração em 12 meses móveis, nunca trimestre isolado (ES-08).
- **Verificação**: a definição de "caixa disponível" fechada no anexo (ES-31); teste no downside.
- **Saída**: {métrica, nível, período_de_apuração, definição}.
- **A jusante**: MA-17/21.
- **Autoridade**: DEF.

### ES-25 · Dividendos condicionados
- **Executa**: desenhar a régua realista: distribuição livre acima de um nível de covenant cumprido, travada abaixo; alternativa: % do lucro com teto; conectar à conta reserva (descomposta → trava, ES-17).
- **Verificação**: trava absoluta que o dono vai violar via mútuo (D-11) é pior que trava realista: preferir a cumprível + covenant de mútuos (ES-27 estendido).
- **Saída**: a régua de distribuição proposta.
- **A jusante**: MA-17.
- **Autoridade**: MERCADO.

### ES-26 · Negative pledge
- **Executa**: vedação de onerar a terceiros com exceções listadas (linhas de giro até X, FINAME do bem, ônus existentes listados); ANTES: verificar os negative pledges EXISTENTES (D-20): a garantia da nova operação cabe nas exceções dos contratos velhos?
- **Verificação**: conflito com NP existente detectado aqui = renegociar exceção ou redesenhar pacote (ES-42 bloqueia se passar).
- **Saída**: cláusula proposta + teste contra os NPs existentes.
- **A jusante**: ES-42, MA-17.
- **Autoridade**: LEI/DEF.

### ES-27 · Endividamento adicional
- **Executa**: teto de dívida nova sem consentimento (absoluto ou por razão), cesta de exceções operacionais (giro sazonal, FINAME), extensão a mútuos com ligadas quando RF-09 presente.
- **Verificação**: a cesta cobre a operação normal do negócio (teto que estrangula o giro é default fabricado).
- **Saída**: cláusula com teto e cesta.
- **A jusante**: MA-17.
- **Autoridade**: DEF.

### ES-28 · Cross-default com threshold
- **Executa**: definir o valor mínimo que dispara (referência da casa por porte, versionada) e o escopo (dívida financeira; incluir ligadas quando RF-09/12); mapear o efeito reverso: a nova dívida entra nos cross-defaults dos contratos velhos (D-29)?
- **Verificação**: threshold baixo demais transforma briga pequena em evento sistêmico; alto demais não protege; a cascata consolidada (D-29) revisada com a nova dívida.
- **Saída**: {threshold, escopo} + cascata atualizada.
- **A jusante**: D-29, MA-17.
- **Autoridade**: DEF.

### ES-29 · Cash sweep
- **Executa**: % de eventos extraordinários (venda de ativo relevante acima de X, indenizações, emissões) pré-paga a dívida; sweep parcial (não 100%) preserva o incentivo de vender bem; definição de "ativo relevante" no anexo.
- **Verificação**: sweep conectado à fonte do bullet quando houver (ES-06).
- **Saída**: cláusula com % e gatilhos.
- **A jusante**: MA-17.
- **Autoridade**: MERCADO.

### ES-30 · Obrigações de informação
- **Executa**: calibrar ao porte (EMP-16): balancete trimestral com prazo, DF anual auditada com prazo, certificado de covenant assinado por diretor, aviso de evento relevante em X dias; prazos exequíveis (o histórico de fechamento observado no caso).
- **Verificação**: obrigação impossível para a capacidade real da empresa é default fabricado; os prazos propostos vs o tempo de fechamento medido (EMP-16).
- **Saída**: a cláusula calibrada.
- **A jusante**: MA-17. A apuração posterior pertence ao financiador e às partes da operação.
- **Autoridade**: DEF.

### ES-31 · A guerra das definições
- **Executa**: manter o anexo de definições da casa versionado (dívida = ponte D-24; EBITDA = régua Q-01; caixa livre; convenção IFRS 16) e anexá-lo ao term sheet indicativo (MA-21); comparar cada definição alternativa considerada internamente com a ponte e mostrar o que ela inclui, exclui e altera nas métricas.
- **Verificação**: nenhuma definição entra no material indicativo sem diff contra a definição usada na análise. A Offroad documenta a base e as alternativas, mas não negocia nem aceita termos em nome das partes.
- **Saída**: anexo de definições + diffs das alternativas indicativas.
- **A jusante**: MA-17/21.
- **Autoridade**: CASA.

### ES-32 · Cura e waiver
- **Executa**: prazos de cura por tipo (pagamento: dias, curto; informação: maior; covenant financeiro: janela de cura ou equity cure com limites de uso); processo de waiver (quórum, prazo de resposta).
- **Verificação**: cura estruturada agora é mais barata que negociada na crise; equity cure com limite de vezes (não vira máquina de esconder deterioração).
- **Saída**: matriz {evento, cura, prazo, processo}.
- **A jusante**: MA-17.
- **Autoridade**: DEF.

## 5.5 Eventos e estrutura societária

### ES-33 · Vencimento antecipado: o menu
- **Executa**: montar do catálogo da casa: inadimplemento, falsidade de declaração, cross-default (ES-28), mudança de controle (ES-34), insolvência, perda de licença essencial (EMP-17), desapropriação/perda do ativo-garantia, covenant sem cura (ES-32); cada evento com materialidade e cura onde couber.
- **Verificação**: menu completo mas calibrado (evento sem materialidade definida é gatilho de disputa).
- **Saída**: a cláusula com o menu calibrado.
- **A jusante**: MA-17.
- **Autoridade**: LEI/DEF.

### ES-34 · Mudança de controle
- **Executa**: definir com precisão o que dispara (controle societário? veto? saída do fundador-chave?) casando com EMP-11 (acordo) e EMP-13 (pessoa-chave); em empresa de dono, a pessoa é parte do crédito e a cláusula nomeia.
- **Verificação**: a definição da cláusula não conflita com o acordo de acionistas (EMP-11).
- **Saída**: a definição proposta.
- **A jusante**: MA-17.
- **Autoridade**: DEF.

### ES-35 · Cláusulas de mercado em estresse
- **Executa**: em ponte e compromissos longos de desembolso: definir mudança adversa relevante com critério o mais objetivo possível (métricas, eventos nomeados); recusar MAC subjetivo amplo (o cliente vira refém) sabendo que sem nenhum, compromisso longo não sai.
- **Verificação**: todo MAC proposto tem pelo menos um critério objetivo verificável.
- **Saída**: a cláusula negociável com a régua da casa.
- **A jusante**: OP-10, MA-17.
- **Autoridade**: MERCADO.

### ES-36 · Quem emite
- **Executa**: a dívida entra na entidade com o fluxo e os ativos (EMP-10); quando inevitável na holding (vedação na operadora), compensar no pacote (garantias da operadora, fiança dela) e declarar a subordinação estrutural (ES-38).
- **Verificação**: emissor definido antes de qualquer cláusula; autorizações societárias do emissor conferidas (ES-42).
- **Saída**: {emissor, justificativa, compensações}.
- **A jusante**: ES-37/38, MA-17.
- **Autoridade**: DEF.

### ES-37 · Garantidores do grupo
- **Executa**: definir quais entidades garantem e com que limite; testar o efeito nos credores delas (D-10: os avais cruzados existentes); fiança da saudável para a devedora é padrão; o inverso (a operação garantindo o grupo) é desvio de propósito e red flag.
- **Verificação**: capacidade de garantir conferida (estatuto, covenants próprios da garantidora).
- **Saída**: {garantidor, limite, verificações}.
- **A jusante**: MA-17, D-10.
- **Autoridade**: DEF.

### ES-38 · Subordinação estrutural
- **Executa**: quando existir (dívida na holding, fluxo na operadora): declarar no memo e refletir no preço (PR-01 ajusta o perfil); mitigar quando possível (garantias diretas da operadora, dividend upstream garantido por covenant).
- **Verificação**: subordinação estrutural omitida do material é a omissão que a diligência acha em uma tarde (LC-12); declaração obrigatória.
- **Saída**: {existe?, mitigação, efeito_no_preço}.
- **A jusante**: MA-12, PR-01.
- **Autoridade**: DEF.

### ES-39 · Intercreditor
- **Executa**: quando a nova dívida convive com existente sobre as mesmas garantias (ES-22), identificar a necessidade de intercreditor, mapear credores, contratos, consentimentos, prioridade pretendida, execução conjunta e eventual standstill; propor princípios indicativos e registrar que a formalização depende das partes e de assessoria jurídica.
- **Verificação**: o term sheet indicativo não promete compartilhamento ainda inexistente; a necessidade, as dependências e o risco de prazo ficam explícitos.
- **Saída**: mapa de credores + necessidade de intercreditor + princípios indicativos + condições para viabilidade.
- **A jusante**: MA-20 (CP), cronograma.
- **Autoridade**: LEI/DEF.

## 5.6 Fechamento do desenho

### ES-40 · Quando não fecha: a ordem de ajuste
- **Executa**: gerar alternativas em uma árvore governada e quantificar cada uma: reforço de garantia, mudança de volume, prazo, carência ou amortização, fases e tranches, capital subordinado ou aporte, escopo menor, e espera por marco de OP-12. A ordem depende da restrição vinculante de ES-03 e do objetivo econômico, não de preferência fixa.
- **Verificação**: cada alternativa mostra efeito em capacidade, serviço, risco, all-in e executabilidade. É proibido forçar o volume original com covenant sem headroom, garantia indisponível ou banda de preço sem base.
- **Saída**: alternativas comparadas, restrição tratada, contrapartidas e desenho indicativo recomendado para discussão com a companhia.
- **A jusante**: PR-08, ES-45.
- **Autoridade**: CASA.

### ES-41 · A estrutura mínima vendável
- **Executa**: para o perfil, escolher o desenho mais simples que um comprador do mapa (M8) aceita; complexidade tem custo fixo (jurídico, registro, tempo, PR-10) que tíquete pequeno não paga; comparar em all-in a estrutura sofisticada vs a simples.
- **Verificação**: estrutura escolhida tem comprador nomeado no mapa (MK-13); sofisticação sem comprador é vaidade.
- **Saída**: {estrutura_escolhida, all_in, comprador_alvo, alternativa_descartada_e_porquê}.
- **A jusante**: ES-44, MK-13.
- **Autoridade**: HEURÍSTICA.

### ES-42 · Compatibilidade dia-um
- **Executa**: verificação final obrigatória: (1) nenhum covenant existente quebra com a operação entrando (D-20 sobre o pró-forma OP-03); (2) nenhum negative pledge violado (ES-26); (3) autorizações societárias completas (estatuto, acordo EMP-11, alçadas); (4) cronograma consolidado sem parede nova (ES-10).
- **Verificação**: os quatro checks verdes antes do term sheet; operação que nasce em default técnico é o vexame máximo da mesa.
- **Saída**: checklist dia-um com evidências.
- **A jusante**: MA-17 (gate).
- **Autoridade**: CASA.

### ES-43 · Da estrutura ao term sheet
- **Executa**: cada termo decidido no módulo referencia a base (procedimento, cálculo, referência datada) e alimenta o template (MA-17/18); termo sem base não entra.
- **Verificação**: o anexo interno de bases (MA-18) cobre 100% dos termos.
- **Saída**: o mapa termo → base.
- **A jusante**: MA-17/18.
- **Autoridade**: CASA.

### ES-44 · O que muda por documento, mecanismo e veículo
- **Executa**: separar cinco dimensões antes de comparar alternativas: ativo ou direito creditório, documento da obrigação, mecanismo de financiamento ou cessão, veículo ou investidor e prestadores necessários. Aplicar o catálogo jurídico e operacional vigente: requisitos de lastro e securitização para CRI/CRA quando aplicáveis; regras do direito creditório e do mandato para eventual FIDC; elegibilidade societária e rito para debênture; requisitos de CCB e possível cessão; garantias, custos, prazo e dependências de cada rota.
- **Verificação**: documento, veículo e investidor nunca são tratados como sinônimos. A alternativa nasce da necessidade econômica, elegibilidade, mecânica, custo all-in e aderência de mercado, com revisão especializada das afirmações jurídicas vigentes.
- **Saída**: {ativo, documento, mecanismo, veículo_ou_investidor, prestadores, exigências, cronograma, all_in, fontes_legais} por alternativa viável.
- **A jusante**: MA-17, MK-13.
- **Autoridade**: LEI/DEF.

### ES-45 · Sizing final
- **Executa**: fechar o número respeitando: envelope (ES-03), S&U (OP-02), excedente controlado (OP-07), tíquetes e restrições indivisíveis confirmados nos mandatos aderentes de MK-11 a MK-14; publicar internamente as três pontas: pedido, calculado, proposto, com justificativa das diferenças.
- **Verificação**: proposto dentro do envelope; a justificativa das diferenças registrada para a conversa com o cliente.
- **Saída**: {pedido, calculado, proposto, justificativas}.
- **A jusante**: MA-05/17.
- **Autoridade**: CASA.

---

# MÓDULO 6 · PRICING E REFERÊNCIAS (PR-01 a PR-13)

### PR-01 · A curva por perfil de risco
- **Executa**: (1) partir do perfil de risco da Etapa 7, análise da companhia e da transação, e do pacote proposto em ES-20; (2) selecionar a célula da grade de PR-07 para perfil, prazo e garantia; (3) se amostra ou validade não atenderem à política versionada, usar aproximação explicitamente marcada e alargar a banda conforme a régua vigente, ou abster-se; (4) registrar fonte, data, validade e método.
- **Verificação**: nenhuma banda citada sem célula-fonte identificada; aproximação sempre alarga.
- **Armadilha**: precificar pelo último deal da casa; um deal é observação, não curva.
- **Saída**: {célula_fonte, n_obs, data_recente, banda_bps, aproximações[]}.
- **A jusante**: MA-05, PR-09.
- **Autoridade**: CASA.

### PR-02 · Comps de emissões
- **Executa**: (1) buscar observações dentro da janela vigente e filtrar comparabilidade por setor, porte, risco, instrumento, prazo, garantia e mercado; (2) normalizar indexadores pela curva e data observadas, com método registrado; (3) selecionar o conjunto que atende à política de amostra; (4) justificar inclusão e descarte material.
- **Fonte**: bases públicas de emissões, anúncios de encerramento; cada linha com fonte e data.
- **Verificação**: observação vencida só aparece como contexto e não governa a faixa; divergência acima da tolerância versionada entre comps e grade abre revisão da célula.
- **Armadilha**: comp com garantia real contra caso clean sem normalizar pacote; normaliza ou cai.
- **Saída**: {emissor_anon, data, instrumento, prazo, garantia, taxa_norm, fonte}[] + mediana e faixa.
- **A jusante**: PR-07, MA-12.
- **Autoridade**: MERCADO.

### PR-03 · O prêmio da garantia
- **Executa**: (1) parear observações que diferem só no pacote (mesmo perfil e prazo); (2) delta em bps por tipo de reforço; (3) manter a tabela de prêmios (real forte, cessão com trava, fiança bancária, clean) com contagem e data.
- **Verificação**: prêmio citado em ES-40 sai desta tabela com data; amostra abaixo da política responde "sem base suficiente".
- **Saída**: {reforço, delta_bps, n_pares, data}[].
- **A jusante**: ES-40, PR-08.
- **Autoridade**: MERCADO.

### PR-04 · O prêmio do prazo
- **Executa**: curva de prazo por perfil com as observações da grade; identificar os degraus (onde o apetite acaba e o prêmio salta, refletindo bandas de mandato MK-11).
- **Verificação**: prazo além do último degrau observado responde "fora da curva observável; exige sondagem", NUNCA extrapolação linear.
- **Saída**: curva {prazo, banda, n} + posição dos degraus.
- **A jusante**: ES-05/06, MK-15.
- **Autoridade**: MERCADO.

### PR-05 · Prêmio de tamanho e liquidez
- **Executa**: classificar o tíquete nas faixas versionadas da casa e aplicar somente ajustes observados e suportados; custo fixo, liquidez e necessidade de distribuição aparecem separadamente.
- **Verificação**: caso acima da capacidade de 2-3 âncoras do mapa obriga desenho de distribuição (MK-17) antes de prometer banda.
- **Saída**: {faixa, ajuste_bps, implicação_de_distribuição}.
- **A jusante**: ES-45, MK-17.
- **Autoridade**: HEURÍSTICA.

### PR-06 · O indexador certo
- **Executa**: (1) mapear receita, custo e ativos por indexador e moeda; (2) mapear indexadores aceitos pelos mandatos aderentes; (3) comparar alternativas com regras tributárias e jurídicas vigentes no catálogo, sem presumir benefício fiscal; (4) quantificar descasamento inevitável em cenário.
- **Verificação**: proposta sem mandato observável ou com tratamento fiscal não confirmado é bloqueada até reconfirmação; indexador é escolha econômica e de mercado, não rótulo do instrumento.
- **Saída**: {indexador, casamento_receita, comprador_alvo, descasamento_quantificado}.
- **A jusante**: ES-43, MK-13.
- **Autoridade**: DEF/MERCADO.

### PR-07 · A grade da casa
- **Executa**: manter perfil × prazo × garantia para {banda, n_obs, datas, fontes, qualidade e validade}; recência e ponderação seguem política versionada por tipo de observação e regime. Célula sem observação válida responde "sem referência confiável".
- **Verificação**: nenhuma célula editada sem fonte; toda resposta de pricing cita a célula; auditoria mensal lista células vencidas.
- **Armadilha**: a grade virar opinião consolidada sem data; célula sem data é célula morta.
- **Saída**: a grade versionada + relatório mensal de frescor.
- **A jusante**: PR-01, todo pricing.
- **Autoridade**: CASA.

### PR-08 · Quando o preço não fecha
- **Executa**: (1) comparar a expectativa de custo da companhia com a banda suportada por PR-07/09; (2) diagnosticar: expectativa fora da grade, célula vencida ou caso sem amostra comparável; (3) aplicar ES-40 com os prêmios de PR-03 e quantificar cada alternativa sem inventar precisão.
- **Verificação**: material não circula com banda incompatível, vencida ou sem referência confiável; qualquer redesenho exige mudança material de estrutura, garantia, volume ou expectativa.
- **Saída**: {gap_bps, diagnóstico, alternativas_quantificadas[], recomendação}.
- **A jusante**: ES-40, PR-09, MK-13.
- **Autoridade**: CASA.

### PR-09 · Como se comunica banda
- **Executa**: sempre: banda (nunca ponto) + "indicativo, sujeito à análise dos investidores" + a base em uma linha; por escrito, só banda que a mesa sustentaria fechar em qualquer ponto dela.
- **Verificação**: régua de largura versionada: mais estreita que o piso é promessa disfarçada (compilador bloqueia); mais larga que o teto é não-saber confesso (volta a PR-01).
- **Saída**: o texto padrão da banda.
- **A jusante**: MA-05, LC-05.
- **Autoridade**: CASA.

### PR-10 · Custo all-in
- **Executa**: (1) somar ao spread: estruturação, registro/emissão (B3, escriturador, agente fiduciário ou securitizadora conforme ES-44), constituição de garantias (laudo, cartório, monitoria anual), jurídico; (2) anualizar no prazo médio; (3) apresentar spread e all-in lado a lado, por alternativa de instrumento.
- **Verificação**: todo custo com fonte (proposta, tabela pública); a comparação entre instrumentos é sempre em all-in (a debênture pode perder da CCB em tíquete pequeno; o cliente vê em número).
- **Saída**: {componente, valor, base}[] + all-in a.a. por alternativa.
- **A jusante**: MA-12, ES-41.
- **Autoridade**: CASA.

### PR-11 · Contra o custo atual
- **Executa**: comparar all-in proposto com: (1) custo médio atual (D-17); (2) a alternativa real do cliente (rolagem curta: custo atual + risco de rolagem quantificado via D-28 como cenário, não adjetivo).
- **Verificação**: proposta mais cara que o atual exige o parágrafo "o que se compra pela diferença" (prazo, carência, liberação de garantia, remoção do risco de rolagem) em termos concretos; sem ele o material não sai.
- **Saída**: {atual, proposto, delta, o_que_compra}.
- **A jusante**: MA-11, calibragem.
- **Autoridade**: CASA.

### PR-12 · Envelhecimento e vigência
- **Executa**: todo dado de pricing tem `valid_until` conforme tipo, fonte, liquidez e regime; vencido sai de decisão e material novo, podendo permanecer como histórico claramente marcado. Choque de regime pode invalidar classes inteiras por decisão registrada.
- **Verificação**: material novo não compila com referência vencida; o erro aponta a célula a reconfirmar.
- **Saída**: estados de vigência na grade + log de invalidações.
- **A jusante**: PR-07, MA-32.
- **Autoridade**: CASA.

### PR-13 · A observação proprietária
- **Executa**: registrar observações de preço obtidas de fontes permitidas, como confirmação direta de mandato, base pública, transação observada ou dado histórico autorizado. Formato: {data, perfil, prazo, garantia, instrumento, valor_bps, tipo_de_observação, fonte, qualidade, validade, identificação_anonimizada_no_agregado}. Dado produzido por eventual atividade futura pós-introdução só entra pela governança própria dessa atividade.
- **Verificação**: observação sem fonte, data, qualidade e validade não alimenta a grade; boato permanece fora de decisão.
- **Saída**: observações governadas na grade; a curva proprietária só existe nas células em que cobertura, qualidade e validade atingirem a política mínima.
- **A jusante**: PR-07; a vantagem de dados da casa.
- **Autoridade**: CASA.

---

# MÓDULO 7 · MATERIAIS INSTITUCIONAIS (MA-01 a MA-32)

Materiais são compilados de fatos verificados, nunca escritos livres. Cada template aqui é
contrato canônico versionado (ADR 0013) e só promove com exemplo gold aprovado.

## 7.1 Teaser

### MA-01 · Os 14 elementos do teaser
- **Executa**: compor uma página, nesta ordem: (1) setor e região; (2) porte por faixa de receita; (3) o negócio em duas linhas (EMP-01 comprimido); (4) o destaque operacional que sustenta o crédito; (5) receita e EBITDA de 2-3 exercícios em faixa ou indexado (base 100); (6) margem e tendência; (7) alavancagem ajustada em faixa; (8) a operação: volume, uso, prazo; (9) estrutura indicativa em uma linha (instrumento + pacote por tipo); (10) fonte de pagamento em uma frase; (11) por que agora (EMP-20, uma linha); (12) próximos passos e o que o NDA libera; (13) disclaimer (MA-30); (14) contato da mesa.
- **Verificação**: template trava a ordem e os campos; nenhum elemento vazio; números vêm da base compilada.
- **Proibido**: nome, marca, cliente nominal, localização de ativo único, qualquer dado que identifique por eliminação (MA-02).
- **Saída**: o teaser compilado com manifesto de versão.
- **A jusante**: MK-15/18.
- **Autoridade**: CASA.

### MA-02 · Anonimização real
- **Executa**: rodar o teste de identificação por eliminação: setor + região + porte + destaque identificam a empresa num mercado concentrado? ("a maior gráfica de tal cidade"); quando identificam, generalizar o eixo menos informativo (região no lugar de cidade; faixa mais larga de porte).
- **Verificação**: checklist de anonimização com veredito registrado por teaser; item de revisão da mesa, não bom senso implícito.
- **Saída**: veredito + generalizações aplicadas.
- **A jusante**: MA-01, LC-08.
- **Autoridade**: CASA.

### MA-03 · O teste dos 90 segundos
- **Executa**: revisão final do teaser contra a régua: um gestor responde em 90 segundos "é meu mandato? vale NDA?"; regras mecânicas: nenhuma frase com duas ideias, números em tabela e não em prosa, zero adjetivo sem número (LC-02).
- **Verificação**: as regras mecânicas no compilador; a leitura de 90s na revisão da mesa (registrada).
- **Saída**: aprovação registrada.
- **A jusante**: MK-15.
- **Autoridade**: CASA.

## 7.2 Memorando de crédito

### MA-04 · As 12 seções na ordem de leitura
- **Executa**: compilar na ordem travada: (1) sumário da operação; (2) destaques de crédito; (3) riscos e mitigantes; (4) a empresa; (5) setor e competição; (6) financeira histórica; (7) a operação e S&U; (8) estrutura indicativa; (9) projeções e cenários; (10) garantias em detalhe; (11) perguntas antecipadas (extrato do Q&A); (12) apêndices (spread Q-18, ponte D-24, índice de evidências MA-14).
- **Verificação**: riscos ANTES da história (seção 3 antes da 4) é contrato do template; tamanhos alvo por seção versionados; seção fora da ordem não compila.
- **Saída**: o memo compilado.
- **A jusante**: MK-18.
- **Autoridade**: CASA.

### MA-05 · Sumário da operação
- **Executa**: meia página: tomador (perfil, sem nome pré-NDA), volume, instrumento, prazo, amortização, garantias por tipo, uso em uma linha (OP-13), banda indicativa (PR-09), fonte de pagamento em uma frase, estado do processo, o "por que agora" (EMP-20).
- **Verificação**: o sumário carrega a operação inteira sozinho (teste: só com ele, um gestor decide levar ao comitê); todos os números da base.
- **Saída**: a seção compilada.
- **A jusante**: decisão de comitê do fundo.
- **Autoridade**: CASA.

### MA-06 · Destaques de crédito
- **Executa**: 4 a 6 bullets, cada um com número e fonte: posição com participação (EMP-09), contrato com prazo e contraparte, conversão de caixa % (Q-02), cobertura do pacote (ES-20).
- **Verificação**: destaque sem número não compila (LC-02); destaque que a diligência não confirmaria inteiro não entra (LC-12).
- **Saída**: a seção.
- **A jusante**: MA-04.
- **Autoridade**: CASA.

### MA-07 · Riscos e mitigantes
- **Executa**: tabela: risco nomeado com substantivo próprio ("concentração no cliente X a 34%") + severidade + probabilidade qualitativa + mitigante REAL (estrutura: trava, reserva, covenant; fato: contrato, seguro; ou preço) + o que NÃO mitiga (OP-05); ordenar do mais severo; incluir toda flag tratada (RF-xx) e ausência material (IN-16).
- **Verificação**: todo risco material conhecido pela mesa aparece com fonte, incerteza e tratamento; diligência futura pode produzir informação nova, que alimenta LC-12. Mitigante de papel, como "monitoramento constante", é bloqueado pela lista vigiada.
- **Saída**: a tabela de riscos.
- **A jusante**: LC-12, MA-04.
- **Autoridade**: CASA.

### MA-08 · A empresa (seção 4)
- **Executa**: compilar de M1: história em um parágrafo, modelo (EMP-01), clientes com números (EMP-03/Q-06), fornecedores (EMP-04), organograma societário (EMP-10), governança real (EMP-12), gestão e sucessão (EMP-13/15), achados tratados (EMP-14).
- **Verificação**: o que é risco está na seção 3, não escondido aqui; nenhuma frase da apresentação do cliente colada.
- **Saída**: a seção.
- **A jusante**: MA-04.
- **Autoridade**: CASA.

### MA-09 · Setor (seção 5)
- **Executa**: tamanho e crescimento com fonte datada, concorrentes nomeados (EMP-09), posição com evidência, ciclo e posição nele (EMP-07), regulação relevante (EMP-06), a lente setorial aplicada (EMP-21 a 30: os índices do setor calculados para o caso).
- **Verificação**: cada frase com dado ou sai; parágrafo de consultoria genérica ("setor resiliente e promissor") bloqueado pela lista vigiada.
- **Saída**: a seção.
- **A jusante**: MA-04.
- **Autoridade**: CASA.

### MA-10 · Financeira histórica (seção 6)
- **Executa**: o spread comentado (Q-18): crescimento e causa física, margem e sustentação (EMP-02), conversão de caixa (Q-02), giro normalizado (Q-04); a PONTE DA DÍVIDA (D-24) como tabela obrigatória + perfil de vencimento pró-forma (D-31/ES-10); ajustes de EBITDA abertos (Q-01: reportado vs mesa, nunca só o ajustado).
- **Verificação**: presença da ponte e do perfil é gate do template; identidade com o modelo entregável (MA-27/28).
- **Saída**: a seção + tabelas.
- **A jusante**: MA-28.
- **Autoridade**: CASA.

### MA-11 · A operação (seção 7)
- **Executa**: S&U completo em blocos (OP-02/13), pró-forma (OP-03), o que resolve/não toca/cria (OP-05), cronograma de desembolso e marcos (OP-08), comparação com o custo atual quando aplicável (PR-11).
- **Verificação**: blocos do S&U nomeados; o parágrafo "o que se compra pela diferença" presente quando o custo sobe (PR-11).
- **Saída**: a seção.
- **A jusante**: MA-04.
- **Autoridade**: CASA.

### MA-12 · Estrutura (seção 8)
- **Executa**: cada termo com a base (ES-43): por que o prazo (fluxo ES-05), por que o pacote (cobertura ES-20), por que os covenants (headroom ES-04), subordinação declarada se existir (ES-38), all-in (PR-10).
- **Verificação**: espelha o term sheet sem divergir em nada (MA-28 cruza); banda conforme PR-09.
- **Saída**: a seção.
- **A jusante**: MA-17/28.
- **Autoridade**: CASA.

### MA-13 · Projeções e cenários (seção 9)
- **Executa**: premissas uma a uma contra o histórico (Q-10, as duas curvas identificadas: empresa e mesa), cenário base, downside, estresses obrigatórios (D-27/28) com DSCR ano a ano (OP-04), sensibilidade em tabela (o que quebra o DSCR primeiro).
- **Verificação**: as duas vozes distintas (projeção da empresa, leitura da mesa); nenhum cenário sem DSCR.
- **Saída**: a seção + tabelas de cenário.
- **A jusante**: MA-04.
- **Autoridade**: CASA.

### MA-14 · Apêndice de evidências
- **Executa**: índice numerado de todos os documentos citados com hash e versão; cada número material do memo carrega o marcador que resolve para o item; o índice espelha a sala (MA-24).
- **Verificação**: marcador órfão (id sem fonte) é visível, nunca escondido; 100% dos números materiais com marcador.
- **Saída**: o apêndice.
- **A jusante**: diligência vira conferência.
- **Autoridade**: CASA.

### MA-15 · Regras editoriais do memo
- **Executa**: aplicar LC-01/02/13: número com fonte, adjetivo com número, declarativa, voz ativa, sem superlativo, risco com substantivo próprio, siglas abertas na primeira vez, datas absolutas; PT/EN por MA-29.
- **Verificação**: as mecânicas no compilador; o resto na revisão da mesa com checklist.
- **Saída**: memo conforme.
- **A jusante**: MA-32.
- **Autoridade**: CASA.

### MA-16 · O que o memo não é
- **Executa**: manter o enquadramento: é material issuer-side de transação, que articula tese, méritos, riscos, estrutura e evidências de forma persuasiva e equilibrada. Não é o memorando interno do investidor, parecer de crédito, aprovação, recomendação de investimento ou prospecto. O disclaimer e o vocabulário da Constituição são aplicados.
- **Verificação**: LC-04 no compilador; revisão jurídica do enquadramento com vigência.
- **Saída**: enquadramento conforme.
- **A jusante**: MA-30.
- **Autoridade**: LEI/CASA.

## 7.3 Term sheet indicativo

### MA-17 · As cláusulas canônicas
- **Executa**: compilar do template versionado: partes; instrumento e forma; volume; destinação (S&U resumido); prazo e cronograma; carência (ES-07); remuneração (indexador + banda PR-09); datas de pagamento; garantias (uma cláusula por garantia COM a mecânica: trava ES-11, LTV ES-13, reserva ES-17); covenants financeiros com definições referenciadas (ES-23/24); covenants não financeiros (ES-25/26/27); informação (ES-30); CPs (MA-20); vencimento antecipado (ES-33); cura e waiver (ES-32); declarações do tomador; despesas; cessão; confidencialidade; foro; validade da proposta; natureza não vinculante (MA-19).
- **Verificação**: gate de entrada: ES-42 verde; cada cláusula com default da casa e alternativas por perfil; nenhuma cláusula removida sem decisão registrada.
- **Saída**: o term sheet compilado.
- **A jusante**: MK-18.
- **Autoridade**: CASA.

### MA-18 · A base de cada termo
- **Executa**: gerar o anexo interno (não circula): termo a termo, a origem (ES-xx, cálculo, referência PR-xx com data); usar na revisão interna e com a companhia para explicar a base, os trade-offs e as alternativas indicativas.
- **Verificação**: 100% dos termos mapeados (ES-43); anexo atualizado a cada versão do term sheet.
- **Saída**: o mapa termo → base.
- **A jusante**: MA-31, MK-18.
- **Autoridade**: CASA.

### MA-19 · Linguagem não vinculante
- **Executa**: manter no template: "indicativo", "sujeito a documentação definitiva e aprovações", sem obrigação de contratar em cláusula nenhuma; revisão jurídica do TEMPLATE (não de cada emissão) com vigência registrada.
- **Verificação**: template vencido (revisão jurídica expirada) não compila.
- **Saída**: template vigente.
- **A jusante**: MA-30.
- **Autoridade**: LEI.

### MA-20 · Condições precedentes no term sheet
- **Executa**: formalizar a lista de OP-09: societárias, garantias constituídas E registradas, certidões, seguros com beneficiária (EMP-18), contratos do projeto, liberações/intercreditor (ES-22/39); cada CP com responsável e prazo estimado.
- **Verificação**: CP sem dono rejeitada; CPs conferem com o cronograma do processo.
- **Saída**: a cláusula de CPs.
- **A jusante**: term sheet indicativo e diligência do financiador. A Offroad não executa closing no produto atual.
- **Autoridade**: CASA.

### MA-21 · Anexo de definições
- **Executa**: anexar as definições da casa (ES-31): dívida (ponte D-24), EBITDA (régua Q-01), caixa livre, convenção IFRS 16 (D-08), CFADS (Q-02); o anexo viaja com o term sheet.
- **Verificação**: as definições do anexo são as MESMAS usadas na análise (uma fonte); divergência é erro de compilação.
- **Saída**: o anexo.
- **A jusante**: MA-17/31, MK-18. A negociação e a apuração posterior pertencem às partes e ao financiador.
- **Autoridade**: CASA.

## 7.4 Q&A, sala e modelo

### MA-22 · As perguntas antecipadas
- **Executa**: compilar o Q&A do padrão versionado por arquétipo e categoria; respostas nascem da sala e da base governada, com marcador MA-14, e são validadas pela companhia. Pergunta sem resposta suportada aparece como não disponível, solicitada ou dependente de confirmação, sem texto inventado.
- **Verificação**: pergunta material recorrente que não estava no padrão gera proposta de evolução; cobertura segue a versão aplicável, sem número universal de perguntas.
- **Saída**: o Q&A compilado.
- **A jusante**: MK-18, MA-04 seção 11.
- **Autoridade**: CASA.

### MA-23 · Resposta com fonte
- **Executa**: toda resposta referencia o documento (marcador); sem resposta na sala: "não disponível, solicitado" e vira lacuna (IN-16), nunca resposta de memória.
- **Verificação**: auditoria de claims cobre o Q&A como cobre o memo.
- **Saída**: Q&A auditado.
- **A jusante**: MA-14.
- **Autoridade**: CASA.

### MA-24 · O índice da sala de saída
- **Executa**: montar na estrutura padrão versionada por arquétipo: 1 societário; 2 demonstrações e balancetes; 3 dívida e garantias; 4 operacional e comercial; 5 projeto/operação; 6 projeções e modelo; 7 jurídico e certidões; 8 Q&A e materiais; cada arquivo com hash, versão, data; o índice espelha MA-14.
- **Verificação**: sala e apêndice do memo idênticos (mesma lista); arquivo na sala fora do índice é erro.
- **Saída**: a sala indexada.
- **A jusante**: MK-18, diligência.
- **Autoridade**: CASA.

### MA-25 · Portões da sala
- **Executa**: aplicar os estágios: pré-NDA: teaser somente; pós-NDA: memo, term sheet, Q&A, sala completa EXCETO itens sensíveis nominais (clientes, folha, IN-21); diligência avançada: sensíveis com registro de acesso por pessoa.
- **Verificação**: nenhum documento pula portão. Exceção exige autorização da companhia ligada à Etapa 12, versão, destinatário e escopo.
- **Saída**: matriz documento × portão + logs de acesso.
- **A jusante**: Etapa 12, autorização e introdução qualificada; MK-18.
- **Autoridade**: CASA.

### MA-26 · Higiene da sala
- **Executa**: varredura antes de abrir: sem duplicado, sem versão velha sem marcação, sem aba oculta esquecida em planilha, sem metadado revelador em PDF (autor, caminho de rede); checklist automatizado + amostra da mesa.
- **Verificação**: sala bagunçada é diagnóstico que o fundo faz da empresa (e da mesa); a varredura registrada.
- **Saída**: relatório de higiene.
- **A jusante**: abertura da sala.
- **Autoridade**: CASA.

### MA-27 · O modelo financeiro entregável
- **Executa**: compilar a planilha: abas premissas (todas num lugar, com fonte), histórico (o spread Q-18), projeção operacional (as duas curvas Q-10), dívida (por contrato, existente e nova, D-24), DRE/balanço/fluxo projetados, covenants (cálculo por período com folga ES-04), cenários (base, downside, estresses); fórmulas abertas, sem macro, sem aba oculta, entradas destacadas.
- **Verificação**: o fundo vai refazer as contas: o modelo que facilita gera confiança; identidade com o memo (MA-28); as identidades Q-17 verdes dentro do modelo.
- **Saída**: o modelo versionado.
- **A jusante**: MK-18, MA-28.
- **Autoridade**: CASA.

## 7.5 Consistência e liberação

### MA-28 · Validação cruzada obrigatória
- **Executa**: antes de qualquer material sair: os mesmos números em teaser, memo, term sheet, modelo e Q&A (a mesma dívida ajustada, o mesmo EBITDA mesa, a mesma banda), verificados por compilação da mesma base.
- **Verificação**: divergência bloqueia a liberação com o apontamento; materiais divergentes entre si são o defeito mais corrosivo diante de um comitê.
- **Saída**: o relatório de consistência verde.
- **A jusante**: MA-32.
- **Autoridade**: CASA.

### MA-29 · PT/EN
- **Executa**: compilar os dois idiomas da mesma base decimal (nunca retraduzir número); terminologia do glossário bilíngue versionado.
- **Verificação**: identidade econômica é teste automático (LC-07).
- **Saída**: o par de materiais.
- **A jusante**: MA-28.
- **Autoridade**: CASA.

### MA-30 · Disclaimers
- **Executa**: incluir o padrão da casa em todo material: assessoria técnica, não é oferta pública nem recomendação de investimento, não é parecer de crédito, sujeito a underwriting e aprovação dos investidores, confidencial; texto jurídico revisado com vigência.
- **Verificação**: presença conferida por template; texto vencido não compila (MA-19).
- **Saída**: materiais com disclaimer vigente.
- **A jusante**: LC-06.
- **Autoridade**: LEI/CASA.

### MA-31 · Versão e fingerprint
- **Executa**: todo material emitido com: versão, data, hash do conteúdo, referência das versões de template e da base (manifesto); material superado recolhido da sala e marcado; nunca duas versões vivas sem marcação.
- **Verificação**: envio registrado com a versão (MK-18); aprovação humana ligada ao fingerprint (aprovação não migra para conteúdo alterado).
- **Saída**: o registro de versões.
- **A jusante**: Etapa 12, autorização e introdução qualificada; auditoria.
- **Autoridade**: CASA.

### MA-32 · A liberação da mesa
- **Executa**: exigir os quatro carimbos antes de qualquer envio: (1) validação cruzada verde de MA-28; (2) auditoria de claims numérica e semântica; (3) revisão técnica do material registrada; (4) autorização da companhia ligada à versão, escopo e destinatários da Etapa 12.
- **Verificação**: sem exceção de urgência (urgência é quando mais se erra); o sistema bloqueia envio sem os quatro.
- **Saída**: liberação de material registrada {material, versão, carimbos, destinatários}. O carimbo confirma consistência e divulgação daquela versão; não aprova crédito, não recomenda investimento e não compromete capital.
- **A jusante**: MK-18; Etapa 12, autorização e introdução qualificada.
- **Autoridade**: CASA.

---

# MÓDULO 8 · MERCADO E DISTRIBUIÇÃO (MK-01 a MK-28)

Mercado pequeno tem memória longa: cada caso bem apresentado compra velocidade para o
próximo; cada caso queimado cobra juros para sempre. Os perfis (MK-01 a 10) alimentam o
registro de mandatos (MK-11); os números finos de cada instituição são dado versionado.

### MK-01 · Fundos de crédito high grade
- **Perfil**: risco baixo, S.A. auditada, debênture, prazo médio-longo, preferência por liquidez de revenda.
- **Olham primeiro**: alavancagem ajustada, consistência de resultado, governança (EMP-12), auditoria (Q-08).
- **Decidem**: comitê com calendário fixo; material incompleto espera o próximo comitê (entregar completo ou não entregar).
- **Matam na entrada**: ressalva de auditoria, litígio societário (RF-10), setor em lista negativa, ausência de demonstração auditada.
- **Uso na shortlist**: o caso limpo com pacote razoável; NUNCA o caso condicional (o não deles suja o processo).
- **Autoridade**: MERCADO.

### MK-02 · High yield e special situations
- **Perfil**: retorno alto por complexidade; garantia pesada, prazo menor, histórias com problema nomeado e solução estruturada.
- **Olham primeiro**: colateral (valor de execução, não de laudo) e caminho de saída.
- **Decidem**: rápido quando o colateral fecha; diligência dura no ativo.
- **Uso**: a contraparte certa do caso condicional (RF tratadas, IN-23 reclassificado); a errada do caso limpo (o preço deles insulta o cliente bom e a mesa perde credibilidade dos dois lados).
- **Autoridade**: MERCADO.

### MK-03 · Assets com mandato dedicado
- **Perfil**: fundos por tese (infra, agro, imobiliário, recebíveis) com regulamento público.
- **Executa**: LER o regulamento antes de apresentar (o mandato declarado é verificável); registrar os limites do regulamento no mapa (MK-11) com a fonte.
- **Matam na entrada**: qualquer item fora do regulamento (não é má vontade, é vedação).
- **Uso**: aderência alta quando a tese casa; o racional (MK-13) cita o regulamento.
- **Autoridade**: MERCADO.

### MK-04 · Gestores e veículos FIDC
- **Perfil**: o FIDC é o veículo. A gestora e o regulamento determinam mandato, direitos creditórios elegíveis, concentração, subordinação, prestadores e retorno. A análise pode combinar carteira, cedente, originador, sacados e estrutura conforme a tese.
- **Olham primeiro**: loan tape, critérios de elegibilidade, política de crédito e cobrança, histórico de perdas, concentração, retenção de risco, qualidade do servicer e mecânica do veículo.
- **Uso**: rota possível para direitos creditórios quando o ativo, a estrutura e o mandato aderem. Não é sinônimo de carteira, instrumento ou solução genérica de capex.
- **Autoridade**: MERCADO.

### MK-05 · Family offices
- **Perfil**: decisão concentrada e rápida; apetite idiossincrático (setores que o principal conhece); sensíveis à história e ao dono.
- **Executa**: apresentação mais curta e direta; o relacionamento pesa; registrar no mapa o apetite declarado COM DATA (volatilidade alta: o mesmo FO fecha sem aviso).
- **Verificação**: apetite vencido conforme a validade do campo é reconfirmado antes de contar na shortlist.
- **Autoridade**: MERCADO.

### MK-06 · Bancos médios
- **Perfil**: crédito com garantia real e relacionamento acessório (folha, câmbio, cobrança); competem com a operação estruturada.
- **Uso**: às vezes são a resposta certa (IN-19 encaminha); úteis como âncora de CCB cedível; a mesa compara com honestidade (PR-11).
- **Autoridade**: MERCADO.

### MK-07 · Securitizadoras
- **Perfil**: veículo (CRI/CRA), não investidor final; distribuição própria ou via coordenador.
- **Executa**: entram quando o lastro existe (ES-44); escolher pela régua: prazo de emissão, custo (PR-10), qualidade de padronização; registrar a experiência de cada uma no mapa.
- **Autoridade**: MERCADO.

### MK-08 · Factors e forfait
- **Perfil**: financiadores de recebíveis performados ou fluxos específicos, com documentação, recurso, preço e controles que variam por produto. Em geral priorizam liquidez do ativo e velocidade, mas podem impor elegibilidade, concentração, recompra e outros gatilhos.
- **Uso**: benchmark de custo do pequeno e take-out de urgência; referência de comparação honesta (PR-11), raramente destino da shortlist.
- **Autoridade**: MERCADO.

### MK-09 · Fundos de infra e imobiliários
- **Perfil**: compram o fluxo do projeto (PPA, aluguel, recebível imobiliário) em estrutura segregada (ES-21), prazo longo, IPCA+.
- **Olham primeiro**: contrato, contraparte, prazo, cláusulas de término, cascata, conta vinculada, riscos de construção e operação, garantias e suporte do sponsor. A relevância do sponsor varia por fase e estrutura.
- **Uso**: casos EMP-27/28 com estrutura segregada; exigem o desenho pronto (não compram intenção de SPE).
- **Autoridade**: MERCADO.

### MK-10 · Fundos de venture debt
- **Perfil**: risco de startup com sponsor; olham runway, recorrência real (EMP-24), cap table, última rodada; estrutura própria (warrant, escalonado).
- **Verificação**: nunca apresentar venture debt a fundo tradicional nem o inverso (a confusão de mandato mais comum do mercado).
- **Autoridade**: MERCADO.

### MK-11 · O registro de mandato
- **Executa**: manter por instituição e veículo: instrumentos aceitos, tíquete mín/máx, setores (positivos e vedados), prazo máximo, indexadores, exigência mínima de garantia, rating implícito mínimo, geografia, retorno alvo, restrições declaradas; MAIS os metadados que valem tanto quanto: fonte da informação (MK-14), data da última confirmação, quem confirmou, validade, nível de confiança e histórico autorizado disponível.
- **Verificação**: campo sem data é campo vazio para o matching; mandato com confirmação vencida (prazo por tipo de fonte, versionado) rebaixa de confiança e sai dos filtros duros até reconfirmar.
- **Saída**: o registro governado com dono e cadência.
- **A jusante**: MK-12/13, matching.
- **Autoridade**: CASA.

### MK-12 · Filtros duros primeiro
- **Executa**: aplicar em ordem: tíquete, setor vedado, instrumento, prazo, exigência de garantia, jurisdição; quem falha em um filtro duro sai ANTES de qualquer consideração qualitativa; o racional qualitativo só ordena quem passou.
- **Verificação**: operação fora de filtro duro NUNCA é apresentada "para testar" (queima o caso e a casa); a exceção não existe: se a mesa acha que o mandato mudou, reconfirma primeiro (MK-14).
- **Saída**: lista de eliminados {fundo, filtro_que_falhou} + lista de passantes.
- **A jusante**: MK-13.
- **Autoridade**: CASA.

### MK-13 · Aderência explicável
- **Executa**: para cada passante, montar o racional: filtros passados com os valores ("tíquete 40 dentro da banda 30-80"), pontos a confirmar nomeados e a frase de tese ("o mandato combina prazo longo e garantia real, características presentes neste caso"); ordenar a shortlist por filtros duros, aderência explicada, qualidade e atualidade do mandato e histórico autorizado disponível.
- **Verificação**: sem percentual mágico de compatibilidade; o teste da primeira frase: o gestor reconhece que a mesa entendeu o mandato dele, ou a porta fecha.
- **Saída**: shortlist ordenada com racional por nome.
- **A jusante**: MK-15/17.
- **Autoridade**: CASA.

### MK-14 · De onde vem a informação de mandato
- **Executa**: classificar cada dado do registro pela hierarquia: confirmação direta do gestor (melhor, com data e autor) > regulamento ou material público do fundo > observação de mercado governada de PR-13 > informação não confirmada. Reconfirmação direta atualiza somente os campos que ela cobriu.
- **Verificação**: filtro duro só roda sobre dado das duas primeiras classes ou observação recente; boato nunca elimina nem inclui.
- **Saída**: cada campo do mandato com {classe_da_fonte, data}.
- **A jusante**: MK-11/12.
- **Autoridade**: CASA.

### MK-15 · Âncoras primeiro
- **Executa**: (1) escolher um primeiro grupo pequeno dentro do limite versionado, pela aderência, qualidade do contato e capacidade de dar retorno útil; (2) realizar introdução ou sondagem somente com autorização e material compatível; (3) registrar apetite, referência indicativa e objeções; (4) revisar material e estrutura antes de ampliar.
- **Verificação**: nenhuma abertura ampla antes do retorno dos âncoras; objeção estrutural repetida por 2 âncoras obriga revisão (ES-40) antes de prosseguir.
- **Saída**: {âncora, retorno, banda, objeções} + ajustes feitos.
- **A jusante**: MK-17, PR-13.
- **Autoridade**: CASA.

### MK-16 · Controle de distribuição
- **Executa**: envio amplo e indiferenciado é proibido. A estratégia define ondas pequenas, tese por destinatário, informação autorizada e aprendizagem antes de ampliar. Qualquer expansão excepcional exige racional, consentimento da companhia e destinatários aderentes.
- **Verificação**: o sistema limita envios simultâneos ao parâmetro da casa e bloqueia destinatário fora de mandato, material não autorizado ou mensagem genérica.
- **A jusante**: MK-17, RF-17 (o caso que chega queimado dos outros).
- **Autoridade**: CASA.

### MK-17 · Sequência e ritmo
- **Executa**: preparar a ordem de introduções qualificadas dentro do limite versionado, com racional por destinatário, materiais autorizados e calendário proposto. Urgência real de IN-22 comprime o calendário sem eliminar gates.
- **Verificação**: plano escrito e aprovado pela companhia; nenhum destinatário entra sem mandato válido, racional MK-13 e autorização vinculada à versão.
- **Saída**: plano ordenado de introduções autorizadas.
- **A jusante**: MK-18 e Etapa 12.
- **Autoridade**: CASA.

### MK-18 · O que vai em cada estágio
- **Executa**: montar para cada introdução o pacote mínimo autorizado pela companhia. O pacote pode conter teaser e, quando expressamente autorizado para aquele destinatário, memo, term sheet indicativo, Q&A e índice da sala. NDA, diligência, negociação, documentação e funding posteriores são conduzidos pelas partes fora do produto atual.
- **Verificação**: destinatário, escopo, versão e autorização estão ligados; nenhum item sensível circula sem permissão específica; MA-31 e MA-32 verdes.
- **Saída**: registro da introdução qualificada {destinatário, racional, materiais, versões, autorização, data}.
- **A jusante**: Etapa 12. Este é o limite da execução atual.
- **Autoridade**: CASA.

## 8.3 Referência pós-introdução, fora da execução atual

MK-19 a MK-28 preservam conhecimento de mesa para uma eventual expansão de escopo. No produto
atual, o pipeline termina na introdução qualificada autorizada de MK-18. A Offroad não executa NDA,
competição, negociação de termos, book, alocação, fechamento ou monitoramento como atividade da
plataforma. Nenhuma entrada desta seção pode ser compilada para runtime atual sem nova decisão de
produto, controles próprios, revisão jurídica, novos testes e atualização explícita do ADR 0012.

### MK-19 · O NDA
- **Executa**: usar o padrão da casa: mútuo, prazo definido, sem non-circumvent abusivo, sem exclusividade implícita; alterações do fundo passam pela régua versionada (o que se aceita sem discussão, o que nunca); registro de quem assinou o quê, quando.
- **Verificação**: material pós-NDA só sai com NDA registrado; cláusula fora da régua escala para decisão registrada.
- **Saída**: registro de NDAs {fundo, versão, alterações, data}.
- **A jusante**: MA-25; Etapa 12, autorização e introdução qualificada.
- **Autoridade**: LEI/CASA.

### MK-20 · Gestão de competição
- **Executa**: com 2+ interessados: mesma informação para todos no mesmo estágio (assimetria proposital é proibida), prazos iguais, competição usada nos termos sem anunciar leilão; a recomendação final pondera preço + termos + histórico de execução do fundo (fechar no termo indicado).
- **Verificação**: toda diferença de informação entre fundos no mesmo estágio precisa de causa registrada (ex.: pergunta específica respondida a quem perguntou, disponibilizada aos demais no Q&A).
- **Saída**: quadro comparativo + recomendação com base.
- **A jusante**: MK-23/24.
- **Autoridade**: CASA.

### MK-21 · Cadência e follow-up
- **Executa**: toda entrega a fundo ganha data de follow-up; silêncio com follow-up feito por 2 semanas rebaixa o fundo na onda (e vira dado MK-22 "sem resposta"); o cliente recebe update padrão semanal do estado do processo (o silêncio da mesa para o cliente é proibido).
- **Verificação**: telemetria de follow-ups em atraso; update semanal como artefato gerado.
- **Saída**: agenda de follow-ups + updates enviados.
- **A jusante**: MK-22, relação com o cliente.
- **Autoridade**: CASA.

### MK-22 · A recusa como dado estruturado
- **Executa**: toda recusa registrada na taxonomia: fora de mandato (qual filtro: atualiza MK-11), preço (que banda pagaria: alimenta PR-13), estrutura (o que faltou: alimenta ES-40 do próximo), momento (fechado no tri: alimenta MK-26), crédito (a objeção específica: alimenta a análise), sem resposta.
- **Verificação**: recusa sem classificação não fecha o registro do fundo no caso; a taxonomia é revisada quando "outros" passa de 10%.
- **Saída**: {fundo, classe, detalhe, data} por recusa.
- **A jusante**: MK-11, PR-13, MK-26; a cobertura do mapa só é declarada onde volume, qualidade e atualidade forem suficientes.
- **Autoridade**: CASA.

### MK-23 · Book e indicações
- **Executa**: consolidar indicações em quadro único na MESMA convenção (PR-02 normalização): volume, taxa, prazo, garantias pedidas, condições; anexar o histórico de execução de cada fundo (fecha no indicado? renegocia na documentação?); recomendação da mesa registrada com base.
- **Verificação**: indicações comparadas só depois de normalizadas; a recomendação pode ser o segundo preço com melhor execução, e a base diz por quê.
- **Saída**: o book + recomendação.
- **A jusante**: MK-24, decisão do cliente.
- **Autoridade**: CASA.

### MK-24 · Alocação
- **Executa**: com demanda acima da oferta: proposta da mesa (âncora que validou cedo tem prioridade moral; diversificação de credor interessa ao cliente; tíquete mínimo de cada fundo respeitado), decisão do cliente registrada; comunicação de alocação no mesmo dia para todos; cortado sabe por quê.
- **Verificação**: nenhum fundo sabe antes dos outros; o motivo do corte é registrado (e alimenta MK-28).
- **Saída**: alocação final + comunicações.
- **A jusante**: MK-25/28.
- **Autoridade**: CASA.

### MK-25 · Fechamento comunicado
- **Executa**: fechou: comunicar todos os envolvidos (o mercado saberá; melhor pela mesa); agradecer quem indicou e não levou; registrar no mapa: quem levou, termos finais (observação PR-13 da melhor qualidade), aprendizados; rodar o checklist de fechamento (observações registradas? LC-12 coletado?).
- **Verificação**: checklist de fechamento completo antes de arquivar o caso.
- **Saída**: registro de fechamento + observações.
- **A jusante**: PR-13, LC-12, MK-28.
- **Autoridade**: CASA.

### MK-26 · Quando o mercado fecha
- **Executa**: monitorar os sinais: recusas em série por "momento" (MK-22), spreads de referência abrindo (PR-02), resgates nos fundos de crédito; ao detectar: dizer ao cliente com número (PR-12), recalibrar ou pausar (OP-12); nunca empurrar caso bom em janela ruim por agenda.
- **Verificação**: a leitura de janela é registrada com as evidências; a decisão de pausar/seguir é do cliente, informada.
- **Saída**: {sinais, leitura, recomendação, decisão}.
- **A jusante**: OP-12, PR-12.
- **Autoridade**: CASA.

### MK-27 · Tudo registrado
- **Executa**: cada contato com fundo (enviado, dito, respondido, quando) em registro por caso e por instituição; nota de reunião é artefato esperado de toda reunião (LC-10).
- **Verificação**: reunião na agenda sem nota em 48h aparece na telemetria; o registro é a memória da distribuição e a proteção da casa em disputa.
- **Saída**: a trilha completa por caso e por fundo.
- **A jusante**: MK-11 (histórico), LC-10.
- **Autoridade**: CASA.

### MK-28 · O fundo é cliente também
- **Executa**: pós-processo: retorno a quem deu feedback ("ajustamos o que você apontou"); registrar o que cada gestor pediu para ver no futuro (vira campo do mandato MK-11); o cortado bem tratado é o comprador rápido do próximo caso.
- **Verificação**: os pedidos registrados são consultados na montagem de shortlists futuras (o matching considera "pediu para ver casos assim").
- **Saída**: registros de preferência por gestor.
- **A jusante**: MK-13, a distribuição composta como ativo da casa.
- **Autoridade**: CASA.

---

# MÓDULO 9 · RED FLAGS E DECLÍNIO DE MANDATO (RF-01 a RF-20)

Cada flag tem: gatilho objetivo (detectável pelo sistema), investigação (passos da mesa),
tratamento possível e efeito quando não tratada. Flag não é veto; flag escondida é.

### RF-01 · Estoque crescendo acima da receita
- **Gatilho**: crescimento de estoque materialmente acima da receita durante a janela versionada de Q-13.
- **Investiga**: giro por linha e idade; estoque estratégico documentado (compra antecipada com contrato/preço) vs acúmulo; provisão vs perdas.
- **Tratamento**: explicação documentada entra no memo; sem explicação: ajuste de provisão proposto e estoque excluído de conta de garantia (ES-14).
- **Efeito não tratada**: qualidade de receita sob suspeita (compõe com RF-02/08).
- **Autoridade**: DEF.

### RF-02 · PMR esticando com receita estável
- **Gatilho**: PMR normalizado (Q-04) subindo acima do limiar versionado em 12m com receita estável ou caindo.
- **Investiga**: aging por cliente (Q-14): esticou para quem?; renegociados no a-vencer?; provisão acompanhou?
- **Tratamento**: causa nomeada (âncora renegociado com contrato) vai ao memo; carteira reprecificada como garantia (ES-11 usa a líquida).
- **Efeito**: colateral vale menos; qualidade de receita em dúvida.
- **Autoridade**: DEF.

### RF-03 · Margem descolada dos pares
- **Gatilho**: margem bruta ou EBITDA acima do intervalo dos pares (lente M1) sem causa registrada.
- **Investiga**: preço de transferência (Q-07); capitalização de custo; receita antecipada (Q-05); mix real.
- **Tratamento**: causa física documentada vira argumento de crédito; sem causa, downside usa margem normalizada aos pares.
- **Efeito**: projeções descontadas; composta com RF-07 é severa.
- **Autoridade**: DEF.

### RF-04 · Caixa alto com dívida cara
- **Gatilho**: caixa e aplicações acima do limiar versionado da dívida bruta convivendo com custo médio alto (D-17).
- **Investiga**: extrato médio mensal (não saldo de data); caixa vinculado ou em garantia (D-19)?; caixa em entidade diferente da dívida (EMP-10)?
- **Tratamento**: caixa comprometido reclassificado (não é líquido); explicação legítima registrada.
- **Efeito**: dívida líquida usa só caixa livre comprovado.
- **Autoridade**: HEURÍSTICA.

### RF-05 · Troca de auditor
- **Gatilho**: troca nos últimos 3 exercícios, especialmente de maior para menor (Q-08).
- **Investiga**: motivo formal; parecer do ano anterior à troca (ênfase/ressalva?); honorários.
- **Tratamento**: racional documentado (custo, escopo) é neutro e dito no memo antes que perguntem.
- **Efeito**: compõe RF-18 (com RF-06/07: cultura de número).
- **Autoridade**: DEF.

### RF-06 · Republicação
- **Gatilho**: demonstração reapresentada em qualquer dos 3 exercícios.
- **Investiga**: o que mudou, por quê, efeito nas linhas usadas; norma nova (neutra) vs erro de receita/estoque/dívida (severa).
- **Tratamento**: técnica documentada; severa entra em riscos com efeito quantificado.
- **Efeito**: severa não tratada tende a declínio (base infiável).
- **Autoridade**: DEF.

### RF-07 · Gerencial sistematicamente melhor
- **Gatilho**: índice de viés de Q-09 acima da faixa versionada e persistentemente favorável ao gerencial.
- **Investiga**: as 3 maiores divergências linha a linha; lançamentos de abertura do exercício seguinte.
- **Tratamento**: nenhum número gerencial em material; projeções descontadas pelo viés medido (Q-10); dito internamente com número.
- **Efeito**: com RF-05/06 compõe o padrão mais grave.
- **Autoridade**: CASA.

### RF-08 · Receita concentrada no fim do período
- **Gatilho**: concentração de receita no fim do período acima da faixa versionada, sem sazonalidade ou entrega que explique.
- **Investiga**: entregas/medições da quinzena; devoluções dos 60 dias seguintes; termos de venda (devolução? canal empurrado?).
- **Tratamento**: entrega comprovada encerra; sem comprovação, a receita da quinzena sai da base LTM.
- **Efeito**: qualidade de receita rebaixada; compõe com RF-01/02.
- **Autoridade**: DEF.

### RF-09 · Circularidade com partes relacionadas
- **Gatilho**: fluxo material com ligadas segundo Q-07, combinado com mútuo em D-11 e garantia cruzada em D-10.
- **Investiga**: mapa de fluxos do grupo (EMP-10) com valores; preços vs mercado; perímetro econômico real.
- **Tratamento**: análise consolidada do perímetro real; covenants fechando o perímetro (ES-26/27 estendidos); tudo no memo.
- **Efeito**: sem transparência total, declínio (o fundo descobrirá, LC-12).
- **Autoridade**: DEF.

### RF-10 · Litígio entre sócios
- **Gatilho**: processo/arbitragem entre controladores ou bloqueio societário (EMP-11/14).
- **Investiga**: objeto e estágio; efeito sobre decisões da vida da dívida (waiver, venda de ativo, garantia).
- **Tratamento**: raro; prazo curto com garantia autoexecutável, ou esperar a solução (OP-12); a maioria não é apresentável durante a guerra.
- **Efeito**: institucionais recusam na entrada (MK-01).
- **Autoridade**: LEI/MERCADO.

### RF-11 · Sucessão aberta
- **Gatilho**: função crítica concentrada conforme EMP-13, sem segunda linha, delegação, seguro-chave ou plano de continuidade compatível com o horizonte da operação.
- **Investiga**: gestão profissional abaixo do dono (EMP-15)?; seguro-chave?; sucessão contratada?
- **Tratamento**: mitigantes reais (covenant de permanência, seguro-chave, prazo menor).
- **Efeito**: prazo longo sem mitigante não viaja.
- **Autoridade**: MERCADO.

### RF-12 · Garantia cruzada com empresa problemática
- **Gatilho**: aval/fiança da analisada a entidade do grupo em dificuldade (D-10 + recuperação/execução/notícia).
- **Investiga**: exposição máxima jurídica; estágio da dificuldade; possibilidade de liberação.
- **Tratamento**: liberação como CP (OP-09/MA-20) ou consolidação do risco no perímetro com preço/estrutura conformes.
- **Efeito**: contágio jurídico direto; sem tratamento, declínio.
- **Autoridade**: DEF.

### RF-13 · Contingência reclassificada na véspera
- **Gatilho**: provável que virou possível no exercício do pedido (comparação de notas, D-16).
- **Investiga**: fundamento novo (decisão judicial, opinião legal datada)?; padrão em outras contingências?
- **Tratamento**: sem fundamento novo documentado, a análise mantém a classificação anterior e o memo explica.
- **Efeito**: compõe padrão de maquiagem pré-operação.
- **Autoridade**: DEF.

### RF-14 · A informação que muda
- **Gatilho**: 3+ versões divergentes do mesmo número/peça sem trilha (versionamento da sala).
- **Investiga**: fonte primária (razão, extrato); confronto das versões com datas.
- **Tratamento**: congelar a análise na base conciliada da Etapa 5; listar divergências; comunicar o método e a versão da base oficial.
- **Efeito**: EMP-16 rebaixado; persistência sem fonte primária tende a declínio.
- **Autoridade**: CASA.

### RF-15 · Resistência ao analítico
- **Gatilho**: item material negado ou adiado de forma persistente além da régua operacional versionada, sem justificativa ou substituto verificável.
- **Investiga**: o que o analítico mostraria (concentração? ligadas? inadimplência?); justificativa legítima (sistema, confidencialidade tratável com NDA)?
- **Tratamento**: alternativa aceitável combinada (amostra, agregado auditável); limitação registrada no memo se material.
- **Efeito**: a mesa não leva o que não viu (LC-12); persistência = declínio.
- **Autoridade**: CASA.

### RF-16 · Pressa incompatível com diligência
- **Gatilho**: pressão contra verificações sem causa de urgência verificada (IN-22).
- **Investiga**: a causa real (vencimento oculto? outra assessoria em paralelo? RF-17?).
- **Tratamento**: urgência real → ponte estruturada (OP-10); pressa sem causa → calendário mantido e dito.
- **Efeito**: atalho de diligência nunca; quem não aceita o rito não é cliente da casa.
- **Autoridade**: CASA.

### RF-17 · O caso que já circulou
- **Gatilho**: menção a outro assessor/material; fundo respondendo "já vimos".
- **Investiga**: o que circulou, para quem, com que números (pedir o material anterior); divergências contra a base conciliada.
- **Tratamento**: reapresentação formal com correção explícita da base, só aos fundos que receberam; às vezes, esperar esfriar (OP-12).
- **Efeito**: mercado queimado limita a lista (MK-16); avaliar antes de aceitar o mandato.
- **Autoridade**: MERCADO.

### RF-18 · Flags compostas
- **Executa**: computar as famílias: cultura de número {RF-05,06,07,13}; qualidade de receita {RF-01,02,08}; perímetro nebuloso {RF-09,12,14}; conduta {RF-15,16,17}. 2+ flags ativas na mesma família elevam a família a severa, independentemente de tratamentos individuais.
- **Verificação**: família severa exige decisão explícita da mesa (seguir com tratamento reforçado ou declinar), registrada; o sistema não deixa passar em silêncio.
- **Saída**: painel de flags por família com estados.
- **A jusante**: RF-19.
- **Autoridade**: CASA.

### RF-19 · Critérios de declínio
- **Executa**: declinar quando: contabilidade não permite análise e o cliente não corrige; analítico essencial negado (RF-15); expectativa incorrigível após calibragem documentada (IN-18 + PR-11 apresentados e recusados); uso real não declarável; pré-insolvência/special situations (fora do ofício, com indicação); família severa sem tratamento (RF-18); achado de integridade (fraude, passivo deliberadamente oculto).
- **Verificação**: todo declínio com motivo classificado e registro; decisão da mesa, nunca automática (o sistema recomenda, a mesa decide).
- **Saída**: {motivo_classe, evidências, decisão, comunicação}.
- **A jusante**: RF-20, funil.
- **Autoridade**: CASA.

### RF-20 · Como se declina
- **Executa**: conversa direta (nunca sumiço): motivo técnico em linguagem simples, sem sermão; o caminho de volta quando existe ("com auditoria de dois exercícios, reabrimos"); indicação alternativa quando cabe; registro interno completo.
- **Verificação**: comunicado em até X dias úteis da decisão (parâmetro); mensagem segue o script versionado.
- **Saída**: comunicação + registro (IN-19, memória comercial).
- **A jusante**: relação preservada; parte volta como mandato melhor.
- **Autoridade**: CASA.

---

# MÓDULO 10 · LINGUAGEM E CONDUTA DA CASA (LC-01 a LC-13)

Cada procedimento declara ONDE é verificado (compilador de materiais, revisão da mesa,
auditoria de claims) e traz exemplo correto e contraexemplo, porque regra editorial sem
verificação é sugestão.

### LC-01 · Frase declarativa com fonte
- **Executa**: toda afirmação material segue sujeito + verbo + número + fonte; o que não tem fonte é declarado premissa ou julgamento (classes da Constituição 2.5) com o rótulo no texto.
- **Verificado em**: auditoria de claims (número sem suporte bloqueia) + revisão da mesa (rótulo presente).
- **Correto**: "A receita cresceu 18% em 2025 (DF auditada, nota 22)." **Contraexemplo**: "A empresa vem apresentando forte crescimento."
- **A jusante**: MA-15, compilador.
- **Autoridade**: CASA.

### LC-02 · Adjetivo sem número é proibido
- **Executa**: adjetivo de intensidade (forte, sólido, robusto, conservador, confortável) só acompanhado do número na mesma frase; lista de adjetivos vigiados versionada no compilador.
- **Verificado em**: compilador (ocorrência sem número na frase = bloqueio com apontamento).
- **Correto**: "cobertura confortável: DSCR mínimo de 1,8x no downside". **Contraexemplo**: "estrutura de capital sólida".
- **Autoridade**: CASA.

### LC-03 · O risco se nomeia primeiro
- **Executa**: em material, a seção de riscos antes da história (ordem travada no template MA-04); em reunião, os 3 riscos principais apresentados pela mesa antes de perguntados; em resumo executivo, pelo menos 1 linha de risco.
- **Verificado em**: template (ordem é contrato); checklist de preparação de reunião.
- **Correto**: "os três pontos que o comitê de vocês vai levantar são estes, com o tratamento de cada um". **Contraexemplo**: risco aparecendo pela primeira vez na pergunta do fundo.
- **A jusante**: LC-12.
- **Autoridade**: CASA.

### LC-04 · Vocabulário permitido e proibido
- **Executa**: aplicar a lista da Constituição seção 5 a TODO texto que sai; a lista vive no compilador com variações morfológicas ("aprovado", "aprovação garantida", "pré-aprovado").
- **Verificado em**: compilador (materiais e textos gerados); revisão da mesa (texto livre).
- **Correto**: "estrutura indicativa suportada pela análise". **Contraexemplo**: "operação pré-aprovada com fundos parceiros".
- **Autoridade**: CASA.

### LC-05 · Nunca prometer o que não é nosso
- **Executa**: permitido prometer: prazo das próprias entregas, escopo do material, condução do processo. Proibido: aprovação, taxa final, prazo de resposta de terceiro. Ao "consegue garantir?", usar a resposta padrão (LC-06).
- **Verificado em**: revisão da mesa; reclamação citando promessa vira incidente com trilha.
- **Correto**: "o material completo sai em 10 dias úteis da entrega dos documentos". **Contraexemplo**: "em 30 dias o dinheiro está na conta".
- **Autoridade**: CASA.

### LC-06 · Disclaimer e resposta padrão
- **Executa**: disclaimer da casa em todo material (bloqueio de compilação sem ele, MA-30); resposta padrão ao "está aprovado?": "o que temos é uma estrutura indicativa suportada pela análise; aprovação é decisão do investidor após a diligência dele". Texto versionado, não improviso.
- **Verificado em**: compilador (presença); treinamento da mesa (uso).
- **Autoridade**: LEI (texto revisado com vigência) / CASA.

### LC-07 · Dois idiomas, uma economia
- **Executa**: números PT e EN compilados da mesma base decimal (nunca retraduzidos); terminologia do glossário bilíngue (dado versionado); termo novo entra no glossário antes de circular.
- **Verificado em**: compilador (identidade econômica é teste automático; divergência bloqueia).
- **Correto**: 1.234,5 ↔ 1,234.5 da mesma célula. **Contraexemplo**: EN re-arredondado na tradução.
- **Autoridade**: CASA.

### LC-08 · Confidencialidade entre casos
- **Executa**: nenhum dado de um caso em outro contexto: sem exemplo identificável, sem benchmark reconhecível, sem "outro cliente nosso do setor"; agregados para a grade (PR-13) anonimizados de forma irreversível (teste de identificação por eliminação, MA-02 espelhado).
- **Verificado em**: revisão de materiais e da grade; tenancy segregada no sistema.
- **Contraexemplo**: "fechamos mês passado uma operação parecida de uma empresa de tal cidade".
- **Autoridade**: LEI (confidencialidade e LGPD) / CASA.

### LC-09 · Conflito de interesse
- **Executa**: (1) no aceite de mandato, checar a carteira ativa por sobreposição (mesmo setor + mesmo bolso no mesmo período); (2) sobreposição: revelar a ambos e registrar o aceite, ou declinar o segundo; (3) NUNCA os dois lados da mesma operação; (4) registro auditável no caso.
- **Verificado em**: checklist de aceite de mandato.
- **Autoridade**: CASA.

### LC-10 · O que se escreve e o que se fala
- **Executa**: todo compromisso (número, prazo, termo) por escrito; conversa relevante dentro do escopo atual vira nota datada no caso; regra dupla: nada dito que não se sustentaria por escrito, nada escrito que não sobreviva a leitura em voz alta numa disputa.
- **Verificado em**: registro do caso (nota de reunião é artefato esperado de reunião registrada).
- **Autoridade**: CASA.

### LC-11 · Velocidade com verdade
- **Executa**: resposta rápida tem formato: o que se sabe + o que falta + quando fecha ("temos X; Y depende do balancete que chega quinta"); "não sabemos ainda, resposta em D+2" é resposta válida e datada; chute confiante é proibido.
- **Verificado em**: revisão da mesa; surpresa em diligência causada por chute é LC-12 com causa classificada.
- **Autoridade**: CASA.

### LC-12 · Zero surpresa como métrica
- **Executa**: (1) após cada diligência de fundo, listar todo item levantado que não estava no material; (2) classificar: qual módulo/procedimento deveria ter pego; (3) registrar na série do caso e da casa; (4) cada item vira emenda ou procedimento novo, datado.
- **Verificação**: meta zero; série histórica é métrica interna pública da casa, revisada por caso fechado.
- **Saída**: {caso, item_surpresa, módulo_falho, ação_gerada}.
- **A jusante**: a evolução do playbook inteiro.
- **Autoridade**: CASA.

### LC-13 · Forma da casa
- **Executa**: sem travessão em texto nenhum (reescrever a frase); sem jargão decorativo (cada coisa pelo nome; termo técnico real sim, poesia de mercado não); datas absolutas em material (25/08/2026, nunca "recentemente"); números com separador e moeda explícita; siglas abertas na primeira ocorrência por documento.
- **Verificado em**: compilador (travessão, data relativa e sigla não aberta são bloqueios mecânicos; jargão é lista vigiada + revisão).
- **Correto**: "em 31/12/2025, a dívida ajustada era de R$ 182,4 milhões". **Contraexemplo**: "recentemente a alavancagem melhorou bastante".
- **Autoridade**: CASA.


---

# PRODUÇÃO E GOVERNANÇA DESTE PLAYBOOK

1. **Carga**: cada entrada permanece fonte até satisfazer o contrato mínimo aplicável à sua
   natureza. Somente então vira registro `draft` com id, módulo, objetivo, produto, passos,
   evidência, saída estruturada, testes, fronteira, dono, autoridade, dependências, forma-pergunta
   quando aplicável e template associado. Entrada incompleta não é preenchida pelo modelo.
2. **Valores versionados**: bandas, haircuts, folgas, limiares e prazos marcados como
   "versionado" ou "parâmetro da casa" vivem em dado com fonte, data e dono. O procedimento
   fixa o método; o dado fixa o número. Atualização de mercado é edição de dado, nunca
   reescrita de procedimento.
3. **Validação**: o fundador aprova posicionamento e lógica de produto. Método financeiro e
   contábil exige responsável técnico e revisão independente; afirmação jurídica, tributária,
   regulatória ou de privacidade exige revisão especializada com fonte e vigência. A aprovação
   registra pessoa, papel, versão, fingerprint e data. Nenhuma aprovação migra para conteúdo
   materialmente alterado.
4. **Evolução**: recusa de fundo (MK-22), surpresa em diligência (LC-12), correção de
   revisor e adversarial que passou onde não devia geram procedimento novo ou emenda,
   datados. O playbook nunca está pronto; está governado.
5. **Orquestração**: papéis organizam responsabilidade e skills, mas não são agentes autônomos.
   Ordem, estado, retries, orçamento, gates e promoção pertencem ao pipeline determinístico.
   Modelo recebe tarefa estreita, contexto mínimo e schema; não decide o próximo passo nem
   conversa livremente com outro modelo.
6. **Fronteira**: a execução atual termina na introdução qualificada autorizada. Underwriting,
   diligência do financiador, comitê, negociação final, documentação, funding, closing e
   monitoramento permanecem atividades do financiador ou referências futuras, nunca claims do
   produto atual.

## Fontes jurídicas e contábeis governadas iniciais

Estas fontes são ponto de partida, não substituem revisão especializada do caso. Cada uso exige
dispositivo aplicável, data de consulta, vigência e responsável:

1. Lei 6.404 compilada, inclusive regime de debêntures:
   https://www.planalto.gov.br/ccivil_03/leis/l6404compilada.htm
2. Lei 14.430, marco legal da securitização:
   https://planalto.gov.br/ccivil_03/_ato2019-2022/2022/lei/l14430.htm
3. Resolução CVM 175 consolidada e Anexo Normativo II:
   https://conteudo.cvm.gov.br/legislacao/resolucoes/resol175.html
4. Atualização do Anexo II da Resolução CVM 175 pela Resolução CVM 240, de março de 2026:
   https://www.gov.br/cvm/pt-br/assuntos/noticias/2026/cvm-edita-norma-com-ajustes-pontuais-no-anexo-ii-da-resolucao-175-sobre-fidc/
5. CPC 06 (R2), arrendamentos:
   https://www.cpc.org.br/CPC/Documentos-emitidos/Pronunciamentos/Pronunciamento?Id=37
