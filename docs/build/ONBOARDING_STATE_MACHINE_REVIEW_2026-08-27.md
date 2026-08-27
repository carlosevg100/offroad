# Revisão estrutural do onboarding

Data: 27/08/2026  
Escopo: empresa e assessor; cadastro institucional de financiadores permanece separado.

## Diagnóstico

O onboarding não tinha uma única fonte de verdade. A mesma página combinava quatro mecanismos de
navegação:

1. `onboarding_progress.current_step`, criado para formulários antigos;
2. `document_intake_sessions.status`, que representa o intake real;
3. `answers.intake_session_id` e `guided_milestone`, usados como ponte entre as duas gerações;
4. parâmetros de URL `section`, `stage` e `setup`, interpretados por regras diferentes.

Isso permitia que telas antigas e novas coexistissem, que um botão Voltar alterasse o ciclo de vida
da sessão e que uma sessão ativa sem nome pulasse a identificação da captação. A rota de nova
captação também criava sessões anônimas por um caminho diferente do primeiro onboarding.

## Fluxo canônico

Para empresa e assessor existe uma sequência única:

| Ordem | Tela | Pré-condição persistida | Próxima transição |
|---|---|---|---|
| 0 | Boas-vindas e funcionamento | usuário autenticado, onboarding incompleto | confidencialidade |
| 1 | Confidencialidade | documento legal ativo | aceite versionado |
| 2 | Nome e política de identidade da captação | aceite vigente | sessão privada nomeada |
| 3 | Companhia | sessão ativa | perfil da companhia salvo |
| 4 | Operação | companhia conhecida | arquétipo e autorização declarados |
| 5 | Pedido | operação conhecida | objetivo e parâmetros essenciais salvos |
| 6 | Informações preliminares | pedido existente | documentos e respostas recebidos |
| 7 | Entendimento e esclarecimentos | processamento real | revisão do que foi entendido |
| 8 | Pacote de informações | caso confirmado | pacote interno governado |
| 9 | Potenciais investidores | gates de representação, material e autorização | introdução qualificada |

Os sete últimos itens aparecem no trilho visual como os sete marcos do produto: companhia,
operação, informações preliminares, entendimento, esclarecimentos, pacote e investidores.

## Regras de navegação

- A função pura `resolveBorrowerOnboardingView` é a única roteadora do primeiro onboarding.
- Parâmetros de URL pedem apenas uma visualização reversível. Eles não criam, cancelam ou avançam
  estado persistido.
- Voltar e Editar nunca cancelam uma sessão.
- Uma sessão antiga sem nome é obrigada a passar pela identificação da captação.
- Uma sessão confirmada abre a conclusão, não um formulário legado.
- O progresso deriva do marco real. Não existe piso artificial.
- O fluxo manual antigo não é acessível.
- Uma nova captação no workspace começa pelo mesmo contrato de nome, identidade e representação.

## Separação de jornadas

O cadastro de financiadores continua sendo um fluxo institucional próprio: organização, fundo,
mandato, contatos e revisão. Seus passos e disponibilidade são calculados apenas quando
`journey = capital_provider`. Nenhum passo desse cadastro participa da máquina de estados de
empresa ou assessor.

## Garantias de banco

`start_onboarding_intake` agora tem semântica create-or-configure: se já existe uma sessão privada
ativa, a edição atualiza nome, política de identidade e tipo de representação na mesma sessão. Não
cria duplicata, não cancela documentos e mantém uma única evidência de autodeclaração. Nome de
projeto é único entre sessões não canceladas da organização.

## Superfícies ativas

- `/[locale]/onboarding`: primeiro acesso, aceite, primeira captação e intake guiado.
- `/[locale]/app/new`: captações adicionais, começando pela identificação da captação e depois pelo
  intake guiado.
- `/[locale]/app/opportunities/[id]`: caso criado e acompanhamento.

Não há uma rota manual alternativa. `/app/new?mode=manual` apenas volta ao início canônico.

## Critérios de aceitação

1. Primeiro acesso sem aceite sempre mostra boas-vindas e depois confidencialidade.
2. Aceite não cria sessão sozinho.
3. Nomear a captação cria uma única sessão privada.
4. Editar nome ou identidade preserva o mesmo ID e todos os documentos.
5. Voltar da companhia abre a edição da captação sem cancelar nada.
6. Refresh retoma exatamente o marco persistido.
7. URL forjada não pula pré-condição.
8. Nova captação exige nome antes de criar sessão.
9. Financiador nunca vê o intake de empresa.
10. PT-BR e EN-US têm a mesma topologia e significado.

## Evidência desta revisão

- O resolvedor possui testes unitários para primeiro acesso, confidencialidade, sessão antiga,
  edição reversível, retomada, conclusão e separação de financiadores.
- A migration foi aplicada primeiro no Supabase staging.
- Um teste SQL transacional comprovou que editar o projeto mantém o mesmo ID, status `collecting`
  e uma única evidência de representação.
- O Security Advisor do staging retornou zero findings após a migration.
- A especificação E2E cobre edição do projeto sem reinício da sessão e será executada pelo CI
  obrigatório com o banco local reconstruído.

O deploy de produção só pode ser declarado após CI obrigatório, migration promovida e verificação
autenticada do fluxo completo no domínio de produção.
