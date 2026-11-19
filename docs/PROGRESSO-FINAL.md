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

Em Lançamentos, a conta autenticada pode selecionar um documento ou abrir o seletor de câmera. A rota `/api/document` exige sessão e mesma origem, limita o volume durante a leitura do corpo e aplica cota por proprietário. O texto original é mostrado separadamente das sugestões. Cada lançamento exige revisão, seleção e confirmação. Valores, datas, natureza, direção, categoria, situação e observações podem ser ajustados. O processamento usa OCR local exclusivamente.

O comando `document.confirm` valida as linhas, reutiliza `transaction.save` e persiste a seleção em uma atualização atômica. A identidade por hash do arquivo e número da linha impede repetir o documento já lançado. Data e valor coincidentes em outro arquivo geram aviso. A conta sem comprovante de pagamento entra como prevista e afeta as pendências no dashboard. Três testes de interpretação e gravação passaram, incluindo recarga por JSON, duplicação, moeda estrangeira e rejeição integral de um lote inválido. O TypeScript passou com as rotas e a interface.
