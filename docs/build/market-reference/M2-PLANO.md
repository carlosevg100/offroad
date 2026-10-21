# M2: primeira série pública de ponta a ponta (ADR 0023)

Estado em 21/10/2026: fundação (PR #924) e job de aquisição (PR #925) em produção, transporte fechado.
O gate de série (PR #926) tirou o CDI do caminho aberto. Este plano fixa as decisões de desenho do M2
antes do código, depois de duas rodadas da revisão independente. Cada parte é uma PR com migração, os
testes nomeados abaixo, revisão independente, prova em staging e produção, manifesto e catálogo.

## Objeto, prova de disponibilidade e consumidor

**Série: meta Selic definida pelo Copom (SGS 432).** Licença `odc-odbl` no catálogo do Banco Central
(evidência `bcb-catalog-meta-selic-432`), percentual ao ano, um valor por dia corrido. Unidade
`percent_per_year`, convenção `meta_copom`, sem anualização nem conversão.

**Prova de quando cada meta passou a valer: os comunicados do Copom.** O conjunto `atas-comunicados-copom`
(Documentos do Copom, `odc-odbl` no mesmo catálogo, evidência a capturar na parte 0) publica cada
comunicado com a data e a hora de divulgação. Pela Resolução BCB 61 (regulamento do Copom, art. 1º, § 2º),
a meta decidida passa a vigorar no primeiro dia útil seguinte ao término da reunião. Cada mudança de
valor na série 432 é ligada ao comunicado que a anunciou, e a observação guarda três instantes distintos:
decisão (fim da reunião), divulgação do comunicado e início de vigência. A ata, publicada dias depois,
não serve de prova. `available_at` de um valor é a divulgação do comunicado quando esse vínculo existe e
é anterior à aquisição; sem vínculo, é a aquisição (`observed_at_acquisition`). O vínculo (identificador
e hash do registro do comunicado) entra no fingerprint. A leitura com data-base D corta D no fim do dia
em `America/Sao_Paulo`, compara instantes (não texto) e exige `available_at <= D` e `acquired_at <= D`.
Reunião extraordinária segue a mesma regra; reunião sem mudança não reinicia a vigência.

**Primeiro consumidor: o gatilho RG-01 do regime de precificação da casa.** A política
`policy.pricing.regime` (`packages/credit-playbook/src/reference-data-proposals/pricing-market.ts`)
declara o regime de afrouxamento iniciado em 19/03/2026 com o gatilho RG-01 ("o Copom inverte a direção
do ciclo de cortes", ação: revisão obrigatória) e o monitoramento da meta Selic depois de cada reunião.
O M2 implementa esse monitoramento: um avaliador determinístico em `packages/credit-playbook` lê a série
observada pelo resolvedor interno, compara com o ciclo declarado (cortes, passo, decisões) e, quando a
direção se inverte, registra o evento de revisão obrigatória para o operador, com a versão, o manifesto,
o comunicado e a atribuição. A declaração histórica não muda: `referenceConditions` continua sendo o
retrato da data em que foi declarado; o monitor só diz se o gatilho disparou. Nenhum tenant recebe
número algum no M2.

**A entrega ao tenant e a adoção tipada (decisão 10 da ADR) passam para o M3,** com o primeiro objeto que
tem consumidor de premissa: as expectativas Focus (`expectativas-mercado`, `odc-odbl` no mesmo catálogo),
que alimentam o caminho de juros dos cenários. A SGS 4189 também fica para o M3, com período mensal,
evidência própria e transformação determinística.

Fica registrado para o fundador: o mesmo arquivo de referência cita o CDI da série 4389, que não tem
licença aberta, e carrega medianas de taxas indicativas da ANBIMA, cujos termos exigem autorização escrita
para uso em base de dados.

## Decisões de desenho

1. **Contrato fechado da série.** A revisão da fonte fixa código SGS, endpoint, parâmetros, unidade,
   escala, convenção, parser, identidade lógica e evidência de licença. O banco constrói a URL; o
   enfileiramento não recebe URL livre. Série, caminho e parâmetros são revalidados em cada
   redirecionamento e na URL final, pelo worker e de novo na confirmação. Teste decisivo: redirecionamento
   para a série 12 (CDI) ou 4389 no mesmo host é recusado. A evidência antiga `bcb-open-data` não serve.

2. **Confirmação única com versão.** A confirmação atual (só o bruto) é substituída: a nova RPC grava,
   numa transação e sob os mesmos locks, lease, gate da fonte, delegação, verificação física e limite de
   5 MiB, o recibo, a versão, as entradas, as observações, o selo e o evento de qualidade. A RPC antiga
   passa a recusar toda confirmação na mesma migração, e o worker exige a capacidade nova
   (`market-version-commit.v1`). O replay compara recibo, fingerprint, parser e política de qualidade e
   devolve as mesmas identidades. Falha estrutural do parser é falha da tentativa (`parse_failed`, sem
   versão); resposta vazia, período duplicado e observação fora da janela pedida são falhas estruturais.
   Provas: worker antigo contra banco novo, recusa da assinatura antiga, replay depois de resposta perdida.

3. **Canônico v2, bytes especificados na parte 0.** `market-canonical.v2` acrescenta à v1 a revisão da
   fonte, o contrato da série, a base de disponibilidade com o vínculo ao comunicado e a política de
   qualidade. A parte 0 especifica serialização, ordem, nulos e precisão, e publica vetores comuns que o
   SQL e o TypeScript precisam reproduzir. Selos v1 continuam verificáveis. Teste: adulterar qualquer
   campo novo, inclusive o vínculo do comunicado, com datas e valores iguais, recusa o selo.

4. **Seleção por período.** Janela inclusiva, blocos de no máximo 10 anos. Revisão da configuração da
   fonte e republicação do dado pelo fornecedor são coisas distintas: a ordem entre versões é a do
   `acquired_at` (o dado mais recente obtido da fonte), com desempate pelo id da versão; parsers diferentes
   da mesma aquisição não competem, porque uma aquisição tem uma só versão por parser vigente e o parser
   novo só entra por comando de reprocessamento que supersede a versão anterior da mesma aquisição.
   Elegibilidade temporal (data-base) e direitos são filtrados antes da escolha. Omissão de um período
   numa resposta nova não é retirada: a versão nova só cobre os períodos que traz; retirada oficial só
   existe com evidência e vira evento de revogação daquele período, sem ressuscitar o valor anterior.
   Toda leitura fixa um manifesto (período, versão) com hash. Testes: janelas sobrepostas confirmadas em
   ordem inversa, aquisições empatadas, reprocessamento por parser corrigido, período omitido.

5. **Qualidade, frescor e direito.** Qualidade: valor entre 0 e 100; mudança de valor só no primeiro dia
   útil seguinte a uma reunião (ordinária ou extraordinária) cujo comunicado está ligado; série sem buraco
   de dia corrido na janela. Frescor: o prazo de uso e a latência tolerada são política interna da Offroad
   registrada na revisão da fonte (o catálogo declara tempestividade "não se aplica"); o padrão é dois dias
   úteis depois do primeiro dia útil seguinte a cada reunião do calendário publicado; passado o prazo, o
   resolvedor devolve `market_reference_stale`. Frescor é medido pelo último período coberto, não pela
   busca. Direito: licença vigente na leitura. Aprovação manual de quarentena registra a exceção e não
   altera frescor nem direito.

6. **ODbL.** O registro da série classifica base original (conjunto do Banco Central), base derivada
   (observações normalizadas e vínculos aos comunicados), base coletiva (a camada de mercado) e obra
   produzida (o evento do RG-01). A base derivada é oferecida gratuitamente, em formato legível por
   máquina, sob ODbL, numa página pública própria com todas as alterações e conteúdos adicionais (parser,
   regras, vínculos e observações normalizadas), sem dado de tenant nem contratado. A página e sua prova de
   acesso são entregues na parte 3, antes de qualquer saída pública; o evento do RG-01 é interno e leva a
   atribuição e o link.

7. **Retenção: exceção restrita e verificada.** O expurgo de objetos confirmados não entra no M2. Só fontes
   abertas com retenção sem prazo e `retainAdoptedValues` verdadeiro podem ser enfileiradas, confirmadas e
   lidas; a recusa vale no banco em todos esses caminhos e lê os entitlements contratados. Uma nova revisão
   de fonte que passasse a exigir prazo é recusada enquanto existir conteúdo armazenado da fonte e não
   existir expurgo, em vez de deixar conteúdo vencido parado. Quarentena fica retida só enquanto o direito
   permitir. A emenda da ADR, do handoff e dos registros entra na PR da parte 3.

8. **Outbox.** Evento e linha de outbox nascem na mesma transação; cada linha é processada até ter recibo,
   sem cursor global (uma transação com sequência menor pode confirmar depois). Ordem por sujeito quando
   necessária, retries, replay. O monitor do RG-01 é o primeiro consumidor, com autoridade própria e
   estreita. Testes: confirmação invertida de duas transações, falha entre efeito e recibo.

9. **Agendador.** O cron executa uma função de plataforma sob uma delegação de agendamento (fonte, série,
   janela relativa, horário em `America/Sao_Paulo`, concedente registrado, revogação serializada). A
   cobertura é a contígua elegível (aprovada, sem quarentena) desde o início pedido; lacunas internas são
   recuperadas. A unicidade fica no banco: (delegação, série, janela, ocorrência agendada) para o disparo,
   e nova coleta legítima da mesma janela é outra ocorrência explícita. Testes: dois disparos simultâneos,
   revogação concorrente, lacuna interna.

## Sequência

| Parte | Entrega | Efeito |
|---|---|---|
| 0 | Contratos (série, disponibilidade com comunicado, seleção por período, canônico v2 com vetores) e evidência do conjunto de comunicados | Nenhum |
| 1 | Parser da 432 e do comunicado, confirmação única com versão, qualidade, recusa da RPC antiga, capacidade nova | Transporte fechado |
| 3 | Outbox, exceção de retenção em todos os caminhos, página pública ODbL, emendas de ADR e handoff | Transporte fechado |
| 6 | Monitor do RG-01 com resolvedor interno e evento de revisão | Desligado até a abertura |
| 2 | Agendador com delegação | Desligado |
| 4 | Atos de produção: publicadora, revisão das fontes, delegações, prova integrada em staging, abertura da chave por último | Abre |

Os atos da parte 4 usam identidade de fundador ou operador; o registro da publicadora é comando de
fundador. A chave só abre depois da outbox consumida, da página ODbL publicada e da prova integrada em
staging.
