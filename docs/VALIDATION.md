# Registro de validação — 17/11/2026

**Evidência histórica da versão indicada abaixo.** Os resultados da candidata à entrega estão no [resumo consolidado](ENTREGA-2026-11-21.md).

Base de trabalho: commit `c1fe0ed91e9b7a57c699e0b51283a5b1d08dfc4e` do repositório oficial. As alterações de autenticação, persistência e segurança estão na branch `codex/complete-auth-ai`.

## Executado nesta revisão

- `npm test`: 62 testes aprovados, sem falhas ou testes ignorados. Inclui regras financeiras, importação, concorrência, isolamento e casos adversariais da integração de IA.
- `npm run test:integration`: um cenário integrado aprovado, com PostgreSQL 18.6 temporário, cadastro de duas contas, hash de senha, sessão inválida rejeitada, isolamento, bloqueio de origem externa, idempotência, migrações repetidas preservando dados, login com senha incorreta, novo login, exclusão isolada e revogação no logout.
- `npm run lint`: aprovado.
- `npm run build`: aprovado com Next.js 16.4.6, incluindo verificação TypeScript e as rotas de conta, autenticação, diagnóstico, saúde e logout.
- `npm audit --omit=dev --audit-level=high`: nenhum alerta conhecido em dependências de produção no momento da consulta. A verificação inicial havia identificado sete dependências afetadas; foram atualizadas antes deste resultado.
- Navegador, servidor local em modo de produção: cadastro sintético, gravação de uma despesa de R$ 12,34, logout e novo login; o valor persistiu. A conta e o lançamento são exclusivamente de teste.
- `GET /api/health` local: HTTP 200, `database:true`, `authentication:true`, `aiConfigured:false`.

## Falhas encontradas e resolvidas durante a execução

O primeiro teste de integração falhou no encerramento porque o Windows/OneDrive bloqueou a remoção imediata da pasta temporária. O teste passou após preservar a pasta ignorada e encerrar o PostgreSQL sem removê-la imediatamente. Um build também encontrou EPERM ao criar pasta gerada pelo Next.js; a execução posterior com permissões apropriadas concluiu o build. Esses resultados não foram ocultados ou contabilizados como aprovação inicial.

## Ainda não comprovado

- Chamada real à OpenAI: chave e modelo não estavam configurados. Os testes adversariais usam provedor simulado e não substituem `npm run verify:ai`.
- PostgreSQL e autenticação no Azure: os recursos/variáveis ainda dependiam de provisionamento. Validação local não comprova disponibilidade online.
- Recuperação de senha por e-mail, verificação de e-mail, MFA, backups, restauração e teste externo de invasão não foram implementados ou executados nesta revisão.
- Execução CI e publicação devem ser verificadas na versão enviada ao GitHub; este registro descreve as verificações locais acima.

As evidências não constituem certificação de segurança nem comprovam que todos os riscos OWASP foram eliminados.
