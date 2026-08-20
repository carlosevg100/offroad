# ADR 0005: Paleta institucional grafite/azul (amenda o ADR 0002)

Status: accepted
Data: 2026-08-18 (registra decisão tomada em 2026-08-15)

## Contexto

O ADR 0002 fixou a base preto/grafite/branco/cinzas com o verde-lima do logo
reservado a acentos e estados. Durante o reposicionamento visual do site
(15/08/2026, registrado em `ACCEPTANCE_EVIDENCE.md`) a direção migrou para uma
paleta grafite com azul institucional ("paleta grafite-azulada, sem verde de
interface"), mais próxima do público de CFOs, fundos e gestores. O ADR 0002 não
foi amendado.

## Decisão

- Fundações: carvão, grafite, azul-marinho escuro, off-white e cinzas frios.
- O verde do logo fica restrito à marca (logo/símbolo) e, com parcimônia, a
  estados de "ativo/validado/alinhado"; não é cor de interface.
- Inter como tipografia dominante; Newsreader disponível para tratamento
  editorial. Motion explica transformação, não decora.
- Referências (Forward, Tier 1) valem apenas como padrão de qualidade e clareza;
  layout, ativos e texto são originais.

## Consequências

`apps/web/src/app/offroad-premium.css` é a camada visual vigente sobre
`globals.css`. Ajustes de paleta ou tipografia passam a exigir novo ADR ou
amenda registrada, para que o design não derive silenciosamente.
