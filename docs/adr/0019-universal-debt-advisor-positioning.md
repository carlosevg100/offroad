# ADR 0019: Offroad como advisor AI-native especialista em dívida

Status: accepted
Data: 2026-09-02

## Contexto

A evolução do produto ampliou o ponto de entrada: a Offroad pode começar com uma companhia, uma
reunião, uma dúvida, documentos, uma necessidade de capital ou uma operação existente. A descrição
histórica como plataforma de originação de crédito privado e acesso ao mercado passou a confundir
uma capacidade downstream com a identidade inteira do produto. Como `AGENTS.md`, metadados, site,
handoffs e a ADR 0004 ainda repetiam esse texto, agentes voltavam à tese antiga apesar da
Constituição 2.2.

## Decisão

- Categoria canônica em português: **advisor AI-native especialista em dívida**.
- Descrição canônica: **A Offroad ajuda companhias e profissionais do mercado a pensar,
  investigar, analisar, decidir, estruturar e executar trabalhos relacionados a dívida.**
- Categoria canônica em inglês: **AI-native debt advisor**.
- Descrição canônica em inglês: **Offroad helps companies and market professionals think,
  investigate, analyze, decide, structure, and execute debt-related work.**
- Originação, análise de crédito, estruturação, materiais, lender matching e introdução qualificada
  são capacidades componíveis. Nenhuma delas substitui a identidade canônica.
- “Originação” continua correta quando nomeia um job concreto, como preparar uma tese de
  originação. É incorreta como descrição geral da Offroad.
- “Executar” significa executar o trabalho sob controle da Offroad. Underwriting, decisão de
  crédito, diligência do financiador, documentação definitiva, desembolso e closing permanecem
  com as partes responsáveis.

## Precedência

Para identidade e posicionamento, a ordem é: Constituição vigente → esta ADR → `brand.ts` →
mensagens públicas. Handoffs arquivados são evidência histórica, não orientação atual. A ADR 0004
fica superada.

## Consequências

Descrições canônicas, metadados e prompts de orientação devem convergir para uma única categoria.
Um teste de contrato bloqueia o retorno das frases históricas nos pontos críticos. Novas mudanças
de identidade exigem atualização conjunta da Constituição, desta decisão ou de sua sucessora, das
projeções públicas e do teste.
