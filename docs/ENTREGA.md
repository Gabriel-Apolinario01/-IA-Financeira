# Entrega parcial — centralização financeira

## Implementado e verificado no núcleo

- Descoberta do projeto, decisões e lacunas registradas antes da implementação.
- CSV/TSV e subconjunto OFX SGML/XML de uma conta em BRL; parsing limitado e validação por linha; upload, prévia e confirmação explícita na tela Lançamentos.
- Mesma coleção de transações e mesmos cálculos do dashboard. Sem alteração destrutiva do banco.
- Hash calculado no servidor, deduplicação de arquivo/FITID, origem por linha, histórico, desfazer/restaurar lote, controle de concorrência e isolamento por identidade.
- README sem os marcadores de conflito existentes no repositório.

Status: **Operacional nos testes do núcleo**. Interface implementada, mas **pendente de validação integrada**. Nenhuma publicação ou envio ao GitHub foi realizado.

## Verificação executada

56 testes passaram (finanças, educação, repositório SQLite e importação), com dados sintéticos. Incluem centavos, datas inválidas, CSV malformado, OFX, duplicação, reversão, hash forjado, isolamento e concorrência. Executados no Node 24.22.1 após transpilar TypeScript com TypeScript 5.9.3, preservando a lógica dos testes e substituindo somente caminhos de módulos no diretório temporário. A dependência decimal.js 10.6.0 foi obtida do registro npm.

Checagem estrita de tipos de imports/commands/types/finance: zero diagnósticos. Não é a checagem integral do frontend.

Instalação completa bloqueada: pnpm falhou em realpath com EPERM; npm ci encontrou entradas @emnapi ausentes no lockfile para a resolução desta plataforma; npm install falhou com EPERM ao criar subdiretórios. O lockfile original foi preservado. Build, typecheck integral, teste HTTP e QA visual não foram concluídos. Não declarar a versão pronta para produção.

## Escopo ainda pendente

| Requisito | Status e motivo |
|---|---|
| Normalização SQL, índices e unicidade por transação | Pendente de implementação/migração em cópia; mantém agregado limitado a 2 MB |
| Conta financeira persistida e adaptadores extensíveis | Pendente de implementação; hoje conta usa apelido fornecido pelo usuário |
| Estados completos e auditoria de todas as operações | Pendente de implementação; auditoria cobre lotes desta etapa |
| Revisão editável, categorias e templates salvos | Pendente de implementação; linhas são selecionadas/excluídas e entram em Outros |
| Links, similaridade explicável e conciliação entre fontes | Pendente de implementação; há apenas alerta conservador e deduplicação exata |
| Transferências, faturas, parcelas, estornos e pendente→confirmada | Pendente de implementação; linhas especiais devem ser excluídas da prévia |
| Open Finance | Pendente de implementação/configuração, contrato e validação real |
| PDF, OCR, imagens, XML fiscal, XLSX | Pendente de implementação; arquivos não suportados são rejeitados |
| Filas, backoff, dead-letter, R2 e retenção | Pendente de implementação/configuração |
| Gmail, encaminhamento e .eml | Pendente de implementação/configuração e verificação OAuth quando aplicável |
| NFP automática | Pendente de acesso autorizado comprovado; não foi presumida API pública |
| Entrada em linguagem natural e recorrência | Pendente de implementação; cadastro manual existente preservado |
| Gate adicional de IA da seção 8.5 | Pendente do texto ausente no anexo; nenhuma nova chamada de extração externa |

Este conjunto é uma primeira etapa revisável, não a conclusão de todo o Prompt Mestre.
