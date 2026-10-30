export const pair = (pt, en) => ({ pt, en });
export const categories = [
  ["all", "✦", "Todas", "All"],
  ["pdf", "▤", "PDF", "PDF"],
  ["image", "◈", "Imagens", "Images"],
  ["media", "▷", "Vídeo & áudio", "Video & audio"],
  ["data", "▦", "Arquivos & dados", "Files & data"],
  ["text", "Aa", "Texto", "Text"],
  ["dev", "⌘", "Dev & utilitários", "Dev & utilities"],
  ["ai", "✧", "IA local", "Local AI"],
].map(([id, icon, pt, en]) => ({ id, icon, label: pair(pt, en) }));
export const opt = (key, pt, en, type = "text", value = "", extra = {}) => ({
  key,
  label: pair(pt, en),
  type,
  value,
  ...extra,
});
const num = (key, pt, en, value, min = 1, max = 10000) =>
  opt(key, pt, en, "number", value, { min, max });
const sel = (key, pt, en, items, value) =>
  opt(key, pt, en, "select", value || items[0][0], {
    items: items.map(([v, p, e]) => ({ value: v, label: pair(p, e || p) })),
  });
const area = (key, pt, en, value = "") => opt(key, pt, en, "textarea", value);
const quality = num(
  "quality",
  "Qualidade (10–100)",
  "Quality (10–100)",
  85,
  10,
  100,
);
const size = [
  num("width", "Largura (px)", "Width (px)", 1280, 1, 12000),
  num(
    "height",
    "Altura (px; 0 = proporcional)",
    "Height (px; 0 = proportional)",
    0,
    0,
    12000,
  ),
];
const format = sel("format", "Formato de saída", "Output format", [
  ["webp", "WebP"],
  ["png", "PNG"],
  ["jpeg", "JPEG"],
  ["avif", "AVIF"],
]);
const color = opt("color", "Cor", "Color", "color", "#7928ca");
const range = opt(
  "pages",
  "Páginas (ex.: 1-3, 5; vazio = todas)",
  "Pages (e.g. 1-3, 5; empty = all)",
);
const fontSize = num("fontSize", "Tamanho do texto", "Font size", 24, 6, 180);
const text = area("content", "Texto", "Text");
const TOOLS = [];
function add(
  category,
  id,
  pt,
  en,
  description,
  english,
  options = [],
  extra = {},
) {
  TOOLS.push({
    id,
    category,
    title: pair(pt, en),
    description: pair(description, english),
    options,
    input: "files",
    accept: "*/*",
    multiple: false,
    ...extra,
  });
}
const pdf = (id, pt, en, desc, endesc, options = [], extra = {}) =>
  add("pdf", id, pt, en, desc, endesc, options, { accept: ".pdf", ...extra });
pdf(
  "merge-pdf",
  "Juntar PDFs",
  "Merge PDFs",
  "Combine arquivos na ordem que você escolher.",
  "Combine documents in your chosen order.",
  [],
  { multiple: true },
);
pdf(
  "split-pdf",
  "Extrair páginas",
  "Extract pages",
  "Selecione páginas e intervalos para um novo PDF.",
  "Choose pages and ranges for a new PDF.",
  [range],
);
pdf(
  "split-all-pdf",
  "Dividir PDF",
  "Split PDF",
  "Uma página por arquivo, com download em ZIP.",
  "One page per file, packaged in a ZIP.",
);
pdf(
  "organize-pdf",
  "Organizar páginas",
  "Organize pages",
  "Arraste miniaturas para reordenar e remover páginas.",
  "Drag thumbnails to reorder and remove pages.",
);
pdf(
  "delete-pages",
  "Excluir páginas",
  "Delete pages",
  "Remova as páginas indicadas do documento.",
  "Remove selected pages from the document.",
  [range],
);
pdf(
  "rotate-pdf",
  "Girar PDF",
  "Rotate PDF",
  "Gire apenas as páginas que precisar.",
  "Rotate only the pages you need.",
  [
    range,
    sel("angle", "Rotação", "Rotation", [
      ["90", "90°"],
      ["180", "180°"],
      ["270", "270°"],
    ]),
  ],
);
pdf(
  "watermark-pdf",
  "Marca-d’água no PDF",
  "Watermark PDF",
  "Adicione um carimbo de texto ao documento.",
  "Add a text watermark to your document.",
  [
    opt("content", "Texto da marca", "Watermark text", "text", "CONFIDENCIAL"),
    num("opacity", "Opacidade (%)", "Opacity (%)", 30, 5, 100),
  ],
);
pdf(
  "number-pdf",
  "Numerar páginas",
  "Page numbers",
  "Adicione números no rodapé das páginas.",
  "Add page numbers to the footer.",
  [num("start", "Número inicial", "Starting number", 1, 0, 10000)],
);
pdf(
  "images-to-pdf",
  "Imagens para PDF",
  "Images to PDF",
  "Monte um PDF com fotos, capturas e documentos.",
  "Build a PDF from photos, screenshots and scans.",
  [
    sel("paper", "Papel", "Paper", [
      ["a4", "A4"],
      ["fit", "Ajustar à imagem", "Fit image"],
    ]),
  ],
  { accept: "image/*,.heic,.heif", multiple: true },
);
pdf(
  "pdf-to-images",
  "PDF para imagens",
  "PDF to images",
  "Exporte páginas em JPG ou PNG em um ZIP.",
  "Export pages as JPG or PNG in a ZIP.",
  [
    range,
    sel("format", "Formato", "Format", [
      ["png", "PNG"],
      ["jpeg", "JPEG"],
    ]),
    num("scale", "Escala (1–3)", "Scale (1–3)", 2, 1, 3),
  ],
);
pdf(
  "pdf-to-text",
  "PDF para texto",
  "PDF to text",
  "Extraia texto selecionável e preserve as páginas.",
  "Extract selectable text while preserving page breaks.",
);
pdf(
  "pdf-extract-images",
  "Extrair imagens do PDF",
  "Extract PDF images",
  "Recupere as imagens rasterizadas incorporadas.",
  "Recover embedded raster images.",
);
pdf(
  "compress-pdf",
  "Comprimir PDF",
  "Compress PDF",
  "Reduza por otimização ou rasterização com qualidade ajustável.",
  "Reduce size through optimization or adjustable rasterization.",
  [
    sel("mode", "Método", "Method", [
      ["lossless", "Otimizar sem rasterizar", "Optimize without rasterizing"],
      [
        "raster",
        "Rasterizar (perde texto selecionável)",
        "Rasterize (loses selectable text)",
      ],
    ]),
    quality,
    num("scale", "Escala da rasterização", "Raster scale", 1.5, 0.5, 3),
  ],
);
pdf(
  "annotate-pdf",
  "Anotar PDF",
  "Annotate PDF",
  "Desenhe, destaque e insira texto sobre uma página.",
  "Draw, highlight and add text on a page.",
  [
    num("page", "Página", "Page", 1, 1, 10000),
    sel("brush", "Ferramenta", "Tool", [
      ["pen", "Caneta", "Pen"],
      ["highlight", "Marca-texto", "Highlighter"],
      ["text", "Texto", "Text"],
    ]),
    color,
    fontSize,
    text,
  ],
);
pdf(
  "sign-pdf",
  "Assinar PDF",
  "Sign PDF",
  "Desenhe uma assinatura e posicione na página.",
  "Draw a signature and place it on a page.",
  [num("page", "Página", "Page", 1, 1, 10000), color],
);
pdf(
  "fill-pdf",
  "Preencher formulários",
  "Fill PDF forms",
  "Edite campos de formulário existentes no documento.",
  "Edit existing document form fields.",
);
pdf(
  "protect-pdf",
  "Proteger PDF",
  "Protect PDF",
  "Criptografe o PDF com uma senha de abertura.",
  "Encrypt your PDF with an opening password.",
  [opt("password", "Senha de abertura", "Opening password", "password")],
);
pdf(
  "unlock-pdf",
  "Desbloquear PDF",
  "Unlock PDF",
  "Remova a proteção usando a senha do documento.",
  "Remove protection using the document password.",
  [opt("password", "Senha atual", "Current password", "password")],
);
pdf(
  "ocr-pdf",
  "OCR de PDF",
  "PDF OCR",
  "Reconheça texto de páginas digitalizadas em PT/EN.",
  "Recognize text from scanned pages in PT/EN.",
  [
    range,
    sel("language", "Idioma do documento", "Document language", [
      ["por+eng", "Português + inglês", "Portuguese + English"],
      ["por", "Português", "Portuguese"],
      ["eng", "Inglês", "English"],
    ]),
  ],
);
pdf(
  "pdf-to-word",
  "PDF para Word",
  "PDF to Word",
  "Crie um DOCX editável com o texto do PDF. Layout simplificado.",
  "Create an editable DOCX from PDF text. Simplified layout.",
);
pdf(
  "word-to-pdf",
  "Word para PDF",
  "Word to PDF",
  "Converta DOCX; use o modo local para preservar o layout.",
  "Convert DOCX; use the local mode to preserve layout.",
  [
    sel("mode", "Conversão", "Conversion", [
      [
        "browser",
        "No navegador (texto e imagens)",
        "In browser (text and images)",
      ],
      [
        "companion",
        "Local com LibreOffice (layout original)",
        "Local LibreOffice (original layout)",
      ],
    ]),
  ],
  { accept: ".docx,.doc,.odt" },
);
pdf(
  "office-to-pdf",
  "Office para PDF",
  "Office to PDF",
  "Converta apresentações e documentos com o serviço local.",
  "Convert presentations and documents with the local service.",
  [],
  {
    accept: ".pptx,.ppt,.xlsx,.xls,.docx,.doc,.odt,.ods,.odp",
    companion: true,
  },
);
pdf(
  "text-to-pdf",
  "Texto para PDF",
  "Text to PDF",
  "Transforme texto em um documento paginado.",
  "Turn text into a paginated document.",
  [text],
  { input: "text" },
);
pdf(
  "crop-pdf",
  "Recortar PDF",
  "Crop PDF",
  "Ajuste margens de todas as páginas em pontos.",
  "Adjust page margins in points.",
  [num("margin", "Margem a remover (pt)", "Margin to remove (pt)", 20, 0, 300)],
);
const image = (id, pt, en, desc, endesc, options = [], extra = {}) =>
  add("image", id, pt, en, desc, endesc, options, {
    accept: "image/*,.heic,.heif",
    multiple: true,
    ...extra,
  });
image(
  "compress-image",
  "Comprimir imagens",
  "Compress images",
  "Ajuste qualidade, formato e largura; compare o resultado.",
  "Adjust quality, format and width; compare results.",
  [
    quality,
    num("width", "Largura máxima (px)", "Maximum width (px)", 1920, 1, 12000),
    format,
  ],
);
image(
  "convert-image",
  "Converter imagens",
  "Convert images",
  "PNG, JPEG, WebP e AVIF, inclusive em lote.",
  "PNG, JPEG, WebP and AVIF, including batch conversion.",
  [format, quality],
);
image(
  "resize-image",
  "Redimensionar imagens",
  "Resize images",
  "Defina dimensões ou porcentagem mantendo proporções.",
  "Set dimensions or percentage while preserving proportions.",
  [
    ...size,
    num(
      "percent",
      "Porcentagem (0 = usar pixels)",
      "Percentage (0 = use pixels)",
      0,
      0,
      1000,
    ),
  ],
);
image(
  "crop-image",
  "Recortar imagem",
  "Crop image",
  "Selecione a área diretamente sobre a imagem.",
  "Select an area directly on the image.",
  [],
  { multiple: false },
);
image(
  "rotate-image",
  "Girar imagens",
  "Rotate images",
  "Gire suas fotos em 90°, 180° ou 270°.",
  "Rotate photos by 90°, 180° or 270°.",
  [
    sel("angle", "Rotação", "Rotation", [
      ["90", "90°"],
      ["180", "180°"],
      ["270", "270°"],
    ]),
  ],
);
image(
  "flip-image",
  "Espelhar imagens",
  "Flip images",
  "Inverta horizontalmente ou verticalmente.",
  "Flip horizontally or vertically.",
  [
    sel("axis", "Direção", "Direction", [
      ["horizontal", "Horizontal"],
      ["vertical", "Vertical"],
    ]),
  ],
);
image(
  "remove-bg",
  "Remover fundo simples",
  "Remove solid background",
  "Recorte por cor com suavização de bordas, preservação interna e opção de novo fundo.",
  "Color cutout with edge smoothing, interior preservation and background fill.",
  [
    num("tolerance", "Tolerância", "Tolerance", 42, 1, 150),
    num("feather", "Suavização de borda", "Edge smoothing", 18, 0, 80),
    sel("mode", "Modo", "Mode", [
      ["outer", "Somente bordas conectadas", "Connected edges only"],
      ["global", "Todas as áreas da cor", "All matching areas"],
    ]),
    sel("fill", "Fundo de saída", "Output background", [
      ["transparent", "Transparente (PNG)", "Transparent (PNG)"],
      ["color", "Cor sólida", "Solid color"],
    ]),
    opt("bgColor", "Cor do novo fundo", "New background color", "color", "#ffffff"),
  ],
);
image(
  "image-text",
  "Texto sobre imagem",
  "Text on image",
  "Adicione títulos, legendas e créditos.",
  "Add titles, captions and credits.",
  [
    text,
    color,
    fontSize,
    sel("position", "Posição", "Position", [
      ["bottom", "Embaixo", "Bottom"],
      ["center", "Centro", "Center"],
      ["top", "Em cima", "Top"],
    ]),
  ],
);
image(
  "watermark-image",
  "Marca-d’água em imagens",
  "Image watermark",
  "Carimbe fotos com texto e opacidade ajustável.",
  "Stamp photos with text and adjustable opacity.",
  [
    opt("content", "Texto", "Text", "text", "© 4u-Labs"),
    num("opacity", "Opacidade (%)", "Opacity (%)", 50, 5, 100),
    color,
    fontSize,
  ],
);
image(
  "border-image",
  "Adicionar bordas",
  "Add borders",
  "Crie uma moldura com espessura e cor.",
  "Create a frame with thickness and color.",
  [num("border", "Espessura (px)", "Thickness (px)", 24, 1, 500), color],
);
image(
  "round-image",
  "Imagem redonda",
  "Round image",
  "Recorte circular com transparência PNG.",
  "Circular crop with PNG transparency.",
);
image(
  "collage-image",
  "Criar colagem",
  "Collage maker",
  "Organize imagens em uma grade com espaçamento.",
  "Arrange images in a grid with spacing.",
  [
    num("columns", "Colunas", "Columns", 2, 1, 8),
    num("cell", "Lado de cada célula (px)", "Cell size (px)", 600, 50, 2000),
    num("gap", "Espaçamento (px)", "Gap (px)", 16, 0, 100),
    color,
  ],
);
image(
  "adjust-image",
  "Ajustar cores",
  "Adjust colors",
  "Brilho, contraste, saturação e escala de cinza.",
  "Brightness, contrast, saturation and grayscale.",
  [
    num("brightness", "Brilho (%)", "Brightness (%)", 100, 0, 300),
    num("contrast", "Contraste (%)", "Contrast (%)", 100, 0, 300),
    num("saturation", "Saturação (%)", "Saturation (%)", 100, 0, 300),
    num("grayscale", "Escala de cinza (%)", "Grayscale (%)", 0, 0, 100),
  ],
);
image(
  "pixelate-image",
  "Pixelizar imagem",
  "Pixelate image",
  "Oculte detalhes usando blocos de pixels.",
  "Hide details using pixel blocks.",
  [num("block", "Tamanho do bloco (px)", "Block size (px)", 16, 2, 128)],
);
image(
  "blur-image",
  "Desfocar imagem",
  "Blur image",
  "Aplique um desfoque ajustável.",
  "Apply adjustable blur.",
  [num("radius", "Raio (px)", "Radius (px)", 8, 1, 80)],
);
image(
  "upscale-image",
  "Ampliar imagem",
  "Upscale image",
  "Amplie com interpolação de alta qualidade, sem IA.",
  "Enlarge with high-quality interpolation, without AI.",
  [
    sel("factor", "Ampliação", "Scale", [
      ["2", "2×"],
      ["3", "3×"],
      ["4", "4×"],
    ]),
  ],
);
image(
  "heic-to-jpg",
  "HEIC para JPG",
  "HEIC to JPG",
  "Converta fotos de iPhone em JPEG.",
  "Convert iPhone photos to JPEG.",
  [quality],
);
image(
  "svg-to-png",
  "SVG para PNG",
  "SVG to PNG",
  "Rasterize vetores com dimensões ajustáveis.",
  "Rasterize vectors at your chosen dimensions.",
  size,
  { accept: ".svg" },
);
image(
  "favicon-maker",
  "Gerar favicons e ícones",
  "Favicon & icon maker",
  "Crie ICO e PNGs de 16 a 512 px em ZIP.",
  "Create ICO and PNGs from 16 to 512 px in a ZIP.",
);
image(
  "image-metadata",
  "Metadados de imagem",
  "Image metadata",
  "Veja dimensões, formato e dados EXIF disponíveis.",
  "Inspect dimensions, format and available EXIF data.",
);
image(
  "strip-metadata",
  "Remover metadados",
  "Strip metadata",
  "Regrave a imagem sem os metadados do arquivo original.",
  "Re-encode the image without original file metadata.",
);
const media = (id, pt, en, desc, endesc, options = [], extra = {}) =>
  add("media", id, pt, en, desc, endesc, options, {
    accept: "video/*,audio/*,.mkv,.mov,.avi,.m4a,.ogg,.flac",
    ...extra,
  });
const audioFormat = sel("format", "Formato de áudio", "Audio format", [
  ["mp3", "MP3"],
  ["wav", "WAV"],
  ["ogg", "OGG"],
  ["m4a", "M4A"],
]);
const videoFormat = sel("format", "Formato de vídeo", "Video format", [
  ["mp4", "MP4"],
  ["webm", "WebM"],
  ["mov", "MOV"],
  ["mkv", "MKV"],
]);
const time = [
  num("start", "Início (segundos)", "Start (seconds)", 0, 0, 86400),
  num("duration", "Duração (segundos)", "Duration (seconds)", 10, 0.1, 86400),
];
media(
  "screen-recorder",
  "Gravar tela",
  "Screen recorder",
  "Capture tela com áudio quando o navegador permitir.",
  "Capture your screen with audio when supported.",
  [],
  { input: "record" },
);
media(
  "extract-audio",
  "Extrair áudio de vídeo",
  "Extract audio",
  "Salve a faixa de áudio em MP3, WAV, OGG ou M4A.",
  "Save the audio track as MP3, WAV, OGG or M4A.",
  [audioFormat],
);
media(
  "convert-video",
  "Converter vídeo",
  "Convert video",
  "Converta MP4, WebM, MOV, MKV e outros formatos.",
  "Convert MP4, WebM, MOV, MKV and other formats.",
  [videoFormat],
  { multiple: true },
);
media(
  "compress-video",
  "Comprimir vídeo",
  "Compress video",
  "Reduza resolução e bitrate com qualidade ajustável.",
  "Reduce resolution and bitrate with adjustable quality.",
  [
    num("width", "Largura máxima (px)", "Maximum width (px)", 1280, 128, 3840),
    num("crf", "CRF (menor = melhor)", "CRF (lower = better)", 28, 18, 40),
  ],
);
media(
  "trim-video",
  "Cortar vídeo",
  "Trim video",
  "Escolha o início e a duração do trecho.",
  "Choose the start and duration of a clip.",
  time,
);
media(
  "resize-video",
  "Redimensionar vídeo",
  "Resize video",
  "Altere a resolução mantendo a proporção.",
  "Change resolution while preserving aspect ratio.",
  [num("width", "Largura (px)", "Width (px)", 720, 128, 3840)],
);
media(
  "mute-video",
  "Remover áudio",
  "Mute video",
  "Crie uma versão silenciosa do vídeo.",
  "Create a silent version of your video.",
);
media(
  "video-to-gif",
  "Vídeo para GIF",
  "Video to GIF",
  "Crie um GIF animado a partir de um trecho.",
  "Create an animated GIF from a clip.",
  [
    ...time,
    num("width", "Largura (px)", "Width (px)", 480, 64, 1280),
    num("fps", "Quadros por segundo", "Frames per second", 12, 1, 30),
  ],
);
media(
  "gif-to-video",
  "GIF para vídeo",
  "GIF to video",
  "Transforme um GIF em vídeo MP4.",
  "Turn an animated GIF into an MP4 video.",
  [],
  { accept: ".gif" },
);
media(
  "video-frames",
  "Extrair quadros",
  "Extract video frames",
  "Exporte quadros do trecho em um ZIP de imagens.",
  "Export clip frames in a ZIP of images.",
  [...time, num("fps", "Imagens por segundo", "Images per second", 1, 0.1, 10)],
);
media(
  "convert-audio",
  "Converter áudio",
  "Convert audio",
  "Converta entre MP3, WAV, OGG e M4A.",
  "Convert between MP3, WAV, OGG and M4A.",
  [audioFormat],
  { multiple: true },
);
media(
  "trim-audio",
  "Cortar áudio",
  "Trim audio",
  "Recorte uma gravação pelo tempo.",
  "Trim an audio recording by time.",
  [...time, audioFormat],
);
media(
  "merge-audio",
  "Juntar áudios",
  "Merge audio",
  "Combine gravações na ordem escolhida.",
  "Combine recordings in your chosen order.",
  [audioFormat],
  { multiple: true },
);
media(
  "normalize-audio",
  "Normalizar volume",
  "Normalize audio",
  "Uniformize o volume com normalização de loudness.",
  "Balance volume using loudness normalization.",
  [audioFormat],
);
media(
  "subtitles-video",
  "Adicionar legendas",
  "Add subtitles",
  "Incorpore legendas SRT como faixa selecionável em MP4.",
  "Embed SRT subtitles as a selectable MP4 track.",
  [
    area(
      "subtitles",
      "Legendas SRT",
      "SRT subtitles",
      "1\n00:00:00,000 --> 00:00:02,000\nTinyLab",
    ),
  ],
);
const data = (id, pt, en, desc, endesc, options = [], extra = {}) =>
  add("data", id, pt, en, desc, endesc, options, extra);
const sheet = { accept: ".xlsx,.xls,.csv,.ods" };
data(
  "csv-to-excel",
  "CSV para Excel",
  "CSV to Excel",
  "Abra CSV e exporte uma planilha XLSX.",
  "Open CSV and export an XLSX spreadsheet.",
  [],
  { accept: ".csv" },
);
data(
  "excel-to-csv",
  "Excel para CSV",
  "Excel to CSV",
  "Exporte uma aba ou todas as abas em ZIP.",
  "Export one sheet or all sheets in a ZIP.",
  [opt("sheet", "Nome da aba (vazio = todas)", "Sheet name (empty = all)")],
  sheet,
);
data(
  "csv-to-json",
  "CSV para JSON",
  "CSV to JSON",
  "Converta linhas e cabeçalhos em objetos JSON.",
  "Convert rows and headers into JSON objects.",
  [],
  { accept: ".csv" },
);
data(
  "json-to-csv",
  "JSON para CSV",
  "JSON to CSV",
  "Transforme uma lista de objetos em uma tabela CSV.",
  "Turn an array of objects into a CSV table.",
  [],
  { accept: ".json" },
);
data(
  "json-to-excel",
  "JSON para Excel",
  "JSON to Excel",
  "Crie uma planilha a partir de objetos JSON.",
  "Create a spreadsheet from JSON objects.",
  [],
  { accept: ".json" },
);
data(
  "xml-to-json",
  "XML para JSON",
  "XML to JSON",
  "Converta a árvore XML preservando atributos.",
  "Convert an XML tree while preserving attributes.",
  [],
  { accept: ".xml" },
);
data(
  "json-to-xml",
  "JSON para XML",
  "JSON to XML",
  "Crie XML estruturado com raiz configurável.",
  "Create structured XML with a configurable root.",
  [opt("root", "Elemento raiz", "Root element", "text", "root")],
  { accept: ".json" },
);
data(
  "xml-to-excel",
  "XML para Excel",
  "XML to Excel",
  "Converta elementos repetidos em linhas de planilha.",
  "Convert repeated elements into spreadsheet rows.",
  [],
  { accept: ".xml" },
);
data(
  "excel-to-json",
  "Excel para JSON",
  "Excel to JSON",
  "Exporte os dados das abas como JSON.",
  "Export worksheet data as JSON.",
  [],
  sheet,
);
data(
  "excel-to-xml",
  "Excel para XML",
  "Excel to XML",
  "Exporte as linhas das abas como XML.",
  "Export worksheet rows as XML.",
  [],
  sheet,
);
data(
  "split-csv",
  "Dividir CSV",
  "Split CSV",
  "Separe tabelas em lotes mantendo o cabeçalho.",
  "Split tables into batches while retaining headers.",
  [num("rows", "Linhas por arquivo", "Rows per file", 1000, 1, 1000000)],
  { accept: ".csv" },
);
data(
  "split-excel",
  "Dividir Excel",
  "Split Excel",
  "Separe uma planilha em arquivos menores.",
  "Split a spreadsheet into smaller files.",
  [num("rows", "Linhas por arquivo", "Rows per file", 1000, 1, 1000000)],
  sheet,
);
data(
  "excel-to-pdf",
  "Excel para PDF",
  "Excel to PDF",
  "Exporte tabelas em páginas PDF com cabeçalhos.",
  "Export tables into PDF pages with headers.",
  [],
  sheet,
);
data(
  "create-zip",
  "Criar ZIP",
  "Create ZIP",
  "Agrupe vários arquivos sem enviar para servidor.",
  "Bundle files without uploading them.",
  [],
  { multiple: true },
);
data(
  "extract-zip",
  "Extrair ZIP",
  "Extract ZIP",
  "Veja o conteúdo e extraia os arquivos do pacote.",
  "Inspect and extract archive files.",
  [],
  { accept: ".zip" },
);
const txt = (id, pt, en, desc, endesc, options = []) =>
  add("text", id, pt, en, desc, endesc, [text, ...options], { input: "text" });
txt(
  "word-counter",
  "Contar palavras",
  "Word counter",
  "Conte palavras, caracteres, linhas e tempo de leitura.",
  "Count words, characters, lines and reading time.",
);
txt(
  "clean-text",
  "Limpar texto",
  "Clean text",
  "Remova espaços extras e normalize quebras de linha.",
  "Remove extra spaces and normalize line breaks.",
);
txt(
  "case-text",
  "Maiúsculas e minúsculas",
  "Change case",
  "Altere a capitalização de palavras e frases.",
  "Change capitalization of words and sentences.",
  [
    sel("mode", "Estilo", "Style", [
      ["upper", "MAIÚSCULAS", "UPPERCASE"],
      ["lower", "minúsculas", "lowercase"],
      ["title", "Iniciais Maiúsculas", "Title Case"],
      ["sentence", "Início de frases", "Sentence case"],
    ]),
  ],
);
txt(
  "dedupe-text",
  "Remover linhas duplicadas",
  "Remove duplicate lines",
  "Elimine repetições mantendo a ordem original.",
  "Remove repeats while preserving original order.",
);
txt(
  "sort-text",
  "Ordenar linhas",
  "Sort lines",
  "Organize listas em ordem alfabética ou inversa.",
  "Sort lists alphabetically or in reverse.",
  [
    sel("order", "Ordem", "Order", [
      ["asc", "A → Z"],
      ["desc", "Z → A"],
    ]),
  ],
);
txt(
  "compare-text",
  "Comparar textos",
  "Compare texts",
  "Compare linhas e encontre inclusões e exclusões.",
  "Compare lines and find additions and deletions.",
  [area("other", "Segundo texto", "Second text")],
);
txt(
  "markdown-preview",
  "Visualizar Markdown",
  "Markdown preview",
  "Veja títulos, listas, links e blocos de código.",
  "Preview headings, lists, links and code blocks.",
);
txt(
  "text-replace",
  "Localizar e substituir",
  "Find & replace",
  "Substitua ocorrências sem expressões regulares.",
  "Replace occurrences without regular expressions.",
  [
    opt("find", "Localizar", "Find"),
    opt("replacement", "Substituir por", "Replace with"),
  ],
);
const dev = (id, pt, en, desc, endesc, options = [], extra = {}) =>
  add("dev", id, pt, en, desc, endesc, options, { input: "text", ...extra });
dev(
  "qr-code-studio",
  "QR Code Studio",
  "QR Code Studio",
  "Crie QR de URL, texto, Wi-Fi, contato ou PIX.",
  "Create QR codes for URLs, text, Wi-Fi, contacts or PIX.",
  [
    sel("kind", "Tipo de QR", "QR type", [
      ["text", "Texto / URL", "Text / URL"],
      ["wifi", "Wi-Fi"],
      ["pix", "PIX"],
      ["vcard", "Contato", "Contact"],
    ]),
    area(
      "content",
      "Texto, URL, chave PIX, SSID ou nome",
      "Text, URL, PIX key, SSID or name",
      "https://4u.ia.br",
    ),
    opt("extra", "Senha Wi-Fi / telefone", "Wi-Fi password / phone"),
    opt(
      "merchant",
      "Nome do recebedor PIX",
      "PIX recipient name",
      "text",
      "RECEBEDOR",
    ),
    opt("city", "Cidade PIX", "PIX city", "text", "SAO PAULO"),
    num(
      "amount",
      "Valor PIX (0 = livre)",
      "PIX amount (0 = open)",
      0,
      0,
      1000000,
    ),
    color,
    opt("background", "Cor de fundo", "Background color", "color", "#ffffff"),
  ],
);
dev(
  "password-generator",
  "Gerador de senhas",
  "Password generator",
  "Gere senhas com aleatoriedade criptográfica.",
  "Generate cryptographically random passwords.",
  [
    num("length", "Tamanho", "Length", 20, 8, 128),
    sel("charset", "Caracteres", "Characters", [
      ["all", "Letras, números e símbolos", "Letters, digits and symbols"],
      ["alnum", "Letras e números", "Letters and digits"],
      ["digits", "Somente números", "Digits only"],
    ]),
  ],
);
dev(
  "hash-crypto",
  "Hashes de texto",
  "Text hashes",
  "Calcule SHA-256, SHA-384, SHA-512 ou SHA-1.",
  "Calculate SHA-256, SHA-384, SHA-512 or SHA-1.",
  [
    text,
    sel("algorithm", "Algoritmo", "Algorithm", [
      ["SHA-256", "SHA-256"],
      ["SHA-384", "SHA-384"],
      ["SHA-512", "SHA-512"],
      ["SHA-1", "SHA-1"],
    ]),
  ],
);
dev(
  "file-hash",
  "Hash de arquivos",
  "File hashes",
  "Calcule SHA-256 para verificar a integridade.",
  "Calculate SHA-256 to verify file integrity.",
  [],
  { input: "files", multiple: true },
);
dev(
  "json-formatter",
  "Formatar JSON",
  "Format JSON",
  "Valide, indente ou compacte seus dados.",
  "Validate, indent or minify your data.",
  [
    text,
    sel("indent", "Indentação", "Indentation", [
      ["2", "2 espaços", "2 spaces"],
      ["4", "4 espaços", "4 spaces"],
      ["0", "Compactar", "Minify"],
    ]),
  ],
);
dev(
  "base64",
  "Base64",
  "Base64",
  "Codifique e decodifique texto UTF-8 em Base64.",
  "Encode and decode UTF-8 text as Base64.",
  [
    text,
    sel("mode", "Operação", "Operation", [
      ["encode", "Codificar", "Encode"],
      ["decode", "Decodificar", "Decode"],
    ]),
  ],
);
dev(
  "url-codec",
  "Codificar URL",
  "URL encode / decode",
  "Converta caracteres especiais de URLs.",
  "Convert special characters in URLs.",
  [
    text,
    sel("mode", "Operação", "Operation", [
      ["encode", "Codificar", "Encode"],
      ["decode", "Decodificar", "Decode"],
    ]),
  ],
);
dev(
  "timestamp",
  "Conversor de timestamp",
  "Timestamp converter",
  "Converta Unix em data ISO ou data em Unix.",
  "Convert Unix timestamps to ISO dates and back.",
  [
    opt(
      "content",
      "Timestamp ou data ISO",
      "Timestamp or ISO date",
      "text",
      "1735689600",
    ),
  ],
);
dev(
  "uuid",
  "Gerar UUID",
  "Generate UUID",
  "Gere identificadores UUID v4 criptográficos.",
  "Generate cryptographic UUID v4 identifiers.",
  [num("count", "Quantidade", "Count", 5, 1, 1000)],
);
dev(
  "lorem-ipsum",
  "Lorem Ipsum",
  "Lorem Ipsum",
  "Gere parágrafos para protótipos e layouts.",
  "Generate paragraphs for prototypes and layouts.",
  [num("count", "Parágrafos", "Paragraphs", 3, 1, 100)],
);
dev(
  "color-converter",
  "Conversor de cores",
  "Color converter",
  "Obtenha HEX, RGB e HSL a partir de uma cor.",
  "Get HEX, RGB and HSL from a color.",
  [color],
);
const ai = (id, pt, en, desc, endesc, options = [], extra = {}) =>
  add("ai", id, pt, en, desc, endesc, options, {
    input: "text",
    model: true,
    ...extra,
  });
ai(
  "ocr-image",
  "Imagem para texto (OCR)",
  "Image to text (OCR)",
  "Reconheça texto em fotos localmente, em PT/EN.",
  "Recognize text in photos locally, in PT/EN.",
  [
    sel("language", "Idioma", "Language", [
      ["por+eng", "Português + inglês", "Portuguese + English"],
      ["por", "Português", "Portuguese"],
      ["eng", "Inglês", "English"],
    ]),
  ],
  { input: "files", accept: "image/*", multiple: true, model: false },
);
ai(
  "ai-remove-bg",
  "Remover fundo de retrato",
  "Portrait background removal",
  "Recorte pessoas com MODNet executado no dispositivo.",
  "Cut out people with MODNet running on your device.",
  [],
  { input: "files", accept: "image/*" },
);
ai(
  "transcribe",
  "Transcrever áudio / vídeo",
  "Transcribe audio / video",
  "Whisper local, com texto e legendas SRT.",
  "Local Whisper with text and SRT subtitles.",
  [
    sel("language", "Idioma falado", "Spoken language", [
      ["portuguese", "Português", "Portuguese"],
      ["english", "Inglês", "English"],
      ["spanish", "Espanhol", "Spanish"],
    ]),
  ],
  { input: "files", accept: "audio/*,video/*" },
);
ai(
  "summarize",
  "Resumir texto",
  "Summarize text",
  "Gere um resumo com um modelo local multilíngue.",
  "Generate a summary with a local multilingual model.",
  [text],
);
ai(
  "translate",
  "Traduzir texto",
  "Translate text",
  "Traduza usando um modelo local, sem API paga.",
  "Translate with a local model, without paid APIs.",
  [
    text,
    sel("target", "Idioma de destino", "Target language", [
      ["English", "Inglês", "English"],
      ["Português brasileiro", "Português", "Portuguese"],
      ["Español", "Espanhol", "Spanish"],
    ]),
  ],
);
ai(
  "proofread",
  "Revisar texto",
  "Proofread text",
  "Revise gramática e clareza mantendo o sentido.",
  "Improve grammar and clarity while retaining meaning.",
  [text],
);
ai(
  "rewrite",
  "Reescrever texto",
  "Rewrite text",
  "Ajuste o tom para uma escrita clara e natural.",
  "Adjust tone for clear, natural writing.",
  [
    text,
    sel("tone", "Tom", "Tone", [
      ["professional", "Profissional", "Professional"],
      ["friendly", "Informal", "Friendly"],
      ["concise", "Conciso", "Concise"],
    ]),
  ],
);
ai(
  "ai-caption",
  "Legendas para redes sociais",
  "Social captions",
  "Crie uma legenda a partir do seu briefing.",
  "Create a caption from your brief.",
  [text],
);
ai(
  "summarize-pdf",
  "Resumir PDF",
  "Summarize PDF",
  "Extraia o texto e produza um resumo local.",
  "Extract text and produce a local summary.",
  [],
  { input: "files", accept: ".pdf" },
);
ai(
  "ai-upscale",
  "Ampliar imagem com IA",
  "AI image upscale",
  "Amplie em 2× com Swin2SR, processando blocos no dispositivo.",
  "Enlarge 2× with Swin2SR, processing tiles on your device.",
  [],
  { input: "files", accept: "image/*" },
);
export const tools = TOOLS;
export function findTool(id) {
  return tools.find((t) => t.id === id);
}
export const normalize = (s) =>
  String(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export const synonyms = {
  foto: "imagem image photo",
  fotografia: "imagem image photo",
  reduzir: "comprimir compress",
  diminuir: "comprimir compress",
  unir: "juntar merge",
  combinar: "juntar merge",
  separar: "dividir split",
  planilha: "excel csv spreadsheet",
  senha: "password proteger",
  recortar: "cortar crop trim",
  audio: "audio som musica",
  video: "video filme",
};
export function searchTools(query, category = "all", lang = "pt") {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  return tools.filter(
    (t) =>
      (category === "all" || t.category === category) &&
      terms.every((term) => {
        const hay = normalize(
          `${t.title.pt} ${t.title.en} ${t.description.pt} ${t.description.en} ${t.id} ${t.category}`,
        );
        return (
          hay.includes(term) ||
          (synonyms[term] || "").split(" ").some((s) => s && hay.includes(s))
        );
      }),
  );
}
