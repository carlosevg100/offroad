# Access Needed

Este registro não contém secrets.

| Provider | Recurso | Papel mínimo | Motivo | Ambiente | Responsável | Status |
|---|---|---|---|---|---|---|
| GitHub | `carlosevg100/offroad` | repo + workflow | branches, PRs e Actions | all | carlosevg100 | CLI autenticada; `main` inicializada; PR da fundação em preparação |
| Vercel | `carlosevg100-9887s-projects/offroad` | project member/owner atual | preview e frontend | production/preview | carlosevg100 | projeto criado; produção publicada; domínio anexado; Git integration ativa |
| Supabase | `Mr. Pickles/offroad-development` (`ifnogpksgdadruooqydi`) | project admin limitado | Postgres, Auth, Storage e RLS | development | carlosevg100 | concluído em `sa-east-1`; custo informado de US$ 10/mês autorizado |
| Resend | conta/domínio transacional Offroad | API key restrita a envio + domínio verificado | entrega de OTP de cadastro e recuperação via SMTP | production/preview | carlosevg100 | login ou API key ainda necessário; SMTP customizado não ativado |
| GoDaddy | `offroad.capital` DNS | DNS editor | configurar targets dedicados exibidos pela Vercel | production | carlosevg100 | DNS concluído e TLS canônico validado |
| Railway | projeto Offroad | project member | runtime stateless futuro | staging | usuário | CLI sem login; não necessário no gate atual |
| Sentry | organização/projeto a selecionar | project admin limitado | release, errors e traces redigidos | production/preview | carlosevg100 | adapter implementado; projeto/DSN ainda não criados |
| PostHog | projeto a selecionar | project admin limitado | analytics allowlisted sem replay/autocapture | production/preview | carlosevg100 | adapter implementado; projeto/token ainda não criados |

## Protocolo

- Nunca colar token, key, password, OTP ou DSN no chat, issue ou commit.
- Usar login oficial, plugin conectado ou secret store do provider.
- Solicitar acesso somente quando a próxima task chegar ao gate correspondente.
- Publicáveis (`NEXT_PUBLIC_*`) não são tratados como credenciais, mas continuam
  fora do Git para evitar divergência entre ambientes.
