# TinyLab 2

PT-BR | [English below](#english)

Laboratório local com 104 ferramentas em sete categorias: PDF, imagens, vídeo/áudio, arquivos/dados, texto, desenvolvimento/utilitários e IA local.

## Executar

A pasta pública `/home/fabiano/public_html/app/tinylab` aponta para este projeto. Os arquivos estáticos já estão compilados.

```sh
npm run dev
```

Abra http://127.0.0.1:4173. Para recompilar:

```sh
ONNXRUNTIME_NODE_INSTALL_CUDA=skip npm ci
npm run build
npm test
```

Use Node.js 22.13 ou mais recente para manutenção. A versão compilada não requer Node no servidor. O build inclui os motores do navegador e os dados OCR em português/inglês. `scripts/build.mjs` usa fontes DejaVu do sistema e importa o conjunto OCR já instalado em `/home/fabiano/public_html/app/scanner/vendor`; consulte essas variáveis no script ao compilar em outra máquina.

## Privacidade e funcionamento

- Operações comuns executam no navegador; não enviam arquivos para APIs.
- O botão **Preparar offline** baixa e guarda as dependências locais. Downloads podem ocupar mais de 100 MB. O Service Worker gerencia apenas caches TinyLab e ignora APIs, POSTs e requisições de outras origens.
- OCR tem modelos PT/EN incluídos. IA generativa, MODNet, Swin2SR e Whisper baixam modelos do Hugging Face na primeira execução. O conteúdo dos documentos não é enviado. A inferência ocorre no dispositivo; os modelos ficam no cache do navegador, sujeito à disponibilidade de armazenamento.
- O serviço opcional **Office para PDF** usa o LibreOffice instalado neste computador. O servidor escuta somente em 127.0.0.1, aceita arquivos de até 100 MB, usa diretório temporário e remove os arquivos ao terminar. Esse modo não existe em hospedagem somente estática.
- A conta Google, quando usada no domínio oficial, reutiliza `../keepai/api/auth.php`. Não há banco separado de usuários/créditos nem cobrança por inferência local.
- Favoritos e recentes armazenam somente IDs de ferramentas. Documentos e senhas não são salvos no histórico.

## Limites explícitos

- Lotes: até 200 arquivos / 512 MB; imagens: até 64 megapixels na saída; mídia: FFmpeg local com cancelamento, até cinco minutos por execução.
- PDF para DOCX usa texto selecionável e layout simplificado. DOCX para PDF no navegador usa texto e imagens ao final; o modo LibreOffice preserva melhor o layout.
- Assinaturas são visuais, sem certificado digital. Anotação/assinatura rasterizam a página editada. Compressão rasterizada perde texto selecionável, links e formulários.
- Remoção por cor funciona melhor em fundos uniformes. MODNet é destinado a retratos, sem garantia de recorte de objetos arbitrários.
- Ampliação de imagens usa interpolação e não inventa detalhes com IA.
- Transcrição local: até 30 minutos; geração de texto depende da capacidade do dispositivo e pode conter erros. Resumos aceitam até 24.000 caracteres; outras tarefas de texto, até 10.000.
- Gravação de tela e áudio depende das permissões e dos codecs do navegador. Legendas de vídeo são uma faixa selecionável.

## Estrutura

`src/catalog.js` define catálogo e opções PT/EN. `src/main.js` controla a interface. `src/engines/` implementa operações, com workers para tarefas pesadas. `assets/` e `vendor/` são os arquivos compilados. `tests/core.test.mjs` verifica invariantes e resultados; `tests/browser.mjs` faz testes de integração com arquivos sintéticos.

Software de terceiros e modelos: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Os binários de terceiros são distribuídos sem modificações, com avisos de licença em `vendor/licenses/`.

## English

TinyLab is a browser-first laboratory with 104 tools across seven categories. Run `npm run dev` and open http://127.0.0.1:4173. Static builds run without Node on the server. Standard file operations do not upload documents. Optional local Office conversion uses LibreOffice through a loopback-only Python service, with temporary files and a 100 MB limit. AI models download on demand and inference runs locally. Use **Prepare offline** to cache browser dependencies; model caches are separate.

PDF-to-Word and browser Word-to-PDF use simplified layouts. Drawn signatures are visual, without digital certificates; edited pages are rasterized. Color-based background removal is best for uniform backgrounds; MODNet targets portraits. The standard image enlargement tool uses interpolation; the AI upscaler uses Swin2SR in 2× tiles (up to 4 megapixels input). AI outputs require review. Screen recording and codecs depend on browser support.

For maintenance use Node.js 22.13+, `ONNXRUNTIME_NODE_INSTALL_CUDA=skip npm ci`, `npm run build`, and `npm test`. See source and third-party notices for build assets and licenses. No separate account/credit database or paid inference API is introduced.
