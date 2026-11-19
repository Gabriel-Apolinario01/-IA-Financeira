# Entrega de 21 de novembro de 2026

## Integração local

A branch `integracao/entrega-2026-11-21` reúne a base de autenticação e Groq em `bc5d582` e os incrementos financeiros em `8260bf4`. O arquivo `IA-Financeira-antes-entrega-final.bundle`, ao lado do repositório, passou em `git bundle verify`. Antes dos testes, os itens ignorados presentes no checkout eram dependências, cache de build e arquivos gerados pelo TypeScript. Não havia cluster PostgreSQL de desenvolvimento nesse checkout. O bundle cobre o histórico Git. Os exemplos financeiros já existentes no navegador permanecem no armazenamento local daquele navegador.

Os cinco conflitos envolveram login, limites de requisição, CI, manifesto npm e lockfile. A página mantém o cadastro Better Auth, a opção Microsoft quando habilitada e os links de demonstração. O repositório mantém os limites de autenticação, diagnóstico, uso de IA e classificação da importação. O lockfile da versão com Better Auth fixa as dependências de autenticação e PostgreSQL. No CI, auditoria, lint, typecheck, testes unitários, integração e build precedem o job de publicação. Publicar exige disparo manual na main com a opção correspondente.

### Validações da integração

| Verificação | Resultado local |
| --- | --- |
| Instalação pelo lockfile | `npm ci` instalou 608 pacotes |
| Lint e TypeScript | Ambos aprovados |
| Testes unitários | 154 aprovados, zero ignorados |
| Auditoria de runtime | Zero vulnerabilidades reportadas |
| Build de produção | Aprovado. A primeira execução encontrou EPERM ao criar uma pasta gerada em .next. A repetição autorizada completou pré-renderização e coleta de traces. |

O teste de integração usa um cluster PostgreSQL local descartável e duas contas fictícias. Seu resultado e os cenários de documentos e chat serão registrados após verificação.
