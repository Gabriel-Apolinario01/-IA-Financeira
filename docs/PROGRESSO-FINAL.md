# Entrega de 21 de novembro de 2026

## Integração local

A branch `integracao/entrega-2026-11-21` reúne a base de autenticação e Groq em `bc5d582` e os incrementos financeiros em `8260bf4`. O arquivo `IA-Financeira-antes-entrega-final.bundle`, ao lado do repositório, passou em `git bundle verify`. Antes dos testes, os itens ignorados presentes no checkout eram dependências, cache de build e arquivos gerados pelo TypeScript. Não havia cluster PostgreSQL de desenvolvimento nesse checkout. O bundle cobre o histórico Git. Os exemplos financeiros já existentes no navegador permanecem no armazenamento local daquele navegador.

Os cinco conflitos envolveram login, limites de requisição, CI, manifesto npm e lockfile. A página mantém o cadastro Better Auth, a opção Microsoft quando habilitada e os links de demonstração. O repositório mantém os limites de autenticação, diagnóstico, uso de IA e classificação da importação. O lockfile da versão com Better Auth fixa as dependências de autenticação e PostgreSQL. No CI, auditoria, lint, typecheck, testes unitários, integração e build precedem o job de publicação. Publicar exige disparo manual na main com a opção correspondente.

### Validações da integração

| Verificação | Resultado local |
| --- | --- |
| Instalação pelo lockfile | `npm ci` instalou 608 pacotes |
| Lint e TypeScript | Ambos aprovados |
| Testes unitários | 154 aprovados, zero ignorados |
| Auditoria de runtime | Zero vulnerabilidades reportadas |
| Build de produção | Aprovado. A primeira execução encontrou EPERM ao criar uma pasta gerada em .next. A repetição autorizada completou pré-renderização e coleta de traces. |

O teste de integração passou com PostgreSQL local real e duas contas fictícias. Foram verificados cadastro, senha, sessão, isolamento, persistência, CSRF, exclusão e logout. O primeiro cluster do teste demorou além do prazo sob a restrição local. A repetição autorizada concluiu com código zero.

## Leitura de fotografias

O leitor local executa Tesseract com o idioma português instalado junto com a aplicação. Sharp verifica o formato decodificado e as dimensões antes da normalização. Cada subprocesso recebe bytes pelo stdin, um ambiente sem chaves de provedor e prazo de 45 segundos. O código limita o arquivo a 5 MiB, a imagem a 16 megapixels e a concorrência a duas leituras por processo do servidor. O OCR não requer credenciais nem envio a terceiros.

O teste `node --import tsx --test tests/document-reader.test.ts` passou nos quatro cenários. Fotos sintéticas foram rasterizadas em JPEG, PNG e WebP antes do reconhecimento. O texto reconhecido continha os títulos e os valores impressos da conta de energia (R$ 182,34), do cupom (R$ 1.234,56) e do PIX (R$ 72,19). Assinatura trocada e JPEG truncado foram recusados. Esse teste cobre o leitor de pixels. Extração dos campos, confirmação, PDF e navegador têm verificações próprias.

## PDF digital e digitalizado

PDF.js lê o texto por página no subprocesso privado. Páginas sem texto suficiente são renderizadas em memória com até 2400 × 3200 pixels e passam pelo mesmo OCR. O leitor recusa mais de quatro páginas. Os testes em `tests/document-pdf.test.ts` passaram (2/2). Um PDF sintético misto produziu R$ 1.234,56 na página digital e R$ 71,98 na página composta exclusivamente por JPEG. O teste verifica a origem de cada texto. Outro PDF, de cinco páginas, foi rejeitado.
## Revisão e confirmação

Em Lançamentos, a conta autenticada pode selecionar um documento ou abrir o seletor de câmera. A rota `/api/document` exige sessão e mesma origem, limita o volume durante a leitura do corpo e aplica cota por proprietário. O texto original é mostrado separadamente das sugestões. Cada lançamento exige revisão, seleção e confirmação. Valores, datas, natureza, direção, categoria, situação e observações podem ser ajustados. OCR local é o padrão.

O comando `document.confirm` valida as linhas, reutiliza `transaction.save` e persiste a seleção em uma atualização atômica. A identidade por hash do arquivo e número da linha impede repetir o documento já lançado. Data e valor coincidentes em outro arquivo geram aviso. A conta sem comprovante de pagamento entra como prevista e afeta as pendências no dashboard. Três testes de interpretação e gravação passaram, incluindo recarga por JSON, duplicação, moeda estrangeira e rejeição integral de um lote inválido. O TypeScript passou com as rotas e a interface.
## Conversa em Aprender

A rota autenticada `/api/chat` aceita a pergunta atual e até cinco trocas anteriores. A resposta pode conter parágrafos gerados pela Groq. Os valores exibidos vêm de chaves que o servidor resolve com o motor financeiro. URLs de fontes vêm do catálogo educativo. As autorizações de conversa e de inclusão das métricas são independentes. Mudar qualquer autorização limpa a conversa. O histórico fica na memória da página. Em caso de indisponibilidade ou resposta inválida, a interface identifica a orientação local.

Passaram cinco testes direcionados do chat e o typecheck. As chamadas de Groq nesses testes usaram um provedor simulado, incluindo falha e timeout. Não há comprovação de geração com a conta real da Groq neste ambiente. O teste distingue explicitamente os modos local e Groq.

## Segurança e regressão final

O adaptador opcional de visão exige `DOCUMENT_VISION_ENABLED=true`, `GROQ_VISION_MODEL`, chave privada e consentimento específico a cada imagem. A aplicação reencoda o raster em JPEG e remove os metadados originais antes de enviá-lo. O modelo recebe apenas a tarefa de transcrição. O servidor verifica o JSON retornado e aplica as regras financeiras locais. As chamadas compartilham os limites diários com o chat e o diagnóstico. O PDF permanece no fluxo local. A prévia mostra páginas renderizadas em imagem.

No build local, os testes de navegador passaram em Edge desktop (1360 × 960) e celular emulado (390 × 844). Em cada jornada, a conta de energia foi reconhecida como prevista, corrigida e confirmada como realizada pelo usuário fictício. O reenvio do mesmo arquivo ficou bloqueado. O cupom digital de R$ 20,00 foi visualizado e confirmado. Uma terceira leitura recuperou R$ 182,34 de um PDF inteiramente digitalizado e ficou na prévia. O dashboard permaneceu com R$ 202,34 de consumo após a recarga e o novo login. Duas perguntas sobre moradia mantiveram o assunto no modo local.

Com o lockfile final, a instalação reproduzível instalou 631 pacotes. Lint, typecheck, build e 171 testes unitários passaram. O teste integrado passou em PostgreSQL real com duas contas fictícias, verificando a rota de extração, repetição de confirmação, isolamento, chat e revisão persistida. A auditoria de runtime reportou zero vulnerabilidades. O modelo de visão foi testado com respostas simuladas. A validação externa da Groq fica pendente por decisão do usuário.
