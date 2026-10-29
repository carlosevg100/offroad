# Correções de dependências

Estado: candidato. Auditoria local do lockfile atualizado sem vulnerabilidades conhecidas; integração e produção ainda pendentes.

O GitHub sinalizou 15 alertas abertos na base: 1 alto, 11 moderados e 3 baixos. O alto é GHSA-587h-7wmj-h5pm, bypass da checagem de arquivo de `launch-editor` em Windows, alcançável pela ferramenta de desenvolvimento. A aplicação publicada usa Next/Turbopack, e este achado não demonstra invasão ou exploração em produção. As versões corrigidas são aplicadas mesmo assim. Os demais alertas nomeiam Vite, mocker, fast-uri e brace-expansion.

| Dependência | Antes | Candidato |
| --- | --- | --- |
| Vite | 8.2.1 | 8.2.4 |
| Vitest e mocker | 4.1.11 | 4.1.12 |
| fast-uri | 3.1.7 | 3.1.9 |
| brace-expansion 1 | 1.1.20 | 1.1.21 |
| brace-expansion 5 | 5.0.11 | 5.0.12 |

Instalação executada sem scripts de terceiros. O lockfile continua pinado por integridade. `pnpm audit --json` retornou zero nas cinco categorias; resumo em `evidence/dependency-patches-2026-10-29.json`. Não foram encontradas essas bibliotecas entre os arquivos de fornecedor registrados nas cápsulas de métodos inspecionadas em `packages/credit-playbook/knowledge/releases/*.sources.json`; os snapshots publicados não são reescritos.

Gates: instalação congelada, `pnpm check`, verificação dos métodos imutáveis e CI pendentes. Os alertas da main só se encerram depois da integração e do novo processamento do GitHub.

Segurança: SDLC-04, SDLC-07, SDLC-10 e SDLC-11. Sem novo provedor, privilégio, esquema ou processamento de dados privados; sem atualização major. A mudança afeta o resolvedor de URI e expansão de padrões usados pelas dependências e as ferramentas de teste. A regressão completa e a compilação são exigidas antes de enviar. Reverter reinstala versões com vulnerabilidades conhecidas; diante de regressão, preferir correção adiante e registrar qualquer contenção e prazo.

Referências primárias: [alerta do projeto](https://github.com/carlosevg100/offroad/security/dependabot/50), [aviso do fornecedor](https://github.com/vitejs/launch-editor/security/advisories/GHSA-587h-7wmj-h5pm). Nenhum alerta foi dispensado ou fechado manualmente.
