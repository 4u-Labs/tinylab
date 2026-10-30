/**
 * TINYLAB — FERRAMENTAS 100% CLIENT-SIDE (ZERO SERVIDOR / ZERO APIS DE TERCEIROS)
 * Todas as operações rodam localmente na memória do dispositivo do usuário.
 */

const TinyTools = {
  // ==========================================
  // 1. PDF LAB (via PDF-Lib na memória)
  // ==========================================
  async mergePdfs(files, progressCb) {
    if (!window.PDFLib) throw new Error('PDF-Lib não carregada.');
    if (!files || files.length < 2) throw new Error('Selecione pelo menos 2 arquivos PDF para juntar.');

    const { PDFDocument } = window.PDFLib;
    const mergedDoc = await PDFDocument.create();

    for (let i = 0; i < files.length; i++) {
      if (progressCb) progressCb((i / files.length) * 80);
      const fileBytes = await files[i].arrayBuffer();
      const pdf = await PDFDocument.load(fileBytes);
      const copiedPages = await mergedDoc.copyPages(pdf, pdf.getPageIndices());
      copiedPages.forEach((page) => mergedDoc.addPage(page));
    }

    if (progressCb) progressCb(95);
    const pdfBytes = await mergedDoc.save();
    return new Blob([pdfBytes], { type: 'application/pdf' });
  },

  async splitPdf(file, pageRange) {
    if (!window.PDFLib) throw new Error('PDF-Lib não carregada.');
    const { PDFDocument } = window.PDFLib;
    const fileBytes = await file.arrayBuffer();
    const srcDoc = await PDFDocument.load(fileBytes);
    const totalPages = srcDoc.getPageCount();

    // Interpreta intervalo como "1-3, 5" ou extrai tudo
    const targetDoc = await PDFDocument.create();
    let indices = [];

    if (!pageRange || pageRange.trim() === '') {
      indices = srcDoc.getPageIndices();
    } else {
      const parts = pageRange.split(',');
      for (const p of parts) {
        const trimmed = p.trim();
        if (trimmed.includes('-')) {
          const [start, end] = trimmed.split('-').map(Number);
          for (let i = Math.max(1, start); i <= Math.min(totalPages, end); i++) {
            indices.push(i - 1);
          }
        } else {
          const num = Number(trimmed);
          if (num >= 1 && num <= totalPages) indices.push(num - 1);
        }
      }
    }

    if (indices.length === 0) throw new Error('Nenhuma página válida selecionada no intervalo.');

    const copiedPages = await targetDoc.copyPages(srcDoc, indices);
    copiedPages.forEach((page) => targetDoc.addPage(page));

    const pdfBytes = await targetDoc.save();
    return new Blob([pdfBytes], { type: 'application/pdf' });
  },

  async rotatePdf(file, degrees = 90) {
    if (!window.PDFLib) throw new Error('PDF-Lib não carregada.');
    const { PDFDocument, degrees: pdfDegrees } = window.PDFLib;
    const fileBytes = await file.arrayBuffer();
    const doc = await PDFDocument.load(fileBytes);
    const pages = doc.getPages();

    pages.forEach((page) => {
      const currentRotation = page.getRotation().angle;
      page.setRotation(pdfDegrees((currentRotation + degrees) % 360));
    });

    const pdfBytes = await doc.save();
    return new Blob([pdfBytes], { type: 'application/pdf' });
  },

  async watermarkPdf(file, text = 'CONFIDENCIAL', opacity = 0.3) {
    if (!window.PDFLib) throw new Error('PDF-Lib não carregada.');
    const { PDFDocument, rgb, degrees } = window.PDFLib;
    const fileBytes = await file.arrayBuffer();
    const doc = await PDFDocument.load(fileBytes);
    const pages = doc.getPages();

    pages.forEach((page) => {
      const { width, height } = page.getSize();
      page.drawText(text, {
        x: width / 4,
        y: height / 2,
        size: Math.min(width, height) / 10,
        color: rgb(0.5, 0.5, 0.5),
        opacity: Number(opacity),
        rotate: degrees(45),
      });
    });

    const pdfBytes = await doc.save();
    return new Blob([pdfBytes], { type: 'application/pdf' });
  },

  // ==========================================
  // 2. IMAGE LAB (Canvas e processamento local)
  // ==========================================
  compressImage(file, quality = 0.8, maxWidth = 1920) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();

      reader.onload = (e) => (img.src = e.target.result);
      reader.onerror = reject;

      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) return reject(new Error('Falha ao comprimir imagem.'));
            resolve({
              blob,
              oldSize: file.size,
              newSize: blob.size,
              width,
              height,
              previewUrl: URL.createObjectURL(blob),
            });
          },
          'image/jpeg',
          quality
        );
      };

      reader.readAsDataURL(file);
    });
  },

  convertImage(file, targetFormat = 'webp') {
    return new Promise((resolve, reject) => {
      const mimeTypes = {
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        webp: 'image/webp',
      };
      const mime = mimeTypes[targetFormat.toLowerCase()] || 'image/webp';

      const img = new Image();
      const reader = new FileReader();

      reader.onload = (e) => (img.src = e.target.result);
      reader.onerror = reject;

      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');

        if (mime === 'image/jpeg') {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        ctx.drawImage(img, 0, 0);

        canvas.toBlob(
          (blob) => {
            if (!blob) return reject(new Error('Falha ao converter formato.'));
            resolve({
              blob,
              format: targetFormat,
              previewUrl: URL.createObjectURL(blob),
            });
          },
          mime,
          0.92
        );
      };

      reader.readAsDataURL(file);
    });
  },

  removeBackgroundInstant(file, targetBg = 'transparent') {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();

      reader.onload = (e) => (img.src = e.target.result);
      reader.onerror = reject;

      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');

        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;

        // Amostra a cor do fundo a partir dos 4 cantos
        const corners = [
          [0, 0],
          [canvas.width - 1, 0],
          [0, canvas.height - 1],
          [canvas.width - 1, canvas.height - 1],
        ];

        let bgR = 0, bgG = 0, bgB = 0;
        corners.forEach(([x, y]) => {
          const idx = (y * canvas.width + x) * 4;
          bgR += data[idx];
          bgG += data[idx + 1];
          bgB += data[idx + 2];
        });
        bgR /= 4;
        bgG /= 4;
        bgB /= 4;

        const threshold = 40;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];

          const diff = Math.sqrt(
            Math.pow(r - bgR, 2) + Math.pow(g - bgG, 2) + Math.pow(b - bgB, 2)
          );

          if (diff < threshold) {
            data[i + 3] = 0; // Transparente
          }
        }

        ctx.putImageData(imgData, 0, 0);

        // Se o usuário escolheu uma cor de fundo personalizada em vez de transparente
        if (targetBg !== 'transparent') {
          const outCanvas = document.createElement('canvas');
          outCanvas.width = canvas.width;
          outCanvas.height = canvas.height;
          const outCtx = outCanvas.getContext('2d');
          outCtx.fillStyle = targetBg;
          outCtx.fillRect(0, 0, outCanvas.width, outCanvas.height);
          outCtx.drawImage(canvas, 0, 0);
          outCanvas.toBlob((blob) => resolve(blob), 'image/png');
        } else {
          canvas.toBlob((blob) => resolve(blob), 'image/png');
        }
      };

      reader.readAsDataURL(file);
    });
  },

  // ==========================================
  // 3. DEV & DATA LAB
  // ==========================================
  generatePassword(length = 16, { upper = true, lower = true, numbers = true, symbols = true }) {
    let charset = '';
    if (upper) charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (lower) charset += 'abcdefghijklmnopqrstuvwxyz';
    if (numbers) charset += '0123456789';
    if (symbols) charset += '!@#$%^&*()_+-=[]{}|;:,.<>?';

    if (!charset) charset = 'abcdefghijklmnopqrstuvwxyz0123456789';

    const randomValues = new Uint32Array(length);
    window.crypto.getRandomValues(randomValues);

    let password = '';
    for (let i = 0; i < length; i++) {
      password += charset[randomValues[i] % charset.length];
    }

    // Calcula entropia aproximada
    const entropy = Math.round(length * Math.log2(charset.length));
    return { password, entropy };
  },

  async calculateHash(text, algo = 'SHA-256') {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest(algo, data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  },

  formatJson(rawJson, indent = 2) {
    const parsed = JSON.parse(rawJson);
    const formatted = JSON.stringify(parsed, null, Number(indent));
    const keysCount = typeof parsed === 'object' && parsed !== null ? Object.keys(parsed).length : 0;
    return { formatted, keysCount, valid: true };
  },

  // ==========================================
  // 4. VIDEO & AUDIO LAB
  // ==========================================
  async recordScreen(onDataAvailable) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      throw new Error('Navegador não suporta captura de tela nativa.');
    }

    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { cursor: 'always' },
      audio: true,
    });

    const mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
    const chunks = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    return {
      start() {
        chunks.length = 0;
        mediaRecorder.start(1000);
      },
      stop() {
        return new Promise((resolve) => {
          mediaRecorder.onstop = () => {
            const blob = new Blob(chunks, { type: 'video/webm' });
            stream.getTracks().forEach((track) => track.stop());
            resolve(blob);
          };
          mediaRecorder.stop();
        });
      },
    };
  },

  downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  },
};

window.TinyTools = TinyTools;
