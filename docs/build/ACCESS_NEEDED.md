# Access Needed

Este registro não contém secrets.

| Provider | Recurso | Papel mínimo | Motivo | Ambiente | Responsável | Status |
|---|---|---|---|---|---|---|
| GitHub | `carlosevg100/offroad` | repo + workflow | branches, PRs e Actions | all | carlosevg100 | CLI autenticada; `main` protegida (PR + `check`/`database`/`e2e`/Vercel obrigatórios); 49 PRs até 18/08/2026 |
| Vercel | `carlosevg100-9887s-projects/offroad` | project member/owner atual | preview e frontend | production/preview | carlosevg100 | projeto criado; produção publicada; domínio anexado; Git integration ativa |
| Supabase | `Mr. Pickles/offroad-development` (`ifnogpksgdadruooqydi`) | project admin limitado (MCP) | Postgres, Auth, Storage e RLS | **produção** (único projeto) | carlosevg100 | 14 migrations aplicadas via MCP; nomes de arquivo alinhados às versões registradas; CLI local instalada mas não vinculada |
| Resend | `offroad.capital` / SMTP transacional | API key restrita a envio + domínio verificado | entrega de OTP de cadastro e recuperação via SMTP | production/preview | carlosevg100 | domínio verificado em `sa-east-1`; DKIM, SPF e MX aprovados; SMTP customizado ativo no Supabase |
| GoDaddy | `offroad.capital` DNS | DNS editor | configurar targets dedicados exibidos pela Vercel | production | carlosevg100 | DNS concluído e TLS canônico validado |
| Railway | projeto Offroad | project member | runtime stateless futuro | staging | usuário | CLI sem login; não necessário no gate atual |
| Sentry | organização/projeto a selecionar | project admin limitado | release, errors e traces redigidos | production/preview | carlosevg100 | adapter implementado; projeto/DSN ainda não criados |
| PostHog | projeto a selecionar | project admin limitado | analytics allowlisted sem replay/autocapture | production/preview | carlosevg100 | adapter implementado; projeto/token ainda não criados |

## Protocolo

- Nunca persistir token, key, password, OTP ou DSN em issue, documentação ou commit; credenciais devem ser rotacionadas quando expostas fora do secret store.
- Usar login oficial, plugin conectado ou secret store do provider.
- Solicitar acesso somente quando a próxima task chegar ao gate correspondente.
- Publicáveis (`NEXT_PUBLIC_*`) não são tratados como credenciais, mas continuam
  fora do Git para evitar divergência entre ambientes.
