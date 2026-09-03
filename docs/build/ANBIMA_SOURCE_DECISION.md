# Decisão de fonte: ANBIMA Data e ANBIMA Feed

Data: 2026-09-02
Status: decisão vigente para o lançamento Brasil

## Decisão

O **ANBIMA Feed não será contratado nem ativado agora**. A APP criada no portal de desenvolvedores
será mantida somente para conhecer o contrato técnico e testar o Sandbox. O Sandbox devolve dados
fixos e fictícios; credenciais de APP não concedem acesso aos dados oficiais de produção.

O **ANBIMA Data público faz sentido como fonte complementar oficial**, inicialmente em modo manual.
Antes de automatizar aquisição ou retenção, a Offroad precisa confirmar os termos aplicáveis ao
endpoint ou página exatos. Firecrawl não altera a licença da fonte e não deve ser usado como atalho
para transformar uma página pública em feed próprio.

## Onde agrega valor

- mapear ofertas e emissões brasileiras de debêntures, notas comerciais, CRI e CRA;
- recuperar termos públicos de operações comparáveis, quando disponíveis;
- observar taxas e preços indicativos recentes de títulos privados;
- contextualizar curvas, índices e condições do mercado de dívida local;
- conferir dados encontrados por busca antes de usá-los como evidência de mercado.

## Onde não resolve o problema

- não reconstrói sozinho o debt book, garantias, covenants ou custo efetivo de uma companhia;
- não cobre de forma completa crédito bancário bilateral, private credit confidencial ou termos de
  operações não públicas;
- não informa mandato, apetite atual, capacidade ou relacionamento de um financiador;
- não substitui CVM, B3, RI, escritura, prospecto ou documentos contratuais;
- a camada pública não equivale ao histórico amplo e estruturado do Feed. A própria ANBIMA informa
  que parte da consulta gratuita de preços mantém somente os cinco dias úteis mais recentes.

## Roteamento no produto

1. CVM, B3, RI e documentos da emissão continuam como fontes primárias do emissor e do instrumento.
2. ANBIMA Data complementa comparáveis, mercado primário e referência secundária recente.
3. Perplexity descobre URLs; não vira fonte dos fatos.
4. Download direto adquire a página ou arquivo descoberto.
5. Firecrawl só entra se a aquisição direta não produzir conteúdo utilizável e se o uso for
   permitido; continua sendo ferramenta de aquisição, nunca autoridade.
6. Nenhum número ANBIMA é promovido sem ativo, data de referência, metodologia, URL e distinção
   entre observado, indicativo e calculado.

## Condições para reconsiderar o Feed

Reavaliar somente quando o uso real provar necessidade recorrente de histórico longo, atualização
estruturada e volume de consultas que o acesso público não atende. A decisão exige preço final,
campos contratados, cobertura por instrumento, direitos de armazenamento/redistribuição e ganho
mensurável contra o custo.

## Segurança das credenciais

Client ID e Client Secret são segredos de máquina. Como a credencial apareceu em uma captura de
tela, o Client Secret deve ser rotacionado antes de qualquer uso. Ele não deve ser copiado para o
repositório ou para conversas. Se o Feed for contratado no futuro, os dois valores irão para o cofre
do ambiente e o runtime obterá tokens OAuth temporários.

## Fontes oficiais consultadas

- [Como acessar nossas APIs](https://developers.anbima.com.br/pt/documentacao/visao-geral/como-acessar-nossas-apis/)
- [Autenticação](https://developers.anbima.com.br/pt/documentacao/visao-geral/autenticacao/)
- [Swagger de Preços e Índices](https://developers.anbima.com.br/pt/documentacao/precos-indices/swagger-precos-e-indices/)
- [ANBIMA Data e dados de ofertas](https://www.anbima.com.br/pt_br/noticias/anbima-data-agora-conta-com-dados-detalhados-de-ofertas-de-notas-comerciais.htm)
- [Consulta gratuita de taxas e preços recentes](https://www.anbima.com.br/pt_br/noticias/mercado-de-credito-mais-transparente-passamos-a-divulgar-taxas-e-precos-de-debentures-cris-e-cras-prefixados.htm)
