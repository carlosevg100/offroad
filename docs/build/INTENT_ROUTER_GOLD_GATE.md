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

As vinte composições aparecem no conjunto. Cada turno possui assinatura semântica explícita:
ação canônica, tipos de objeto, referências materiais, sinais do resultado desejado, presença e
categoria da decisão e categoria de audiência. O score confere esses significados, além de
composição, abstenção, profundidade, continuidade, trabalhos, responsabilidades e pergunta.
JSON válido ou campo meramente preenchido não é acerto.

## Manifesto imutável e estabilidade

O manifesto exige exatamente:

- 40 observações `repeat=1`, uma por turno;
- `repeat=2` e `repeat=3` somente para seis IDs de estabilidade;
- 52 observações no total.

As duas repetições adicionais são paráfrases escritas manualmente, não replay do mesmo prompt. O
gate compara o SHA-256 dos três textos e rejeita observação ausente, extra, duplicada, associada à
suíte errada ou com bytes reaproveitados. Nos seis trios, o fingerprint semântico completo deve ser
idêntico e todos os checks precisam passar.

## Regra de promoção

Não há tolerância estatística neste corpus pequeno. Manifesto, quatro suítes, todos os checks de
todos os 40 turnos e os seis trios de estabilidade exigem 100%. Um resultado verde é necessário,
mas não suficiente para expor o roteador: ainda não autoriza executor, pesquisa, conclusão ao
cliente ou ação externa.

## Execução e segurança

O workflow manual usa somente prompts sintéticos, o prompt e schema exatos do runtime e credenciais
AWS OIDC de curta duração. As chaves são mascaradas, o gateway impõe teto de chamadas e custo e o
artefato é compacto. A quantidade de repetições não é configurável: o runner falha se o manifesto
não tiver exatamente 52 observações.

Cada divergência real deve resultar em uma decisão explícita: corrigir um gabarito comprovadamente
errado, melhorar o contrato subespecificado, separar composições que colidem ou manter a família
fora de produção. Nunca se reduz o gate apenas para transformar uma corrida vermelha em verde.
