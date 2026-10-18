# Verificação do MVP

Revisão final: 08/10/2026. Ambiente: Windows, Node 24.19, Chromium do navegador integrado e banco D1 local/SQLite. Foram usados exclusivamente dados fictícios de teste.

## Execuções concluídas

- `tsc --noEmit`: passou.
- `tsx --test tests/*.test.ts`: **51 testes passaram**, sem falhas.
- Build pelo helper oficial Sites/Vinext: passou, com Worker e arquivos do cliente em `dist/`.
- `node scripts/test-local-api.mjs`: **17 verificações HTTP passaram** em 06/10, após a correção de geração da conta. Validaram sessão local de teste, anonimato 401, cabeçalhos de identidade forjados, origem inválida 403, persistência, idempotência, revisão obsoleta, valores inválidos, diagnóstico por regras, exportação e exclusão confirmada dos dados descartáveis.
- `node scripts/prepare-local-db.mjs`: reconheceu o banco existente sem reaplicar a migração.
- `node scripts/start-local.mjs`: iniciou o servidor e respondeu HTTP 200.
- Cópia independente na Área de Trabalho: `Abrir IA Financeira.cmd` criou o banco vazio, iniciou o site na porta 5173 e respondeu HTTP 200. As 17 verificações HTTP foram repetidas nessa cópia em 08/10, todas aprovadas. Doze arquivos essenciais foram comparados por SHA-256 e o ZIP teve sua integridade conferida.

Os testes automatizados incluem os valores de aceitação: R$ 3.000 − R$ 2.700 = R$ 300; dívida vinculada sem duplicar a parcela; aporte sem alterar o resultado; previsto separado de realizado; renda ausente versus zero; juros zero = R$ 1.200; 12% anuais efetivos = R$ 1.120; isolamento entre proprietários em SQLite real.

Foram acrescentadas regressões para totais derivados acima do limite individual e para comandos enviados por uma aba antiga após excluir/recriar a conta. A geração da conta e a revisão numérica são verificadas no servidor.

## Navegador

- Entrada na demonstração e navegação entre Visão geral, Lançamentos, Orçamento, Metas e Aprender.
- Despesa fictícia de R$ 12,34 alterou o resultado de R$ 300 para R$ 287,66; edição para R$ 15 atualizou a categoria Lazer para R$ 115.
- Aporte de R$ 100 alterou o valor guardado de R$ 800 para R$ 900 e preservou o resultado do mês. Recarregar preservou os registros da demonstração.
- Criação de uma meta pelo teclado em tela de 360 pixels. O diálogo colocou foco no primeiro campo e devolveu o foco ao botão de criação após salvar.
- Simulador mostrou R$ 1.200 no cenário sem juros e R$ 1.120 no cenário de 12% efetivos ao ano.
- Pergunta sobre tema fora da base recebeu explicação de falta de evidência, sem inventar referência.
- Entrada na identidade local vazia não copiou dados da demonstração. Configuração de perfil e recarga preservaram o nome; estimativa de renda de R$ 3.000 não criou receita realizada.
- Larguras de **360, 768 e 1440 pixels** inspecionadas. Painel sem rolagem horizontal da página; tabelas têm sua própria região de rolagem. Ajustados contraste de textos secundários e tamanho das explicações.
- Nenhum erro ou aviso de console foi registrado na revisão final do painel. Não foi feita auditoria completa com leitor de tela ou certificação de acessibilidade.

WebMCP opcional: ferramenta `read_registered_month` registrada no navegador com schema e anotação de somente leitura. A consulta válida retornou os mesmos totais exibidos; mês inválido foi recusado. A ferramenta não grava dados.

## Limites que continuam explícitos

- **Não publicado:** o serviço Sites retornou `project_not_found` para o projeto original após a troca de conta/espaço confirmada pelo usuário. O identificador foi preservado; não criamos silenciosamente outro Site. Nenhum endereço esperado foi apresentado como link ativo.
- Autenticação real hospedada e recuperação de acesso não foram exercitadas. Localmente, o starter fornece uma identidade de teste claramente indicada.
- Não foi configurada chave de IA nem realizada chamada a um provedor real. Testes do adaptador usam respostas controladas; o diagnóstico por regras foi exercitado sem chave.
- O starter utiliza Vinext beta. O build avisa que não classifica estaticamente a rota `/`; ela respondeu HTTP 200 e foi utilizada no navegador. Não houve erro de compilação.
- Não há banco, corretora ou pagamento conectado. Valores de metas são informados pelo usuário; não são saldos bancários verificados.

Consulte `README.md` para instalar e reproduzir as verificações.

## Correção do inicializador — 09/10/2026

Um registro antigo de execução do Vinext apontava para um PID reutilizado pelo Chrome, impedindo a inicialização mesmo com a porta 5173 livre. O modo local agora usa a porta fixa com `strictPort` para impedir instâncias duplicadas e desativa apenas o bloqueio por PID do Vinext. Nenhum processo de outro aplicativo é encerrado.

Verificação: sintaxe dos dois scripts aprovada; inicializador da Área de Trabalho reconheceu o banco existente e iniciou com o registro antigo ainda presente; página inicial respondeu HTTP 200 com o nome IA Financeira. Uma segunda execução recusou a porta ocupada, conforme esperado. A mensagem inicial agora orienta aguardar a linha `Local:` antes de abrir o endereço. Não houve alteração na interface nem nos cálculos financeiros.
