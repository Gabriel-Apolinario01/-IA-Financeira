# Incremento 2B — validação de natureza

Base: `e9ab688`, branch `feat/importacao-inteligente-financeira`.

`lib/transaction-nature.ts` valida em runtime os seis valores de `TransactionNature`. Valores desconhecidos, null, undefined explícito, números, booleanos, arrays e objetos são recusados com mensagem fixa, sem repetir a entrada recebida.

`transaction.save` em `lib/commands.ts` preserva a natureza válida. Ao atualizar um registro, a omissão do campo mantém o valor anterior. Registros legados continuam sem a propriedade; nenhuma classificação é inferida ou gravada. Os demais campos continuam sendo projetados explicitamente, sem copiar propriedades internas como `origin` ou `ownerId`.

O caminho de produção é `/api/command` → `FinanceRepository.execute` → `executeFinanceCommand` → `applyCommand`. Erros de validação são convertidos pelo repositório em `RepositoryError` 400 e não avançam a revisão persistida. Não há endpoint novo nem mudança no schema SQL.

## Contrato opcional de importação revisada

Um comando `import.commit` pode enviar `payload.natures`, objeto que associa o número de cada linha selecionada à sua natureza, por exemplo `{"2":"expense","3":"transfer"}`. Todas as linhas selecionadas devem ter uma natureza válida, sem linhas adicionais. `unidentified` exige revisão e não pode ser confirmado nesse contrato. O campo é validado no servidor e preservado nas transações e no lote.

O campo `natures` é opcional para compatibilidade com o importador anterior, cuja classificação por sinal ainda não foi alterada. A interface atual não envia esse contrato novo. Esta entrega não implementa revisão humana na interface nem certifica que ela ocorreu; apenas valida a classificação declarada pelo cliente. A permissão de gravação continua exigindo autenticação, mesma origem e comando válido.

## Limites

- Os totais ainda usam `type`, como antes. `nature` é metadado validado; transferências/faturas/estornos ainda não têm contabilização específica.
- `unidentified` é um valor válido no modelo e nos comandos manuais; é recusado no novo contrato de importação revisada.
- Vínculo de estorno, coerência entre natureza e direção de caixa, cálculos e revisão visual pertencem aos próximos incrementos.
- Não houve alteração de dashboard, simulador, LLM, autenticação, interface ou banco de produção.

## Testes

Dez testes adicionais em `tests/repository.test.ts` exercitam a fronteira utilizada pelo servidor com SQLite em memória: seis naturezas válidas; entradas inválidas sem alteração da revisão; atualização por cliente antigo e reclassificação explícita; projeção segura de campos internos/isolamento; e validação de importação revisada com persistência, exportação e rejeição de não identificado.

Resultado: 76 testes aprovados (66 anteriores + 10 novos), TypeScript, lint e build aprovados. A validação de persistência é local e não representa teste de PostgreSQL ou Entra em produção.
