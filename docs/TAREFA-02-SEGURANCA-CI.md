# Tarefa 02 — Segurança, qualidade e integração contínua

Implementação e validação local em 16/11/2026. Branch: `fix/seguranca-dependencias-ci`.

## Resultado

O ponto de partida foi confirmado: `main` limpa no commit auditado `c1fe0ed91e9b7a57c699e0b51283a5b1d08dfc4e`. A branch foi criada a partir dele. O ZIP e o bundle Git da auditoria anterior foram preservados; o SHA-256 do ZIP foi reconferido antes das alterações.

Foram corrigidos os quatro erros de lint e todos os alertas críticos/altos apontados pelo npm audit. Os 56 testes existentes continuam passando; três testes de regressão do contrato de conectores foram adicionados por causa da atualização do Zod. Nenhuma lógica financeira, schema de banco, credencial, configuração Azure ou dado de produção foi alterado.

## Arquivos da alteração

| Arquivo | Alteração |
|---|---|
| `package.json` | Next.js, configuração ESLint do Next, Azure Identity e Zod corrigidos |
| `package-lock.json` | Resolução consistente das dependências diretas e transitivas afetadas |
| `components/login-page.tsx` | Três âncoras internas substituídas por `next/link` |
| `lib/webmcp.ts` | Referência do estado sincronizada em efeito após commit do React |
| `.github/workflows/main_iafinanceira.yml` | CI em pull requests/main, instalação pelo lockfile, checks separados e deploy manual explícito |
| `tests/connector-errors.test.ts` | Três testes do contrato público de validação/serialização dos conectores |
| `docs/TAREFA-02-SEGURANCA-CI.md` | Registro da decisão, validação e limites desta entrega |

## Dependências

| Dependência | Antes | Depois | Motivo |
|---|---|---|---|
| `next` | 16.3.4 | **16.4.6** | Corrigir avisos críticos e demais alertas do framework, permanecendo na major 16 |
| `eslint-config-next` | 16.3.4 | **16.4.6** | Manter alinhamento com o Next.js |
| `@azure/identity` | 4.14.0 | **4.14.1** | Patch oficial que atualiza a cadeia MSAL |
| `@azure/msal-node` (transitiva) | 6.0.1 | **7.2.2** | Dependência corrigida selecionada pelo próprio Azure Identity 4.14.1 |
| `sharp` (opcional/transitiva) | 0.35.4 | **0.35.5** | Correção da cadeia de processamento de imagens |
| `zod` | 3.25.76 | **4.6.7** | O aviso consultado não possui correção na major 3; o código já importava `zod/v4` |
| `@babel/core` (transitiva) | 7.29.0 | **7.29.13** | Correção de alerta baixo |
| `typescript-eslint` e seus pacotes | 8.59.3 | **8.72.2** | Atualização compatível da cadeia de lint |
| `brace-expansion` | 1.1.14 / 5.0.6 | **1.1.22 / 5.0.13** | Correções de consumo de CPU/memória/recursão |
| `browserslist` | 4.28.2 | **4.29.5** | Correção dos alertas altos da ferramenta |
| `js-yaml` | 4.1.1 | **4.3.2** | Correções de consumo de recursos |
| `source-map-js` | 1.2.1 | **1.2.2** | Correção de negação de serviço |
| `esbuild` | 0.28.0 | **0.28.2** | Correção do alerta baixo em desenvolvimento Windows |
| `baseline-browser-mapping` | 2.10.30 | **2.11.37** | Correção do alerta moderado |

React, React DOM, decimal.js, pg, TypeScript, Tailwind, ESLint e tsx mantiveram suas versões diretas. Não foi feita atualização indiscriminada para as majors mais recentes. O lockfile também registra subdependências e binários opcionais por plataforma.

A versão candidata 16.4.6 existe no registro npm, aceita o React 19.2.6 e declara Node >=20.9.0. O projeto mantém seu requisito mais estrito Node >=22.13.0; Azure Identity 4.14.1 exige Node >=22. Os guias do Next.js distribuídos com a versão instalada foram consultados. A candidata passou em TypeScript, testes, lint, build e regressão visual desta aplicação.

As correções transitivas foram feitas com `npm audit fix --ignore-scripts`, **sem `--force`**. A instalação final foi refeita com `npm ci --offline --no-audit --no-fund`, usando o cache já baixado, com os scripts normais de instalação habilitados. Isso verificou a consistência do lockfile. As consultas de segurança foram executadas separadamente.

## Boletins e aplicabilidade

| Aviso | Avaliação e tratamento |
|---|---|
| [Next ImageResponse — GHSA-vcvr-r3jv-pc5j](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j) | A versão anterior estava na faixa afetada. Não foi identificado uso direto de `next/og` com dados externos, mas o framework foi atualizado |
| [Next Image Optimization/SVG — GHSA-2464-fhr4-w9xw](https://github.com/advisories/GHSA-2464-fhr4-w9xw) | Relevante para implantação Linux; Next e sharp atualizados. Não foi realizada exploração nem teste de renderização maliciosa |
| [Next use cache — GHSA-673q-mjm6-r5xr](https://github.com/advisories/GHSA-673q-mjm6-r5xr) | Não há função `use cache` no aplicativo auditado; a dependência foi corrigida mesmo assim |
| [MSAL Node — GHSA-xcx6-jx8p-x3h5](https://github.com/advisories/GHSA-xcx6-jx8p-x3h5) | O aplicativo usa DefaultAzureCredential para PostgreSQL e Easy Auth para login, não implementa diretamente o auth_code afetado. Azure Identity e MSAL atualizados sem alterar o fluxo de autenticação |
| [Zod — GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) | O projeto valida conteúdo de conectores com arrays/JSON. Atualização para a versão corrigida; testes cobrem conteúdo válido, projeção de campos, falhas contraditórias e conteúdo cíclico |
| [source-map-js — GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) | Dependência atualizada para 1.2.2 |
| [js-yaml — GHSA-2883-xcg3-v3hh](https://github.com/advisories/GHSA-2883-xcg3-v3hh) | Cadeia de ferramentas atualizada para 4.3.2 |
| [Browserslist — GHSA-c83g-rgw3-j3cx](https://github.com/advisories/GHSA-c83g-rgw3-j3cx) | Dependência atualizada dentro da major 4 |
| [brace-expansion — GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7) | Versões aninhadas atualizadas dentro de suas faixas compatíveis; demais avisos do pacote também deixaram de aparecer |

### Alertas restantes

O resultado completo passou de **19 entradas (1 crítica, 8 altas, 8 moderadas e 2 baixas)** para **7 moderadas**, com **zero críticas, altas ou baixas**. A consulta `npm audit --omit=dev` retornou **zero alertas**.

As sete entradas restantes representam um aviso subjacente no `minimatch` e sua propagação por seis dependentes da ferramenta de lint:

- `minimatch` 10.2.6, dentro de `@typescript-eslint/typescript-estree`.
- `@typescript-eslint/typescript-estree`, `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`, `@typescript-eslint/type-utils`, `@typescript-eslint/utils` e `typescript-eslint`, todos 8.72.2.

O [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) descreve amplificação de padrões glob com `optimizationLevel >= 2`; a correção está em minimatch >=11.0.1. A versão estável mais recente de typescript-eslint consultada é 8.72.2 e ainda declara minimatch `^10.2.2`. Não há atualização semver compatível nessa cadeia que elimine o aviso naquele momento.

Não foi aplicado override de minimatch 11 sobre uma dependência que exige 10. Esse salto aumentaria o risco de incompatibilidade no tooling para resolver um alerta moderado fora do runtime. O ponto de uso inspecionado em typescript-estree é a comparação de padrões de configuração `allowDefaultProject`, sem opção `optimizationLevel: 2`; a aplicação não oferece esses padrões como entrada de suas APIs. Isso reduz a aplicabilidade ao fluxo atual, mas não apaga o aviso ou garante ausência de risco em outras configurações futuras.

O workflow existente empacota `node_modules` completo, inclusive dependências de desenvolvimento; esta tarefa não mudou esse formato de implantação. Portanto, zero alertas com `--omit=dev` significa zero alertas nas dependências classificadas como produção, e não ausência física de pacotes de tooling no artefato. Acompanhar a correção upstream do typescript-eslint e reavaliar o empacotamento é o seguimento indicado.

`npm audit` completo termina com código 1 por causa desses sete alertas documentados. Isso foi distinguido de uma falha de rede. Não houve uso de credenciais de produção ou envio de dados financeiros às consultas npm.

## Correções de lint

Os links de marca, Página inicial e Acessar demonstração em `components/login-page.tsx` passaram a usar `Link` com `prefetch={false}`. Destinos e apresentação foram preservados; o redirecionamento Microsoft continua usando `window.location.assign` para `/.auth/login/aad`. Foi testada a transição real do link de demonstração a partir de `/login` no build de produção local.

Em `lib/webmcp.ts`, a referência deixa de ser alterada durante renderização. Um efeito dependente de `state` sincroniza a referência após o commit; o registro da ferramenta permanece ligado ao ciclo `enabled`, com cancelamento no cleanup. A leitura pelo WebMCP após salvar uma despesa retornou os novos valores: despesas 271234 e resultado 28766 centavos.

Nenhuma regra ESLint foi desativada ou relaxada para resolver os quatro erros.

## GitHub Actions

O job **Quality checks** executa, nesta ordem:

1. `npm ci`.
2. `npm run lint`.
3. `npm run typecheck`.
4. `npm test`.
5. `npm run build`.

Os comandos não usam `--if-present` nem `continue-on-error`. O job de deploy continua com `needs: build`. Uma falha de qualquer etapa impede o upload de artefato e a publicação. Isso segue a [semântica de dependências de jobs do GitHub Actions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idneeds).

O workflow roda em pull requests destinados à main, pushes na main e acionamento manual. **Push e PR apenas verificam: não publicam.** Upload e deploy exigem conjuntamente `workflow_dispatch`, referência `refs/heads/main` e a opção booleana `deploy_to_production=true`. A opção tem valor inicial falso. Essa é uma mudança deliberada em relação ao deploy automático anterior, para separar revisão/merge de uma aprovação de publicação.

`actions/setup-node` passou de v3 para v4, mantendo Node 24 e adicionando cache npm. Permissões padrão são somente leitura; `id-token: write` continua restrito ao job de deploy. Aplicativo, slot e referências de secrets do Azure foram mantidos.

O workflow foi validado com **actionlint 1.7.12**, baixado da release oficial e com SHA-256 do binário/arquivo conferido. Também foram verificadas sua estrutura e seis combinações de evento, branch, opção e sucesso dos checks. PR, push, execução manual sem opção, branch diferente e checks falhos não habilitaram deploy. A execução manual na main com opção verdadeira e checks aprovados habilitou a condição apenas na simulação.

Não foi disparada execução no GitHub. Regras de proteção/rulesets da main não foram alteradas: para tornar o check obrigatório também para o merge, um administrador precisa exigir **Quality checks** e revisão de PR nas regras da branch. O workflow garante o bloqueio da publicação por falha dos seus checks; regras de merge são uma configuração separada.

## Validação e regressão

Ambiente local: Windows, Node 24.15.0. A instalação reproduzível foi verificada com npm 11.12.1; a resolução online inicial utilizou o npm disponível no contexto autorizado, 12.2.0. O lockfile permanece no formato 3.

| Verificação | Resultado |
|---|---|
| Instalação limpa com npm ci | Aprovada; 586 pacotes instalados pelo lockfile |
| Lint | Aprovado, sem erros/avisos |
| TypeScript | Aprovado |
| Testes automatizados | **59 aprovados**, zero falhas: 56 existentes e três novos |
| Build Next.js 16.4.6/webpack | Aprovado |
| npm audit completo | 7 moderados documentados, zero críticos/altos/baixos |
| npm audit de runtime (`--omit=dev`) | Zero alertas |
| actionlint | Aprovado |
| Estrutura e condições do workflow | Seis cenários aprovados |
| Entrada pelo link de demonstração | Aprovada no navegador local |
| Despesa fictícia de R$ 12,34 | Resultado R$ 300,00 → R$ 287,66; despesas R$ 2.712,34 |
| Recarga da demonstração | Preservou despesa e totais |
| WebMCP após gravação | Retornou resultado atualizado de 28766 centavos |
| 12 aportes de R$ 100 a juros zero | R$ 1.200,00 |
| R$ 1.000 a 12% anuais por 12 meses, sem aportes | R$ 1.120,00 |
| Console nos fluxos visuais exercitados | Nenhum erro ou aviso coletado |

As evidências locais, incluindo JSON dos audits, logs, diff de dependências, validação do workflow e capturas, estão em `D:\codigos\projeto eng comp2\tarefa02-evidencias-20261116`, fora do repositório. Não se deve transportar essa pasta inteira para um PR.

## Compatibilidade e limites

- Zod muda de major 3 para 4 porque o aviso exige versão >=4.6.6. O uso existente já era pela entrada `zod/v4`, e os três novos testes protegem esse contrato. Outros consumidores futuros precisam observar as APIs da major 4.
- MSAL Node muda de major como dependência transitiva escolhida pelo patch oficial do Azure Identity, sem importação direta no código financeiro. A autenticação real Entra e a conexão PostgreSQL com identidade gerenciada ainda precisam de validação no ambiente apropriado; não foram acessadas nesta tarefa.
- `Link` usa navegação do Next em vez de recarga completa nesses três destinos. O fluxo login → demonstração foi confirmado; o login Microsoft não foi modificado.
- O WebMCP passa a expor apenas o último estado confirmado pelo React, evitando estado de uma renderização ainda não concluída.
- O build foi executado em Windows, não no runner Ubuntu/Azure. A primeira execução remota do PR ainda será necessária para confirmar o ambiente Linux.
- O resultado de uma consulta de segurança depende dos avisos disponíveis em sua data. Esta entrega não representa uma certificação de segurança completa.

## Revisão e integração

Revisar os sete arquivos listados e a diferença da branch em relação à main. Reexecutar os comandos de qualidade e conferir a justificativa dos alertas moderados antes de integrar. Enviar a branch para revisão por PR somente quando autorizado; não enviar diretamente à main.

Depois que o workflow estiver disponível no GitHub, o PR deverá executar o job Quality checks. A exigência desse status e de revisão para merge deve ser definida nas regras da main por quem administra o repositório. Integrar via PR revisado; o merge, com o workflow desta tarefa, não publica automaticamente.

Publicação é uma etapa posterior, com autorização explícita: executar manualmente o workflow na main e marcar `deploy_to_production` somente após aprovação. Essa execução repetirá os checks antes de acessar o Azure. Não foram feitos push, merge ou deploy nesta tarefa.
