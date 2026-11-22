# Tour guiado e ajuda contextual

Base: `main`, commit `4736a81dd52253bb54b78af459026cdf4c61ee80`. Branch: `feat/onboarding-tour-guiado`.

O botão **Precisa de uma mão?** oferece **Fazer tour pelo site**, **Ajuda desta tela** e **Ver guias educativos**. No celular, o mesmo botão usa um ícone com nome acessível. A primeira visita mostra um convite sem bloquear a página. **Agora não** dispensa esse convite; o menu permite reabrir o tour a qualquer momento.

Foi utilizada **Driver.js 1.14.0**, com versão fixa no lockfile, carregada sob demanda. O projeto usa React 19.2.6 e Next.js 16.4.6. A inspeção inicial da visão geral foi feita com Chrome/Playwright em desktop e celular. Foram preservados a paleta, os cartões e os controles reais da aplicação.

## Roteiro

O tour principal tem 12 etapas: boas-vindas; resultado do mês; navegação para lançamentos; cadastro manual; envio de arquivo; lista e filtros; Economizar; Metas; Aprender; aba Chat financeiro; pergunta do chat; encerramento. A apresentação de Aprender foi dividida em duas etapas para destacar primeiro a navegação e depois a aba. Há Voltar, Próximo, Pular, Finalizar e Rever tour.

Em Lançamentos, **Como importar e revisar um documento?** apresenta o seletor de arquivos e, quando disponíveis, Extrair dados, campos de revisão, seleção e confirmação. Sem documento, explica como continuar e permite finalizar. Na demonstração, informa que fotos e PDFs exigem uma conta. A ajuda da tela também cobre visão geral, economia, metas, aprendizado e configurações.

## Implementação e limites

| Arquivos | Responsabilidade |
| --- | --- |
| `components/guided-tour.tsx` | Convite, ciclo de vida, navegação do tour, preferência local, retorno do foco e cancelamento |
| `components/tour-help-menu.tsx` | Menu acessível de ajuda, fechamento por Esc e clique externo |
| `lib/tour-steps.ts` | Textos e roteiros principal/contextuais |
| `lib/tour-targets.ts` | Seleção do alvo visível e espera pelo DOM após renderização React |
| `components/finance-app.tsx` | Integração com navegação e abas existentes, marcadores estáveis |
| `components/import-panel.tsx`, `document-panel.tsx`, `financial-chat.tsx` | Marcadores dos controles reais e estado de processamento/revisão |
| `app/layout.tsx`, `app/tour.css` | Estilos da biblioteca, aparência, foco, celular e movimento reduzido |
| `package.json`, `package-lock.json` | Driver.js com versão fixa |
| `scripts/verify-tour-browser.mjs`, `scripts/stop-tour-postgres.mjs` | Verificação local com contas e PDF fictícios, evidências e encerramento do PostgreSQL de teste no Windows |

Os seletores usam `data-tour`; a navegação escolhe o item visível entre desktop e celular. A espera observa mudanças reais do DOM, com cancelamento e limite de dois segundos. Um alvo indisponível vira uma explicação central, sem deixar o usuário preso. Redimensionar a tela durante o tour atualiza o alvo.

O tour bloqueia interação com os controles destacados: não envia perguntas, extrai arquivos, seleciona linhas, grava lançamentos ou marca consentimentos. Com uma revisão de arquivo aberta, o tour completo não navega para outra tela; a ajuda contextual permanece disponível. Durante processamento, a ajuda pede que o usuário aguarde. O único valor novo salvo é o estado técnico do convite em `ia-financeira:onboarding-tour:v1` (`seen`, `dismissed` ou `completed`). O tour também funciona quando esse armazenamento está indisponível.

O resultado do mês é explicado como cálculo dos registros, e não como saldo bancário. Economia é hipotética, metas não transferem dinheiro, e compartilhar conversa com a Groq é separado do uso opcional de resumos financeiros. Não foram alterados cálculos, banco, autenticação, rotas de API, integrações de IA, workflows ou configuração da Azure.

## Validação

- `npm run lint`: passou sem avisos.
- `npm run typecheck`: passou.
- `npm test`: 184 testes passaram.
- `npm run build`: build de produção passou.
- `npm run test:integration`: 1 suíte passou, código de saída 0. Neste sandbox Windows, foi usado um preload temporário que substitui somente o encerramento do cluster descartável por `pg_ctl stop` (o `taskkill` padrão ficava pendurado). Nenhuma asserção foi alterada. Uma execução adicional da mesma suíte compilada com esbuild também passou. O preload não integra o código da aplicação nem altera o comando/CI do repositório.
- `node scripts/verify-tour-browser.mjs --production`: passou, código de saída 0.

A verificação de navegador usa o build real e um PostgreSQL isolado, cria contas fictícias e gera um PDF digital de teste. Executa o tour completo em 1440×1000 e 390×844, nos modos demonstração e conta; também verifica 320×568 com armazenamento indisponível. Cobre voltar, pular com Esc, repetir, concluir, foco por teclado, mudança de viewport, reabertura pelo menu, ajuda contextual, acesso aos guias, documento ausente/selecionado/extraído e proteção da revisão em andamento. Compara os registros e os campos antes e depois, verifica consentimentos desmarcados e ausência de requisições de gravação/IA feitas pelo tour. Não houve chamada a provedor externo de IA.

As capturas abaixo foram produzidas na execução local. A validação foi em Chrome; não substitui teste com leitor de tela, Safari ou aparelhos físicos. A extração de OCR não foi retestada para esta alteração: o documento utilizado pelo tour é um PDF digital fictício.

## Como testar

```sh
npm ci
npm run dev:local
```

Abra `http://localhost:5174`, entre na demonstração ou crie uma conta fictícia local e abra **Precisa de uma mão? → Fazer tour pelo site**. Para revisar documentos, abra Lançamentos e use a ajuda de importação antes e depois de selecionar/extrair um PDF de teste.

Para reproduzir a verificação automatizada, com Chrome instalado e as portas locais 5190 e 55449 disponíveis:

```sh
npm run build
node scripts/verify-tour-browser.mjs --production
```

As novas capturas e o resultado JSON ficam em `outputs/tour/`; os clusters descartáveis ficam em `.test-data/`, ambos ignorados pelo Git. Nenhum serviço de produção é utilizado.

## Evidências

| Cenário | Captura |
| --- | --- |
| Convite no desktop | [Convite](tour-evidence/desktop-account-convite.png) |
| Início do tour | [Boas-vindas](tour-evidence/desktop-demo-inicio.png) |
| Envio real de arquivos | [Desktop](tour-evidence/desktop-demo-upload.png) · [Celular](tour-evidence/mobile-demo-upload.png) |
| Chat e autorizações separadas | [Celular](tour-evidence/mobile-account-chat.png) |
| Revisão do PDF fictício | [Desktop](tour-evidence/desktop-account-revisao.png) · [Celular](tour-evidence/mobile-account-revisao.png) |

Possível melhoria futura: avaliar o agrupamento dos controles avançados de importação e a clareza do histórico de CSV/OFX em relação a fotos/PDFs. Essa reorganização fica fora deste PR.

Entrega em PR separado, sem merge e sem publicação na Azure.
