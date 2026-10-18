# IA Financeira

Aplicação para registrar receitas e despesas, acompanhar o orçamento, organizar dívidas, planejar metas e explorar cenários de acumulação. Interface em português, valores em reais e modo demonstrativo separado das contas pessoais.

## Execução local

Requer Node.js 22.13 ou superior (testado com Node 24), npm e Git para publicação. Não requer Python nesta adaptação.

**No Windows deste projeto:** dê dois cliques em `Abrir IA Financeira.cmd`. Ele usa Node instalado (ou o runtime local do Codex), instala dependências quando necessário, prepara o banco vazio e inicia o site. Depois abra `http://127.0.0.1:5173/`. Mantenha a janela aberta enquanto usa o MVP; Ctrl+C encerra o servidor. Os dados existentes são preservados ao iniciar novamente.

```sh
npm ci
npm run typecheck
npm test
npm run build
node scripts/prepare-local-db.mjs
npm run dev
```

Acesse o endereço Local mostrado pelo servidor (normalmente `http://localhost:5173`). Escolha **Explorar demonstração** para testar imediatamente, sem chave e sem login externo. O seletor de mês começa no mês atual de São Paulo. Configurações permite restaurar os exemplos ou começar uma demonstração vazia.

O preparo consulta o banco e só aplica a migração inicial em um banco sem a tabela financeira. Migrações subsequentes devem ser geradas com `npm run db:generate` e aplicadas em ordem. O banco local fica em `.wrangler/state`. Mantenha essa pasta para preservar contas locais; não a publique.

O comando `npm run dev` usa a simulação de identidade mantida pelo starter Sites em loopback. **Começar** abre o fluxo de entrada e uma identidade local de teste explicitamente identificada na interface. Nenhuma senha ou recuperação de e-mail é simulada pelo aplicativo. No site publicado, autenticação, cadastro e recuperação são gerenciados pelo ChatGPT/Sites. Os dados da conta local não são enviados ao banco publicado.

## Arquitetura e adaptação do planejamento

- React + TypeScript, Tailwind CSS e Vinext/Vite no frontend.
- Backend TypeScript no Cloudflare Worker nativo da plataforma Sites. A plataforma não executa FastAPI/Python; usamos a alternativa permitida na especificação, sem manter dois backends.
- Cloudflare D1 (SQLite) para contas autenticadas; schema Drizzle e migrações versionadas. Não há configuração de PostgreSQL porque o backend escolhido é nativo Sites.
- `lib/finance.ts`: única fonte de cálculos; centavos inteiros e Decimal para projeções.
- `lib/commands.ts`: validação compartilhada e alterações puras de estado.
- `lib/repository.ts`: persistência, revisão, idempotência e isolamento por identidade.
- `lib/education.ts`: base selecionada, fontes e diagnóstico por regras.
- `lib/explanations.ts`: integração opcional com provedor de IA, restrita à organização de conteúdo revisado.
- `components/finance-app.tsx` e `finance-dialog.tsx`: telas e formulários.

O schema armazena um agregado financeiro por identidade: perfil, lançamentos, limites mensais, dívidas, metas, movimentos e cenários. Isso mantém todas as referências dentro do mesmo proprietário. Categorias e conteúdos educativos são catálogos versionados no código. Não é um modelo analítico normalizado: foi escolhido para atomicidade e simplicidade do MVP. Limite operacional: 2 MB por conta, incluindo recibos de idempotência, e limites de quantidade definidos no domínio; uma evolução precisará normalizar entidades e planejar retenção dos recibos.

O P0 reúne acesso, orçamento, dívidas básicas, metas/reserva e diagnóstico educativo. O P1 adiciona o simulador de acumulação e **amplia o MVP previsto para 19/10/2026**, antecipando uma função do marco de 23/11/2026. Não implementamos todo o backlog acadêmico.

O starter fornecido utiliza Vinext `1.0.0-beta.5`, necessário para a integração de hospedagem. Essa dependência ainda é beta; as demais versões ficam fixadas no lockfile. É uma limitação da plataforma, não uma substituição silenciosa por um framework estável.

## Regras financeiras

- Valores persistidos: inteiros positivos em centavos; entradas brasileiras como `1.234,56`. Zero é permitido nas estimativas, no saldo inicial e nos parâmetros apropriados, mas lançamentos e movimentos precisam ter valor maior que zero.
- Resultado do mês = receitas realizadas − despesas realizadas. Projeção = resultado + receitas previstas − despesas previstas. Nunca chamamos esse resultado de saldo bancário.
- Saldo devedor é separado do orçamento; apenas uma parcela vinculada entra nos lançamentos. Pagar parcela não reduz automaticamente o saldo devedor.
- Aportes e retiradas não são consumo nem receita. Saldo de meta = saldo inicial + aportes − retiradas + ajustes identificados. Metas arquivadas continuam no total guardado.
- Saldo inicial e sua data ficam imutáveis após criar a meta. Correções são movimentos de ajuste. Um movimento retroativo não pode deixar o saldo negativo em nenhum ponto posterior do histórico.
- Posição das metas: fim do mês para meses passados; hoje para o mês corrente/futuro. A data aparece na interface.
- Estimativas de perfil não viram lançamentos. Sem receitas registradas, o diagnóstico é parcial até haver registros ou confirmação explícita de ausência de receita.
- Cenários de redução são opcionais. Escolher um cenário não diminui despesas nem gera aportes. Necessidade mensal calculada para uma meta não é capacidade de poupança.
- Datas financeiras são strings ISO sem horário, exibidas em DD/MM/AAAA. Referência de hoje: `America/Sao_Paulo`. Timestamps técnicos em UTC.

### Simulador

Taxa anual efetiva hipotética, aportes ao fim de cada mês, `i = (1 + a)^(1/12) − 1`. Usa Decimal com 40 dígitos; cada linha é arredondada HALF_UP para centavos **somente na saída**, sem propagar arredondamentos intermediários. Isso preserva R$ 1.000 → R$ 1.120 após 12 meses a 12% anuais. Limites de prazo, taxa e magnitude são validados; taxa negativa maior que −100% é admitida e pode gerar perdas. Impostos, custos e inflação não estão incluídos. Não usa taxas de mercado nem recomenda ativos.

## Dados, acesso e privacidade

- Produção: identidade fornecida pelo dispatcher Sites, validada no servidor em todas as APIs. Headers de identidade não podem ser expostos por um proxy que aceite sua falsificação.
- Cada consulta SQL usa a identidade autenticada. O corpo do cliente nunca define o proprietário. IDs externos não acessam os dados de outra conta.
- Escritas exigem origem igual, JSON válido e corpo limitado. Controle de revisão impede sobrescrita entre abas. Um comando repetido com o mesmo ID é aplicado uma vez; mesmo ID com conteúdo diferente é rejeitado.
- Limites por usuário para comandos e diagnóstico. Não registramos conteúdo financeiro completo nos logs da aplicação.
- Sessões e cookies são mantidos pela infraestrutura Sites/ChatGPT; o aplicativo não armazena senhas nem implementa criptografia própria.
- A demonstração usa exclusivamente a chave `ia-financeira:demo:v1` do localStorage. Contas reais usam D1. Exportação contém apenas os dados do usuário ativo.
- Exclusão requer sessão autenticada, origem válida, texto EXCLUIR e confirmação; remove perfil, registros, recibos e controle de uso do usuário no banco ativo. Não exclui a conta ChatGPT. Backups e logs da infraestrutura seguem políticas do provedor; o aplicativo não promete apagamento de cópias que não controla nem certificação legal.
- Registros permanecem até exclusão solicitada ou remoção pelo próprio usuário. Não há expiração automática de registros financeiros. Contadores de uso são sobrescritos por janela e excluídos com a conta.

## Explicações e IA opcional

Sem chave, sem modelo, sem `AI_ENABLED=true`, sem consentimento ou em falha, permanece **Análise automática por regras**. Essa análise não finge ser uma chamada de IA.

Para habilitar futuramente, configure no servidor as variáveis de `.env.example`, como segredos da plataforma; no desenvolvimento Worker, use `.dev.vars` (ignorado no Git). Nunca use `NEXT_PUBLIC_` para chaves. A obtenção de chave OpenAI pelo fluxo Sites depende da habilitação do plugin OpenAI Developers e sua aprovação. Nenhuma chave acompanha este projeto.

Após configurar, cada usuário escolhe o compartilhamento em Configurações. O endpoint envia somente métricas agregadas necessárias e trechos educativos revisados; não envia nomes, identidade da conta, descrições livres de lançamentos nem a pergunta original. A busca por tema acontece localmente antes do envio. A requisição tem timeout de 12 segundos, `store:false` e limite de saída.

Neste MVP, o modelo pode selecionar/ordenar IDs de conceitos e métricas. O servidor valida contra os trechos recuperados e monta a resposta com texto revisado e números calculados. Texto livre, URLs e valores inventados pelo provedor são descartados. É uma integração deliberadamente restrita, não um chat geral nem RAG vetorial. Perguntas fora da base recebem indicação de falta de evidência.

Terceiros: ChatGPT/Sites para autenticação e hospedagem; Cloudflare para execução e armazenamento; OpenAI API somente se configurada e autorizada. Revogar consentimento impede novos envios, sem prometer remover dados já recebidos pelo provedor.

Fontes educativas verificadas em 06/10/2026 estão em `lib/education.ts`: Banco Central e Portal do Investidor/CVM. Os exemplos numéricos são didáticos, não taxas atuais. Não há parceria ou endosso dessas instituições.

Documentação técnica: [D1](https://developers.cloudflare.com/d1/), [Decimal.js](https://mikemcl.github.io/decimal.js/) e [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).

## Testes e limites de verificação

`npm test` executa testes de cálculo, comandos, persistência SQLite real, isolamento entre proprietários, concorrência, idempotência e explicações. O relatório final das execuções e verificações visuais está em `VERIFICACAO.md`.

Com `npm run dev` em execução e uma identidade local vazia, `node scripts/test-local-api.mjs` valida os endpoints HTTP. O script usa exclusivamente `http://127.0.0.1:5173`, recusa prosseguir se encontrar registros anteriores, cria dados descartáveis e remove esses dados ao terminar. Não execute contra uma conta com dados que deseja manter.

Além da revisão numérica, cada resposta da conta contém uma geração de armazenamento. Comandos precisam reenviar essa geração: uma aba aberta antes de excluir a conta não pode recriar registros antigos quando a nova conta alcançar o mesmo número de revisão.

Não há integração bancária, Open Finance, Pix, corretora, importação de extrato, recorrência automática, transação monetária, aconselhamento de ativos ou sincronização entre a demo e contas pessoais. Apostas podem ser registradas manualmente em Outros; não são a experiência principal.

## Publicação

`.openai/hosting.json` identifica o único Site privado deste projeto e o binding D1. O fluxo Sites aplica as migrações publicadas e configura a autenticação. A publicação inicial fica privada para o proprietário; compartilhar com colegas exige alterar explicitamente a audiência. O endereço esperado antes da publicação não é prova de uma versão ativa.
