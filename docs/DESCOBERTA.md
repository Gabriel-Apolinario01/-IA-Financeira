# Fase 0 — descoberta (29/10/2026)

Arquitetura atual: React 19.2.6, Next 16.3.4 sobre Vinext 1.0.0-beta.5/Vite 8.0.13, TypeScript 5.9.3, Tailwind 4.2.1 e componentes shadcn/Base UI. Worker Cloudflare hospedável pelo Sites; identidade ChatGPT validada no servidor. D1/SQLite, Drizzle 0.45.2; migração inicial versionada. Dados em um agregado JSON por proprietário, escrita atômica condicionada a revisão e geração. Sem RLS: isolamento nas consultas por identidade autenticada. Limite de 2 MB por conta.

Frontend: finance-app e finance-dialog; lançamentos, categorias estáticas, orçamento, metas, dívidas, dashboard e educação. APIs state, command, diagnosis e account. Valores inteiros em centavos, datas civis em São Paulo, cálculos determinísticos. Testes node:test/tsx de finanças, educação e repositório SQLite; sem workflow CI encontrado. IA opcional usa métricas agregadas mediante consentimento e AI_ENABLED, OPENAI_API_KEY, OPENAI_MODEL.

Lacunas: não existem contas financeiras, importações, staging, links, auditoria de alterações financeiras, armazenamento privado de arquivos (R2 nulo), filas, OCR, OAuth bancário/e-mail ou conciliação. Esquema atual não oferece índices/unicidade SQL por lançamento. Importações em escala exigirão normalização e migração aditiva com teste em cópia. README contém conflito textual de merge. Não foi encontrada instrução AGENTS.md no checkout.

Riscos: limite do agregado, runtime beta, fontes ambíguas e duplicação de consumo por transferências/faturas. O anexo termina na seção 7; seção 8.5 não foi fornecida. Nenhuma nova extração enviará documentos à IA. Não há evidência de credenciais, contratos, acesso de publicação ou ambiente de produção validado.

Decisão inicial: preservar stack e modelo existente; entregar uma primeira etapa limitada de CSV/TSV e OFX, com confirmação explícita por linha, identidade por conta, SHA-256 calculado no servidor, origem imutável e histórico. Manter formatos e integrações não implementados visivelmente pendentes. Não alterar banco de produção ou publicar a partir desta cópia sem validar a identidade do Site.

Dependências externas: Open Finance (seleção e contrato de provedor, credenciais, consentimento, webhooks), Gmail (OAuth e verificação de escopos), encaminhamento de e-mail (domínio/serviço), OCR (worker isolado), arquivos (R2 privado/retenção), fila durável e acesso autorizado à Nota Fiscal Paulista. Nenhum destes recursos será anunciado como operacional nesta etapa.
