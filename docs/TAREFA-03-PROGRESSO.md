# Tarefa 03 — registro incremental

Base confirmada: `49e5688`, branch `fix/seguranca-dependencias-ci`, árvore limpa. Nova branch: `feat/importacao-inteligente-financeira`. A main e a Tarefa 02 foram preservadas. Sem push, merge, deploy, migração ou acesso a dados reais.

## Entrega inicial: A.1–A.3

| Requisito | Problema | Implementação | Arquivos |
|---|---|---|---|
| A.1 / IMP-01 | Retenção de conteúdo descartado | Novos lotes contêm somente linhas efetivamente importadas, com campos explícitos e sem `raw`. Contagens de ignorados/erros permanecem, sem seus detalhes financeiros | `lib/imports.ts` |
| A.1 / compatibilidade | Histórico antigo expõe linhas rejeitadas | Histórico filtra linhas pela origem das transações do lote. Não modifica nem apaga registros antigos | `lib/imports.ts`, `components/import-panel.tsx` |
| A.2 / IMP-02 | Hash do arquivo bloqueia importações parciais | Hash continua identificando o arquivo; lote é identificado pelo comando; transações são identificadas por conta, formato, hash e linha. Linhas já utilizadas são deduplicadas, permitindo incluir as demais | `lib/imports.ts` |
| A.3 / IMP-03 | Mesmo arquivo colide entre contas financeiras | IDs e verificação de linhas passam a considerar o apelido exato da conta. FITID continua restrito à conta/formato | `lib/imports.ts` |

Lotes desfeitos continuam reservando suas linhas: para recuperá-las, restaure o lote original. Isso evita recriar uma linha e duplicá-la depois ao restaurar. Linhas de um lote parcial diferente podem ser adicionadas normalmente.

Não existe migração destrutiva: transações antigas conservam IDs e proveniência. O filtro de histórico é apenas de apresentação; dados antigos não selecionados continuam presentes no estado legado e na exportação JSON até uma futura política explícita de minimização. Novos lotes não os armazenam.

Contas ainda são identificadas pelo apelido exato fornecido pelo usuário. Trocar apelido não equivale a renomear uma entidade financeira persistida; é necessário manter o mesmo apelido. A deduplicação CSV por hash/linha não pretende reconhecer a mesma movimentação em arquivos diferentes com conteúdo reordenado ou modificado. FITID OFX e os alertas de similaridade existentes continuam ativos. Essas limitações devem ser abordadas na conciliação posterior.

## Validação

Quatro novos testes em `tests/imports.test.ts` verificam:

- Privacidade dos campos persistidos, importação parcial após serialização/recarga do estado, deduplicação e desfazer/restaurar.
- Mesmo arquivo em duas contas financeiras com IDs distintos e desfazimento independente.
- Compatibilidade com histórico legado sem alteração dos dados antigos.
- Reserva de linhas em lotes desfeitos e inclusão de linhas restantes.

Os 59 testes anteriores permanecem aprovados: total de 63, zero falhas. A suíte anterior cobre CSV/TSV/OFX, centavos, negativos, entradas inválidas, persistência do repositório, isolamento entre usuários, concorrência e cálculos financeiros. Lint e TypeScript aprovados. Build e audit registrados nos logs locais em `D:\codigos\projeto eng comp2\tarefa03-evidencias`.

Serialização/recarga é exercitada nos testes de domínio; não foi feita validação visual de upload e recarga no navegador nesta entrega. Não declarar a Etapa A inteira concluída.

## Situação do escopo

- Implementados e testados neste incremento: A.1–A.3, com as limitações de compatibilidade acima.
- Parcial: Etapa A. A classificação ainda usa o sinal do valor, e a prévia ainda não permite editar descrição/categoria/natureza.
- Pendentes: A.4–A.6 completos, B (comprometimento da renda), C (apostas e comparativo), D (melhorias da IA) e novas evidências E (OWASP).
- PDF/OCR, modelos pagos e chamadas reais não foram implementados ou executados.
- Não houve bloqueio de acesso à branch. As pendências são trabalho de implementação, não dependências externas comprovadamente bloqueantes.

## Próxima tarefa

Concluir A.4/A.5 com revisão explícita de natureza e categoria, contratos validados pelo servidor e vínculo verificável para estornos. Transferências e pagamentos de fatura precisam ficar fora do consumo, enquanto movimentos ambíguos devem impedir confirmação até revisão. Cobrir orçamento, desfazimento e recarga em testes antes de avançar ao dashboard. Até isso existir, continua necessário excluir manualmente essas movimentações da seleção, conforme o aviso atual da interface.
