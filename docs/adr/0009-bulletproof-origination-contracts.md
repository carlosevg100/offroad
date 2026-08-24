# ADR 0009: Contratos canônicos de originação, resultado operacional, lineage e gold cases

Status: accepted, fundador em 24/08/2026

Data: 2026-08-24

Plano de referência: `docs/build/BULLETPROOF_EXECUTION_PLAN.md`

## Contexto

Os componentes de extração, conciliação, análise, materiais e matching já existem, mas usam
vocabulários parcialmente sobrepostos e são avaliados em trilhos separados. Em particular, uma
necessidade de capital, um instrumento, uma estrutura, um veículo e um provedor de capital podem
aparecer como se fossem a mesma dimensão. O harness mede extração sobre documentos e executa a
mesa sobre fatos do gabarito, mas ainda não prova uma travessia única das oito camadas.

O parecer de crédito também não é suficiente para representar o estado operacional do case. Uma
operação pode ser economicamente viável e ainda não estar pronta para materiais, matching ou
direcionamento externo.

## Decisão

1. `packages/credit-ontology` passa a publicar uma taxonomia ortogonal v2 com dimensões
   independentes para necessidade de capital, fonte de pagamento, lastro, obrigação da empresa,
   valor mobiliário distribuído, mecanismo da estrutura, veículo de capital, tipo de provedor,
   rota de distribuição e garantias ou reforços.
2. FIDC é modelado internamente como veículo de capital. Uma operação de recebíveis pode ter
   cessão como obrigação ou transferência, cotas como valor distribuído e uma gestora de FIDC como
   participante. Interfaces antigas continuam válidas durante uma migração explícita.
3. `packages/case-understanding` passa a publicar seis estados operacionais: informação
   insuficiente, pendências materiais, estrutura em análise, viável com condições, pronta para
   direcionamento qualificado e não recomendada.
4. Somente o estado `ready_for_qualified_direction`, com auditoria de materiais, screening de
   mandato e aprovação externa concluídos, permite direcionamento. O parecer econômico nunca
   concede essa permissão sozinho.
5. Todo artefato material passa a poder carregar um manifesto unificado com hashes das fontes,
   versões de todos os motores, política e prompts dos modelos, data da referência de mercado e
   hashes das saídas.
6. O contrato de gold case passa a cobrir oito camadas: documentos e perfis, extração,
   conciliação, cálculos, estruturas, claims e materiais, matching e resultado operacional.
7. Casos existentes continuam válidos com as novas camadas vazias. A cobertura aumenta caso a
   caso, sem reescrever os gabaritos de extração já medidos.
8. O RAG não é parte desta fundação. Retrieval entra depois que o playbook, a evidência, o
   isolamento e os evals estiverem governados.

## Consequências

- A taxonomia antiga não é removida nesta decisão. Cada consumidor migra por uma função de
  compatibilidade testada.
- Uma alteração de playbook, mercado, modelo ou template muda o manifesto, mesmo quando os
  documentos não mudam.
- Um caso pode ter parecer positivo e continuar bloqueado operacionalmente.
- A fábrica paramétrica poderá derivar gabaritos sobre contratos estáveis, sem inventar uma nova
  taxonomia por vertical.
- Publicação externa continuará exigindo aprovação humana até que a política de autoaceite e o
  verificador semântico estejam medidos em cases reais.

