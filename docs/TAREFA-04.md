# Tarefa 04 — dashboard e comparação educativa

Entrega local em 16/11/2026, sobre `50816e8`, na branch `feat/importacao-inteligente-financeira`. Árvore inicial limpa. As melhorias da Tarefa 03 foram preservadas. Nenhum push, merge, deploy, migração ou acesso ao banco de produção foi realizado. Nenhuma dependência ou configuração de produção foi alterada.

## Funcionalidades entregues

| Requisito | Implementação e arquivos | Evidência automatizada | Status |
|---|---|---|---|
| A: comprometimento | `lib/finance.ts`, `components/income-commitment.tsx`, integração em `components/finance-app.tsx` | 7 testes iniciais em `tests/dashboard.test.ts`: renda, ausência, zero, 80%, 125%, legado, estorno, previsão, importação e recarga | Concluído |
| B: US10 | Categoria `apostas` em `lib/types.ts`; validação e descrição opcional em `lib/commands.ts`; formulário em `components/finance-dialog.tsx`; resumo em `components/betting-summary.tsx` | 3 testes de domínio/importação em `tests/dashboard.test.ts` e 1 de persistência e isolamento em `tests/repository.test.ts` | Concluído |
| C: US13 | `comparePeriodicSpending` reutiliza `simulate`, em `lib/finance.ts`; `components/educational-comparison.tsx`; aba Aprender e acesso pelo dashboard | 9 testes em `tests/educational-comparison.test.ts`: zero, positivo, capital, centavos, um mês, 12 meses, entradas inválidas, preservação do simulador e ausência de mutação | Concluído |
| D: integração | `lib/education.ts`, integração visual em `components/finance-app.tsx`, estilos em `app/globals.css` | 2 testes integrados adicionais em `tests/dashboard.test.ts`, além de toda a regressão anterior | Concluído |

A revisão de importação recebe a nova categoria pela lista compartilhada `CATEGORIES`; não foi reimplementada nem passou a inferir categorias por descrições. O mesmo se aplica ao filtro de transações e aos limites do orçamento existentes.

## Cálculos e estados

O comprometimento realizado é `consumo líquido reconhecido / renda reconhecida × 100`, a partir de `monthMetrics` e `budgetEffect`. Não usa todas as saídas de caixa. Transferências e pagamentos de fatura permanecem no caixa, com efeito zero no orçamento. Estornos vinculados compensam a categoria original. Registros sem `nature` continuam com a compatibilidade pelo campo `type`, sem receber classificação persistida automaticamente.

- Renda positiva: percentual numérico sem teto; R$ 3.000 / consumo R$ 2.400 => 80%; renda R$ 2.000 / consumo R$ 2.500 => 125%.
- Renda ausente: nenhuma receita reconhecida e nenhuma confirmação de ausência de receita no mês. Exibe renda não informada, com percentual `null`, nunca um 0% inventado. Estimativa no perfil não é receita.
- Renda reconhecida zero: confirmação explícita `confirmedNoIncomeMonths`, ou renda reconhecida integralmente compensada pelos estornos válidos. Não divide por zero, nem afirma ausência de renda externa ao aplicativo.
- Sem despesas e com renda positiva: 0% válido.
- Previsto: soma realizados e registros planejados do mesmo mês, em apresentação separada. O denominador inclui apenas receitas realizadas/planejadas cadastradas, não a estimativa de perfil. Sem renda positiva, o percentual previsto também fica indisponível. Não é previsão de recebimento ou agenda completa de obrigações.
- Barra: preenchimento visual limitado a 100%, mas número exibido e atributos acessíveis preservam o percentual integral; `aria-valuemax` acompanha o valor quando superior a 100%.

Os gastos opcionais com apostas são despesas na categoria `apostas`, nunca uma segunda coleção ou natureza financeira. O resumo exibe consumo realizado líquido, participação no consumo total, pendências separadas e referência ao mês anterior. Ausência de registros não comprova inexistência de gastos. Descrição vazia/ausente é permitida somente para despesas nessa categoria e recebe o rótulo neutro `Gasto com apostas`; valores, datas, categorias, natureza, autenticação e limites continuam validados no servidor. Cadastro, edição e exclusão usam os mecanismos existentes. A soma das categorias concilia com o consumo reconhecido.

A comparação educativa usa o mesmo motor Decimal, com 40 dígitos de precisão interna, taxa anual efetiva convertida por `(1 + taxa anual)^(1/12) − 1`, aportes no fim do mês e arredondamento de exibição HALF_UP para centavos. Prazo de 1 a 600 meses; taxa maior que −100% e até 1.000%, com os limites monetários existentes. A função original do simulador mantém seu contrato, inclusive prazo zero.

Total hipotético gasto = valor mensal × meses. Total aportado = capital inicial + aportes mensais. Montante vem do motor existente; rendimento/perda e diferença entre montante e aportes são o mesmo valor. O capital inicial não entra no total de gastos periódicos. Há gráfico comparativo e tabela mensal acessível. Não há previsão de retornos em apostas, promessa de rentabilidade ou produto recomendado; a tela informa riscos, perdas possíveis e exclusão de impostos, taxas e inflação.

Usar despesas registradas como entrada exige clicar no botão que identifica o mês de origem. O valor pode ser editado. A simulação fica apenas no estado do componente: não salva transações, aportes em metas, investimentos ou saldos e não envia dados a serviços externos.

O diagnóstico por regras informa o comprometimento e o consumo categorizado quando há registros, explicitando que o valor já integra o total. Ausência de registros não gera conclusão sobre apostas. Cenários hipotéticos não entram nas métricas do diagnóstico. A lista de métricas transmitidas ao provedor opcional não foi ampliada e nenhuma chamada real a LLM foi feita nesta tarefa.

## Validação final

| Verificação executada após as alterações | Resultado |
|---|---|
| `npm run lint` | Aprovado, saída 0 |
| `npm run typecheck` | Aprovado, saída 0 |
| `npm test` | 106 aprovados, 0 falhas, 0 ignorados; 84 anteriores + 22 novos |
| `npm run build` | Aprovado, Next.js 16.4.6 / webpack, saída 0 |
| `npm audit --json` | 7 moderados, 0 baixos/altos/críticos; saída 1 pelos achados |
| `npm audit --omit=dev --json` | 0 vulnerabilidades, saída 0 |
| `git diff --check` | Sem erros de espaços; apenas aviso do Git sobre normalização LF/CRLF |

Os sete avisos moderados permanecem em `minimatch`, `typescript-eslint` e cinco pacotes `@typescript-eslint` (eslint-plugin, parser, type-utils, typescript-estree, utils). A origem é [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249), boletim oficial consultado: amplificação de padrões glob e consumo excessivo de CPU/memória. Requer padrões controlados por atacante; o caminho observado pertence às ferramentas de lint/TypeScript de desenvolvimento. O audit sem dependências de desenvolvimento retornou zero e `npm ls minimatch --omit=dev` retornou árvore vazia. Isso limita a exposição observada, sem declarar inexistência de risco ao processar projetos ou padrões não confiáveis em CI. Não foram adicionadas dependências ou aplicado `audit fix --force`.

Regressões aprovadas incluem: 3.000 − 2.700 = 300; mais despesa 12,34 => 287,66; transferência 800 sem consumo; compra e pagamento da fatura contados uma vez; compra 200 menos estorno vinculado 50 => consumo 150; 12 aportes de 100 a 0% => 1.200; capital inicial 1.000 a 12% anual por 12 meses sem aportes => 1.120. A comparação adicional de 12 aportes de 100 a 12% anual => 1.264,65 e rendimento 64,65 também foi verificada com valor esperado fixo.

## Validação no navegador

Aplicação de produção local em `127.0.0.1:5197`, modo demonstração, dados fictícios isolados por origem. Conferidos dashboard, criação sem descrição na categoria opcional, edição de categoria, recarga, revisão/importação, deduplicação, renda ausente/zero, comparação e gráficos. Larguras 1280 e 390 px; nenhum transbordamento horizontal de documento na largura móvel (390/390). Navegação móvel fixa aparece sobre a posição corrente nas capturas de página inteira; o conteúdo permanece acessível por rolagem. Console sem avisos ou erros capturados. Override de viewport restaurado ao final.

Fluxo observado: resultado 300,00 e consumo 2.700,00; cadastrar despesa opcional 12,34 => resultado 287,66, comprometimento 90,41%, categoria 12,34 (0,45%); recarga preservou. Comparação default a 0% mostrou 1.200,00; a 12% mostrou 1.264,65. O preenchimento explícito trouxe 12,34 do mês e permitiu editar. Voltar ao dashboard manteve os registros.

Importado CSV fictício com despesa revisada 100, transferência 800 e pagamento de fatura 100: consumo final 2.812,34, renda 3.000,00, resultado 187,66, comprometimento 93,74%; saídas de caixa 3.712,34. Reimportação foi rejeitada com erro controlado de arquivo/linhas já importadas. Alterar a categoria do lançamento manual 12,34 para lazer reduziu a categoria de apostas de 112,34 para 100,00, mantendo consumo e comprometimento. Outubro sem registros exibiu renda ausente; confirmar ausência de receita passou a exibir renda reconhecida zero sem percentual.

Exclusão, estorno, isolamento e execução no repositório foram verificados pelos testes automatizados. Não foram repetidos todos esses caminhos no navegador; nenhum teste visual acessou uma conta real. Durante a validação visual foi corrigido o atributo `required` do campo de descrição opcional e melhorada a distribuição do gráfico em telas pequenas. As verificações finais foram executadas após essas correções.

Logs, CSV fictício, snapshots e capturas estão fora do Git, em `D:/codigos/projeto eng comp2/tarefa04-evidencias`. Backup anterior: `D:/codigos/projeto eng comp2/IA-Financeira-antes-tarefa04.bundle`. Backup final: `D:/codigos/projeto eng comp2/IA-Financeira-tarefa04.bundle`. São cópias locais de Git, não backup de banco de produção ou contra falha do disco.

## Git e revisão

Commits separados: `8268509` (A), `724dcc6` (B), `c2379c1` (C), seguidos do commit de integração, regressão, correções visuais e deste relatório (`test(finance): validar dashboard e comparacao educativa`). Todos ficam na branch existente, sem reescrever a história anterior. `main` preservada em `c1fe0ed91e9b7a57c699e0b51283a5b1d08dfc4e`.

Arquivos alterados nesta tarefa: `lib/finance.ts`, `lib/types.ts`, `lib/commands.ts`, `lib/education.ts`, `components/finance-app.tsx`, `components/finance-dialog.tsx`, `components/income-commitment.tsx` (novo), `components/betting-summary.tsx` (novo), `components/educational-comparison.tsx` (novo), `app/globals.css`, `tests/dashboard.test.ts` (novo), `tests/educational-comparison.test.ts` (novo), `tests/repository.test.ts` e este relatório.

Para revisar: comparar `50816e8..HEAD` e os quatro commits em sequência; executar os scripts novamente no ambiente de integração. Após autorização, enviar a branch de desenvolvimento e abrir PR com verificações obrigatórias. Não selecionar somente os commits desta tarefa sobre uma main antiga: a branch depende dos incrementos anteriores de naturezas/importação. Publicação no Azure deve ser uma ação posterior, separada e aprovada.

## Limitações e próxima etapa

- Previsões dependem das receitas/despesas planejadas cadastradas; não inferem obrigações ausentes, recorrências ou renda futura.
- Categoria opcional não infere comportamento, condição clínica, retorno ou prejuízo líquido em jogos. A comparação histórica é entre mês escolhido e mês anterior; outros meses podem ser escolhidos pelo controle existente do dashboard.
- A comparação usa somente frequência mensal e taxa hipotética constante. Não representa investimento executado, resultado real ou recomendação personalizada.
- Mantidas as limitações da Tarefa 03: estornos vinculados no mesmo mês, sem conciliação bancária/cartão real; clientes antigos da importação sem `natures` continuam com compatibilidade documentada.
- Persistência validada em armazenamento local do demo e no repositório de testes com gateway SQLite em memória. PostgreSQL/Azure e autenticação Entra reais não foram exercitados; não há nova estrutura persistida ou migração a aplicar.
- Recomenda-se como próxima tarefa **validação de Azure e PostgreSQL em ambiente de homologação**, com credenciais de teste, conferindo autenticação, isolamento, persistência, concorrência e workflow antes de publicar estas funcionalidades em produção. Preparar as evidências acadêmicas a partir dos logs e capturas preservados.
