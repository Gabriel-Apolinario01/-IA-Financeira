# Tarefa 05 — CSV, revisão responsiva e sugestões

Entrega local na branch `feat/importacao-inteligente-financeira`, a partir de `8e984e6`, com árvore inicial limpa. Não houve push, merge, deploy, alterações de credenciais ou migrações de produção. As funcionalidades e os 106 testes anteriores foram preservados.

## Erro numérico: reprodução e correção

O arquivo original `extrato_exemplo_brl.csv` **não foi encontrado no diretório do projeto e nas evidências locais**. Não é possível afirmar qual formato específico provocou o erro naquele arquivo. Foram usados CSVs sintéticos, identificados como tais nos testes e nas evidências.

Causas comprovadas no código anterior: a expressão numérica rejeitava `R$`, espaços entre símbolo e número e sinal `+`; a escolha Brasil rejeitava decimais com ponto; o mapeamento de cabeçalhos era restrito e não suportava débito/crédito separados. Valores brasileiros simples, como `-42,35`, já funcionavam e continuam funcionando. Nenhuma mudança transforma silenciosamente um número internacional em brasileiro quando o usuário escolhe explicitamente Brasil.

`lib/imports.ts` agora aceita decoração monetária nas bordas (`-R$ 42,35`, `R$ -1.234,56`, espaço não separável), sinal positivo, vírgula ou ponto decimal conforme a convenção escolhida, separadores `;`, `,` e tabulação respeitando aspas, BOM, cabeçalhos normalizados e reorganizados. Mantém centavos inteiros, limites e rejeição de campos/aspas inconsistentes.

Há três escolhas de formato:

- **Brasil** e **Internacional**: interpretação explícita e estrita; um número incompatível permanece inválido.
- **Detectar**: aceita somente interpretações sem ambiguidade; `1.234` e `1,234` exigem escolha explícita. Evidências de convenções diferentes no mesmo arquivo bloqueiam as linhas correspondentes até a origem ser corrigida ou separada. Saldos informativos e números já ambíguos não estabelecem a convenção das outras linhas.

Cabeçalhos aceitos incluem data/date/data de lançamento, descrição/description/histórico/lançamento, valor/amount/valor do lançamento, ou débito/saída e crédito/entrada. Aliases equivalentes repetidos ou combinação de valor com débito/crédito são rejeitados. Colunas não transacionais como saldo não entram no valor. Débito vira saída, crédito vira entrada; ambos preenchidos, crédito negativo ou ambos vazios/zero são inválidos.

Linhas identificadas pelos rótulos de saldo anterior/inicial/final/do dia/disponível ou total/totais suportados ficam visíveis com erro explicativo e não podem ser confirmadas, inclusive por comando direto. Não são receitas. O detector não pretende cobrir todos os formatos proprietários de bancos; rótulos diferentes precisam ser examinados antes da importação.

A decodificação é UTF-8 estrita por padrão. Windows-1252 exige escolha explícita e nova seleção do arquivo, evitando fallback silencioso. Binários, caracteres de substituição e controles incompatíveis são rejeitados. O limite de 100 KB também continua sendo verificado no texto normalizado pelo servidor; conversão de encoding pode aumentar o tamanho em UTF-8. Preservados 300 linhas, datas válidas, limites monetários e validação da API.

## Prévia e interação

`components/import-panel.tsx` e `app/globals.css` organizam os dados em tabela no desktop, com justificativas/sugestões em faixa própria para cada movimentação. No celular, cada linha vira cartão com descrição, data, valor/direção, natureza, categoria e status. Descrições são áreas de texto editáveis, com original consultável após correção. Valores bancários não são editáveis.

O resumo informa encontradas, válidas, inválidas, duplicadas exatas, pendentes e selecionadas. Duplicadas exatas continuam sendo linhas estruturalmente válidas, mas não selecionáveis; os contadores não são grupos mutuamente exclusivos. Totais selecionados mostram receitas reconhecidas e consumo líquido, sem somar transferências/faturas como consumo. Estornos vinculados reduzem o original segundo o mesmo motor; vínculos e limites conjuntos de estorno são verificados também na prévia.

Seleção individual, seleção de todas as válidas/revisadas e desmarcação funcionam. Aplicar sugestão apenas preenche natureza/categoria. Selecionar e confirmar permanecem ações separadas. Linhas inválidas, não identificadas, sem descrição ou estornos sem vínculo não podem ser confirmadas. A confirmação definitiva continua validando o arquivo e todos os campos no servidor.

`lib/import-review.ts` concentra prontidão, totais e identificação de duplicação na prévia. Hash calculado no cliente serve só à exibição: o servidor recalcula o hash e não aceita alterações em origem, IDs ou valores via `payload.edits`. O contrato `import.commit`, `payload.natures` e `payload.edits` foi mantido. Histórico, importação parcial, desfazer/restaurar, FITID por conta e reserva de linhas de lotes desfeitos continuam funcionando. Possíveis duplicações por valor/data são avisos, sem remoção automática.

Durante a validação visual foram corrigidos o tamanho mínimo implícito da grade e o posicionamento de rótulos acessíveis em tabelas com rolagem. Isso eliminou um transbordamento de documento encontrado no celular. Em telas intermediárias, a tabela de revisão mantém rolagem interna quando necessário; os cartões são usados até 700 px.

## Classificação local e limites

`lib/import-classifier.ts` aplica regras determinísticas, sem rede ou alterações de dados. Normaliza Unicode, acentos, pontuação e espaços; usa limites de palavras e evidências explícitas. Retorna categoria opcional existente, natureza sugerida, justificativa, estado qualitativo de evidência e `needsReview: true`. Não há probabilidades numéricas ou aprendizagem automática.

| Evidência comum | Sugestão |
|---|---|
| Padaria, mercado, supermercado, restaurante | Alimentação |
| Farmácia, drogaria, consulta médica, posto de saúde | Saúde |
| Posto de combustível, abastecimento, gasolina, estacionamento | Transporte |
| Conta de luz/água, energia elétrica, aluguel, condomínio | Moradia |
| Mensalidade escolar, material escolar, curso de idiomas | Educação |
| Serviços de streaming, Netflix, Spotify | Assinaturas |

Entradas com nomes de estabelecimentos não viram despesas pelo nome. PIX genérico, Mercado Pago/Livre, Amazon, PayPal, referências a apostas, categorias conflitantes e nomes desconhecidos ficam pendentes. Transferências, pagamentos de fatura e estornos recebem sugestões conservadoras próprias. O original de um estorno nunca é escolhido automaticamente. Uma menção genérica a posto/empresa não determina uma compra de combustível. O usuário pode corrigir todas as sugestões antes de confirmar.

## LLM opcional: implementação real e configuração

O classificador usado por padrão é local. O adaptador de diagnóstico anterior (`lib/explanations.ts`) trabalha com métricas agregadas e não tinha consentimento para descrições; sua autorização não foi reutilizada.

Foi implementado `lib/import-assistance.ts`, acessível pela nova rota autenticada `POST /api/import-classification`. A rota usa os mesmos controles de identidade, mesma origem, JSON limitado e erros controlados. Credenciais são lidas apenas na rota do servidor. Usa o provedor Responses já adotado pelo projeto, sem acrescentar dependências.

Para habilitar futuramente em ambiente controlado: configurar `OPENAI_API_KEY`, `OPENAI_MODEL` e **`IMPORT_AI_ENABLED=true`** somente no servidor. Essa flag é separada de `AI_ENABLED`, que continua pertencendo ao diagnóstico. Nenhuma dessas configurações foi alterada nesta tarefa. Não é necessário habilitar IA para importar ou usar categorias sugeridas.

Na conta autenticada, a opção fica em uma seção própria. O usuário vê as descrições candidatas e suas direções e precisa autorizar cada solicitação. A escolha é desmarcada após o pedido e ao revisar os dados. O modo demo não oferece envio externo.

Controles implementados:

- Até 10 descrições de até 160 caracteres por pedido, JSON de até 4.096 bytes e cinco pedidos por minuto por usuário, em bucket separado no repositório existente. Não há nova estrutura de banco.
- Envia somente número da linha para correlação, descrição minimizada e direção; não envia arquivo, perfil, apelido, IDs financeiros nem colunas de datas/valores. Remove padrões reconhecíveis de identificadores, e-mails e links. A remoção não é anonimização completa: nomes ou valores presentes no texto podem continuar na descrição, por isso a tela exige revisão e consentimento.
- `store:false`, até 1.600 tokens de saída, timeout de oito segundos no servidor e dez no cliente, validação de resposta estruturada e limite de tamanho da resposta aceita.
- Categorias e naturezas existentes, linhas únicas/correspondentes, justificativas limitadas e rejeição de propriedades inesperadas, probabilidades inventadas ou vínculos de estorno.
- Evidências locais conservadoras para transferências, faturas, estornos e descrições ambíguas prevalecem sobre palpites externos. Categoria de apostas proposta pelo modelo não substitui a regra local.
- Ausência de consentimento/configuração, timeout, erro HTTP, JSON inválido ou sugestão inválida preservam as regras locais. Nenhuma resposta seleciona linhas, modifica transações ou salva a classificação. Respostas de pedidos antigos são descartadas após mudança dos dados.

**Nenhuma chamada real ou paga a LLM foi executada.** O adaptador externo foi testado com `fetch` simulado. A rota local sem autenticação retornou 401. Autenticação Entra, PostgreSQL e o provedor externo reais ainda precisam de homologação; não foram declarados como validados nesta entrega.

## Testes e verificações

Base: 106 testes. Adicionados 41: 13 de CSV/encoding, 3 da prévia, 19 de classificação local e 6 do adaptador opcional. O teste existente de rate limit ganhou verificações do bucket novo e isolamento por usuário.

| Comando final | Resultado |
|---|---|
| `npm run lint` | Aprovado, saída 0 |
| `npm run typecheck` | Aprovado, saída 0 |
| `npm test` | 147 aprovados; zero falhas/ignorados |
| `npm run build` | Aprovado; Next.js 16.4.6, webpack, incluindo a rota nova |
| `npm audit --json` | Mesmos sete moderados; zero baixos, altos ou críticos; saída 1 pelos achados |
| `npm audit --omit=dev --json` | Zero vulnerabilidades, saída 0 |
| `git diff --check` | Sem erros de espaços; aviso de normalização LF/CRLF apenas |

Os testes cobrem formatos e moedas sintéticas, colunas reorganizadas, aspas/BOM, débito/crédito, saldo anterior, ausência e ambiguidade de valor, encoding, limites, segurança de campos, natureza, correções humanas, deduplicação, compatibilidade de lotes antigos, persistência, isolamento e fallback externo sem gravação. Todas as regressões financeiras anteriores foram mantidas.

Os sete avisos moderados continuam na cadeia de desenvolvimento `typescript-eslint`/`@typescript-eslint` e `minimatch`, associados a [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249). Não houve atualização de pacotes nesta tarefa; não surgiram novos avisos no audit. O resultado de runtime limita a exposição identificada, sem declarar que processamento de código/padrões não confiáveis no CI seja isento de risco.

## Evidências visuais

Aplicação local de produção em `127.0.0.1:5198`, demo com dados fictícios e origem distinta das tarefas anteriores. Arquivo `brasileiro-sintetico.csv`: sete linhas, cinco válidas e duas bloqueadas (saldo anterior e valor ausente). Valores lidos: −12,34, −50,00, −800,00, −100,00 e −25,90. Aplicadas sugestões, corrigida padaria para Lazer e descrição para `Padaria - compra revisada`; seleção em lote escolheu somente as cinco revisadas.

Consumo selecionado: R$ 88,24. Confirmação criou cinco transações. Dashboard após recarga: renda R$ 3.000,00, consumo R$ 2.788,24, resultado R$ 211,76 e comprometimento 92,94%. Caixa: saídas R$ 3.688,24, incluindo transferência/fatura. Reimportar o mesmo arquivo/conta mostrou cinco duplicadas exatas e duas inválidas, sem seleção ou confirmação adicional.

Capturas finais usam `previa-visual.csv`, uma segunda prévia fictícia de três linhas **não confirmada**, para mostrar controles e sugestões com clareza. Avisos de possível duplicação por data/valor foram mantidos; nenhum registro adicional foi salvo por essa prévia.

Verificados desktop em 1.280 px e móvel em 390 px nominais. Depois das correções, largura útil e largura rolável do documento coincidiram: 1.265/1.265 no desktop e 375/375 no móvel com barra de rolagem. Não há mais transbordamento horizontal de documento nesses cenários. Capturas de página inteira mostram a navegação móvel fixa sobre a posição corrente; todos os campos continuam acessíveis por rolagem. Console sem avisos ou erros capturados. Viewport restaurado ao final.

Logs, snapshots, CSVs fictícios, resposta 401 e capturas estão em `D:/codigos/projeto eng comp2/tarefa05-evidencias`, fora do Git. Backups Git locais: `D:/codigos/projeto eng comp2/IA-Financeira-antes-tarefa05.bundle` e `D:/codigos/projeto eng comp2/IA-Financeira-tarefa05.bundle`. Não representam backup de banco real ou proteção contra perda do disco.

## Git, arquivos e próxima prioridade

Commits separados: `7c2dcf4` (parser), `36a8b03` (prévia), `e6d738b` (classificador local), `c222ecc` (LLM opcional), seguidos do commit de regressão, ajustes visuais e documentação. Todos sobre a branch atual, sem reescrever o histórico. `main` permanece em `c1fe0ed91e9b7a57c699e0b51283a5b1d08dfc4e`.

Arquivos: `lib/imports.ts`, `lib/import-review.ts`, `lib/import-classifier.ts`, `lib/import-assistance.ts`, `lib/repository.ts`, `components/import-panel.tsx`, `components/finance-app.tsx`, `app/globals.css`, `app/api/import-classification/route.ts`, `tests/csv-regression.test.ts`, `tests/import-review.test.ts`, `tests/import-classifier.test.ts`, `tests/import-assistance.test.ts`, `tests/repository.test.ts` e este relatório.

Próxima prioridade: testar o CSV original quando disponibilizado, para confirmar a causa específica e adicionar a fixture anonimizada; depois homologar autenticação/Azure/PostgreSQL e os limites do endpoint opcional antes de habilitar chamadas externas. A importação permanece sujeita à revisão explícita; não há promessa de suporte a todos os layouts bancários nem de classificação perfeita.
