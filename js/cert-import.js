// ============================================================================
// Vehicle certificate import pipeline.
//
// Entry point: importCertFile(file) → returns { fields, rawText, source, qrPayloads }
//
// Strategy:
//   1. If PDF with embedded text layer → extract text directly (pdf.js getTextContent).
//   2. Render each page to a canvas → try QR decoding (jsQR).
//   3. If no usable text layer, run OCR on rendered canvases (tesseract.js CDN).
//   4. Pass the combined text through cert-parser.js.
//
// For image inputs (PNG/JPEG), skip PDF step and go directly to canvas.
// ============================================================================

import { parseVehicleCertText } from './cert-parser.js';

// ---- Lazy loaders ---------------------------------------------------------
let pdfjsLib = null;
async function loadPdfJs() {
  if (pdfjsLib) return pdfjsLib;
  pdfjsLib = await import('../vendor/pdf.min.mjs');
  // Configure worker
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.mjs';
  return pdfjsLib;
}

let jsQR = null;
async function loadJsQR() {
  if (jsQR) return jsQR;
  await loadScript('vendor/jsQR.js');
  jsQR = window.jsQR;
  return jsQR;
}

// Tesseract is loaded from CDN on first OCR use. The integrity hash pinned
// below prevents the browser from executing a tampered copy of the library.
const TESSERACT_CDN_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.0/dist/tesseract.min.js';
const TESSERACT_SRI     = 'sha384-1zP4ZOtlk2FXAOiUArpMuWf7INJJKe/ROfYFAVSeUa11DEfXdKWGiPI3dVma2Gt0';

let tesseractLoadingPromise = null;
async function loadTesseract() {
  if (window.Tesseract) return window.Tesseract;
  if (tesseractLoadingPromise) return tesseractLoadingPromise;
  tesseractLoadingPromise = loadScript(TESSERACT_CDN_URL, TESSERACT_SRI)
    .then(() => window.Tesseract);
  return tesseractLoadingPromise;
}

function loadScript(src, integrity) {
  return new Promise((resolve, reject) => {
    // Already loaded?
    if ([...document.scripts].some(s => s.src && s.src.includes(src))) {
      return resolve();
    }
    const s = document.createElement('script');
    s.src = src;
    if (integrity) {
      s.integrity = integrity;
      s.crossOrigin = 'anonymous';
    }
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load (or integrity mismatch): ' + src));
    document.head.appendChild(s);
  });
}

// ---- Public API -----------------------------------------------------------

/**
 * @param {File} file — uploaded file (PDF or image)
 * @param {(status: {step: string, progress?: number, message?: string}) => void} onProgress
 * @returns {Promise<{fields: object, rawText: string, source: string, qrPayloads: string[]}>}
 */
export async function importCertFile(file, onProgress = () => {}) {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  const isImage = file.type.startsWith('image/') || /\.(png|jpg|jpeg|webp)$/i.test(file.name);
  if (!isPdf && !isImage) throw new Error('PDFまたは画像ファイルを指定してください');

  let canvases = [];
  let pdfText = '';

  if (isPdf) {
    onProgress({ step: 'pdf', message: 'PDFを読み込み中…' });
    const pdf = await loadPdfJs();
    const buf = await file.arrayBuffer();
    const doc = await pdf.getDocument({ data: buf }).promise;
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      // Text layer
      const tc = await page.getTextContent();
      const pageText = tc.items.map(it => it.str).join(' ');
      pdfText += pageText + '\n';
      // Render to canvas for QR / OCR fallback
      const viewport = page.getViewport({ scale: 2.5 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      canvases.push(canvas);
      onProgress({ step: 'pdf', message: `${i}/${doc.numPages}ページ読込`, progress: i / doc.numPages });
    }
  } else {
    onProgress({ step: 'image', message: '画像を読み込み中…' });
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0);
    canvases = [canvas];
  }

  // ---- QR Codes -----------------------------------------------------------
  onProgress({ step: 'qr', message: 'QRコードを検索中…' });
  const qrLib = await loadJsQR();
  const qrPayloads = [];
  for (const c of canvases) {
    const found = scanAllQrInCanvas(c, qrLib);
    qrPayloads.push(...found);
  }

  // ---- Text source decision ----------------------------------------------
  // Heuristic: if PDF text is rich enough (>100 chars of Japanese-ish), use it.
  // Otherwise fall back to OCR.
  const hasRichText = pdfText.replace(/\s+/g, '').length > 100;
  let combinedText = pdfText;
  let source = 'pdf';

  if (!hasRichText) {
    onProgress({ step: 'ocr', message: 'OCRを準備中（初回は数十秒かかります）…' });
    source = 'ocr';
    combinedText = await runOcr(canvases, onProgress);
  }

  // Append QR payloads so the parser can see them
  if (qrPayloads.length) {
    combinedText += '\n[QR] ' + qrPayloads.join(' | ');
  }

  onProgress({ step: 'parse', message: '項目を抽出中…' });
  const result = parseVehicleCertText(combinedText, source);
  result.qrPayloads = qrPayloads;
  onProgress({ step: 'done', message: '完了', progress: 1 });
  return result;
}

// Scan a canvas for multiple QR codes by tiling.
function scanAllQrInCanvas(canvas, jsQR) {
  const ctx = canvas.getContext('2d');
  const payloads = new Set();
  // First try the full image
  try {
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const r = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
    if (r?.data) payloads.add(r.data);
  } catch {}
  // Then try common quadrants for multi-QR documents
  const halves = [
    [0, 0, canvas.width, canvas.height / 2],
    [0, canvas.height / 2, canvas.width, canvas.height / 2],
    [0, 0, canvas.width / 2, canvas.height],
    [canvas.width / 2, 0, canvas.width / 2, canvas.height],
    [0, canvas.height * 0.75, canvas.width / 2, canvas.height / 4],
    [canvas.width / 4, canvas.height * 0.75, canvas.width / 4, canvas.height / 4],
  ];
  for (const [x, y, w, h] of halves) {
    try {
      const img = ctx.getImageData(x, y, w, h);
      const r = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
      if (r?.data) payloads.add(r.data);
    } catch {}
  }
  return [...payloads];
}

async function runOcr(canvases, onProgress) {
  const Tesseract = await loadTesseract();
  const worker = await Tesseract.createWorker(['jpn', 'eng'], 1, {
    logger: (m) => {
      if (m.status && m.progress != null) {
        onProgress({ step: 'ocr', message: `${m.status}`, progress: m.progress });
      }
    },
  });
  let text = '';
  for (let i = 0; i < canvases.length; i++) {
    const c = canvases[i];
    const url = c.toDataURL('image/png');
    const r = await worker.recognize(url);
    text += r.data.text + '\n';
    onProgress({ step: 'ocr', message: `${i + 1}/${canvases.length} ページOCR完了`, progress: (i + 1) / canvases.length });
  }
  await worker.terminate();
  return text;
}
