# Nove categorias OWASP para aplicações LLM — edição 2026

Classificação consultada em 17/11/2026 na [página oficial](https://genai.owasp.org/resource/owasp-genai-llm-top-10-2026/) e no [PDF oficial, sumário da página 3](https://genai.owasp.org/download/56857/?tmstv=1785822482). O PDF contém campos editoriais de data ainda não preenchidos; a classificação usada aqui é a que ele identifica como Version 2026. Códigos não devem ser substituídos pelos da edição 2025.

A distribuição abaixo é responsabilidade proposta para estudo, acompanhamento e validação acadêmica. Não é uma afirmação de autoria individual das alterações.

| Responsável | Categorias oficiais |
| --- | --- |
| Gabriel da Silva Apolinario | LLM01:2026 Prompt Injection; LLM03:2026 Excessive Agency; LLM08:2026 Hidden Context Exposure |
| Felipe Yuji Naraki | LLM02:2026 Sensitive Information Disclosure; LLM07:2026 Misinformation; LLM10:2026 Improper Output Handling |
| Leonardo Moreno Zani Ramos | LLM04:2026 Supply Chain; LLM05:2026 Data and Model Poisoning; LLM06:2026 Unbounded Consumption |

LLM09:2026 Vector and Embedding Weaknesses fica fora das nove selecionadas porque esta versão não usa embeddings ou banco vetorial. A recuperação educativa é local, por palavras-chave em corpus versionado.

## LLM01:2026 — Prompt Injection

Responsável: Gabriel. Risco: instruções não confiáveis alterarem o comportamento esperado do modelo. Cenário: uma pergunta ou descrição financeira tenta induzir exclusão de dados, exposição de contexto ou resposta fraudulenta.

Controle no projeto: a pergunta bruta, descrições e nomes não são enviados. A recuperação local escolhe até três itens conhecidos; o modelo recebe métricas agregadas e resumos revisados. Mesmo uma instrução que passe pelo filtro de palavras não recebe acesso a ferramentas. IDs fora da lista recuperada são recusados no servidor. O filtro lexical sozinho não é tratado como defesa suficiente.

Componentes: `lib/education.ts`, `lib/explanations.ts`, `app/api/diagnosis/route.ts`. Validação: entradas com instruções e marcação maliciosa; verificar o corpo enviado ao provedor e a ausência de efeitos no estado. Evidência: testes `LLM01/02/03/08` e testes de educação, com resposta simulada. Situação: controles implementados e testáveis; resistência universal do modelo não alegada.

## LLM02:2026 — Sensitive Information Disclosure

Responsável: Felipe. Risco: divulgação de informações privadas. Cenário: dados de outro usuário, credenciais ou descrições dos lançamentos chegam ao provedor ou à resposta.

Controle: identidade obtida da sessão e dados consultados por proprietário; consentimento explícito por conta; envio de seis totais em centavos e indicação de incompletude; `store:false`; segredos somente no servidor; respostas de erro genéricas. Os totais continuam sendo informação financeira, motivo pelo qual o consentimento informa seu envio. A aplicação não promete ausência de retenção operacional no provedor apenas por usar `store:false`.

Componentes: `lib/auth.ts`, `app/api/_shared.ts`, `lib/repository.ts`, `lib/explanations.ts`. Validação: duas contas isoladas, cookie adulterado, ausência de consentimento e inspeção do payload. Evidência: integração PostgreSQL e testes de IA. Situação: implementado no aplicativo; contrato, retenção, rede e acesso administrativo do provedor dependem da configuração externa.

## LLM03:2026 — Excessive Agency

Responsável: Gabriel. Risco: autonomia ou permissões excessivas concedidas ao modelo. Cenário: uma resposta tenta criar lançamentos, executar SQL, transferir dinheiro ou chamar ferramentas.

Controle: nenhuma ferramenta é registrada na chamada OpenAI. A resposta apenas seleciona textos e métricas já conhecidos. O código de IA não executa comandos do repositório. A exposição automática do resumo financeiro via WebMCP foi removida da interface; o hook legado permanece sem uso. Alterações financeiras dependem das APIs autenticadas e dos comandos explícitos da interface.

Componentes: `lib/explanations.ts`, `components/finance-app.tsx`, `app/api/command/route.ts`. Validação: verificar ausência de `tools` no payload e igualdade do estado antes/depois de resposta adversarial. Evidência: teste `LLM01/02/03/08`. Situação: implementado; não há agente financeiro autônomo.

## LLM04:2026 — Supply Chain

Responsável: Leonardo. Risco: dependências, artefatos ou serviços externos comprometidos. Cenário: pacote vulnerável ou atualização inesperada do pipeline altera o sistema.

Controle: lockfile versionado e `npm ci`; ações GitHub fixadas por SHA; `npm audit --omit=dev --audit-level=high` no pipeline; Next.js e dependências vulneráveis atualizados; segredos e bancos locais excluídos do artefato de deploy; endpoint do provedor fixo e redirecionamentos recusados.

Componentes: `package.json`, `package-lock.json`, `.github/workflows/main_iafinanceira.yml`, `lib/explanations.ts`. Validação: instalação pelo lockfile, auditoria, build e testes após atualizações. Evidência: saída datada do audit e execução CI associada ao commit. Situação: controles implementados; auditoria sem alertas conhecidos não prova ausência de dependências maliciosas. O modelo externo não é auditável integralmente pelo grupo; configurar um identificador de versão fixa quando disponível e revalidar ao trocá-lo.

## LLM05:2026 — Data and Model Poisoning

Responsável: Leonardo. Risco: dados ou artefatos adulterados contaminarem as respostas. Cenário: texto importado por usuário é incorporado à base educativa ou altera referências usadas pela IA.

Controle: corpus local versionado, sem ingestão de uploads, páginas externas ou dados de usuários na base educativa. Objetos, lista e palavras-chave são congelados em execução. URLs exibidas são as do corpus; o provedor não pode introduzir uma nova fonte. Arquivos CSV/OFX continuam sendo dados financeiros, sem alimentar treinamento ou a base de conhecimentos.

Componentes: `lib/education.ts`, `lib/imports.ts`, `lib/explanations.ts`. Validação: tentativa de modificar corpus em memória e seleção de fonte inexistente. Evidência: testes `LLM05` e de referências inválidas. Situação: proteção local implementada; revisão editorial contínua e segurança do treinamento do fornecedor são limites externos. Congelamento não impede um mantenedor autorizado de alterar o código.

## LLM06:2026 — Unbounded Consumption

Responsável: Leonardo. Risco: consumo descontrolado de recursos ou orçamento. Cenário: solicitações repetidas, respostas enormes ou um provedor que mantém a conexão aberta.

Controle: diagnóstico autenticado, corpo de 4.096 bytes, pergunta de até 600 caracteres, dez diagnósticos/minuto por usuário, 20 chamadas ao provedor/dia por conta, orçamento global padrão de 200 chamadas/dia, reserva de cota antes da rede, 400 tokens máximos de saída, 12 segundos de prazo, limite de 64.000 bytes lido durante o streaming e sem retentativa automática. Cotas persistem em PostgreSQL e não são apagadas pela exclusão dos dados financeiros.

Componentes: `app/api/diagnosis/route.ts`, `lib/repository.ts`, `lib/bounded-response.ts`, `lib/explanations.ts`. Validação: estouro do limite, stream grande, stream interrompido, cota esgotada impedindo chamada. Evidência: testes `LLM06`, rate limit do repositório e integração PostgreSQL. Situação: implementado; limites em janelas fixas permitem rajadas nas fronteiras. WAF, orçamento em moeda, alertas e limites do projeto OpenAI ainda precisam ser configurados.

## LLM07:2026 — Misinformation

Responsável: Felipe. Risco: informação incorreta apresentada como confiável. Cenário: modelo inventa saldo, previsão ou recomendação financeira.

Controle: cálculos em centavos feitos pelo aplicativo; texto educativo e fontes mantidos localmente; seleção de métricas restrita a seis chaves; demonstração explicitamente fictícia; resultado por regras identificado quando a IA falha ou não é usada. Não há recomendação de ativo ou operação financeira baseada em geração livre.

Componentes: `lib/finance.ts`, `lib/education.ts`, `lib/explanations.ts`, `components/finance-app.tsx`. Validação: resposta com métrica inventada e comparação dos resultados financeiros determinísticos. Evidência: testes financeiros e `LLM07/10`. Situação: implementado dentro do escopo educativo; a seleção entre textos permitidos ainda pode ser pouco relevante e o corpus requer revisão humana.

## LLM08:2026 — Hidden Context Exposure

Responsável: Gabriel. Risco: exposição de contexto interno não destinado ao usuário. Cenário: resposta inclui instruções internas, credenciais, histórico ou dados de outra sessão.

Controle: nenhuma credencial ou identificador de usuário é interpolado nas instruções ou no conteúdo enviado; a chave vai apenas no cabeçalho HTTPS do provedor fixo. A saída bruta nunca é exibida: somente IDs válidos resolvidos em textos locais. Não há histórico de conversa ou memória compartilhada entre usuários na integração.

Componentes: `lib/explanations.ts`, `app/api/_shared.ts`. Validação: inserir marcadores privados no estado e tentar retorná-los como texto extra. Evidência: testes `LLM01/02/03/08` e `LLM07/10`. Situação: implementado; o prompt não é considerado segredo nem substituto de autorização.

## LLM10:2026 — Improper Output Handling

Responsável: Felipe. Risco: saída do modelo interpretada como código, comando ou dado confiável sem validação. Cenário: resposta contendo HTML, URL externa, campo de comando ou ID inexistente.

Controle: JSON Schema estrito no provedor e validação independente no servidor, que rejeita propriedades adicionais, quantidades inválidas, IDs não recuperados e chaves não permitidas. Texto/links vêm exclusivamente do corpus; não são executados HTML, JavaScript, SQL ou comandos produzidos pelo modelo. Erros, resposta incompleta ou JSON inválido retornam à análise por regras.

Componentes: `lib/explanations.ts`, `lib/bounded-response.ts`, `components/finance-app.tsx`. Validação: respostas com script, URL externa, campo extra, JSON malformado e conteúdo acima do limite. Evidência: testes `LLM07/10`, `LLM06` e testes de educação. Situação: implementado e testado com provedor simulado; uma chamada real precisa ser validada após configurar o serviço.

## Evidências e limites de interpretação

Execute `npm test` e `npm run test:integration`; preserve a saída e o commit. Execute `npm run verify:ai` somente quando houver credenciais privadas e orçamento, pois faz uma chamada cobrada com dados sintéticos. Registre separadamente testes locais, CI e validação no site publicado. Não atribua a um integrante atividades que ele ainda não realizou, nem apresente nove controles como certificação ou correção definitiva das nove categorias.
