# ADR 002 — integrações externas pendentes

Consulta documental em 29/10/2026. Nenhum provedor foi contratado, chamado com dados reais ou certificado por esta revisão.

## Open Finance: comparação preliminar

| Critério | Pluggy | Belvo |
|---|---|---|
| Consentimento oficial | Connect Widget e fluxo regulado documentados | Hosted Widget para Open Finance Brasil documentado |
| Webhooks | Eventos de atualização e mecanismos de entrega documentados | Agregação assíncrona e notificações documentadas |
| Incremental | Validar cursores, paginação e atualização no sandbox contratado | Validar paginação/filtros e eventos no sandbox contratado |
| Cobertura | Conferir instituições e produtos do contrato | Conferir instituições e produtos do contrato |
| Segurança/certificações | Exigir evidências vigentes; não verificadas aqui | Exigir evidências vigentes; não verificadas aqui |
| SLA, custos e suporte | Cotação e contrato pendentes | Cotação e contrato pendentes |
| Adequação regulatória ao negócio | Análise contratual/jurídica pendente | Análise contratual/jurídica pendente |

Fontes primárias: [Pluggy: criação de conexão regulada](https://v1.docs.pluggy.ai/docs/creating-an-item), [Pluggy: webhooks](https://docs.pluggy.ai/en/reference/webhooks), [Belvo: integração Brasil](https://developers.belvo.com/products/aggregation_brazil/aggregation-brazil-integration-widget), [Belvo: webhooks de agregação](https://developers.belvo.com/developer_resources/resources-webhooks-aggregation).

Decisão: seleção final pendente de cotação, cobertura e validação. Sem endpoints simulados em produção. A interface marca Open Finance como pendente. Adaptador remoto, tokens criptografados, validação de webhook, filas e revogação ainda precisam ser implementados, não apenas configurados.

## Nota Fiscal Paulista

O [guia oficial de consulta de documentos fiscais](https://portal.fazenda.sp.gov.br/servicos/nfp/Paginas/Guia-Consulta-Documentos-Fiscais.aspx) documenta consulta pelo consumidor, com conta gov.br prata/ouro ou certificado digital. A página consultada não estabelece uma API de acesso por este aplicativo a documentos de terceiros. Isso não prova inexistência de todos os meios possíveis: acesso autorizado continua pendente de confirmação formal. Não implementar login automatizado nem solicitar credenciais. Importação manual de XML, fotos/PDF e QR/chave é alternativa planejada, ainda não implementada nesta etapa.

## Gmail

Conforme a [documentação oficial de escopos](https://developers.google.com/workspace/gmail/api/auth/scopes), gmail.readonly é restrito; requer verificação, e armazenar ou transmitir dados de escopos restritos em servidor pode exigir avaliação de segurança. Configurar OAuth com PKCE, filtros mínimos e revogação antes da habilitação. Upload .eml e encaminhamento dedicado são alternativas planejadas de menor acesso. Nenhuma dessas três opções foi implementada nesta entrega.

## IA

Não adicionar extração por IA externa. O anexo não contém a seção 8.5 citada. A integração educativa preexistente foi preservada: somente agregados com consentimento e configuração. Não foram enviados arquivos ou dados financeiros reais a provedores.
