/**
 * TINYLAB — APLICAÇÃO PRINCIPAL & ROTEAMENTO DE FERRAMENTAS
 * Gerencia catálogo, busca em tempo real, i18n bilíngue (PT/EN) e modais.
 */

// ==========================================
// 1. DICIONÁRIO BILÍNGUE (PT / EN)
// ==========================================
const i18nData = {
  pt: {
    heroPill: '⚡ 100% no Navegador • Sem Fila • Arquivos Privados',
    heroTitle: 'O Laboratório de Ferramentas <span>Mais Rápido & Privado</span> da Web.',
    heroSubtitle: 'Mais de 20 utilitários para PDF, Imagem, Vídeo e Código. Seus arquivos nunca são enviados para servidores externos.',
    searchPlaceholder: 'O que você deseja fazer hoje? (ex: juntar pdf, comprimir imagem, qr code...)',
    catAll: '✨ Todas as Ferramentas',
    catPdf: '📄 PDF Lab',
    catImage: '🎨 Image Lab',
    catVideo: '🎬 Vídeo & Áudio',
    catDev: '⚙️ Dev & Dados',
    openTool: 'Abrir Ferramenta',
    btnProcess: 'Executar Operação',
    btnDownload: 'Baixar Resultado',
    dropzoneText: 'Arraste e solte o arquivo aqui ou clique para selecionar',
    dropzoneSubtext: 'Processamento instantâneo e 100% privado no seu navegador',
    successMsg: 'Operação concluída com sucesso!',
    communityEyebrow: 'ECOSSISTEMA 4U-LABS',
    communityTitle: 'Aplicativos, suporte e comunidade',
    installTitle: 'Instalar Aplicativo',
    donateBtn: '♡ Apoiar o projeto no PayPal',
  },
  en: {
    heroPill: '⚡ 100% In-Browser • No Queue • Private Files',
    heroTitle: 'The <span>Fastest & Most Private</span> Web Tools Laboratory.',
    heroSubtitle: 'Over 20 utilities for PDF, Image, Video, and Code. Your files are never uploaded to third-party servers.',
    searchPlaceholder: 'What do you want to do today? (e.g.: merge pdf, compress image, qr code...)',
    catAll: '✨ All Tools',
    catPdf: '📄 PDF Lab',
    catImage: '🎨 Image Lab',
    catVideo: '🎬 Video & Audio',
    catDev: '⚙️ Dev & Data',
    openTool: 'Open Tool',
    btnProcess: 'Execute Operation',
    btnDownload: 'Download Result',
    dropzoneText: 'Drag and drop file here or click to browse',
    dropzoneSubtext: 'Instant and 100% private in-browser processing',
    successMsg: 'Operation completed successfully!',
    communityEyebrow: '4U-LABS ECOSYSTEM',
    communityTitle: 'Apps, support and community',
    installTitle: 'Install Application',
    donateBtn: '♡ Support the project on PayPal',
  },
};

let currentLang = 'pt';

// ==========================================
// 2. CATÁLOGO DE FERRAMENTAS DO TINYLAB
// ==========================================
const TOOLS_CATALOG = [
  // --- PDF LAB ---
  {
    id: 'merge-pdf',
    category: 'pdf',
    icon: '📑',
    title: { pt: 'Juntar PDFs', en: 'Merge PDF' },
    desc: {
      pt: 'Combine múltiplos documentos PDF em um único arquivo ordenado sem limites de tamanho.',
      en: 'Combine multiple PDF files into a single ordered document without size limits.',
    },
    badge: 'pdf',
    multipleFiles: true,
    accept: '.pdf',
  },
  {
    id: 'split-pdf',
    category: 'pdf',
    icon: '✂️',
    title: { pt: 'Dividir PDF', en: 'Split PDF' },
    desc: {
      pt: 'Extraia páginas específicas ou intervalos (ex: 1-5, 8) de qualquer documento PDF.',
      en: 'Extract specific pages or page ranges (e.g.: 1-5, 8) from any PDF file.',
    },
    badge: 'pdf',
    accept: '.pdf',
    hasOptions: true,
  },
  {
    id: 'rotate-pdf',
    category: 'pdf',
    icon: '🔄',
    title: { pt: 'Girar PDF', en: 'Rotate PDF' },
    desc: {
      pt: 'Altere a orientação de páginas PDF em 90°, 180° ou 270° com visualização imediata.',
      en: 'Rotate PDF page orientations by 90°, 180°, or 270° with immediate preview.',
    },
    badge: 'pdf',
    accept: '.pdf',
    hasOptions: true,
  },
  {
    id: 'watermark-pdf',
    category: 'pdf',
    icon: '🛡️',
    title: { pt: 'Marca d\'Água no PDF', en: 'Watermark PDF' },
    desc: {
      pt: 'Aplique carimbos de "Confidencial", "Cópia" ou textos personalizados em todas as páginas.',
      en: 'Apply "Confidential", "Copy" stamps or custom text across all PDF pages.',
    },
    badge: 'pdf',
    accept: '.pdf',
    hasOptions: true,
  },

  // --- IMAGE LAB ---
  {
    id: 'compress-image',
    category: 'image',
    icon: '🗜️',
    title: { pt: 'Comprimir Imagem', en: 'Compress Image' },
    desc: {
      pt: 'Reduza até 90% do peso de fotos JPG, PNG e WebP mantendo fidelidade e nitidez visual.',
      en: 'Reduce image file size by up to 90% in JPG, PNG, and WebP with sharpness retention.',
    },
    badge: 'image',
    accept: 'image/*',
    hasOptions: true,
  },
  {
    id: 'convert-image',
    category: 'image',
    icon: '🔁',
    title: { pt: 'Converter Imagens', en: 'Convert Image' },
    desc: {
      pt: 'Converta instantaneamente formatos de imagem entre PNG, JPG, WebP e AVIF com 1 clique.',
      en: 'Instantly convert image formats between PNG, JPG, WebP, and AVIF in 1 click.',
    },
    badge: 'image',
    accept: 'image/*',
    hasOptions: true,
  },
  {
    id: 'remove-bg',
    category: 'image',
    icon: '✨',
    title: { pt: 'Remover Fundo', en: 'Remove Background' },
    desc: {
      pt: 'Remova fundos de logos, assinaturas e retratos com transparência alfa instantânea.',
      en: 'Remove backgrounds from logos, signatures, and portraits with instant alpha transparency.',
    },
    badge: 'image',
    accept: 'image/*',
    hasOptions: true,
  },
  {
    id: 'resize-image',
    category: 'image',
    icon: '📐',
    title: { pt: 'Redimensionar Foto', en: 'Resize Image' },
    desc: {
      pt: 'Altere dimensões exatas em pixels ou porcentagem mantendo a proporção de aspecto.',
      en: 'Change exact dimensions in pixels or percentages while preserving aspect ratios.',
    },
    badge: 'image',
    accept: 'image/*',
    hasOptions: true,
  },

  // --- VIDEO & AUDIO LAB ---
  {
    id: 'screen-recorder',
    category: 'video',
    icon: '📹',
    title: { pt: 'Gravar Tela & Vídeo', en: 'Screen & Video Recorder' },
    desc: {
      pt: 'Grave sua tela inteira, janela de aplicativo ou aba do navegador diretamente em WebM/MP4.',
      en: 'Record your full screen, app window, or browser tab directly to WebM/MP4.',
    },
    badge: 'video',
    noUpload: true,
  },
  {
    id: 'extract-audio',
    category: 'video',
    icon: '🎵',
    title: { pt: 'Extrair Áudio de Vídeo', en: 'Extract Audio' },
    desc: {
      pt: 'Extraia trilhas de voz ou música de vídeos MP4/WebM salvando em áudio sem perdas.',
      en: 'Extract voice or music tracks from MP4/WebM videos saving directly as audio files.',
    },
    badge: 'video',
    accept: 'video/*',
  },

  // --- DEV & DATA LAB ---
  {
    id: 'qr-code-studio',
    category: 'dev',
    icon: '📱',
    title: { pt: 'QR Code Studio', en: 'QR Code Studio' },
    desc: {
      pt: 'Crie QR Codes personalizados com cores, fundos transparentes, URLs, senhas Wi-Fi ou PIX.',
      en: 'Create custom QR Codes with colors, transparent backgrounds, URLs, Wi-Fi or PIX keys.',
    },
    badge: 'dev',
    noUpload: true,
  },
  {
    id: 'password-generator',
    category: 'dev',
    icon: '🔐',
    title: { pt: 'Gerador de Senhas Seguras', en: 'Secure Password Generator' },
    desc: {
      pt: 'Gere senhas criptograficamente fortes com medidor de entropia e tempo de quebra estimado.',
      en: 'Generate cryptographically strong passwords with entropy calculation and crack time.',
    },
    badge: 'dev',
    noUpload: true,
  },
  {
    id: 'hash-crypto',
    category: 'dev',
    icon: '🧬',
    title: { pt: 'Criptografia & Hashes', en: 'Hash & Cryptography' },
    desc: {
      pt: 'Calcule somas de verificação SHA-256, SHA-512 e SHA-1 direto na velocidade do hardware.',
      en: 'Compute SHA-256, SHA-512, and SHA-1 checksums natively at maximum hardware speed.',
    },
    badge: 'dev',
    noUpload: true,
  },
  {
    id: 'json-formatter',
    category: 'dev',
    icon: '📋',
    title: { pt: 'Formatador de JSON', en: 'JSON Formatter & Validator' },
    desc: {
      pt: 'Valide, formate com indentação limpa e analise a estrutura de objetos e arrays JSON.',
      en: 'Validate, format with clean indentation, and inspect JSON object structures and keys.',
    },
    badge: 'dev',
    noUpload: true,
  },
];

// ==========================================
// 3. INICIALIZAÇÃO & RENDERIZAÇÃO
// ==========================================
let currentCategory = 'all';
let currentSearch = '';
let activeTool = null;
let currentLoadedFiles = [];

document.addEventListener('DOMContentLoaded', () => {
  setupLanguage();
  renderTools();
  setupSearch();
  setupCategoryTabs();
  setupModalEvents();
  registerServiceWorker();
});

function setupLanguage() {
  const btnPt = document.getElementById('lang-pt');
  const btnEn = document.getElementById('lang-en');

  btnPt.addEventListener('click', () => setLanguage('pt'));
  btnEn.addEventListener('click', () => setLanguage('en'));

  // Detecta preferência salva
  const saved = localStorage.getItem('tinylab_lang');
  if (saved && (saved === 'pt' || saved === 'en')) {
    setLanguage(saved);
  } else {
    const navLang = navigator.language || '';
    if (navLang.startsWith('en')) setLanguage('en');
    else setLanguage('pt');
  }
}

function setLanguage(lang) {
  currentLang = lang;
  localStorage.setItem('tinylab_lang', lang);

  document.getElementById('lang-pt').classList.toggle('active', lang === 'pt');
  document.getElementById('lang-en').classList.toggle('active', lang === 'en');

  // Atualiza textos marcados com data-i18n
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (i18nData[lang] && i18nData[lang][key]) {
      el.innerHTML = i18nData[lang][key];
    }
  });

  // Atualiza placeholder de busca
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.placeholder = i18nData[lang].searchPlaceholder;
  }

  // Atualiza atributos data-pt e data-en
  document.querySelectorAll('[data-pt][data-en]').forEach((el) => {
    el.textContent = lang === 'en' ? el.getAttribute('data-en') : el.getAttribute('data-pt');
  });

  renderTools();
}

function renderTools() {
  const container = document.getElementById('toolsGrid');
  if (!container) return;

  const filtered = TOOLS_CATALOG.filter((tool) => {
    const matchesCat = currentCategory === 'all' || tool.category === currentCategory;
    const title = (tool.title[currentLang] || tool.title.pt).toLowerCase();
    const desc = (tool.desc[currentLang] || tool.desc.pt).toLowerCase();
    const matchesQuery = !currentSearch || title.includes(currentSearch) || desc.includes(currentSearch);
    return matchesCat && matchesQuery;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
        <p style="font-size: 1.5rem; margin-bottom: 0.5rem;">🔍</p>
        <p style="font-weight: 600;">${currentLang === 'pt' ? 'Nenhuma ferramenta encontrada para a busca.' : 'No tools found for this search query.'}</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered
    .map(
      (tool) => `
    <div class="tool-card" onclick="openToolModal('${tool.id}')">
      <div class="tool-card-top">
        <div class="tool-icon">${tool.icon}</div>
        <span class="tool-badge">⚡ 100% Local</span>
      </div>
      <h3 class="tool-title">${tool.title[currentLang] || tool.title.pt}</h3>
      <p class="tool-desc">${tool.desc[currentLang] || tool.desc.pt}</p>
      <div class="tool-card-footer">
        <span>${i18nData[currentLang].openTool}</span>
        <span class="tool-arrow">→</span>
      </div>
    </div>
  `
    )
    .join('');
}

function setupSearch() {
  const input = document.getElementById('searchInput');
  if (!input) return;

  input.addEventListener('input', (e) => {
    currentSearch = e.target.value.toLowerCase().trim();
    renderTools();
  });

  // Atalho de teclado '/' para focar busca
  window.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== input) {
      e.preventDefault();
      input.focus();
    }
  });
}

function setupCategoryTabs() {
  document.querySelectorAll('.category-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.category-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      currentCategory = tab.getAttribute('data-category');
      renderTools();
    });
  });
}

// ==========================================
// 4. MODAL INTERATIVO DE CADA FERRAMENTA
// ==========================================
function openToolModal(toolId) {
  const tool = TOOLS_CATALOG.find((t) => t.id === toolId);
  if (!tool) return;
  activeTool = tool;
  currentLoadedFiles = [];

  const overlay = document.getElementById('toolModalOverlay');
  const modalIcon = document.getElementById('modalToolIcon');
  const modalTitle = document.getElementById('modalToolTitle');
  const modalBody = document.getElementById('modalToolBody');

  modalIcon.textContent = tool.icon;
  modalTitle.textContent = tool.title[currentLang] || tool.title.pt;

  // Renderiza corpo do modal customizado por tipo de ferramenta
  modalBody.innerHTML = generateModalBody(tool);
  bindModalEvents(tool);

  overlay.classList.add('active');
}

function closeToolModal() {
  const overlay = document.getElementById('toolModalOverlay');
  overlay.classList.remove('active');
  activeTool = null;
  currentLoadedFiles = [];
}

function generateModalBody(tool) {
  // 1. QR Code Studio
  if (tool.id === 'qr-code-studio') {
    return `
      <div class="controls-grid">
        <div class="control-item" style="grid-column: 1 / -1;">
          <label class="control-label">Conteúdo do QR Code (Texto, URL, Chave PIX, Wi-Fi):</label>
          <input type="text" id="qrText" class="control-input" value="https://4u.ia.br" placeholder="Digite ou cole aqui...">
        </div>
        <div class="control-item">
          <label class="control-label">Cor dos Módulos:</label>
          <input type="color" id="qrColor" class="control-input" value="#00dfd8" style="height: 42px; cursor: pointer;">
        </div>
        <div class="control-item">
          <label class="control-label">Cor de Fundo:</label>
          <input type="color" id="qrBgColor" class="control-input" value="#07080d" style="height: 42px; cursor: pointer;">
        </div>
      </div>
      <div style="text-align: center; margin: 1.5rem 0;">
        <canvas id="qrCanvas" style="max-width: 260px; border-radius: 12px; border: 1px solid var(--border-subtle); box-shadow: var(--shadow-glow);"></canvas>
      </div>
      <button class="btn-primary" onclick="generateQrCodeAction()">⚡ Gerar & Baixar QR Code</button>
    `;
  }

  // 2. Gerador de Senhas
  if (tool.id === 'password-generator') {
    return `
      <div class="controls-grid">
        <div class="control-item" style="grid-column: 1 / -1;">
          <label class="control-label">Senha Gerada:</label>
          <input type="text" id="passResult" class="control-input" readonly style="font-family: monospace; font-size: 1.25rem; font-weight: 700; color: var(--accent-cyan);">
        </div>
        <div class="control-item">
          <label class="control-label">Tamanho (${currentLang === 'pt' ? 'Caracteres' : 'Length'}): <span id="passLenVal">20</span></label>
          <input type="range" id="passLength" min="8" max="64" value="20" class="control-input" oninput="document.getElementById('passLenVal').textContent = this.value">
        </div>
        <div class="control-item">
          <label class="control-label">Força / Entropia:</label>
          <div id="passEntropyBadge" style="padding: 0.5rem; border-radius: 6px; font-weight: 700; text-align: center; background: rgba(16, 185, 129, 0.2); color: var(--accent-emerald);">Excelente (130 bits)</div>
        </div>
      </div>
      <button class="btn-primary" onclick="generatePasswordAction()">🎲 Gerar Nova Senha</button>
    `;
  }

  // 3. Formatador de JSON
  if (tool.id === 'json-formatter') {
    return `
      <div style="display: flex; flex-direction: column; gap: 0.75rem;">
        <label class="control-label">Cole o JSON bruto aqui:</label>
        <textarea id="jsonInput" rows="9" class="control-input" style="font-family: monospace; resize: vertical;" placeholder='{"nome": "TinyLab", "versao": 1}'></textarea>
        <div id="jsonFeedback" style="display: none; padding: 0.6rem; border-radius: 8px; font-size: 0.85rem; font-weight: 600;"></div>
      </div>
      <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
        <button class="btn-primary" onclick="formatJsonAction(2)">✨ Formatar com 2 Espaços</button>
        <button class="btn-primary" style="background: rgba(255,255,255,0.08); box-shadow: none;" onclick="minifyJsonAction()">🗜️ Minificar</button>
        <button class="btn-pill" onclick="copyJsonAction()">📋 Copiar</button>
      </div>
    `;
  }

  // 4. Gravador de Tela
  if (tool.id === 'screen-recorder') {
    return `
      <div style="text-align: center; padding: 2rem 1rem;">
        <div style="font-size: 3.5rem; margin-bottom: 1rem;">🎥</div>
        <h4 style="font-size: 1.2rem; font-weight: 700; margin-bottom: 0.5rem;">Gravação de Tela Nativa</h4>
        <p style="color: var(--text-muted); font-size: 0.9rem; max-width: 500px; margin: 0 auto 1.5rem;">
          Grave sua área de trabalho, aba do navegador ou apresentação de slides com áudio sem instalar extensões.
        </p>
        <button id="btnRecordToggle" class="btn-primary" onclick="toggleScreenRecord()">🔴 Iniciar Gravação</button>
        <div id="recordStatus" style="margin-top: 1.5rem; font-weight: 700; color: var(--accent-pink); display: none;">● Gravando em tempo real...</div>
      </div>
    `;
  }

  // 5. Criptografia & Hashes
  if (tool.id === 'hash-crypto') {
    return `
      <div class="controls-grid">
        <div class="control-item" style="grid-column: 1 / -1;">
          <label class="control-label">Texto para cálculo do Hash:</label>
          <input type="text" id="hashInput" class="control-input" value="TinyLab 4U" placeholder="Digite o texto...">
        </div>
        <div class="control-item" style="grid-column: 1 / -1;">
          <label class="control-label">SHA-256 (Padrão Bancário):</label>
          <input type="text" id="hashSha256" class="control-input" readonly style="font-family: monospace; color: var(--accent-cyan);">
        </div>
        <div class="control-item" style="grid-column: 1 / -1;">
          <label class="control-label">SHA-512:</label>
          <input type="text" id="hashSha512" class="control-input" readonly style="font-family: monospace; font-size: 0.8rem; color: var(--accent-purple);">
        </div>
      </div>
      <button class="btn-primary" onclick="calculateHashAction()">⚡ Recalcular Hashes</button>
    `;
  }

  // Ferramentas baseadas em Arquivo (Upload / Drag and Drop)
  return `
    <div class="dropzone" id="fileDropzone">
      <input type="file" id="fileInput" ${tool.multipleFiles ? 'multiple' : ''} accept="${tool.accept || '*'}" style="display: none;">
      <span class="dropzone-icon">${tool.icon}</span>
      <p class="dropzone-text">${i18nData[currentLang].dropzoneText}</p>
      <p class="dropzone-subtext">${i18nData[currentLang].dropzoneSubtext}</p>
      <div id="fileSelectedList" style="margin-top: 1rem; font-weight: 600; color: var(--accent-cyan);"></div>
    </div>

    ${generateToolOptions(tool)}

    <div style="display: flex; gap: 0.75rem; margin-top: 0.5rem; flex-wrap: wrap;">
      <button class="btn-primary" id="btnExecuteTool" disabled onclick="executeToolAction()">${i18nData[currentLang].btnProcess}</button>
      <button class="btn-primary" id="btnDownloadTool" style="display: none; background: linear-gradient(135deg, #10b981, #00dfd8);" onclick="downloadToolResult()">${i18nData[currentLang].btnDownload}</button>
    </div>

    <div id="toolLiveFeedback" style="display: none; padding: 0.75rem; border-radius: 8px; font-weight: 600; font-size: 0.9rem;"></div>
  `;
}

function generateToolOptions(tool) {
  if (tool.id === 'compress-image') {
    return `
      <div class="controls-grid">
        <div class="control-item">
          <label class="control-label">Qualidade da Imagem: <span id="imgQualityVal">80%</span></label>
          <input type="range" id="imgQuality" min="10" max="95" value="80" class="control-input" oninput="document.getElementById('imgQualityVal').textContent = this.value + '%'">
        </div>
        <div class="control-item">
          <label class="control-label">Largura Máxima (Pixels):</label>
          <input type="number" id="imgMaxWidth" class="control-input" value="1920">
        </div>
      </div>
    `;
  }

  if (tool.id === 'convert-image') {
    return `
      <div class="controls-grid">
        <div class="control-item">
          <label class="control-label">Formato de Destino:</label>
          <select id="imgTargetFormat" class="control-select">
            <option value="webp">WebP (Moderno & Leve)</option>
            <option value="png">PNG (Sem perdas / Transparente)</option>
            <option value="jpeg">JPEG (Universal)</option>
          </select>
        </div>
      </div>
    `;
  }

  if (tool.id === 'remove-bg') {
    return `
      <div class="controls-grid">
        <div class="control-item">
          <label class="control-label">Fundo de Saída:</label>
          <select id="bgTargetType" class="control-select">
            <option value="transparent">Transparente (PNG Alpha)</option>
            <option value="#ffffff">Branco Puro</option>
            <option value="#07080d">Preto Profundo</option>
          </select>
        </div>
      </div>
    `;
  }

  if (tool.id === 'rotate-pdf') {
    return `
      <div class="controls-grid">
        <div class="control-item">
          <label class="control-label">Ângulo de Rotação:</label>
          <select id="pdfRotationAngle" class="control-select">
            <option value="90">90° Horário (Girar à Direita)</option>
            <option value="180">180° Invertido</option>
            <option value="270">270° Anti-horário (Girar à Esquerda)</option>
          </select>
        </div>
      </div>
    `;
  }

  if (tool.id === 'watermark-pdf') {
    return `
      <div class="controls-grid">
        <div class="control-item">
          <label class="control-label">Texto da Marca d'Água:</label>
          <input type="text" id="pdfWatermarkText" class="control-input" value="CONFIDENCIAL">
        </div>
        <div class="control-item">
          <label class="control-label">Opacidade: <span id="pdfOpacityVal">30%</span></label>
          <input type="range" id="pdfWatermarkOpacity" min="0.1" max="0.9" step="0.05" value="0.3" class="control-input" oninput="document.getElementById('pdfOpacityVal').textContent = Math.round(this.value * 100) + '%'">
        </div>
      </div>
    `;
  }

  if (tool.id === 'split-pdf') {
    return `
      <div class="controls-grid">
        <div class="control-item">
          <label class="control-label">Intervalo de Páginas (ex: 1-3, 5):</label>
          <input type="text" id="pdfSplitRange" class="control-input" placeholder="Em branco para extrair todas">
        </div>
      </div>
    `;
  }

  return '';
}

function bindModalEvents(tool) {
  if (tool.id === 'password-generator') generatePasswordAction();
  if (tool.id === 'hash-crypto') calculateHashAction();
  if (tool.id === 'qr-code-studio') generateQrCodeAction();

  const dropzone = document.getElementById('fileDropzone');
  const fileInput = document.getElementById('fileInput');

  if (dropzone && fileInput) {
    dropzone.addEventListener('click', () => fileInput.click());

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFilesSelected(e.dataTransfer.files);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFilesSelected(e.target.files);
      }
    });
  }
}

function handleFilesSelected(files) {
  currentLoadedFiles = Array.from(files);
  const listEl = document.getElementById('fileSelectedList');
  const btnExec = document.getElementById('btnExecuteTool');

  if (listEl) {
    const names = currentLoadedFiles.map((f) => `${f.name} (${(f.size / 1024).toFixed(1)} KB)`).join(', ');
    listEl.textContent = `✓ ${currentLoadedFiles.length} arquivo(s): ${names}`;
  }

  if (btnExec) btnExec.disabled = false;
}

// ==========================================
// 5. DISPARADORES DAS FERRAMENTAS
// ==========================================
let lastGeneratedBlob = null;
let lastGeneratedName = 'arquivo-tinylab';

async function executeToolAction() {
  if (!activeTool || currentLoadedFiles.length === 0) return;
  const feedback = document.getElementById('toolLiveFeedback');
  const btnDownload = document.getElementById('btnDownloadTool');
  const btnExec = document.getElementById('btnExecuteTool');

  try {
    btnExec.disabled = true;
    feedback.style.display = 'block';
    feedback.style.background = 'rgba(0, 223, 216, 0.1)';
    feedback.style.color = 'var(--accent-cyan)';
    feedback.textContent = '⚡ Processando arquivo localmente...';

    if (activeTool.id === 'merge-pdf') {
      lastGeneratedBlob = await TinyTools.mergePdfs(currentLoadedFiles);
      lastGeneratedName = 'tinylab-unificado.pdf';
    } else if (activeTool.id === 'rotate-pdf') {
      const angle = Number(document.getElementById('pdfRotationAngle').value) || 90;
      lastGeneratedBlob = await TinyTools.rotatePdf(currentLoadedFiles[0], angle);
      lastGeneratedName = 'tinylab-girado.pdf';
    } else if (activeTool.id === 'watermark-pdf') {
      const text = document.getElementById('pdfWatermarkText').value || 'CONFIDENCIAL';
      const opacity = document.getElementById('pdfWatermarkOpacity').value || 0.3;
      lastGeneratedBlob = await TinyTools.watermarkPdf(currentLoadedFiles[0], text, opacity);
      lastGeneratedName = 'tinylab-marca-dagua.pdf';
    } else if (activeTool.id === 'split-pdf') {
      const range = document.getElementById('pdfSplitRange').value;
      lastGeneratedBlob = await TinyTools.splitPdf(currentLoadedFiles[0], range);
      lastGeneratedName = 'tinylab-extraido.pdf';
    } else if (activeTool.id === 'compress-image') {
      const quality = (Number(document.getElementById('imgQuality').value) || 80) / 100;
      const maxWidth = Number(document.getElementById('imgMaxWidth').value) || 1920;
      const res = await TinyTools.compressImage(currentLoadedFiles[0], quality, maxWidth);
      lastGeneratedBlob = res.blob;
      lastGeneratedName = 'tinylab-comprimido.jpg';
      const saved = (((res.oldSize - res.newSize) / res.oldSize) * 100).toFixed(1);
      feedback.textContent = `✓ Economia de ${saved}%! De ${(res.oldSize / 1024).toFixed(1)} KB para ${(res.newSize / 1024).toFixed(1)} KB.`;
    } else if (activeTool.id === 'convert-image') {
      const format = document.getElementById('imgTargetFormat').value;
      const res = await TinyTools.convertImage(currentLoadedFiles[0], format);
      lastGeneratedBlob = res.blob;
      lastGeneratedName = `tinylab-convertido.${format}`;
    } else if (activeTool.id === 'remove-bg') {
      const targetBg = document.getElementById('bgTargetType').value;
      lastGeneratedBlob = await TinyTools.removeBackgroundInstant(currentLoadedFiles[0], targetBg);
      lastGeneratedName = 'tinylab-sem-fundo.png';
    }

    feedback.style.background = 'rgba(16, 185, 129, 0.15)';
    feedback.style.color = 'var(--accent-emerald)';
    if (!feedback.textContent.includes('Economia')) {
      feedback.textContent = '✓ Processamento concluído com sucesso!';
    }
    btnDownload.style.display = 'inline-flex';
  } catch (err) {
    feedback.style.display = 'block';
    feedback.style.background = 'rgba(239, 68, 68, 0.15)';
    feedback.style.color = 'var(--accent-red)';
    feedback.textContent = `Erro: ${err.message}`;
  } finally {
    btnExec.disabled = false;
  }
}

function downloadToolResult() {
  if (lastGeneratedBlob) {
    TinyTools.downloadBlob(lastGeneratedBlob, lastGeneratedName);
  }
}

function generatePasswordAction() {
  const len = Number(document.getElementById('passLength')?.value) || 20;
  const res = TinyTools.generatePassword(len, { upper: true, lower: true, numbers: true, symbols: true });
  const input = document.getElementById('passResult');
  const badge = document.getElementById('passEntropyBadge');
  if (input) input.value = res.password;
  if (badge) {
    badge.textContent = `Excelente (${res.entropy} bits de entropia)`;
  }
}

async function calculateHashAction() {
  const text = document.getElementById('hashInput')?.value || '';
  const sha256 = await TinyTools.calculateHash(text, 'SHA-256');
  const sha512 = await TinyTools.calculateHash(text, 'SHA-512');
  document.getElementById('hashSha256').value = sha256;
  document.getElementById('hashSha512').value = sha512;
}

function formatJsonAction(indent = 2) {
  const input = document.getElementById('jsonInput');
  const feedback = document.getElementById('jsonFeedback');
  try {
    const res = TinyTools.formatJson(input.value, indent);
    input.value = res.formatted;
    feedback.style.display = 'block';
    feedback.style.background = 'rgba(16, 185, 129, 0.15)';
    feedback.style.color = 'var(--accent-emerald)';
    feedback.textContent = `✓ JSON válido com ${res.keysCount} chaves formatadas.`;
  } catch (e) {
    feedback.style.display = 'block';
    feedback.style.background = 'rgba(239, 68, 68, 0.15)';
    feedback.style.color = 'var(--accent-red)';
    feedback.textContent = `Erro de sintaxe no JSON: ${e.message}`;
  }
}

function minifyJsonAction() {
  formatJsonAction(0);
}

function copyJsonAction() {
  const input = document.getElementById('jsonInput');
  if (input && input.value) {
    navigator.clipboard.writeText(input.value);
    alert('JSON copiado para a área de transferência!');
  }
}

function generateQrCodeAction() {
  const text = document.getElementById('qrText')?.value || 'https://4u.ia.br';
  const color = document.getElementById('qrColor')?.value || '#00dfd8';
  const bgColor = document.getElementById('qrBgColor')?.value || '#07080d';
  const canvas = document.getElementById('qrCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  canvas.width = 300;
  canvas.height = 300;

  // Renderizador básico com Canvas
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, 300, 300);

  // Se a lib qrcode estiver disponível usa ela, senão gera visualização estilizada
  if (window.QRCode && QRCode.toCanvas) {
    QRCode.toCanvas(canvas, text, { width: 300, color: { dark: color, light: bgColor } });
  } else {
    // Visual placeholder estilizado até lib carregar
    ctx.fillStyle = color;
    ctx.fillRect(40, 40, 60, 60);
    ctx.fillRect(200, 40, 60, 60);
    ctx.fillRect(40, 200, 60, 60);
    ctx.fillStyle = bgColor;
    ctx.fillRect(55, 55, 30, 30);
    ctx.fillRect(215, 55, 30, 30);
    ctx.fillRect(55, 215, 30, 30);
    ctx.fillStyle = color;
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text.slice(0, 24), 150, 160);
  }

  canvas.toBlob((blob) => {
    lastGeneratedBlob = blob;
    lastGeneratedName = 'qrcode-tinylab.png';
    const btnDownload = document.getElementById('btnDownloadTool');
    if (btnDownload) btnDownload.style.display = 'inline-flex';
  });
}

let activeScreenRecorder = null;
async function toggleScreenRecord() {
  const btn = document.getElementById('btnRecordToggle');
  const status = document.getElementById('recordStatus');

  if (!activeScreenRecorder) {
    try {
      activeScreenRecorder = await TinyTools.recordScreen();
      activeScreenRecorder.start();
      btn.textContent = '⏹️ Parar & Baixar Gravação';
      btn.style.background = 'var(--accent-red)';
      status.style.display = 'block';
    } catch (e) {
      alert(`Erro ao iniciar captura: ${e.message}`);
    }
  } else {
    const blob = await activeScreenRecorder.stop();
    TinyTools.downloadBlob(blob, `gravacao-tinylab-${Date.now()}.webm`);
    activeScreenRecorder = null;
    btn.textContent = '🔴 Iniciar Gravação';
    btn.style.background = '';
    status.style.display = 'none';
  }
}

// ==========================================
// 6. EVENTOS DE MODAL & 4U-LABS DIALOG
// ==========================================
function setupModalEvents() {
  const closeBtn = document.getElementById('modalToolClose');
  const overlay = document.getElementById('toolModalOverlay');

  if (closeBtn) closeBtn.addEventListener('click', closeToolModal);
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeToolModal();
    });
  }

  // Tecla ESC fecha modais
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeToolModal();
      document.getElementById('community-dialog')?.close();
      document.getElementById('install-dialog')?.close();
    }
  });

  // Modal 4U-Labs
  document.querySelectorAll('[data-open="community-dialog"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.getElementById('community-dialog')?.showModal();
    });
  });

  document.querySelectorAll('[data-close="community-dialog"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.getElementById('community-dialog')?.close();
    });
  });

  // Modal Instalação
  document.querySelectorAll('[data-open="install-dialog"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.getElementById('install-dialog')?.showModal();
    });
  });

  document.querySelectorAll('[data-close="install-dialog"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.getElementById('install-dialog')?.close();
    });
  });
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch((err) => {
        console.warn('SW registration failed:', err);
      });
    });
  }
}
