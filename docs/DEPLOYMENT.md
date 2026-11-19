# Publicação no Azure — acesso por e-mail

## Dependências externas

1. App Service Linux/Node.js 24 existente, plano com cota disponível.
2. PostgreSQL provisionado e acessível pelo App Service. Não abra acesso irrestrito de IP. Use rede privada quando disponível ou restrinja firewall aos endereços de saída necessários.
3. Segredo aleatório de sessão, com pelo menos 32 caracteres, guardado nas configurações privadas do App Service ou no Key Vault.
4. Para IA: projeto OpenAI, chave restrita a esse projeto, modelo com Responses API e saída JSON Schema estrita, orçamento e alertas definidos no provedor.

Provisionar banco, aumentar plano e usar OpenAI pode gerar cobrança. A escolha de região/plano depende da assinatura e das cotas reais; este arquivo não declara que os recursos já foram criados.

## Variáveis privadas do App Service

| Variável | Valor |
| --- | --- |
| AZURE_AUTH_MODE | `email` |
| BETTER_AUTH_URL | Origem HTTPS exata do site, sem barra final |
| BETTER_AUTH_SECRET | Segredo aleatório, não reutilizar o de desenvolvimento |
| AZURE_POSTGRES_CONNECTION_STRING | URL PostgreSQL privada, sem parâmetros SSL; percent-encode na senha |
| AZURE_POSTGRES_SSL | `true` |
| AZURE_POSTGRES_POOL_SIZE | `5` (mínimo 2, máximo 20) |
| AI_ENABLED | `true` após configurar e validar o provedor |
| OPENAI_API_KEY | Chave privada do projeto OpenAI |
| OPENAI_MODEL | Identificador de modelo disponível nesse projeto e compatível com JSON Schema |
| AI_GLOBAL_DAILY_LIMIT | `200` inicialmente; 20 chamadas diárias por conta no código |
| SCM_DO_BUILD_DURING_DEPLOYMENT | `false`, pois o artefato já contém build e dependências |

Alternativa de banco sem senha: em vez da URL, usar `AZURE_POSTGRES_HOST`, `AZURE_POSTGRES_DATABASE`, `AZURE_POSTGRES_USER` e identidade gerenciada do App Service com acesso no PostgreSQL. O script original usa `DefaultAzureCredential`. A existência dessas variáveis não concede privilégios no servidor; o administrador precisa provisioná-los.

Use `npm start` como comando de inicialização. O script aplica migrações aditivas protegidas por advisory lock e inicia o Next.js. O usuário do banco precisa de permissão para essas migrações; em ambientes mais restritos, execute `npm run db:prepare` com credencial de migração antes de iniciar com a identidade de execução. O script atual sempre verifica/aplica o schema na inicialização, portanto valide essa permissão antes de trocar a identidade.

No modo e-mail, o portal não deve exigir login Microsoft antes de carregar a página de cadastro. Se Easy Auth estiver habilitado, permita visitantes anônimos na camada de plataforma; as rotas financeiras continuam exigindo sessão Better Auth no servidor. Isso deve ser avaliado no recurso correto antes de qualquer mudança de configuração.

## Validação após a publicação

1. `/api/health` deve retornar HTTP 200, `database: true`, `authentication: true`. `aiConfigured: true` indica presença de configuração, não uma chamada bem-sucedida.
2. Cadastre uma conta de teste e registre um lançamento. Saia, entre novamente e confirme persistência.
3. Em outra sessão, cadastre uma segunda conta. Ela deve iniciar vazia e não conseguir acessar os registros da primeira.
4. Habilite consentimento de IA e solicite explicação sobre orçamento ou reserva. Confirme o indicador de organização com IA, não apenas análise por regras.
5. Verifique logout, exportação e exclusão usando exclusivamente dados sintéticos. A exclusão mantém o cadastro de acesso.
6. Registre URL, commit, data, status e capturas sem chaves, cookies ou dados pessoais. Não declare testes online aprovados apenas com testes locais.

## Falhas úteis

- HTTP 403 `This web app is stopped`: conferir estado/cota do App Service. Um erro na hospedagem não é resolvido alterando o React.
- Banco indisponível: revisar firewall, TLS, URL, permissões e logs sanitizados.
- Login indisponível: verificar schema, segredo de sessão e origem pública exata. Não mudar o segredo a cada reinicialização, pois isso invalida sessões.
- HTTP 403 em uma gravação: origem enviada deve coincidir com `BETTER_AUTH_URL`; use uma URL canônica.
- IA por regras: conferir consentimento, `AI_ENABLED`, chave/modelo/faturamento, limite de uso e resposta do provedor. A aplicação rejeita saída inválida e preserva as regras.

## Limites operacionais

O limitador de autenticação usa cotas globais e por e-mail anonimizado para não confiar em cabeçalhos de IP enviados pelo cliente. Isso é adequado para a demonstração acadêmica, mas pode negar temporariamente acesso a outros usuários sob ataque. WAF, política de recuperação/verificação de e-mail, backups com teste de restauração e monitoramento precisam ser configurados no ambiente de produção; não são garantidos pelo repositório.

## Groq

No ambiente privado do servidor, use `AI_PROVIDER=groq`, `GROQ_MODEL=openai/gpt-oss-20b`, `GROQ_API_KEY` e `AI_ENABLED=true`. A integração usa Chat Completions com JSON Schema estrito. A autorização anterior para a OpenAI não habilita o envio à Groq. O usuário pode ativar a opção correspondente em Configurações.
