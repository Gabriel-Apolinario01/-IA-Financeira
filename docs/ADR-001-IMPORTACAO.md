# ADR 001 — primeira etapa de importação, sem migração destrutiva

Data: 29/10/2026. Decisão implementada parcialmente; não equivale à arquitetura-alvo completa.

Preservar D1, autenticação, agregado por usuário e o pipeline de comandos. CSV/TSV e OFX convergem para o mesmo ImportRow e para a coleção transactions já consumida pelo dashboard. Não há banco paralelo. O servidor recalcula o parsing e SHA-256 do texto decodificado em UTF-8: não confia em valores ou hashes enviados pelo cliente. O hash identifica o conteúdo textual, não os bytes originais de arquivos Latin-1. Os registros brutos por linha e as descrições originais ficam no lote, dentro do agregado privado; o arquivo completo não é retido.

Novos campos são opcionais e aditivos no JSON: importBatches e transaction.origin. Não há alteração de tabela nem migração a aplicar. O CAS de revisão/geração mantém lote, auditoria e lançamentos atômicos. A idempotência de comandos permanece no repositório. Hash por fonte impede reimportação de arquivo; FITID é comparado por fonte e apelido da conta, inclusive em lotes desfeitos. O apelido deve ser estável. A próxima fase deve substituir esse apelido por entidade financeira validada, com unicidade SQL e índices.

Normalização: parser usa sinal negativo para saída e positivo para entrada. A representação persistida existente continua em centavos positivos com tipo income/expense. BRL apenas. Datas civis no fuso America/Sao_Paulo; não representam instantes UTC. OFX utiliza o dia civil informado pelo banco, sem inventar hora de lançamento ou competência. CSV exige escolha explícita de locale para não presumir um formato ambíguo.

Toda linha começa desmarcada. Correspondências de valor, tipo e janela de três dias são avisos conservadores, inclusive quando a conta ainda é desconhecida; não são prova de duplicidade. Somente FITID exato é ignorado automaticamente. Edição/exclusão individual de registros importados é bloqueada para preservar origem. Desfazer/restaurar lote é reversível e auditado; registros históricos não desaparecem. O usuário pode exportar o agregado e excluir a conta pelas funções existentes.

Limites deliberados desta etapa: 100 KB/arquivo, 300 linhas/lote, 100 lotes, teto agregado existente de 2 MB. Processamento síncrono; sem jobs, OCR ou armazenamento de grandes documentos. Não há garantia de escala comercial. A validação MIME local complementa a validação de estrutura e conteúdo feita no servidor, que recebe texto JSON, não upload binário multipart.

Parcelas e faturas: a política-alvo é reconhecer cada parcela no mês da fatura; total da compra é somente metadado; pagamento da fatura e transferências próprias não são consumo. A aplicação ainda não implementa essas relações. A prévia orienta excluir essas linhas. Não se deve importar automaticamente uma fatura como extrato genérico sem revisão.

Recuperação: exportar dados antes de atualizar versão; validar numa cópia D1. Uma reversão de código para versão antiga não deve receber novas escritas, pois versões antigas podem descartar os campos de origem ao editar registros. Recuperar o backup integral do agregado se necessário; nunca executar DROP ou reescrever dados de produção nesta etapa.
