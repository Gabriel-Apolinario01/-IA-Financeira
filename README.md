# IA Financeira Azure

Cópia preparada para executar como aplicação Node.js no Azure. A demonstração usa valores fictícios e continua disponível sem login. Contas autenticadas usam Microsoft Entra ID no Azure App Service e Azure Database for PostgreSQL Flexible Server.

## Ver a demonstração neste computador

Requer Node.js 22.13 ou superior e npm.

```powershell
npm ci
npm run dev
```

Abra `http://127.0.0.1:5174/`. Os botões **Entrar** e **Começar** levam à tela de login. O acesso Microsoft depende do Entra configurado no Azure; o botão Google informa que essa integração ainda não foi configurada. Na prévia, continuar com e-mail abre uma tela ilustrativa para criar senha, mas nenhum valor de senha é salvo ou enviado. Use **Acessar demonstração** para explorar os recursos com dados fictícios, salvos somente neste navegador. A demonstração local não conecta ao banco Azure.

Para encerrar, pressione Ctrl+C no terminal.

## Arquitetura Azure

- **Azure App Service para Linux**, runtime Node.js 24, executando Next.js no servidor.
- **App Service Authentication (Easy Auth)** com Microsoft Entra ID. O site e a demonstração podem aceitar visitantes anônimos; as APIs financeiras exigem identidade Entra.
- **Azure Database for PostgreSQL Flexible Server** para contas, registros e limites de uso.
- **Identidade gerenciada do App Service** para conectar ao PostgreSQL sem senha fixa. O código aceita uma connection string para desenvolvimento controlado, mas a configuração de produção usa identidade gerenciada.
- A identificação dos dados combina tenant e principal do Entra. Revisões, idempotência, exclusão e limites por usuário continuam no repositório; atualizações concorrentes usam transações e revisão condicional.

O schema é criado por `npm run prepare:azure-db` ou durante `npm start`. A migração usa `CREATE TABLE IF NOT EXISTS` e preserva tabelas existentes. Ela não copia dados de nenhum banco D1 anterior.

## Configuração do Azure

1. Crie um Azure App Service Linux com Node.js 24 e um Azure Database for PostgreSQL Flexible Server.
2. No App Service, habilite uma identidade gerenciada atribuída pelo sistema e configure **Authentication** com Microsoft Entra ID. Restrinja o aplicativo ao tenant pretendido. Permita acesso anônimo à página inicial para que a demonstração permaneça disponível; as rotas `/api/*` validam a identidade no servidor.
3. Crie no PostgreSQL um principal para a identidade gerenciada do App Service e conceda acesso apenas ao banco da aplicação.
4. Configure estes Application settings no App Service:

   - `AZURE_AUTH_MODE=app-service`
   - `AZURE_TENANT_ID=<tenant Microsoft Entra permitido>`
   - `AZURE_POSTGRES_HOST=<servidor>.postgres.database.azure.com`
   - `AZURE_POSTGRES_DATABASE=iafinanceira`
   - `AZURE_POSTGRES_USER=<principal criado para a identidade gerenciada>`
   - `AZURE_POSTGRES_PORT=5432`
   - `SCM_DO_BUILD_DURING_DEPLOYMENT=true`

   Não configure `AZURE_POSTGRES_CONNECTION_STRING` na produção quando a identidade gerenciada estiver ativa.
5. Publique o código com `npm run build` e `npm start`. O App Service informa a porta por `PORT`; o script de inicialização respeita esse valor.

Easy Auth precisa estar ativo antes de aceitar tráfego autenticado. O servidor só confia em `X-MS-CLIENT-PRINCIPAL` quando `AZURE_AUTH_MODE=app-service`, `WEBSITE_AUTH_ENABLED=true`, `AZURE_TENANT_ID` está definido e o processo está dentro do App Service (`WEBSITE_SITE_NAME` presente). O código também exige que o tenant da identidade corresponda ao tenant configurado. Não habilite esse modo atrás de um proxy que aceite cabeçalhos de identidade do cliente.

## Variáveis locais

Veja `.env.example`. Para desenvolvimento com PostgreSQL, use `AZURE_POSTGRES_CONNECTION_STRING` em `.env.local` e mantenha o arquivo fora do Git. Sem banco configurado, a demonstração continua funcionando, mas as contas autenticadas ficam indisponíveis.

## Verificação

`npm run build` compila a aplicação para Next.js/Node. `npm run typecheck` verifica os tipos. Os testes herdados em `tests/` cobrem cálculos e o contrato do repositório original; a conexão real com Entra e PostgreSQL precisa ser verificada depois que os recursos Azure estiverem provisionados.

Os documentos de descoberta e decisões em `docs/` vieram do repositório original e registram decisões da versão Cloudflare. Este README descreve a arquitetura Azure desta cópia.
