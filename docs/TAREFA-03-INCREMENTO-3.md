# Incremento 3 — motor por natureza e revisão de extratos

Base: `6273566`. Branch: `feat/importacao-inteligente-financeira`. Sem push, merge, deploy, credenciais reais ou migrações.

## Contabilização

| Natureza | Orçamento | Caixa registrado |
|---|---|---|
| Ausente (legado) | Mantém a regra anterior de `type`, sem gravar classificação presumida | Direção e valor existentes |
| `income` | Soma receita | Direção informada em `type` |
| `expense` | Soma consumo | Direção informada em `type` |
| `transfer` | Não soma receita nem consumo | Mantém entrada/saída; não presume outra ponta |
| `invoice_payment` | Não soma consumo novamente | Mantém a liquidação; não comprova que as compras foram cadastradas |
| `refund` com vínculo válido | Reverte parcialmente receita ou consumo do original, na categoria dele | Mantém a direção de caixa |
| `refund` sem vínculo | Não compensa orçamento; fica pendente | Mantém caixa |
| `unidentified` | Não compõe receita/consumo | Mantém caixa; exige revisão no novo importador |

`invoice_payment` é o literal já definido no projeto, reutilizado para o conceito chamado de card_payment no planejamento.

`budgetEffect` centraliza a regra, utilizada por `monthMetrics`, que alimenta dashboard, gráficos, diagnóstico e sugestões. Cenários de economia validam a mesma base líquida por categoria. `cashIncome`, `cashExpenses` e `cashResult` representam as movimentações realizadas, separadas do resultado de receitas menos consumo. O dashboard mostra ambos com rótulos distintos e avisa sobre pendências de revisão. Metas permanecem um registro separado: importar não cria aportes, retiradas ou transferências bancárias.

O campo opcional `refundOf` identifica o original confirmado na mesma coleção do usuário. A validação exige original realizado de natureza receita/despesa (incluindo legado), direção oposta, data igual ou posterior, mesmo mês e soma dos estornos limitada ao valor original. A verificação roda também em alterações, exclusões, desfazimento e restauração; o original não pode ser removido enquanto houver estorno vinculado. Valores parciais são aceitos. Idempotência dos comandos e deduplicação de arquivo/linha/conta/FITID permanecem ativas. Dois reembolsos legítimos de mesmo valor não são presumidos duplicados por mera semelhança; o limite cumulativo sempre é aplicado.

Estornos entre meses diferentes são recusados para compensação neste MVP. Não são feitas retificações retroativas automáticas. Estornos antigos sem vínculo permanecem pendentes; no importador revisado, selecionar estorno exige escolher um original válido. Vincular pelo próprio usuário não comprova a autenticidade bancária do reembolso.

## Revisão

O importador existente foi ampliado, sem trocar parser ou persistência. Todas as linhas começam como Não identificado e nenhuma é selecionada automaticamente. Essa escolha conservadora exige classificação explícita, sem tratar palavras-chave ou sinal como confirmação de natureza.

Cada linha apresenta data, valor, direção de caixa, descrição editável, natureza, categoria e seleção. Possíveis correspondências geram aviso de duplicação. Transferências e faturas explicam seu efeito apenas no caixa. Estornos oferecem seleção de original realizado de direção oposta, mesmo mês e data compatível. Categoria do original prevalece na compensação.

A UI envia `natures` e `edits` apenas das linhas selecionadas. `edits` aceita exclusivamente descrição, categoria e vínculo de estorno; o servidor valida linhas, campos permitidos e dados pelo mesmo domínio dos comandos manuais. Nenhum cliente escolhe `origin`, `ownerId`, valores ou datas a partir de edits. O arquivo é reprocessado e seu hash recalculado no servidor. Lotes são persistidos de uma vez pelo repositório, com revisão e geração já existentes.

Histórico mostra origem e valores confirmados, incluindo descrição corrigida, natureza e categoria. Desfazer/restaurar continua disponível. Linhas descartadas não entram em novos lotes. IDs, hashes e o histórico anterior não foram migrados. Reimportar não serve para editar uma transação já deduplicada; a classificação original é preservada.

## Arquivos

| Arquivo | Alteração e motivo |
|---|---|
| `lib/types.ts` | Vínculo opcional `refundOf`, compatível com registros antigos |
| `lib/finance.ts` | Efeito por natureza, validação de vínculos e separação de caixa/orçamento |
| `lib/commands.ts` | Persistência do vínculo, integridade após mutações e base líquida para cenários de economia |
| `lib/imports.ts` | Contrato de edição permitido, estorno revisado com vínculo obrigatório e validação atômica |
| `lib/education.ts` | Diagnóstico descreve receitas/consumo reconhecidos e pendências |
| `components/import-panel.tsx` | Revisão funcional por linha e envio dos campos efetivamente editados |
| `components/finance-app.tsx` | Rótulos por natureza e exibição distinta de caixa e orçamento |
| `tests/nature-finance.test.ts` | Quatro testes de cenários financeiros e regressão legada |
| `tests/repository.test.ts` | Quatro testes integrados de CSV/TSV/OFX e rejeição de edições maliciosas/inválidas |
| Este documento | Evidências e limites da entrega |

## Validação

- 76 testes anteriores preservados, oito novos: **84 aprovados**, zero falhas.
- TypeScript e lint aprovados. Build final executado antes do commit da interface.
- Audit completo: **sete moderados de desenvolvimento**, zero críticos/altos/baixos; mesmas dependências e exposição documentadas na Tarefa 02. Nenhuma dependência atualizada.
- Cenários financeiros: transferência sem novo consumo; compra/fatura sem duplicação; compra de R$ 200 com estorno de R$ 50 = R$ 150; vínculo inexistente, mês/direção inválidos e excesso cumulativo recusados; estorno pendente sem renda fictícia; legado R$ 300 → R$ 287,66; simuladores anteriores preservados pela suíte.
- Integração com SQLite em memória: natureza/descrição/categoria revisadas, compensação, serialização, nova instância do repositório, exportação, deduplicação, importação parcial, desfazer/restaurar e isolamento entre usuários. Testes anteriores continuam cobrindo limites de arquivo, OFX malformado, erros, concorrência e histórico legado.
- Navegador local: CSV fictício; edição de descrição para Despesa revista e categoria Lazer; seleção de despesa de R$ 12,34 e transferência de R$ 800; resultado R$ 287,66 preservado após recarga; reimportação reconheceu duas duplicadas e incluiu apenas uma fatura de R$ 100 sem novo consumo; desfazer/restaurar lote preservou totais. Nenhum erro/aviso de console coletado nesse ciclo.
- Arquivos de evidência local em `D:\codigos\projeto eng comp2\incremento3-evidencias`, fora do repositório. A captura e os snapshots registram o ciclo visual; não contêm dados reais.

## Limites e próximos passos

Não houve teste de PostgreSQL, Entra ou Azure reais. Nenhuma nova migração é necessária para o agregado JSON. A validação visual foi desktop/CSV; TSV e OFX revisados foram exercitados por testes integrados. Estornos foram exercitados automaticamente no domínio/repositório, sem teste visual dedicado. Não se trata de certificação WCAG; os novos controles possuem labels e bloqueios de confirmação, mas falta auditoria com leitor de tela e telas móveis.

O fluxo antigo de importação sem `natures` continua aceito por compatibilidade, mantendo a contabilização legada. A interface atual sempre usa o contrato revisado. Uma remoção futura desse caminho requer versionamento e tratamento dos clientes antigos. Não foi presumido vínculo bancário, conta financeira normalizada, cartões completos ou autenticação de documentos. Alterar apelidos ou arquivos pode exigir conciliação além da deduplicação exata já existente.

A próxima prioridade técnica é o indicador de comprometimento da renda, reutilizando as métricas por natureza e distinguindo renda ausente de zero. US10/US13, IA real, PDF e evidências OWASP adicionais continuam fora deste incremento.
