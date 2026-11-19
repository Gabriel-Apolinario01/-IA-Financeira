# IA Financeira

Aplicação Next.js para lançamentos financeiros, orçamento, metas, dívidas e educação. Aceita extratos CSV, TSV e OFX, fotos e PDFs de documentos brasileiros. A aba Aprender reúne guias, simuladores e chat educativo. [Relatório da entrega e evidências](docs/PROGRESSO-FINAL.md)

## Executar com cadastro, login e banco real local

Requisitos: Node.js 24 e npm. Na primeira execução, a instalação baixa os binários PostgreSQL de teste da dependência `embedded-postgres`.

```sh
npm ci
npm run dev:local
```

Abra **http://localhost:5174/login**, escolha **Ainda não tenho conta — cadastrar** e crie uma conta. Este modo usa PostgreSQL real, acessível somente por loopback. Dados e credenciais locais ficam em `.local-postgres/`, ignorada pelo Git. Não use contas ou dados financeiros reais nos testes. `Ctrl+C` encerra o servidor e o banco; a próxima execução preserva os dados locais.

`npm run dev` inicia apenas o Next.js: nesse caso configure o banco e a autenticação em `.env.local`, conforme `.env.example`, e execute `npm run db:prepare` antes. Para testar a compilação otimizada local: `npm run build` e `node --env-file-if-exists=.env.local scripts/local-dev.mjs --production`.

## Autenticação e dados

- `AZURE_AUTH_MODE=email`: Better Auth com e-mail/senha, hash de senha da biblioteca, sessão no PostgreSQL e cookie HttpOnly/SameSite. HTTPS fora de localhost, cookie Secure em HTTPS, sessão de sete dias e revogação no logout.
- Cada espaço financeiro pertence ao identificador da sessão. Identificadores recebidos no corpo da requisição não concedem acesso a outro usuário.
- Revisões condicionais, geração do espaço e recibos de comandos protegem contra conflitos e duplicação de envios.
- Consultas SQL usam parâmetros. Conexões remotas exigem TLS com validação do certificado.
- Nome/e-mail cadastrado não significa e-mail verificado. Verificação, recuperação por e-mail e MFA não estão implementados; exigem uma decisão e serviço de entrega adicionais. A interface informa a ausência de recuperação ao cadastrar.
- A exclusão disponível nas configurações remove somente o perfil financeiro e seus registros; mantém o cadastro de acesso, conforme informado na interface.
- O modo legado `app-service` mantém Microsoft Entra/Easy Auth. Ele não habilita o cadastro por e-mail.
- `AZURE_AUTH_MODE=preview` disponibiliza apenas demonstração. Não permite acesso anônimo ao banco das contas.

## Inteligência artificial

O diagnóstico organiza trechos educativos revisados e admite OpenAI ou Groq. O chat em **Aprender → Chat financeiro** gera parágrafos livres com a Groq quando há configuração e autorização. Cada pergunta tem até 600 caracteres. A interface apresenta as métricas calculadas pelo aplicativo e identifica respostas educativas locais. O histórico recente e as métricas têm autorizações próprias. A seção de documentos em **Lançamentos** funciona por OCR em português mesmo com todas as integrações externas desligadas.

Em `.env.local` ou nas variáveis privadas do App Service:

```dotenv
AI_ENABLED=true
AI_PROVIDER=groq
GROQ_API_KEY=<chave privada>
GROQ_MODEL=openai/gpt-oss-20b
AI_GLOBAL_DAILY_LIMIT=200
```

Depois, na conta, habilite o consentimento em **Configurações** e solicite uma explicação em **Aprender**. Sem chave, consentimento ou resposta válida, a interface informa que está usando análise por regras. Os limites de chamadas ao provedor são 20 por conta por dia e 200 globais por dia por padrão, com janelas UTC; a API de diagnóstico também limita dez pedidos por minuto. O teto global é configurável de 1 a 10.000; nenhuma dessas cotas substitui o orçamento do projeto no provedor.

`npm run verify:ai` realiza **uma chamada real, potencialmente cobrada**, com dados sintéticos. Sucesso exige resposta aceita pelos controles. Os testes automatizados comuns usam respostas simuladas e não comprovam disponibilidade do provedor em produção.

## Azure

Siga [o roteiro de publicação](docs/DEPLOYMENT.md). Login online requer PostgreSQL, URL pública e segredo de sessão configurados no App Service. A IA também requer chave, modelo e faturamento disponíveis no provedor. A existência de código ou um build bem-sucedido não comprova essas configurações.

O workflow testa pull requests. A publicação exige disparo manual na `main` com a opção de produção selecionada e todas as verificações aprovadas. Usa `npm ci`, ações fixadas por commit e auditoria das dependências de produção. As chaves pertencem ao ambiente privado do servidor.

## Verificação

```sh
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run build
npm audit --omit=dev --audit-level=high
```

Os testes de integração iniciam PostgreSQL na porta local 55439, criam contas sintéticas e verificam senha, sessão, isolamento entre contas, CSRF, gravação, exclusão e logout. O processo encerra o banco; as pastas ignoradas em `.test-data/` são mantidas porque o Windows pode bloquear a remoção imediata. As dependências e binários de teste não são serviços de produção.

Controles e limites das nove categorias estão em [OWASP LLM 2026](docs/OWASP-LLM-2026.md). Trata-se de implementação e evidências de teste do projeto, sem certificação OWASP ou promessa de ausência de vulnerabilidades.

## Groq

No ambiente privado do servidor, use `AI_PROVIDER=groq`, `GROQ_MODEL=openai/gpt-oss-20b`, `GROQ_API_KEY` e `AI_ENABLED=true`. A integração usa Chat Completions com JSON Schema estrito. A autorização anterior para a OpenAI não habilita o envio à Groq. O usuário pode ativar a opção correspondente em Configurações.
