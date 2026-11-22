export const TOUR_STORAGE_KEY = 'ia-financeira:onboarding-tour:v1';
export type TourView = 'overview' | 'transactions' | 'savings' | 'goals' | 'learn' | 'settings';
export type TourKind = 'main' | 'context' | 'document';
export type TourStep = {
  title: string;
  description: string;
  target?: string;
  view?: TourView;
  chat?: boolean;
};

export function mainTour(account: boolean): TourStep[] {
  return [
    { title: 'Um passo de cada vez', description: 'Conheça os principais recursos em um tour rápido. Você pode voltar, pular ou sair com Esc a qualquer momento. Nenhum registro será alterado.' },
    { title: 'Entenda o resultado do mês', target: 'month-summary', view: 'overview', description: 'Aqui você compara receitas reconhecidas e consumo do mês. O resultado é calculado a partir dos seus registros: não é seu saldo bancário nem dinheiro automaticamente disponível para gastar.' },
    { title: 'Organize seus lançamentos', target: 'nav-transactions', view: 'overview', description: 'Em Lançamentos ficam suas entradas, saídas, orçamento e dívidas. Vamos conhecer essa área.' },
    { title: 'Adicione um lançamento', target: 'add-transaction', view: 'transactions', description: 'Use este botão para registrar manualmente uma receita ou despesa, informando descrição, valor, data, categoria e situação. O tour não abre nem preenche o formulário.' },
    { title: 'Extrato, foto ou PDF', target: 'document-upload', view: 'transactions', description: 'Este é o envio de arquivos: CSV, TSV, OFX, fotos e PDFs. A leitura prepara uma revisão; nada entra nos registros sem sua confirmação.' + (account ? ' Confira sempre os campos extraídos.' : ' Na demonstração, fotos e PDFs exigem entrar em uma conta.') },
    { title: 'Encontre e confira seus registros', target: 'transaction-records', view: 'transactions', description: 'Busque por descrição e filtre por categoria ou situação. A lista abaixo mostra os lançamentos do mês escolhido. Valores previstos não entram no resultado realizado.' },
    { title: 'Explore possibilidades de economia', target: 'nav-savings', view: 'savings', description: 'Em Economizar, compare cenários de redução de gastos. São estimativas hipotéticas: escolher um cenário não reduz despesas nem comprova dinheiro economizado.' },
    { title: 'Dê um nome ao seu objetivo', target: 'nav-goals', view: 'goals', description: 'Em Metas, crie objetivos e acompanhe valores que você informa como guardados. Registrar uma movimentação não transfere dinheiro nem verifica seu saldo no banco.' },
    { title: 'Conheça os recursos educativos', target: 'nav-learn', view: 'learn', description: 'Na área Aprender, explore guias, análises do mês e simuladores. O conteúdo ajuda a compreender seus registros e a planejar com autonomia.' },
    { title: 'Aprender e conversar', target: 'learn-chat-tab', view: 'learn', description: 'Aprender reúne guias, análises e simuladores. A aba Chat financeiro abre uma conversa educativa sobre suas dúvidas.' },
    { title: 'Seu chat financeiro', target: account ? 'chat-question' : 'financial-chat', view: 'learn', chat: true, description: account ? 'Escreva sua dúvida aqui. Autorizar a Groq a receber a conversa e incluir resumos financeiros são escolhas separadas. O tour não marca autorizações nem envia perguntas. Evite informações pessoais.' : 'Entre em uma conta para conversar. Os guias e o simulador continuam disponíveis na demonstração. A autorização da conversa para a Groq é separada do uso de resumos financeiros.' },
    { title: 'Pronto para explorar', description: 'Siga no seu ritmo. Você pode rever este tour ou abrir a ajuda da tela pelo botão “Precisa de uma mão?”.' },
  ];
}

export function documentTour(account: boolean, exists: (target: string) => boolean): TourStep[] {
  const steps: TourStep[] = [{ title: 'Como importar e revisar um documento?', target: 'document-upload', description: 'Selecione um arquivo em “Extrato, foto ou PDF”. A leitura não adiciona lançamentos automaticamente.' + (!account ? ' Entre em uma conta para usar fotos e PDFs.' : '') }];
  const conditional: TourStep[] = [
    { target: 'document-extract', title: 'Peça a leitura do arquivo', description: '“Extrair dados” lê o documento selecionado. Confira se o texto e os números estão legíveis. Este tour não inicia a extração nem autoriza envio para IA.' },
    { target: 'document-fields', title: 'Confira cada campo', description: 'Revise descrição, data do lançamento, valor, categoria, natureza e situação. Vencimento não comprova pagamento. Corrija campos ausentes ou ambíguos usando o documento como referência.' },
    { target: 'document-select', title: 'Escolha os lançamentos revisados', description: 'Depois de conferir os campos, selecione os lançamentos que deseja adicionar. Campos incompletos precisam ser corrigidos antes. O tour não seleciona nenhuma linha.' },
    { target: 'document-confirm', title: 'Confirme quando estiver pronto', description: '“Confirmar e adicionar” salva apenas os lançamentos revisados e selecionados. Confira duplicidades e o mês da data informada. O tour não aciona este botão.' },
  ];
  steps.push(...conditional.filter(step => exists(step.target!)));
  if (steps.length === 1) steps.push({ title: 'Continue quando tiver um arquivo', description: 'Após selecionar uma foto ou PDF e extrair os dados, reabra esta ajuda para conhecer os campos de revisão. Você não precisa enviar um documento para encerrar o tour.' });
  return steps;
}

export function contextTour(view: TourView, account: boolean, exists: (target: string) => boolean): TourStep[] {
  if (view === 'transactions') return documentTour(account, exists);
  if (view === 'settings') return [{ target: 'settings', title: 'Seu espaço, suas escolhas', description: 'Aqui você revisa seu perfil, exporta dados e controla as autorizações. O tour não altera suas preferências nem compartilha informações.' }];
  const steps = mainTour(account);
  return steps.filter(step => step.view === view && !step.target?.startsWith('nav-')).concat(
    view === 'savings' ? [{ ...steps[6], target: 'savings-intro' }] : view === 'goals' ? [{ ...steps[7], target: 'goals-summary' }] : []
  );
}
