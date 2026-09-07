# Gate gold do roteador semântico

Estado em 07/09/2026: **candidate, ainda não executado com modelo real**. O gate anterior
([run 34096964058](https://github.com/carlosevg100/offroad/actions/runs/34096964058)) permanece
como histórico de desenvolvimento, mas foi invalidado como evidência de promoção: cobria só 17
turnos, repetia os mesmos bytes nos testes de estabilidade e não verificava o significado dos
objetos, resultados, decisões ou audiências.

O contrato novo não governa produção, não homologa executores e não comprova qualidade analítica.
Ele só poderá ser chamado de `tested` quando uma corrida posterior a esta mudança passar sem
exceção pelo manifesto e por todos os checks descritos abaixo.

## O que o gate novo prova

O catálogo mantém vinte composições, mas cada composição possui uma única política canônica. A
mesma tabela tipada alimenta schema, canonicalizador, carimbo de runtime e fingerprint; ela fixa:

- ação canônica;
- trabalhos primários e sua ordem;
- profundidade;
- responsabilidades do trabalho;
- efeito externo.

Quando a ordem depende do contexto, a condição também pertence à policy. Para estrutura indicativa,
documentos efetivamente presentes no control plane ativam `extract_and_reconcile` antes de
`capital_strategy` e `analyze`; sem documentos, a sequência base continua estratégia e análise. O
schema rejeita a variante documental quando não há documentos governados. O texto enviado ao
classificador é renderizado dessa policy, em vez de manter uma segunda lista manual de regras.

O envelope persistido rejeita qualquer divergência nesses campos. Cargo continua sendo contexto,
nunca autoridade. Regime de evidência, grants, permissões e acesso são carimbados apenas pelo
control plane; acesso ausente vira `unresolved`, não público. Pedidos horizontais sobre instrumento,
documento ou mercado não precisam inventar uma companhia.

## Corpus e resposta esperada

São exatamente 40 turnos sintéticos distribuídos em quatro suítes:

- jornadas longitudinais;
- trabalho horizontal sem companhia;
- fronteiras de confusão entre composições próximas;
- pedidos adversariais, negações e tentativas de inferir cargo, objetivo, evidência ou autoridade.

As vinte composições aparecem no conjunto. Cada turno possui uma assinatura semântica estruturada:
uma ação canônica, um tipo canônico de decisão, um tipo canônico de audiência e instâncias de
objetos identificadas por `id` e `ordinal`. Cada instância declara exatamente os slots materiais que
precisa preservar: entidade, assunto, montante, moeda, percentual, basis points, ratio, indexador,
prazo em meses, número de páginas, contagem e cadência.
O classificador não pode usar prosa livre de resultado, decisão ou audiência como campo de
roteamento; esses textos são renderizados deterministicamente depois, para a interface.

O relatório separa três camadas: métricas da resposta bruta do modelo, cobertura do extrator e
métricas da saída final depois de compilação e policy. A promoção usa a saída final recomposta e
expõe quantas observações foram alteradas pela policy; não chama correção determinística de acerto
do modelo bruto. A correspondência entre gold
e resposta é bijetiva: quantidade de objetos, identidade, ordem, tipo, conjunto de slots,
cardinalidade e valores permitidos precisam coincidir. Um segundo objeto, um slot extra, slots de um
mesmo cenário repartidos entre objetos ou valores conflitantes reprovam. Assim, `CDI 12% e CDI 15%`,
uma operação adicional de BRL 500 milhões ou CDI num objeto e prazo em outro não satisfazem o gold.
Negação ou ambiguidade deve ser refletida nos enums canônicos ou em abstenção; não existe mais uma
frase narrativa que o gate tente interpretar por regex.

Um teste de integração passa uma resposta bruta estruturada pelos 52 textos autorais e pelo
canonicalizador de produção. Ele exerce precedência, mudança de continuidade, abstenção e os
limites de cardinalidade. Esse teste local prova o contrato determinístico; não substitui a corrida
futura com o provedor real.

As expectativas do gold são um oracle de aceitação escrito no pacote de evals. Elas não importam
nem derivam a policy de produção; desse modo, uma alteração equivocada na policy faz a integração
falhar em vez de atualizar automaticamente a resposta considerada correta.

## Manifesto imutável e estabilidade

O manifesto exige exatamente:

- 40 observações `repeat=1`, uma por turno;
- `repeat=2` e `repeat=3` somente para seis IDs de estabilidade;
- 52 observações no total.

As duas repetições adicionais são paráfrases escritas manualmente, não replay do mesmo prompt. O
gate compara o SHA-256 dos três textos e rejeita observação ausente, extra, duplicada, associada à
suíte errada ou com bytes reaproveitados. Nos seis trios, o fingerprint semântico completo deve ser
idêntico e todos os checks precisam passar. O fingerprint preserva entidades, números, indexadores
e sua associação ao tipo de objeto, de modo que `CDI` e `CDI + 15%` não sejam equivalentes.

O resumo não confia nos checks, compilações, saídas finais ou hashes gravados pelo runner. Ele
reconstrói os inputs canônicos e a cadeia inteira `raw route + raw extractor -> compile -> apply ->
canonicalize`; só então recalcula checks e fingerprints. A estabilidade inclui todo
`inferableContext` que pode alterar execução. Resposta bruta ausente, erro do provedor, input,
compilação, saída final, expected, check ou fingerprint forjado reprova nominalmente o gate.

Cobertura semântica e abstenção são eixos separados. Um pedido que deve abster não recebe crédito
porque o extrator falhou, e uma extração completa não invalida uma abstenção correta. O relatório
mostra complete/incomplete/rejected separadamente para pedidos roteados e abstidos.

## Regra de promoção

Não há tolerância estatística neste corpus pequeno. Manifesto, quatro suítes, todos os checks de
todos os 40 turnos e os seis trios de estabilidade exigem 100%. Um resultado verde é necessário,
mas não suficiente para expor o roteador: ainda não autoriza executor, pesquisa, conclusão ao
cliente ou ação externa.

## Execução e segurança

O workflow manual usa somente prompts sintéticos e pode executar chamadas pagas apenas no commit
de `main`, no repositório canônico, pelo arquivo de workflow canônico e pelo GitHub Environment
`intent-router-gold-main`. O runner repete esses checks antes de ler credenciais. Cada chamada deve
se ligar bijetivamente a task, schema, prompt, input, provider, model, tentativa, output e custo;
chamada órfã, duplicada ou de cassette reprova. O artefato inclui provenance do run e fingerprint
de todo o record, mas ainda não possui attestation criptográfica externa.

Configuração externa obrigatória antes da próxima corrida: restringir o GitHub Environment à branch
`main` e a trust policy do IAM ao subject
`repo:carlosevg100/offroad:environment:intent-router-gold-main`. O repositório não consegue provar
sozinho essas duas políticas. Sem proxy efêmero, as chaves dos provedores ainda existem em memória
no runner confiável durante a chamada; portanto nenhum gate em branch candidata é permitido.

O gateway impõe teto de tentativas e custo. O manifesto distingue 52 observações, 104 operações de
modelo esperadas e preflights; tentativas de reparo/fallback são contadas à parte. A quantidade de
repetições não é configurável.

Cada divergência real deve resultar em uma decisão explícita: corrigir um gabarito comprovadamente
errado, melhorar o contrato subespecificado, separar composições que colidem ou manter a família
fora de produção. Nunca se reduz o gate apenas para transformar uma corrida vermelha em verde.
